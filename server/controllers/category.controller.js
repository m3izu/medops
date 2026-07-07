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
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const cat = await prisma.category.create({
      data: { name, parentId: parentId || null, createdById: req.user.id },
    });
    res.status(201).json(cat);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const cat = await prisma.category.update({
      where: { id: req.params.id },
      data: { name: req.body.name },
    });
    res.json(cat);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const categoryId = req.params.id;
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true, items: true },
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
