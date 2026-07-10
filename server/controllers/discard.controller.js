const prisma = require('../lib/prisma');
const { checkAndFireAlerts } = require('./stock.controller');

const logDiscard = async (req, res, next) => {
  try {
    const { itemId, batchId, quantity, reason, notes } = req.body;
    if (!itemId || !quantity || !reason) {
      return res.status(400).json({ error: 'itemId, quantity, and reason are required' });
    }
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ error: 'Discard quantity must be a positive number' });
    }

    let discard;
    await prisma.$transaction(async (tx) => {
      // Verify item and stock level inside transaction
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { stockLevel: true, category: true },
      });
      if (!item) {
        throw new Error('Item not found');
      }
      if (item.isArchived) {
        throw new Error('Cannot discard stock for an archived item');
      }

      const isBatch = item.itemType === 'MEDICATION' || (item.category?.hasBatchControl ?? false);
      if (isBatch && !batchId) {
        throw new Error('A specific batch must be selected for discard.');
      }

      if (!item.stockLevel || item.stockLevel.quantityOnHand < quantity) {
        throw new Error(`Insufficient stock on hand to discard ${quantity} unit(s). Current: ${item.stockLevel?.quantityOnHand ?? 0}`);
      }

      // Verify batch if specified
      if (batchId) {
        const batch = await tx.itemBatch.findUnique({ where: { id: batchId } });
        if (!batch) {
          throw new Error('Batch not found');
        }
        if (batch.itemId !== itemId) {
          throw new Error('Selected batch does not belong to the selected item');
        }
        if (batch.quantityRemaining < quantity) {
          throw new Error(`Insufficient quantity in selected batch. Current remaining: ${batch.quantityRemaining}`);
        }
      }

      discard = await tx.discardLog.create({
        data: { itemId, batchId, qty: quantity, reason, notes, loggedById: req.user.id },
      });

      // Update stock level
      const updatedStock = await tx.stockLevel.updateMany({
        where: { itemId, quantityOnHand: { gte: quantity } },
        data: { quantityOnHand: { decrement: quantity }, lastUpdated: new Date() },
      });
      if (updatedStock.count === 0) {
        throw new Error('Concurrent modification detected: Insufficient stock level.');
      }

      // Update batch if specified
      if (batchId) {
        const updatedBatch = await tx.itemBatch.updateMany({
          where: { id: batchId, quantityRemaining: { gte: quantity } },
          data: { quantityRemaining: { decrement: quantity } },
        });
        if (updatedBatch.count === 0) {
          throw new Error('Concurrent modification detected: Insufficient batch quantity.');
        }
      }

      // Transaction log entry
      await tx.transactionLog.create({
        data: { itemId, batchId, type: 'DISCARD', qty: quantity, userId: req.user.id, notes: `${reason}: ${notes || ''}` },
      });
    });

    // Fire stock alerts
    await checkAndFireAlerts(itemId);

    res.status(201).json(discard);
  } catch (err) {
    const knownErrors = [
      'Item not found',
      'Cannot discard stock for an archived item',
      'A specific batch must be selected for discard.',
      'Batch not found',
      'Selected batch does not belong to the selected item',
      'Concurrent modification detected: Insufficient batch quantity.',
      'Concurrent modification detected: Insufficient stock level.'
    ];
    if (knownErrors.includes(err.message) || err.message.startsWith('Insufficient stock on hand') || err.message.startsWith('Insufficient quantity in selected batch')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const discards = await prisma.discardLog.findMany({
      include: {
        item: { select: { name: true, sku: true } },
        batch: { select: { batchNo: true, expiryDate: true } },
        loggedBy: { select: { name: true, role: true } },
      },
      orderBy: { timestamp: 'desc' },
    });
    res.json(discards);
  } catch (err) { next(err); }
};

module.exports = { logDiscard, list };
