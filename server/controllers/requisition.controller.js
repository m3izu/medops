const prisma = require('../lib/prisma');
const { checkAndFireAlerts } = require('./stock.controller');

const list = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    const where = {};

    // Nurses only see their own forms
    if (role === 'NURSE') where.submittedById = userId;

    const requisitions = await prisma.requisition.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, chartNumber: true } },
        submittedBy: { select: { id: true, name: true, role: true } },
        lines: {
          include: { item: { select: { id: true, name: true, unit: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requisitions);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { patientId, sessionDate, lines } = req.body;
    if (!patientId || !sessionDate || !lines?.length) {
      return res.status(400).json({ error: 'patientId, sessionDate, and at least one line item are required' });
    }
    const parsedSessionDate = new Date(sessionDate);
    if (isNaN(parsedSessionDate.getTime())) {
      return res.status(400).json({ error: 'Valid sessionDate is required.' });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    if (patient.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Cannot submit requisition for an inactive patient.' });
    }

    const requisition = await prisma.requisition.create({
      data: {
        patientId,
        submittedById: req.user.id,
        sessionDate: parsedSessionDate,
        lines: {
          create: lines.map(l => ({
            itemId: l.itemId,
            location: l.location || 'CENTRAL',
            qtyRequested: l.quantity,
            reason: l.reason,
          })),
        },
      },
      include: { lines: true },
    });

    // Notify inventory managers
    const managers = await prisma.user.findMany({
      where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: managers.map(m => ({
        userId: m.id,
        eventType: 'REQUISITION_SUBMITTED',
        message: `New requisition submitted by ${req.user.name}`,
        link: `/requisitions/${requisition.id}`,
      })),
    });

    res.status(201).json(requisition);
  } catch (err) { next(err); }
};

const createBatch = async (req, res, next) => {
  try {
    const { sessionDate, requisitions } = req.body;
    if (!sessionDate || isNaN(new Date(sessionDate).getTime())) {
      return res.status(400).json({ error: 'Valid sessionDate is required.' });
    }
    if (!Array.isArray(requisitions) || requisitions.length === 0) {
      return res.status(400).json({ error: 'At least one requisition column is required.' });
    }

    const createdRequisitions = [];

    await prisma.$transaction(async (tx) => {
      for (const itemReq of requisitions) {
        const { patientId, lines, notes, isAdditional } = itemReq;
        if (!Array.isArray(lines) || lines.length === 0) continue;

        // 1. Consolidate lines (aggregate quantities for duplicate item entries in the same column)
        const lineMap = {};
        const lineLocationMap = {};
        for (const l of lines) {
          if (!l.itemId) continue;
          const qty = Math.floor(Number(l.quantity));
          if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error(`Invalid requested quantity "${l.quantity}" for item.`);
          }
          const loc = l.location || itemReq.location || 'CENTRAL';
          if (!['ECART', 'CENTRAL'].includes(loc)) {
            throw new Error(`Invalid location "${loc}". Must be ECART or CENTRAL.`);
          }
          if (lineMap[l.itemId]) {
            lineMap[l.itemId] += qty;
          } else {
            lineMap[l.itemId] = qty;
            lineLocationMap[l.itemId] = loc;
          }
        }

        const consolidatedItems = Object.keys(lineMap);
        if (consolidatedItems.length === 0) continue;

        // 2. Validate all requested items exist and are not archived
        for (const itemId of consolidatedItems) {
          const itemDb = await tx.item.findUnique({ where: { id: itemId } });
          if (!itemDb) {
            throw new Error(`Catalog item not found: ${itemId}`);
          }
          if (itemDb.isArchived) {
            throw new Error(`Cannot request archived item: ${itemDb.name}`);
          }
        }

        // 3. Resolve Patient
        let resolvedPatientId = patientId;
        if (isAdditional || patientId === 'ADDITIONAL') {
          let addPatient = await tx.patient.findFirst({
            where: { chartNumber: 'ADDITIONAL' }
          });
          if (!addPatient) {
            addPatient = await tx.patient.create({
              data: {
                name: 'ADDITIONAL ITEMS',
                chartNumber: 'ADDITIONAL',
                diagnosis: 'Station stock and backup items',
                status: 'ACTIVE'
              }
            });
          }
          resolvedPatientId = addPatient.id;
        } else {
          const patient = await tx.patient.findUnique({ where: { id: resolvedPatientId } });
          if (!patient) {
            throw new Error(`Patient not found in registry: ${patientId}`);
          }
          if (patient.status !== 'ACTIVE') {
            throw new Error(`Cannot submit requisition for inactive patient: ${patient.name}`);
          }
        }

        // 4. Create Requisition & Line Items
        const requisition = await tx.requisition.create({
          data: {
            patientId: resolvedPatientId,
            submittedById: req.user.id,
            sessionDate: new Date(sessionDate),
            lines: {
              create: consolidatedItems.map(itemId => ({
                itemId,
                location: lineLocationMap[itemId] || 'CENTRAL',
                qtyRequested: lineMap[itemId],
                reason: notes?.trim() || 'Grid Requisition sheet entry'
              }))
            }
          },
          include: { lines: true }
        });
        createdRequisitions.push(requisition);
      }
    });

    if (createdRequisitions.length === 0) {
      return res.status(400).json({ error: 'No valid line item quantities were provided to submit.' });
    }

    // Notify inventory managers
    const managers = await prisma.user.findMany({
      where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
      select: { id: true }
    });
    await prisma.notification.createMany({
      data: managers.map(m => ({
        userId: m.id,
        eventType: 'REQUISITION_SUBMITTED',
        message: `Batch requisition sheet (${createdRequisitions.length} columns) submitted by ${req.user.name}`,
        link: `/requisitions`
      }))
    });

    res.status(201).json({ success: true, count: createdRequisitions.length, requisitions: createdRequisitions });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || 'Failed to submit batch requisitions.' });
  }
};

