const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    res.json(suppliers);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, contactPerson, phone, email, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = await prisma.supplier.create({
      data: { name, contactPerson, phone, email, address, notes, createdById: req.user.id },
    });
    res.status(201).json(supplier);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const s = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: { items: { select: { id: true, name: true, sku: true } } },
    });
    if (!s) return res.status(404).json({ error: 'Supplier not found' });
    res.json(s);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name, contactPerson, phone, email, address, notes } = req.body;
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { name, contactPerson, phone, email, address, notes },
    });
    res.json(supplier);
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.json({ message: 'Supplier removed' });
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, update, remove };
