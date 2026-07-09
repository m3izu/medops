const prisma = require('../lib/prisma');
const { getEffectivePermissions } = require('../middleware/rbac');

const list = async (req, res, next) => {
  try {
    const { category, itemType, stockStatus, search, archived } = req.query;

    // Check permission to view archived items
    const perms = await getEffectivePermissions(req.user.id, req.user.role);
    const canViewArchived = !!perms['view_archived_items'];

    const where = { isArchived: canViewArchived ? (archived === 'true') : false };
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

    if (warningLevel !== undefined && (typeof warningLevel !== 'number' || warningLevel < 0)) {
      return res.status(400).json({ error: 'Warning level must be a non-negative number' });
    }
    if (criticalLevel !== undefined && (typeof criticalLevel !== 'number' || criticalLevel < 0)) {
      return res.status(400).json({ error: 'Critical level must be a non-negative number' });
    }

    const existing = await prisma.item.findUnique({ where: { sku: sku.trim() } });
    if (existing) {
      return res.status(400).json({ error: `SKU "${sku}" is already in use.` });
    }

    const item = await prisma.item.create({
      data: {
        name, sku: sku.trim(), categoryId, itemType, unit,
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
    
    if (warningLevel !== undefined && (typeof warningLevel !== 'number' || warningLevel < 0)) {
      return res.status(400).json({ error: 'Warning level must be a non-negative number' });
    }
    if (criticalLevel !== undefined && (typeof criticalLevel !== 'number' || criticalLevel < 0)) {
      return res.status(400).json({ error: 'Critical level must be a non-negative number' });
    }

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
