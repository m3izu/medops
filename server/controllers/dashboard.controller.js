const prisma = require('../lib/prisma');

const getSummary = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    const today = new Date();
    const in90 = new Date(today); in90.setDate(today.getDate() + 90);

    const [
      totalItems,
      pendingRequisitions,
      lowStockCount,
      criticalStockCount,
      outOfStockCount,
      expiringCount,
      recentTransactions,
    ] = await Promise.all([
      prisma.item.count({ where: { isArchived: false } }),
      prisma.requisition.count({ where: { status: { in: ['PENDING', 'PARTIALLY_APPROVED'] } } }),
      prisma.stockLevel.count({ where: { item: { isArchived: false, warningLevel: { gt: 0 } }, quantityOnHand: { gt: 0 } } }),
      prisma.stockLevel.count({ where: { item: { isArchived: false }, quantityOnHand: { gt: 0 } } }),
      prisma.stockLevel.count({ where: { quantityOnHand: 0 } }),
      prisma.itemBatch.count({ where: { expiryDate: { lte: in90 }, quantityRemaining: { gt: 0 } } }),
      prisma.transactionLog.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: {
          item: { select: { name: true, unit: true } },
          user: { select: { name: true, role: true } },
        },
      }),
    ]);

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
    for (const pref of prefs) {
      await prisma.userDashboardPref.upsert({
        where: { userId_widgetKey: { userId: req.user.id, widgetKey: pref.widgetKey } },
        update: { isVisible: pref.isVisible, displayOrder: pref.displayOrder },
        create: { userId: req.user.id, widgetKey: pref.widgetKey, isVisible: pref.isVisible, displayOrder: pref.displayOrder },
      });
    }
    res.json({ message: 'Preferences saved' });
  } catch (err) { next(err); }
};

module.exports = { getSummary, getPrefs, updatePrefs };
