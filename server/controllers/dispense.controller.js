const prisma = require('../lib/prisma');
const { checkAndFireAlerts } = require('./stock.controller');

/**
 * POST /api/dispense
 * Nurse directly dispenses an item to a patient.
 * Stock is deducted immediately via FIFO batch selection.
 */
const create = async (req, res, next) => {
  try {
    const { patientId, itemId, qty, items: itemsArr, notes } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'patientId is required.' });
    }

    // Standardize payload into list of items to dispense
    let dispenseList = [];
    if (Array.isArray(itemsArr) && itemsArr.length > 0) {
      dispenseList = itemsArr;
    } else if (itemId && qty) {
      dispenseList = [{ itemId, qty, notes }];
    } else {
      return res.status(400).json({ error: 'At least one item line with valid quantity is required.' });
    }

    // Validate quantities
    for (const d of dispenseList) {
      if (!d.itemId || !d.qty) {
        return res.status(400).json({ error: 'Each dispense row must specify an itemId and quantity.' });
      }
      const numQty = Number(d.qty);
      if (isNaN(numQty) || numQty <= 0 || !Number.isInteger(numQty)) {
        return res.status(400).json({ error: 'Quantity must be a positive whole number for all items.' });
      }
    }

    const createdDispenses = [];
    const itemIdsToAlert = new Set();

    await prisma.$transaction(async (tx) => {
      // 1. Verify patient is active
      const patient = await tx.patient.findUnique({ where: { id: patientId } });
      if (!patient) throw new Error('Patient not found.');
      if (patient.status !== 'ACTIVE') throw new Error('Cannot dispense to an inactive patient.');

      for (const line of dispenseList) {
        const lineItemId = line.itemId;
        const lineQty = Number(line.qty);
        const lineNotes = line.notes?.trim() || notes?.trim() || undefined;

        itemIdsToAlert.add(lineItemId);

        // 2. Verify item exists, is not archived, and allows direct dispense
        const item = await tx.item.findUnique({
          where: { id: lineItemId },
          include: {
            stockLevel: true,
            category: true,
            batches: {
              where: {
                quantityRemaining: { gt: 0 },
                OR: [
                  { expiryDate: { gte: new Date() } },
                  { expiryDate: null },
                ],
              },
              orderBy: { expiryDate: 'asc' }, // FIFO: oldest expiry first
            },
          },
        });

        if (!item) throw new Error(`Item not found: ${lineItemId}`);
        if (item.isArchived) throw new Error(`Cannot dispense archived item: ${item.name}`);
        if (item.dispenseMode === 'REQUISITION_ONLY') {
          throw new Error(`"${item.name}" requires a formal requisition and cannot be directly dispensed.`);
        }

        // 3. Verify sufficient stock
        const currentStock = item.stockLevel?.quantityOnHand ?? 0;
        if (currentStock < lineQty) {
          throw new Error(`Insufficient stock for "${item.name}". Available: ${currentStock} ${item.unit}.`);
        }

        // 4. FIFO batch deduction for batch-controlled items
        const isBatchControlled = item.itemType === 'MEDICATION' || (item.category?.hasBatchControl ?? false);
        let primaryBatchId = null;
        const txLogsToCreate = [];

        if (isBatchControlled) {
          let remaining = lineQty;
          for (const batch of item.batches) {
            if (remaining <= 0) break;
            const deduct = Math.min(batch.quantityRemaining, remaining);

            const updatedBatch = await tx.itemBatch.updateMany({
              where: { id: batch.id, quantityRemaining: { gte: deduct } },
              data: { quantityRemaining: { decrement: deduct } },
            });
            if (updatedBatch.count === 0) {
              throw new Error(`Concurrent modification detected on batch for "${item.name}".`);
            }

            txLogsToCreate.push({
              itemId: lineItemId,
              batchId: batch.id,
              type: 'DISPENSE',
              qty: deduct,
              userId: req.user.id,
              notes: `Direct dispense to patient (${patient.name} / ${patient.chartNumber})${lineNotes ? `: ${lineNotes}` : ''}`,
            });

            if (primaryBatchId === null) primaryBatchId = batch.id;
            remaining -= deduct;
          }

          if (remaining > 0) {
            throw new Error(`Insufficient batch quantities remaining to fulfill "${item.name}".`);
          }
        } else {
          txLogsToCreate.push({
            itemId: lineItemId,
            type: 'DISPENSE',
            qty: lineQty,
            userId: req.user.id,
            notes: `Direct dispense to patient (${patient.name} / ${patient.chartNumber})${lineNotes ? `: ${lineNotes}` : ''}`,
          });
        }

        // 5. Deduct total from StockLevel
        const updatedStock = await tx.stockLevel.updateMany({
          where: { itemId: lineItemId, quantityOnHand: { gte: lineQty } },
          data: { quantityOnHand: { decrement: lineQty }, lastUpdated: new Date() },
        });
        if (updatedStock.count === 0) {
          throw new Error(`Concurrent modification detected: Insufficient stock level for "${item.name}".`);
        }

        // 6. Create DispenseLog
        const dispenseLog = await tx.dispenseLog.create({
          data: {
            patientId,
            itemId: lineItemId,
            batchId: isBatchControlled ? primaryBatchId : null,
            qty: lineQty,
            dispensedById: req.user.id,
            notes: lineNotes,
            billingStatus: 'PENDING',
          },
        });

        // 7. Create transaction logs
        for (const txLog of txLogsToCreate) {
          await tx.transactionLog.create({
            data: {
              ...txLog,
              dispenseLogId: dispenseLog.id,
            },
          });
        }

        createdDispenses.push(dispenseLog);
      }
    });

    // 8. Fire stock alerts (outside transaction)
    for (const idToAlert of itemIdsToAlert) {
      await checkAndFireAlerts(idToAlert);
    }

    // 9. Notify all cashiers
    const cashiers = await prisma.user.findMany({
      where: { role: 'CASHIER', isActive: true, isDeleted: false },
      select: { id: true },
    });
    if (cashiers.length > 0) {
      const patientObj = await prisma.patient.findUnique({ where: { id: patientId }, select: { name: true, chartNumber: true } });
      const summaryMsg = createdDispenses.length === 1
        ? `New dispense entry for ${patientObj.name} (${patientObj.chartNumber}) — pending billing`
        : `New batch dispense (${createdDispenses.length} items) for ${patientObj.name} (${patientObj.chartNumber}) — pending billing`;

      await prisma.notification.createMany({
        data: cashiers.map(c => ({
          userId: c.id,
          eventType: 'DISPENSE_PENDING_BILLING',
          message: summaryMsg,
          link: '/cashier',
        })),
      });
    }

    if (createdDispenses.length === 1) {
      res.status(201).json(createdDispenses[0]);
    } else {
      res.status(201).json({ success: true, count: createdDispenses.length, dispenses: createdDispenses });
    }
  } catch (err) {
    const knownErrors = [
      'patientId, itemId, and qty are required.',
      'Quantity must be a positive whole number.',
      'Patient not found.',
      'Cannot dispense to an inactive patient.',
      'Item not found.',
      'Cannot dispense an archived item.',
      'This item requires a formal requisition and cannot be directly dispensed.',
      'Concurrent modification detected: Insufficient batch quantity.',
      'Concurrent modification detected: Insufficient stock level.',
      'Insufficient batch quantities remaining to fulfill this dispense.',
    ];
    if (knownErrors.includes(err.message) || err.message.startsWith('Insufficient stock.')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/dispense
 * List dispense logs. Nurses see only their own; others with view_dispense_logs see all.
 */
const list = async (req, res, next) => {
  try {
    const { billingStatus, dateFrom, dateTo } = req.query;
    const { role, id: userId } = req.user;

    const where = {};

    // Nurses only see their own dispenses
    if (role === 'NURSE') where.dispensedById = userId;

    if (billingStatus && ['PENDING', 'RECORDED'].includes(billingStatus)) {
      where.billingStatus = billingStatus;
    }
    if (dateFrom || dateTo) {
      where.dispensedAt = {};
      if (dateFrom) where.dispensedAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.dispensedAt.lte = end;
      }
    }

    const logs = await prisma.dispenseLog.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, chartNumber: true } },
        item: { select: { id: true, name: true, sku: true, unit: true } },
        batch: { select: { batchNo: true, expiryDate: true } },
        dispensedBy: { select: { id: true, name: true, role: true } },
        recordedBy: { select: { id: true, name: true } },
        transactions: {
          where: { type: 'RETURN' },
          select: { qty: true }
        }
      },
      orderBy: { dispensedAt: 'desc' },
    });

    res.json(logs);
  } catch (err) { next(err); }
};

