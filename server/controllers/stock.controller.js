const prisma = require('../lib/prisma');

// Helper: check and fire stock alerts
const checkAndFireAlerts = async (itemId) => {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { stockLevel: true },
  });
  if (!item || !item.stockLevel) return;

  const qty = item.stockLevel.quantityOnHand;
  let alertLevel = null;

  if (qty <= item.criticalLevel) alertLevel = 'CRITICAL';
  else if (qty <= item.warningLevel) alertLevel = 'WARNING';

  if (!alertLevel) return;

  // Notify Inventory Managers and Top Admins
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
    select: { id: true },
  });

  if (recipients.length === 0) return;

  const eventType = `STOCK_${alertLevel}`;
  const link = `/items/${itemId}`;
  const message = `${alertLevel} stock alert: ${item.name} has ${qty} ${item.unit} remaining`;

  const notificationsToCreate = [];
  for (const recipient of recipients) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: recipient.id,
        eventType,
        link,
        isRead: false,
      },
    });

    if (!existing) {
      notificationsToCreate.push({
        userId: recipient.id,
        eventType,
        message,
        link,
      });
    }
  }

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToCreate,
    });
  }
};

const receiveStock = async (req, res, next) => {
  try {
    const { itemId, quantity, supplierId, batchNo, expiryDate, notes } = req.body;
    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'itemId and positive quantity are required' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Verify item exists
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) {
        throw new Error('Item not found');
      }
      if (item.isArchived) {
        throw new Error('Cannot receive stock for an archived item');
      }

      // Create batch if batch details provided (medications)
      let batchId = null;
      if (batchNo || expiryDate) {
        if (expiryDate) {
          const expDate = new Date(expiryDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (expDate < today) {
            throw new Error('Medication batch cannot be registered with a past expiry date.');
          }
        }

        const batch = await tx.itemBatch.create({
          data: {
            itemId,
            batchNo,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            quantityRemaining: quantity,
            supplierId,
          },
        });
        batchId = batch.id;
      }

      // Transaction log
      const txn = await tx.transactionLog.create({
        data: {
          itemId,
          batchId,
          type: 'INBOUND',
          qty: quantity,
          userId: req.user.id,
          notes,
        },
      });

      // Update stock level
      await tx.stockLevel.upsert({
        where: { itemId },
        update: { quantityOnHand: { increment: quantity }, lastUpdated: new Date() },
        create: { itemId, quantityOnHand: quantity },
      });

      return { txn, batchId };
    });

    // Re-evaluate stock alerts (stock may have come back above warning/critical)
    await checkAndFireAlerts(itemId);

    res.status(201).json({ transaction: result.txn, batchId: result.batchId });
  } catch (err) {
    if (err.message === 'Item not found') {
      return res.status(404).json({ error: err.message });
    }
    if (
      err.message === 'Cannot receive stock for an archived item' ||
      err.message === 'Medication batch cannot be registered with a past expiry date.'
    ) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const { itemId, type, userId, from, to, limit = '100' } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const where = {};
    if (itemId) where.itemId = itemId;
    if (type) where.type = type;
    if (userId) where.userId = userId;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const transactions = await prisma.transactionLog.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        user: { select: { id: true, name: true, role: true } },
        batch: { select: { batchNo: true, expiryDate: true } },
        mgmtComments: {
          include: { commentedBy: { select: { name: true } } },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit,
    });

    res.json(transactions);
  } catch (err) { next(err); }
};

let lastExpiryAlertCheck = 0;

const checkAndFireExpiryAlerts = async () => {
  const now = Date.now();
  if (now - lastExpiryAlertCheck < 5 * 60 * 1000) {
    return; // Cooldown active (Bug #19)
  }
  lastExpiryAlertCheck = now;

  const today = new Date();
  const in90 = new Date(today);
  in90.setDate(today.getDate() + 90);

  // Find all batches expiring in 90 days that still have stock
  const batches = await prisma.itemBatch.findMany({
    where: {
      expiryDate: { lte: in90, gte: today },
      quantityRemaining: { gt: 0 },
    },
    include: { item: true },
  });

  if (batches.length === 0) return;

  const recipients = await prisma.user.findMany({
    where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
    select: { id: true },
  });

  if (recipients.length === 0) return;

  for (const batch of batches) {
    const daysLeft = Math.ceil((new Date(batch.expiryDate) - today) / (1000 * 60 * 60 * 24));
    let threshold = 90;
    if (daysLeft <= 30) threshold = 30;
    else if (daysLeft <= 60) threshold = 60;

    const eventType = `EXPIRY_ALERT_${threshold}`;
    const message = `Medication batch ${batch.batchNo || 'N/A'} of ${batch.item.name} is expiring in ${daysLeft} days (Batch ID: ${batch.id})`;

    for (const recipient of recipients) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: recipient.id,
          eventType,
          message: { contains: `Batch ID: ${batch.id}` },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: recipient.id,
            eventType,
            message,
            link: '/items',
          },
        });
      }
    }
  }
};

const getAlerts = async (req, res, next) => {
  try {
    // Proactively generate notifications for expiring batches
    await checkAndFireExpiryAlerts();

    const items = await prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevel: true },
    });

    const today = new Date();
    const in90 = new Date(today); in90.setDate(today.getDate() + 90);

    const stockAlerts = items
      .filter(i => i.stockLevel)
      .map(i => {
        const qty = i.stockLevel.quantityOnHand;
        if (qty === 0) return { ...i, alertLevel: 'OUT_OF_STOCK' };
        if (qty <= i.criticalLevel) return { ...i, alertLevel: 'CRITICAL' };
        if (qty <= i.warningLevel) return { ...i, alertLevel: 'WARNING' };
        return null;
      })
      .filter(Boolean);

    const expiringBatches = await prisma.itemBatch.findMany({
      where: {
        expiryDate: { lte: in90 },
        quantityRemaining: { gt: 0 },
      },
      include: { item: { select: { id: true, name: true, sku: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    res.json({ stockAlerts, expiringBatches });
  } catch (err) { next(err); }
};

module.exports = { receiveStock, getTransactions, getAlerts, checkAndFireAlerts, checkAndFireExpiryAlerts };
