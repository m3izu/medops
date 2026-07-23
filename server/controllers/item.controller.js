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
        stockLevels: true,
        category: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Apply stock status filter based on combined total stock across both pools
    const withStatus = items.map(item => {
      const stockLevels = item.stockLevels || [];
      const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
      const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
      const totalQty = ecartQty + centralQty;

      let status = 'IN_STOCK';
      if (totalQty === 0) status = 'OUT_OF_STOCK';
      else if (totalQty <= item.criticalLevel) status = 'CRITICAL';
      else if (totalQty <= item.warningLevel) status = 'WARNING';

      return {
        ...item,
        ecartQty,
        centralQty,
        totalQty,
        quantityOnHand: totalQty, // backward compatibility
        stockStatus: status,
      };
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
      supplierId, serialNumber, acquisitionDate, condition, dispenseMode } = req.body;

    if (!name || !sku || !itemType || !unit) {
      return res.status(400).json({ error: 'name, sku, itemType, and unit are required' });
    }

    if (warningLevel !== undefined && (typeof warningLevel !== 'number' || warningLevel < 0)) {
      return res.status(400).json({ error: 'Warning level must be a non-negative number' });
    }
    if (criticalLevel !== undefined && (typeof criticalLevel !== 'number' || criticalLevel < 0)) {
      return res.status(400).json({ error: 'Critical level must be a non-negative number' });
    }

    const validModes = ['REQUISITION_ONLY', 'DIRECT_DISPENSE', 'FLEXIBLE'];
    if (dispenseMode && !validModes.includes(dispenseMode)) {
      return res.status(400).json({ error: 'Invalid dispenseMode. Must be REQUISITION_ONLY, DIRECT_DISPENSE, or FLEXIBLE.' });
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
        dispenseMode: dispenseMode ?? 'REQUISITION_ONLY',
        acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : null,
        createdById: req.user.id,
        stockLevels: {
          create: [
            { location: 'ECART', quantityOnHand: 0 },
            { location: 'CENTRAL', quantityOnHand: 0 },
          ],
        },
      },
      include: { stockLevels: true },
    });

    const stockLevels = item.stockLevels || [];
    const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
    const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
    const totalQty = ecartQty + centralQty;

    res.status(201).json({
      ...item,
      ecartQty,
      centralQty,
      totalQty,
      quantityOnHand: totalQty,
    });
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: {
        stockLevels: true,
        category: { include: { parent: true } },
        supplier: true,
        batches: { where: { quantityRemaining: { gt: 0 } }, orderBy: { expiryDate: 'asc' } },
      },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const stockLevels = item.stockLevels || [];
    const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
    const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
    const totalQty = ecartQty + centralQty;

    res.json({
      ...item,
      ecartQty,
      centralQty,
      totalQty,
      quantityOnHand: totalQty,
    });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name, categoryId, unit, warningLevel, criticalLevel, supplierId, condition, dispenseMode } = req.body;
    
    if (warningLevel !== undefined && (typeof warningLevel !== 'number' || warningLevel < 0)) {
      return res.status(400).json({ error: 'Warning level must be a non-negative number' });
    }
    if (criticalLevel !== undefined && (typeof criticalLevel !== 'number' || criticalLevel < 0)) {
      return res.status(400).json({ error: 'Critical level must be a non-negative number' });
    }

    const validModes = ['REQUISITION_ONLY', 'DIRECT_DISPENSE', 'FLEXIBLE'];
    if (dispenseMode && !validModes.includes(dispenseMode)) {
      return res.status(400).json({ error: 'Invalid dispenseMode.' });
    }

    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: { name, categoryId, unit, warningLevel, criticalLevel, supplierId, condition, dispenseMode },
      include: { stockLevels: true },
    });

    const stockLevels = item.stockLevels || [];
    const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
    const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
    const totalQty = ecartQty + centralQty;

    res.json({
      ...item,
      ecartQty,
      centralQty,
      totalQty,
      quantityOnHand: totalQty,
    });
  } catch (err) { next(err); }
};

const toggleArchive = async (req, res, next) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: {
        stockLevels: true,
        batches: { where: { quantityRemaining: { gt: 0 } } }
      }
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Prevent archiving an item with remaining stock
    if (!item.isArchived) {
      const stockLevels = item.stockLevels || [];
      const totalQty = stockLevels.reduce((sum, s) => sum + (s.quantityOnHand || 0), 0);
      const activeBatchesCount = item.batches ? item.batches.length : 0;

      if (totalQty > 0 || activeBatchesCount > 0) {
        return res.status(400).json({
          error: `Cannot archive item with positive stock on hand (${totalQty} ${item.unit}) or active batch inventory. Discard or transfer remaining stock before archiving.`
        });
      }
    }

    const updated = await prisma.item.update({
      where: { id: req.params.id },
      data: { isArchived: !item.isArchived },
    });
    res.json({ isArchived: updated.isArchived });
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, update, toggleArchive };
