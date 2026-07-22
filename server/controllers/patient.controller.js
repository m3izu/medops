const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) where.OR = [
      { name: { contains: search } },
      { chartNumber: { contains: search } },
    ];
    const patients = await prisma.patient.findMany({ where, orderBy: { name: 'asc' } });
    res.json(patients);
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { name, chartNumber, diagnosis, schedule, firstSessionDate, contact } = req.body;
    if (!name || !chartNumber) return res.status(400).json({ error: 'name and chartNumber are required' });

    const existing = await prisma.patient.findUnique({ where: { chartNumber: chartNumber.trim() } });
    if (existing) {
      return res.status(400).json({ error: `Chart number "${chartNumber}" is already in use.` });
    }

    let parsedFirstSessionDate = null;
    if (firstSessionDate) {
      const d = new Date(firstSessionDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Invalid first session date format.' });
      }
      parsedFirstSessionDate = d;
    }

    const patient = await prisma.patient.create({
      data: {
        name, chartNumber: chartNumber.trim(), diagnosis, schedule,
        firstSessionDate: parsedFirstSessionDate,
        contact,
        managedById: req.user.id,
      },
    });
    res.status(201).json(patient);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        requisitions: {
          include: { lines: { include: { item: { select: { name: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const { name, diagnosis, schedule, firstSessionDate, contact } = req.body;

    let parsedDate = undefined;
    if (firstSessionDate === null || firstSessionDate === '') {
      parsedDate = null;
    } else if (firstSessionDate !== undefined) {
      parsedDate = new Date(firstSessionDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid first session date format' });
      }
    }

    const patient = await prisma.patient.update({
      where: { id: req.params.id },
      data: { name, diagnosis, schedule, firstSessionDate: parsedDate, contact },
    });
    res.json(patient);
  } catch (err) { next(err); }
};

const toggleStatus = async (req, res, next) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const updated = await prisma.patient.update({
      where: { id: req.params.id },
      data: { status: patient.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
    });
    res.json({ status: updated.status });
  } catch (err) { next(err); }
};

module.exports = { list, create, getOne, update, toggleStatus };
