const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const reports = await prisma.monthlyReport.findMany({
      include: { generatedBy: { select: { name: true } } },
      orderBy: { generatedAt: 'desc' },
    });
    res.json(reports);
  } catch (err) { next(err); }
};

const generate = async (req, res, next) => {
  try {
    // Get the last report's end date or default to 30 days ago
    const lastReport = await prisma.monthlyReport.findFirst({ orderBy: { generatedAt: 'desc' } });
    const periodStart = lastReport ? lastReport.periodEnd : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    const report = await prisma.monthlyReport.create({
      data: {
        periodStart,
        periodEnd,
        generatedById: req.user.id,
      },
    });

    // Notify top admin
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        eventType: 'MONTHLY_REPORT_GENERATED',
        message: `Monthly report generated for ${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`,
        link: `/reports/${report.id}`,
      },
    });

    res.status(201).json(report);
  } catch (err) { next(err); }
};

const getSchedule = async (req, res, next) => {
  try {
    const schedule = await prisma.reportSchedule.findUnique({ where: { id: 1 } });
    res.json(schedule || { dayOfMonth: 1, isActive: true });
  } catch (err) { next(err); }
};

const updateSchedule = async (req, res, next) => {
  try {
    const { dayOfMonth, isActive } = req.body;
    const schedule = await prisma.reportSchedule.upsert({
      where: { id: 1 },
      update: { dayOfMonth, isActive },
      create: { id: 1, dayOfMonth, isActive },
    });
    res.json(schedule);
  } catch (err) { next(err); }
};

module.exports = { list, generate, getSchedule, updateSchedule };
