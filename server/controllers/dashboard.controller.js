const prisma = require('../lib/prisma');

const getSummary = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    const today = new Date();
    const in90 = new Date(today); in90.setDate(today.getDate() + 90);

    const [
      totalItems,
      pendingRequisitions,
      expiringCount,
      recentTransactions,
      itemsWithStock,
    ] = await Promise.all([
      prisma.item.count({ where: { isArchived: false } }),
      prisma.requisition.count({ where: { status: { in: ['PENDING', 'PARTIALLY_APPROVED'] } } }),
      prisma.itemBatch.count({ where: { expiryDate: { lte: in90, not: null }, quantityRemaining: { gt: 0 } } }),
      prisma.transactionLog.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: {
          item: { select: { name: true, unit: true } },
          user: { select: { name: true, role: true } },
        },
      }),
      prisma.item.findMany({
        where: { isArchived: false },
        include: { stockLevels: true },
      }),
    ]);

    let lowStockCount = 0;
    let criticalStockCount = 0;
    let outOfStockCount = 0;

    for (const item of itemsWithStock) {
      const stockLevels = item.stockLevels || [];
      const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
      const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
      const qty = ecartQty + centralQty;

      if (qty === 0) {
        outOfStockCount++;
      } else if (qty <= item.criticalLevel) {
        criticalStockCount++;
      } else if (qty <= item.warningLevel) {
        lowStockCount++;
      }
    }

    // For nurses — only their own forms
    let myPendingForms = 0;
    if (role === 'NURSE') {
      myPendingForms = await prisma.requisition.count({
        where: { submittedById: userId, status: { in: ['PENDING', 'PARTIALLY_APPROVED'] } },
      });
    }

    res.json({
      totalItems,
      pendingRequisitions,
      lowStockCount,
      criticalStockCount,
      outOfStockCount,
      expiringCount,
      recentTransactions,
      myPendingForms,
    });
  } catch (err) { next(err); }
};

const getPrefs = async (req, res, next) => {
  try {
    const prefs = await prisma.userDashboardPref.findMany({ where: { userId: req.user.id } });
    res.json(prefs);
  } catch (err) { next(err); }
};

const updatePrefs = async (req, res, next) => {
  try {
    const { prefs } = req.body; // [{ widgetKey, isVisible, displayOrder }]
    if (!Array.isArray(prefs)) {
      return res.status(400).json({ error: 'prefs must be an array of { widgetKey, isVisible, displayOrder }' });
    }
    for (const pref of prefs) {
      if (!pref.widgetKey || typeof pref.widgetKey !== 'string') continue;
      await prisma.userDashboardPref.upsert({
        where: { userId_widgetKey: { userId: req.user.id, widgetKey: pref.widgetKey } },
        update: { isVisible: !!pref.isVisible, displayOrder: parseInt(pref.displayOrder, 10) || 0 },
        create: { userId: req.user.id, widgetKey: pref.widgetKey, isVisible: !!pref.isVisible, displayOrder: parseInt(pref.displayOrder, 10) || 0 },
      });
    }
    res.json({ message: 'Preferences saved' });
  } catch (err) { next(err); }
};

module.exports = { getSummary, getPrefs, updatePrefs };
