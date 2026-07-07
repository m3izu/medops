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
        include: { stockLevel: true },
      });
      if (!item) {
        throw new Error('Item not found');
      }

      if (item.itemType === 'MEDICATION' && !batchId) {
        throw new Error('A specific medication batch must be selected for discard.');
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
      await tx.stockLevel.update({
        where: { itemId },
        data: { quantityOnHand: { decrement: quantity }, lastUpdated: new Date() },
      });

      // Update batch if specified
      if (batchId) {
        await tx.itemBatch.update({
          where: { id: batchId },
          data: { quantityRemaining: { decrement: quantity } },
        });
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
      'A specific medication batch must be selected for discard.',
      'Batch not found',
      'Selected batch does not belong to the selected item'
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