const getOne = async (req, res, next) => {
  try {
    const req_ = await prisma.requisition.findUnique({
      where: { id: req.params.id },
      include: {
        patient: true,
        submittedBy: { select: { id: true, name: true, role: true } },
        lines: {
          include: {
            item: {
              include: { 
                stockLevels: true, 
                batches: { 
                  where: { 
                    quantityRemaining: { gt: 0 },
                    OR: [
                      { expiryDate: { gte: new Date() } },
                      { expiryDate: null }
                    ]
                  }, 
                  orderBy: { expiryDate: 'asc' } 
                } 
              },
            },
            transactionLogs: {
              include: {
                batch: { select: { id: true, batchNumber: true, expiryDate: true, location: true } }
              }
            }
          },
        },
      },
    });
    if (!req_) return res.status(404).json({ error: 'Requisition not found' });

    // Enforcement: Nurses can only view their own requisitions
    const { role, id: userId } = req.user;
    if (role === 'NURSE' && req_.submittedById !== userId) {
      return res.status(403).json({ error: 'You do not have permission to view this requisition.' });
    }

    res.json(req_);
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const requisition = await prisma.requisition.findUnique({ where: { id: req.params.id } });
    if (!requisition) return res.status(404).json({ error: 'Requisition not found' });

    const { role, id: userId } = req.user;
    const canCancel = role === 'TOP_ADMIN' || role === 'INVENTORY_MANAGER' || requisition.submittedById === userId;
    if (!canCancel) return res.status(403).json({ error: 'You cannot cancel this requisition' });

    await prisma.$transaction(async (tx) => {
      const reqDb = await tx.requisition.findUnique({
        where: { id: req.params.id },
        include: { lines: true }
      });
      if (!reqDb) {
        throw new Error('Requisition not found');
      }
      if (reqDb.status !== 'PENDING') {
        throw new Error('Only pending requisitions can be cancelled');
      }
      if (reqDb.lines.some(l => l.status === 'APPROVED')) {
        throw new Error('Cannot cancel a requisition that has already had line items approved.');
      }

      await tx.requisition.update({
        where: { id: req.params.id },
        data: {
          status: 'CANCELLED',
          cancelledBy: userId,
          cancelledAt: new Date(),
          lines: { updateMany: { where: { status: 'PENDING' }, data: { status: 'CANCELLED' } } },
        },
      });
    });

    res.json({ message: 'Requisition cancelled' });
  } catch (err) {
    if (err.message === 'Requisition not found') {
      return res.status(404).json({ error: err.message });
    }
    if (
      err.message === 'Only pending requisitions can be cancelled' ||
      err.message === 'Cannot cancel a requisition that has already had line items approved.'
    ) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

const approveLine = async (req, res, next) => {
  try {
    const { qtyApproved } = req.body;
    
    if (qtyApproved !== undefined && (typeof qtyApproved !== 'number' || qtyApproved <= 0 || !Number.isInteger(qtyApproved))) {
      return res.status(400).json({ error: 'Approved quantity must be a positive whole number' });
    }

    const line = await prisma.requisitionLine.findUnique({ where: { id: req.params.lineId } });
    if (!line) return res.status(404).json({ error: 'Line item not found' });

    const approvedQty = qtyApproved ?? line.qtyRequested;
    let requisition;

    // Execute batch deduction and stock updates in a single database transaction
    await prisma.$transaction(async (tx) => {
      const lineDb = await tx.requisitionLine.findUnique({ where: { id: req.params.lineId } });
      if (!lineDb) {
        throw new Error('Line item not found');
      }
      if (lineDb.status !== 'PENDING') {
        throw new Error('Line item is not pending');
      }

      // Verify patient status is still active before approving
      const requisitionDb = await tx.requisition.findUnique({
        where: { id: lineDb.requisitionId },
        include: { patient: true }
      });
      if (!requisitionDb || requisitionDb.patient.status !== 'ACTIVE') {
        throw new Error('Cannot approve requisition line for an inactive patient.');
      }

      const targetLocation = lineDb.location || 'CENTRAL';
      const item = await tx.item.findUnique({
        where: { id: lineDb.itemId },
        include: { 
          stockLevels: true, 
          category: true,
          batches: { 
            where: { 
              location: targetLocation,
              quantityRemaining: { gt: 0 },
              OR: [
                { expiryDate: { gte: new Date() } },
                { expiryDate: null }
              ]
            }, 
            orderBy: { expiryDate: 'asc' } 
          } 
        },
      });

      if (!item) {
        throw new Error('Item not found');
      }

      const stockLevels = item.stockLevels || [];
      const currentStock = stockLevels.find(s => s.location === targetLocation)?.quantityOnHand ?? 0;
      if (currentStock < approvedQty) {
        throw new Error(`Insufficient stock in ${targetLocation} for this quantity. Available: ${currentStock} ${item.unit}`);
      }

      let remaining = approvedQty;
      const isBatchControlled = item.itemType === 'MEDICATION' || (item.category?.hasBatchControl ?? false);
      
      if (isBatchControlled) {
        for (const batch of item.batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.quantityRemaining, remaining);
          
          const updatedBatch = await tx.itemBatch.updateMany({
            where: { id: batch.id, quantityRemaining: { gte: deduct } },
            data: { quantityRemaining: { decrement: deduct } },
          });
          if (updatedBatch.count === 0) {
            throw new Error('Concurrent modification detected: Insufficient batch quantity.');
          }

          await tx.transactionLog.create({
            data: {
              itemId: lineDb.itemId,
              location: targetLocation,
              batchId: batch.id,
              type: 'OUTBOUND',
              qty: deduct,
              userId: req.user.id,
              requisitionLineId: lineDb.id,
            },
          });
          remaining -= deduct;
        }

        if (remaining > 0) {
          throw new Error('Insufficient batch quantities remaining to fulfill this request.');
        }
      } else {
        // Non-medication/non-batch outbound logging
        await tx.transactionLog.create({
          data: {
            itemId: lineDb.itemId,
            location: targetLocation,
            type: 'OUTBOUND',
            qty: approvedQty,
            userId: req.user.id,
            requisitionLineId: lineDb.id,
          },
        });
      }

      // Update stock level for target location
      const updatedStock = await tx.stockLevel.updateMany({
        where: { itemId: lineDb.itemId, location: targetLocation, quantityOnHand: { gte: approvedQty } },
        data: { quantityOnHand: { decrement: approvedQty }, lastUpdated: new Date() },
      });
      if (updatedStock.count === 0) {
        throw new Error('Concurrent modification detected: Insufficient stock level.');
      }

      // Update line status
      await tx.requisitionLine.update({
        where: { id: lineDb.id },
        data: { status: 'APPROVED', qtyApproved: approvedQty, reviewedById: req.user.id },
      });

      // Update requisition status (Bug #3, #8)
      await updateRequisitionStatus(lineDb.requisitionId, tx);

      requisition = await tx.requisition.findUnique({ where: { id: lineDb.requisitionId } });
    });

    // Check stock alerts (outside transaction to avoid blocking locks)
    await checkAndFireAlerts(line.itemId);

    // Notify the submitter using correct requisition ID (Bug #8)
    const itemObj = await prisma.item.findUnique({ where: { id: line.itemId } });
    await prisma.notification.create({
      data: {
        userId: requisition.submittedById,
        eventType: 'REQUISITION_LINE_APPROVED',
        message: `Item request approved: ${itemObj.name} (${approvedQty} ${itemObj.unit})`,
        link: `/requisitions/${requisition.id}`,
      },
    });

    res.json({ message: 'Line item approved', qtyApproved: approvedQty });
  } catch (err) {
    const knownErrors = [
      'Line item not found',
      'Line item is not pending',
      'Item not found',
      'Cannot approve requisition line for an inactive patient.',
      'Medication co-verification is required before approval.',
      'Insufficient Medication batch quantities remaining to fulfill this request.',
      'Concurrent modification detected: Insufficient batch quantity.',
      'Concurrent modification detected: Insufficient stock level.'
    ];
    if (knownErrors.includes(err.message) || err.message.includes('Insufficient stock')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

const rejectLine = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ error: 'rejectionReason is required' });

    const line = await prisma.requisitionLine.findUnique({ where: { id: req.params.lineId } });
    if (!line) return res.status(404).json({ error: 'Line item not found' });

    let requisition;
    await prisma.$transaction(async (tx) => {
      const lineDb = await tx.requisitionLine.findUnique({ where: { id: req.params.lineId } });
      if (!lineDb) {
        throw new Error('Line item not found');
      }
      if (lineDb.status !== 'PENDING') {
        throw new Error('Line item is not pending');
      }

      await tx.requisitionLine.update({
        where: { id: lineDb.id },
        data: { status: 'REJECTED', rejectionReason, reviewedById: req.user.id },
      });

      await updateRequisitionStatus(lineDb.requisitionId, tx);

      requisition = await tx.requisition.findUnique({ where: { id: lineDb.requisitionId } });
    });

    const item = await prisma.item.findUnique({ where: { id: line.itemId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: requisition.submittedById,
        eventType: 'REQUISITION_LINE_REJECTED',
        message: `Item request rejected: ${item.name} — ${rejectionReason}`,
        link: `/requisitions/${requisition.id}`,
      },
    });

    res.json({ message: 'Line item rejected' });
  } catch (err) {
    const knownErrors = ['Line item not found', 'Line item is not pending'];
    if (knownErrors.includes(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

const resubmitLine = async (req, res, next) => {
  try {
    const { itemId, quantity, reason } = req.body;
    
    if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity))) {
      return res.status(400).json({ error: 'Quantity must be a positive whole number' });
    }

    const originalLine = await prisma.requisitionLine.findUnique({ 
      where: { id: req.params.lineId },
      include: { requisition: true }
    });
    if (!originalLine) return res.status(404).json({ error: 'Original line not found' });
    if (originalLine.status !== 'REJECTED') return res.status(400).json({ error: 'Only rejected lines can be resubmitted' });

    // Auth check: Only the original submitter or top admin can resubmit
    const { role, id: userId } = req.user;
    if (role !== 'TOP_ADMIN' && originalLine.requisition?.submittedById !== userId) {
      return res.status(403).json({ error: 'You are not authorized to resubmit this line item' });
    }

    const newLine = await prisma.requisitionLine.create({
      data: {
        requisitionId: originalLine.requisitionId,
        itemId: itemId || originalLine.itemId,
        qtyRequested: (quantity !== undefined && quantity !== null) ? quantity : originalLine.qtyRequested,
        reason: reason || originalLine.reason,
        location: originalLine.location || 'CENTRAL',
        isResubmission: true,
        originalLineId: originalLine.id,
      },
    });

    // Move requisition back to PENDING if needed
    await prisma.requisition.update({
      where: { id: originalLine.requisitionId },
      data: { status: 'PENDING' },
    });

    res.status(201).json(newLine);
  } catch (err) { next(err); }
};

const coVerifyLine = async (req, res, next) => {
  try {
    const line = await prisma.requisitionLine.findUnique({
      where: { id: req.params.lineId },
      include: {
        item: true,
        requisition: { select: { submittedById: true } }
      }
    });

    if (!line) return res.status(404).json({ error: 'Line item not found' });
    if (line.status !== 'PENDING') return res.status(400).json({ error: 'Only pending items can be co-verified' });
    if (line.item.itemType !== 'MEDICATION') return res.status(400).json({ error: 'Co-verification is only allowed for Medications' });
    if (line.coVerifiedById) return res.status(400).json({ error: 'This item has already been co-verified' });
    if (line.requisition.submittedById === req.user.id) {
      return res.status(400).json({ error: 'Nurses cannot co-verify their own requisition line items.' });
    }

    const updatedLine = await prisma.requisitionLine.update({
      where: { id: line.id },
      data: { coVerifiedById: req.user.id },
    });

    const requisition = await prisma.requisition.findUnique({ where: { id: line.requisitionId } });
    await prisma.notification.create({
      data: {
        userId: requisition.submittedById,
        eventType: 'REQUISITION_LINE_COVERIFIED',
        message: `Medication request co-verified: ${line.item.name}`,
        link: `/requisitions/${line.requisitionId}`,
      },
    });

    res.json({ message: 'Medication co-verified successfully', line: updatedLine });
  } catch (err) { next(err); }
};

// Helper to sync requisition status from its lines
async function updateRequisitionStatus(requisitionId, tx) {
  const client = tx || prisma;
  const lines = await client.requisitionLine.findMany({ where: { requisitionId } });

  // Exclude superceded lines (lines that have been resubmitted) from status calculation
  const supercededIds = lines.filter(l => l.originalLineId).map(l => l.originalLineId);
  const activeLines = lines.filter(l => !supercededIds.includes(l.id));

  const statuses = activeLines.map(l => l.status);
  let newStatus = 'PENDING';
  if (statuses.every(s => s === 'APPROVED')) newStatus = 'FULLY_APPROVED';
  else if (statuses.every(s => s === 'REJECTED' || s === 'CANCELLED')) newStatus = 'REJECTED';
  else if (statuses.some(s => s === 'APPROVED')) newStatus = 'PARTIALLY_APPROVED';

  await client.requisition.update({ where: { id: requisitionId }, data: { status: newStatus } });
}

module.exports = { list, create, createBatch, getOne, cancel, approveLine, rejectLine, resubmitLine, coVerifyLine };
