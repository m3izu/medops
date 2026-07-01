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
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ message: 'Category removed' });
  } catch (err) { next(err); }
};

module.exports = { list, create, update, remove };
