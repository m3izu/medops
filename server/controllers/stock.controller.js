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

  const message = `${alertLevel} stock alert: ${item.name} has ${qty} ${item.unit} remaining`;
  await prisma.notification.createMany({
    data: recipients.map(u => ({
      userId: u.id,
      eventType: `STOCK_${alertLevel}`,
      message,
      link: `/items/${itemId}`,
    })),
  });
};

const receiveStock = async (req, res, next) => {
  try {
    const { itemId, quantity, supplierId, batchNo, expiryDate, notes } = req.body;
    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'itemId and positive quantity are required' });
    }

    // Create batch if batch details provided (medications)
    let batchId = null;
    if (batchNo || expiryDate) {
      const batch = await prisma.itemBatch.create({
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
    const txn = await prisma.transactionLog.create({
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
    await prisma.stockLevel.upsert({
      where: { itemId },
      update: { quantityOnHand: { increment: quantity }, lastUpdated: new Date() },
      create: { itemId, quantityOnHand: quantity },
    });

    res.status(201).json({ transaction: txn, batchId });
  } catch (err) { next(err); }
};

const getTransactions = async (req, res, next) => {
  try {
    const { itemId, type, userId, from, to, limit = 100 } = req.query;
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
      take: parseInt(limit),
    });

    res.json(transactions);
  } catch (err) { next(err); }
};

const checkAndFireExpiryAlerts = async () => {
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
