const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const { category, itemType, stockStatus, search } = req.query;
    const where = { isArchived: false };
    if (category) where.categoryId = category;
    if (itemType) where.itemType = itemType;
    if (search) where.OR = [
      { name: { contains: search } },
      { sku: { contains: search } },
    ];

    const items = await prisma.item.findMany({
      where,
      include: {
        stockLevel: true,
        category: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Apply stock status filter
    const withStatus = items.map(item => {
      const qty = item.stockLevel?.quantityOnHand ?? 0;
      let status = 'IN_STOCK';
      if (qty === 0) status = 'OUT_OF_STOCK';
      else if (qty <= item.criticalLevel) status = 'CRITICAL';
      else if (qty <= item.warningLevel) status = 'WARNING';
      return { ...item, stockStatus: status };
    });

    const filtered = stockStatus
      ? withStatus.filter(i => i.stockStatus === stockStatus)
      : withStatus;

    res.json(filtered);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, sku, categoryId, itemType, unit, warningLevel, criticalLevel,
      supplierId, serialNumber, acquisitionDate, condition } = req.body;

    if (!name || !sku || !itemType || !unit) {
      return res.status(400).json({ error: 'name, sku, itemType, and unit are required' });
    }

    const item = await prisma.item.create({
      data: {
        name, sku, categoryId, itemType, unit,
        warningLevel: warningLevel ?? 10,
        criticalLevel: criticalLevel ?? 5,
        supplierId, serialNumber, condition,
        acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : null,
        createdById: req.user.id,
        stockLevel: { create: { quantityOnHand: 0 } },
      },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: {
        stockLevel: true,
        category: { include: { parent: true } },
        supplier: true,
        batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { expiryDate: 'asc' } },
      },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name, categoryId, unit, warningLevel, criticalLevel, supplierId, condition } = req.body;
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: { name, categoryId, unit, warningLevel, criticalLevel, supplierId, condition },
    });
    res.json(item);
  } catch (err) { next(err); }
};

const toggleArchive = async (req, res, next) => {
  try {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const updated = await prisma.item.update({
      where: { id: req.params.id },
      data: { isArchived: !item.isArchived },
    });
    res.json({ isArchived: updated.isArchived });
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, update, toggleArchive };
