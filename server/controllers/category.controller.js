const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const cats = await prisma.category.findMany({
      include: { children: true },
      where: { parentId: null },
      orderBy: { name: 'asc' },
    });
    res.json(cats);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, parentId, hasBatchControl } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    let finalHasBatchControl = !!hasBatchControl;
    if (parentId && hasBatchControl === undefined) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } });
      if (parent?.hasBatchControl) {
        finalHasBatchControl = true;
      }
    }

    const cat = await prisma.category.create({
      data: { 
        name, 
        parentId: parentId || null, 
        hasBatchControl: finalHasBatchControl, 
        createdById: req.user.id 
      },
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name, hasBatchControl } = req.body;

    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const cat = await prisma.category.update({
      where: { id: req.params.id },
      data: { name, hasBatchControl },
    });

    // If hasBatchControl toggled from false/null to true, retroactively create batches for active items in this category
    if (hasBatchControl && !existing.hasBatchControl) {
      const categoriesToCheck = [req.params.id];
      const queue = [req.params.id];
      while (queue.length > 0) {
        const currentId = queue.shift();
        const children = await prisma.category.findMany({ 
          where: { parentId: currentId },
          select: { id: true }
        });
        for (const child of children) {
          if (!categoriesToCheck.includes(child.id)) {
            categoriesToCheck.push(child.id);
            queue.push(child.id);
          }
        }
      }

      const items = await prisma.item.findMany({
        where: { categoryId: { in: categoriesToCheck }, isArchived: false },
        include: { stockLevel: true, batches: true }
      });

      for (const item of items) {
        const qty = item.stockLevel?.quantityOnHand ?? 0;
        const activeBatchesCount = item.batches.filter(b => b.quantityRemaining > 0).length;
        if (qty > 0 && activeBatchesCount === 0) {
          await prisma.itemBatch.create({
            data: {
              itemId: item.id,
              batchNo: `IMPORT-${item.sku.trim()}`,
              expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year default
              quantityRemaining: qty,
              supplierId: item.supplierId
            }
          });
        }
      }
    }

    res.json(cat);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const categoryId = req.params.id;
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { 
        children: true, 
        items: { where: { isArchived: false } }
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.children.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete category because it has subcategories. Please delete or reassign them first.'
      });
    }

    if (category.items.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete category because it contains active inventory items. Please reassign or remove them first.'
      });
    }

    await prisma.category.delete({ where: { id: categoryId } });
    res.json({ message: 'Category removed' });
  } catch (err) { next(err); }
};

module.exports = { list, create, update, remove };
