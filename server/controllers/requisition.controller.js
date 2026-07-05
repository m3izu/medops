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

    const requisition = await prisma.requisition.create({
      data: {
        patientId,
        submittedById: req.user.id,
        sessionDate: new Date(sessionDate),
        lines: {
          create: lines.map(l => ({
            itemId: l.itemId,
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
              include: { stockLevel: true, batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { expiryDate: 'asc' } } },
            },
          },
        },
      },
    });
    if (!req_) return res.status(404).json({ error: 'Requisition not found' });
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
    if (requisition.status !== 'PENDING' && requisition.status !== 'PARTIALLY_APPROVED') {
      return res.status(400).json({ error: 'Only pending requisitions can be cancelled' });
    }

    await prisma.requisition.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        cancelledBy: userId,
        cancelledAt: new Date(),
        lines: { updateMany: { where: { status: 'PENDING' }, data: { status: 'CANCELLED' } } },
      },
    });
    res.json({ message: 'Requisition cancelled' });
  } catch (err) { next(err); }
};

const approveLine = async (req, res, next) => {
  try {
    const { qtyApproved } = req.body;
    const line = await prisma.requisitionLine.findUnique({ where: { id: req.params.lineId } });
    if (!line) return res.status(404).json({ error: 'Line item not found' });
    if (line.status !== 'PENDING') return res.status(400).json({ error: 'Line item is not pending' });

    const item = await prisma.item.findUnique({
      where: { id: line.itemId },
      include: { stockLevel: true, batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { expiryDate: 'asc' } } },
    });

    if (item.itemType === 'MEDICATION' && !line.coVerifiedById) {
      return res.status(400).json({ error: 'Medication co-verification is required before approval.' });
    }

    const approvedQty = qtyApproved ?? line.qtyRequested;
    if (item.stockLevel.quantityOnHand < approvedQty) {
      return res.status(400).json({ error: 'Insufficient stock for this quantity' });
    }

    // FIFO: deduct from oldest batch first
    let remaining = approvedQty;
    for (const batch of item.batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.quantityRemaining, remaining);
      await prisma.itemBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: { decrement: deduct } },
      });
      await prisma.transactionLog.create({
        data: {
          itemId: line.itemId,
          batchId: batch.id,
          type: 'OUTBOUND',
          qty: deduct,
          userId: req.user.id,
          requisitionLineId: line.id,
        },
      });
      remaining -= deduct;
    }

    // Update stock level
    await prisma.stockLevel.update({
      where: { itemId: line.itemId },
      data: { quantityOnHand: { decrement: approvedQty }, lastUpdated: new Date() },
    });

    // Update line status
    await prisma.requisitionLine.update({
      where: { id: line.id },
      data: { status: 'APPROVED', qtyApproved: approvedQty, reviewedById: req.user.id },
    });

    // Check stock alerts
    await checkAndFireAlerts(line.itemId);

    // Update requisition status
    await updateRequisitionStatus(req.params.id);

    // Notify the submitter
    const requisition = await prisma.requisition.findUnique({ where: { id: req.params.id } });
    await prisma.notification.create({
      data: {
        userId: requisition.submittedById,
        eventType: 'REQUISITION_LINE_APPROVED',
        message: `Item request approved: ${item.name} (${approvedQty} ${item.unit})`,
        link: `/requisitions/${req.params.id}`,
      },
    });

    res.json({ message: 'Line item approved', qtyApproved: approvedQty });
  } catch (err) { next(err); }
};

const rejectLine = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ error: 'rejectionReason is required' });

    const line = await prisma.requisitionLine.findUnique({ where: { id: req.params.lineId } });
    if (!line) return res.status(404).json({ error: 'Line item not found' });
    if (line.status !== 'PENDING') return res.status(400).json({ error: 'Line item is not pending' });

    await prisma.requisitionLine.update({
      where: { id: line.id },
      data: { status: 'REJECTED', rejectionReason, reviewedById: req.user.id },
    });

    await updateRequisitionStatus(req.params.id);

    const requisition = await prisma.requisition.findUnique({ where: { id: req.params.id } });
    const item = await prisma.item.findUnique({ where: { id: line.itemId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: requisition.submittedById,
        eventType: 'REQUISITION_LINE_REJECTED',
        message: `Item request rejected: ${item.name} — ${rejectionReason}`,
        link: `/requisitions/${req.params.id}`,
      },
    });

    res.json({ message: 'Line item rejected' });
  } catch (err) { next(err); }
};

const resubmitLine = async (req, res, next) => {
  try {
    const { itemId, quantity, reason } = req.body;
    const originalLine = await prisma.requisitionLine.findUnique({ where: { id: req.params.lineId } });
    if (!originalLine) return res.status(404).json({ error: 'Original line not found' });
    if (originalLine.status !== 'REJECTED') return res.status(400).json({ error: 'Only rejected lines can be resubmitted' });

    const newLine = await prisma.requisitionLine.create({
      data: {
        requisitionId: originalLine.requisitionId,
        itemId: itemId || originalLine.itemId,
        qtyRequested: quantity || originalLine.qtyRequested,
        reason: reason || originalLine.reason,
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
      include: { item: true }
    });

    if (!line) return res.status(404).json({ error: 'Line item not found' });
    if (line.status !== 'PENDING') return res.status(400).json({ error: 'Only pending items can be co-verified' });
    if (line.item.itemType !== 'MEDICATION') return res.status(400).json({ error: 'Co-verification is only allowed for Medications' });
    if (line.coVerifiedById) return res.status(400).json({ error: 'This item has already been co-verified' });

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
async function updateRequisitionStatus(requisitionId) {
  const lines = await prisma.requisitionLine.findMany({ where: { requisitionId } });
  const statuses = lines.map(l => l.status);
  let newStatus = 'PENDING';
  if (statuses.every(s => s === 'APPROVED')) newStatus = 'FULLY_APPROVED';
  else if (statuses.every(s => s === 'REJECTED' || s === 'CANCELLED')) newStatus = 'REJECTED';
  else if (statuses.some(s => s === 'APPROVED')) newStatus = 'PARTIALLY_APPROVED';

  await prisma.requisition.update({ where: { id: requisitionId }, data: { status: newStatus } });
}

module.exports = { list, create, getOne, cancel, approveLine, rejectLine, resubmitLine, coVerifyLine };