/**
 * PATCH /api/dispense/:id/record
 * Cashier marks a single dispense log as Recorded.
 */
const recordOne = async (req, res, next) => {
  try {
    const { id } = req.params;

    const log = await prisma.dispenseLog.findUnique({ where: { id } });
    if (!log) return res.status(404).json({ error: 'Dispense log not found.' });
    if (log.billingStatus === 'RECORDED') {
      return res.status(400).json({ error: 'This entry has already been recorded.' });
    }

    const updated = await prisma.dispenseLog.update({
      where: { id },
      data: {
        billingStatus: 'RECORDED',
        recordedById: req.user.id,
        recordedAt: new Date(),
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
};

/**
 * PATCH /api/dispense/bulk-record
 * Cashier bulk-marks multiple dispense logs as Recorded.
 */
const bulkRecord = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array.' });
    }

    const logs = await prisma.dispenseLog.findMany({
      where: { id: { in: ids } },
      select: { id: true, billingStatus: true }
    });

    if (logs.length !== ids.length) {
      return res.status(404).json({ error: 'One or more dispense logs were not found.' });
    }

    const alreadyRecorded = logs.filter(l => l.billingStatus === 'RECORDED');
    if (alreadyRecorded.length > 0) {
      return res.status(400).json({ error: 'One or more selected entries have already been recorded.' });
    }

    const result = await prisma.dispenseLog.updateMany({
      where: {
        id: { in: ids },
        billingStatus: 'PENDING',
      },
      data: {
        billingStatus: 'RECORDED',
        recordedById: req.user.id,
        recordedAt: new Date(),
      },
    });

    res.json({ recorded: result.count });
  } catch (err) { next(err); }
};

/**
 * GET /api/dispense/pending-count
 * Returns the count of PENDING billing entries (used for Cashier dashboard widget).
 */
const pendingCount = async (req, res, next) => {
  try {
    const count = await prisma.dispenseLog.count({
      where: { billingStatus: 'PENDING' },
    });
    res.json({ count });
  } catch (err) { next(err); }
};

module.exports = { create, list, recordOne, bulkRecord, pendingCount };
