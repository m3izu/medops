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

const createReportInternal = async (userId) => {
  const lastReport = await prisma.monthlyReport.findFirst({ orderBy: { generatedAt: 'desc' } });
  const periodStart = lastReport ? lastReport.periodEnd : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const periodEnd   = new Date();
  const in90        = new Date(); in90.setDate(in90.getDate() + 90);

  const [
    inventorySummary,
    lowStockItemsRaw,
    expiringBatches,
    inboundLogs,
    outboundLogs,
    discardLogs,
    adjustmentLogs,
    requisitions,
    returnLogs,
  ] = await Promise.all([
    prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevel: true },
      orderBy: { name: 'asc' },
    }),
    prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevel: true },
    }),
    prisma.itemBatch.findMany({
      where: { expiryDate: { lte: in90, not: null }, quantityRemaining: { gt: 0 } },
      include: { item: { select: { name: true, sku: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
    }),
    prisma.transactionLog.findMany({
      where: { type: 'INBOUND', timestamp: { gte: periodStart, lte: periodEnd } },
      include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.transactionLog.findMany({
      where: { type: { in: ['OUTBOUND', 'DISPENSE'] }, timestamp: { gte: periodStart, lte: periodEnd } },
      include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.discardLog.findMany({
      where: { timestamp: { gte: periodStart, lte: periodEnd } },
      include: {
        item: { select: { name: true, sku: true } },
        loggedBy: { select: { name: true } },
      },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.transactionLog.findMany({
      where: { type: 'ADJUSTMENT', timestamp: { gte: periodStart, lte: periodEnd } },
      include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.requisition.findMany({
      where: { createdAt: { gte: periodStart, lte: periodEnd } },
      include: {
        patient: { select: { name: true, chartNumber: true } },
        submittedBy: { select: { name: true } },
        lines: {
          include: { item: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transactionLog.findMany({
      where: { type: 'RETURN', timestamp: { gte: periodStart, lte: periodEnd } },
      include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { timestamp: 'desc' },
    }),
  ]);

  const lowStockItems = lowStockItemsRaw.filter(item => {
    const qty = item.stockLevel?.quantityOnHand ?? 0;
    return qty <= item.warningLevel;
  });

  const compiledData = {
    inventorySummary,
    lowStockItems,
    expiringBatches,
    inboundLogs,
    outboundLogs,
    discardLogs,
    adjustmentLogs,
    requisitions,
    returnLogs,
  };

  const report = await prisma.monthlyReport.create({
    data: {
      periodStart,
      periodEnd,
      generatedById: userId,
      reportData: JSON.stringify(compiledData),
    },
  });

  if (userId) {
    await prisma.notification.create({
      data: {
        userId,
        eventType: 'MONTHLY_REPORT_GENERATED',
        message: `Monthly report generated for ${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}`,
        link: `/reports`,
      },
    });
  }

  return {
    ...report,
    sections: {
      inventoryCount: inventorySummary.length,
      expiringBatchCount: expiringBatches.length,
      inboundCount: inboundLogs.length,
      outboundCount: outboundLogs.length,
      discardCount: discardLogs.length,
      adjustmentCount: adjustmentLogs.length,
      requisitionCount: requisitions.length,
      returnCount: returnLogs.length,
    },
  };
};

const generate = async (req, res, next) => {
  try {
    const reportData = await createReportInternal(req.user.id);
    res.status(201).json(reportData);
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
    const day = parseInt(dayOfMonth, 10);
    if (isNaN(day) || day < 1 || day > 28) {
      return res.status(400).json({ error: 'dayOfMonth must be an integer between 1 and 28' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }
    const schedule = await prisma.reportSchedule.upsert({
      where: { id: 1 },
      update: { dayOfMonth: day, isActive },
      create: { id: 1, dayOfMonth: day, isActive },
    });
    res.json(schedule);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const report = await prisma.monthlyReport.findUnique({
      where: { id: req.params.id },
      include: { generatedBy: { select: { name: true } } }
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (report.reportData) {
      try {
        const parsedData = JSON.parse(report.reportData);
        return res.json({
          report,
          data: parsedData,
        });
      } catch (parseErr) {
        console.error('Failed to parse historical reportData JSON:', parseErr);
      }
    }

    const periodStart = report.periodStart;
    const periodEnd = report.periodEnd;
    const in90 = new Date(report.generatedAt); in90.setDate(in90.getDate() + 90);

    // Compile all 9 sections in parallel for this period
    const [
      inventorySummary,
      lowStockItemsRaw,
      expiringBatches,
      inboundLogs,
      outboundLogs,
      discardLogs,
      adjustmentLogs,
      requisitions,
      returnLogs,
    ] = await Promise.all([
      // 1. Full inventory snapshot
      prisma.item.findMany({
        where: { isArchived: false },
        include: { stockLevel: true },
        orderBy: { name: 'asc' },
      }),
      // 2. Items below warning/critical
      prisma.item.findMany({
        where: { isArchived: false },
        include: { stockLevel: true },
      }),
      // 3. Expiring batches within 90 days
      prisma.itemBatch.findMany({
        where: { expiryDate: { lte: in90, not: null }, quantityRemaining: { gt: 0 } },
        include: { item: { select: { name: true, sku: true, unit: true } } },
        orderBy: { expiryDate: 'asc' },
      }),
      // 4. Inbound transactions in period
      prisma.transactionLog.findMany({
        where: { type: 'INBOUND', timestamp: { gte: periodStart, lte: periodEnd } },
        include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      // 5. Outbound (dispensing) in period
      prisma.transactionLog.findMany({
        where: { type: { in: ['OUTBOUND', 'DISPENSE'] }, timestamp: { gte: periodStart, lte: periodEnd } },
        include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      // 6. Discard logs in period
      prisma.discardLog.findMany({
        where: { timestamp: { gte: periodStart, lte: periodEnd } },
        include: {
          item: { select: { name: true, sku: true } },
          loggedBy: { select: { name: true } },
        },
        orderBy: { timestamp: 'desc' },
      }),
      // 7. Stocktake adjustments in period
      prisma.transactionLog.findMany({
        where: { type: 'ADJUSTMENT', timestamp: { gte: periodStart, lte: periodEnd } },
        include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      // 8. Requisition activity in period
      prisma.requisition.findMany({
        where: { createdAt: { gte: periodStart, lte: periodEnd } },
        include: {
          patient: { select: { name: true, chartNumber: true } },
          submittedBy: { select: { name: true } },
          lines: {
            include: { item: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // 9. Return transactions in period
      prisma.transactionLog.findMany({
        where: { type: 'RETURN', timestamp: { gte: periodStart, lte: periodEnd } },
        include: { item: { select: { name: true, sku: true } }, user: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const lowStockItems = lowStockItemsRaw.filter(item => {
      const qty = item.stockLevel?.quantityOnHand ?? 0;
      return qty <= item.warningLevel;
    });

    res.json({
      report,
      data: {
        inventorySummary,
        lowStockItems,
        expiringBatches,
        inboundLogs,
        outboundLogs,
        discardLogs,
        adjustmentLogs,
        requisitions,
        returnLogs,
      }
    });
  } catch (err) { next(err); }
};

module.exports = { list, generate, getSchedule, updateSchedule, getOne, createReportInternal };
