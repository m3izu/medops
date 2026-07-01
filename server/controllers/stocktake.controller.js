const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const stocktakes = await prisma.stocktake.findMany({
      include: { initiatedBy: { select: { name: true } } },
      orderBy: { initiatedAt: 'desc' },
    });
    res.json(stocktakes);
  } catch (err) { next(err); }
};

const initiate = async (req, res, next) => {
  try {
    const items = await prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevel: true },
    });

    const stocktake = await prisma.stocktake.create({
      data: {
        initiatedById: req.user.id,
        lines: {
          create: items.map(item => ({
            itemId: item.id,
            systemQty: item.stockLevel?.quantityOnHand ?? 0,
          })),
        },
      },
    });

    // Notify all clinic staff
    const staff = await prisma.user.findMany({
      where: { isActive: true, isDeleted: false, role: { notIn: ['MANAGEMENT_OFFICE'] } },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: staff.map(s => ({
        userId: s.id,
        eventType: 'STOCKTAKE_INITIATED',
        message: 'A stocktake has been initiated. Please assist with physical counting.',
        link: `/stocktakes/${stocktake.id}`,
      })),
    });

    res.status(201).json(stocktake);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const st = await prisma.stocktake.findUnique({
      where: { id: req.params.id },
      include: {
        initiatedBy: { select: { name: true } },
        lines: {
          include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
        },
      },
    });
    if (!st) return res.status(404).json({ error: 'Stocktake not found' });
    res.json(st);
  } catch (err) { next(err); }
};

const updateLine = async (req, res, next) => {
  try {
    const { physicalQty } = req.body;
    const line = await prisma.stocktakeLine.findUnique({ where: { id: req.params.lineId } });
    const discrepancy = physicalQty - line.systemQty;
    await prisma.stocktakeLine.update({
      where: { id: req.params.lineId },
      data: { physicalQty, discrepancy, approvedById: req.user.id },
    });
    res.json({ discrepancy });
  } catch (err) { next(err); }
};

const complete = async (req, res, next) => {
  try {
    const lines = await prisma.stocktakeLine.findMany({ where: { stocktakeId: req.params.id } });

    // Apply adjustments where there's a discrepancy
    for (const line of lines) {
      if (line.physicalQty !== null && line.discrepancy !== 0) {
        await prisma.stockLevel.update({
          where: { itemId: line.itemId },
          data: { quantityOnHand: line.physicalQty, lastUpdated: new Date() },
        });
        await prisma.transactionLog.create({
          data: {
            itemId: line.itemId,
            type: 'ADJUSTMENT',
            qty: line.discrepancy,
            userId: req.user.id,
            notes: `Stocktake adjustment. System: ${line.systemQty}, Physical: ${line.physicalQty}`,
          },
        });
      }
    }

    await prisma.stocktake.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    res.json({ message: 'Stocktake completed and adjustments applied' });
  } catch (err) { next(err); }
};

module.exports = { list, initiate, getOne, updateLine, complete };
