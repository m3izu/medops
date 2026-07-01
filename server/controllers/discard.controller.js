const prisma = require('../lib/prisma');
const { checkAndFireAlerts } = require('./stock.controller');

const logDiscard = async (req, res, next) => {
  try {
    const { itemId, batchId, quantity, reason, notes } = req.body;
    if (!itemId || !quantity || !reason) {
      return res.status(400).json({ error: 'itemId, quantity, and reason are required' });
    }

    const discard = await prisma.discardLog.create({
      data: { itemId, batchId, qty: quantity, reason, notes, loggedById: req.user.id },
    });

    // Update stock level
    await prisma.stockLevel.update({
      where: { itemId },
      data: { quantityOnHand: { decrement: quantity }, lastUpdated: new Date() },
    });

    // Update batch if specified
    if (batchId) {
      await prisma.itemBatch.update({
        where: { id: batchId },
        data: { quantityRemaining: { decrement: quantity } },
      });
    }

    // Transaction log entry
    await prisma.transactionLog.create({
      data: { itemId, batchId, type: 'DISCARD', qty: quantity, userId: req.user.id, notes: `${reason}: ${notes || ''}` },
    });

    // Fire stock alerts
    await checkAndFireAlerts(itemId);

    res.status(201).json(discard);
  } catch (err) { next(err); }
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
