const prisma = require('../lib/prisma');

// Helper to parse date range or fallback to current month
const parseDateRange = (from, to) => {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const startDate = from ? new Date(from) : defaultFrom;
  const endDate = to ? new Date(to) : defaultTo;

  // Set endDate to end of day if only YYYY-MM-DD string is provided without time
  if (to && !to.includes('T')) {
    endDate.setHours(23, 59, 59, 999);
  }
  if (from && !from.includes('T')) {
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
};

// Helper to generate daily bucket map for sparkline data
const generateDailyBuckets = (startDate, endDate) => {
  const buckets = {};
  const current = new Date(startDate);
  // Cap max days to 180 for sparkline sanity
  let daysCount = 0;
  while (current <= endDate && daysCount < 180) {
    const key = current.toISOString().split('T')[0];
    buckets[key] = { date: key, qty: 0, count: 0 };
    current.setDate(current.getDate() + 1);
    daysCount++;
  }
  return buckets;
};

/**
 * GET /api/reports/live/summary
 * Returns high-level metrics & daily sparklines for all 11 report sections.
 */
const liveSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const { startDate, endDate } = parseDateRange(from, to);
    const in90 = new Date();
    in90.setDate(in90.getDate() + 90);

    const [
      itemsWithStock,
      expiringBatches,
      inboundLogs,
      outboundLogs,
      discardLogs,
      adjustmentLogs,
      requisitions,
      returnLogs,
      stockTransfers,
      dispenseLogs,
    ] = await Promise.all([
      // 1 & 2: Inventory & Low Stock
      prisma.item.findMany({
        where: { isArchived: false },
        include: { stockLevels: true },
      }),
      // 3: Expiring Batches
      prisma.itemBatch.findMany({
        where: { expiryDate: { lte: in90, not: null }, quantityRemaining: { gt: 0 } },
        include: { item: { select: { name: true, sku: true, unit: true } } },
      }),
      // 4: Inbound Logs
      prisma.transactionLog.findMany({
        where: { type: 'INBOUND', timestamp: { gte: startDate, lte: endDate } },
        select: { qty: true, timestamp: true },
      }),
      // 5: Outbound Logs
      prisma.transactionLog.findMany({
        where: { type: { in: ['OUTBOUND', 'DISPENSE', 'TRANSFER_OUT'] }, timestamp: { gte: startDate, lte: endDate } },
        select: { qty: true, timestamp: true },
      }),
      // 6: Discard Logs
      prisma.discardLog.findMany({
        where: { timestamp: { gte: startDate, lte: endDate } },
        select: { qty: true, reason: true, timestamp: true },
      }),
      // 7: Adjustment Logs
      prisma.transactionLog.findMany({
        where: { type: 'ADJUSTMENT', timestamp: { gte: startDate, lte: endDate } },
        select: { qty: true, timestamp: true },
      }),
      // 8: Requisitions
      prisma.requisition.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { status: true, createdAt: true },
      }),
      // 9: Returns
      prisma.transactionLog.findMany({
        where: { type: 'RETURN', timestamp: { gte: startDate, lte: endDate } },
        select: { qty: true, timestamp: true },
      }),
      // 10: Stock Transfers
      prisma.stockTransfer.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { status: true, createdAt: true },
      }),
      // 11: Direct Dispenses
      prisma.dispenseLog.findMany({
        where: { dispensedAt: { gte: startDate, lte: endDate } },
        select: { qty: true, billingStatus: true, dispensedAt: true },
      }),
    ]);

    // Calculate Section 1 & 2 (Inventory & Low Stock)
    let totalQoH = 0;
    let ecartQoH = 0;
    let centralQoH = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let outOfStockCount = 0;

    itemsWithStock.forEach(item => {
      const stock = item.stockLevels || [];
      const ecart = stock.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
      const central = stock.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
      const total = ecart + central;

      totalQoH += total;
      ecartQoH += ecart;
      centralQoH += central;

      if (total === 0) outOfStockCount++;
      else if (total <= item.criticalLevel) criticalCount++;
      else if (total <= item.warningLevel) warningCount++;
    });

    // Calculate Section 3 (Expiring)
    const nowTime = new Date().getTime();
    const in30Time = nowTime + 30 * 24 * 60 * 60 * 1000;
    const in60Time = nowTime + 60 * 24 * 60 * 60 * 1000;

    let within30 = 0;
    let within60 = 0;
    let within90 = 0;
    let expired = 0;

    expiringBatches.forEach(b => {
      const exp = new Date(b.expiryDate).getTime();
      if (exp <= nowTime) expired++;
      else if (exp <= in30Time) within30++;
      else if (exp <= in60Time) within60++;
      else within90++;
    });

    // Helper to build daily sparklines
    const buildSparkline = (logs, dateKey = 'timestamp', qtyKey = 'qty') => {
      const buckets = generateDailyBuckets(startDate, endDate);
      logs.forEach(l => {
        const d = new Date(l[dateKey]).toISOString().split('T')[0];
        if (buckets[d]) {
          buckets[d].count += 1;
          if (qtyKey && l[qtyKey] !== undefined && l[qtyKey] !== null) {
            buckets[d].qty += Math.abs(Number(l[qtyKey]) || 0);
          }
        }
      });
      return Object.values(buckets);
    };

    // Build stats & sparklines for sections 4-11
    const inboundSparkline = buildSparkline(inboundLogs);
    const outboundSparkline = buildSparkline(outboundLogs);
    const discardSparkline = buildSparkline(discardLogs);
    const adjustmentSparkline = buildSparkline(adjustmentLogs);
    const requisitionSparkline = buildSparkline(requisitions, 'createdAt', null);
    const returnSparkline = buildSparkline(returnLogs);
    const transferSparkline = buildSparkline(stockTransfers, 'createdAt', null);
    const dispenseSparkline = buildSparkline(dispenseLogs, 'dispensedAt', 'qty');

    // Discard breakdown
    const discardReasons = { EXPIRED: 0, DAMAGED: 0, RECALLED: 0, OTHER: 0 };
    discardLogs.forEach(d => {
      if (discardReasons[d.reason] !== undefined) discardReasons[d.reason] += d.qty;
      else discardReasons.OTHER += d.qty;
    });

    // Requisition breakdown
    const reqStatus = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
    requisitions.forEach(r => {
      if (r.status.includes('APPROVED')) reqStatus.APPROVED++;
      else if (r.status === 'REJECTED') reqStatus.REJECTED++;
      else if (r.status === 'CANCELLED') reqStatus.CANCELLED++;
      else reqStatus.PENDING++;
    });

    // Transfer breakdown
    const transferStatus = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
    stockTransfers.forEach(t => {
      if (transferStatus[t.status] !== undefined) transferStatus[t.status]++;
    });

    // Dispense breakdown
    const pendingBillingCount = dispenseLogs.filter(d => d.billingStatus === 'PENDING').length;

    res.json({
      dateRange: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
      },
      sections: {
        inventory: {
          totalItems: itemsWithStock.length,
          totalQoH,
          ecartQoH,
          centralQoH,
        },
        'low-stock': {
          totalLowStock: criticalCount + warningCount + outOfStockCount,
          outOfStockCount,
          criticalCount,
          warningCount,
        },
        expiring: {
          totalExpiring: expiringBatches.length,
          expired,
          within30,
          within60,
          within90,
        },
        inbound: {
          count: inboundLogs.length,
          totalQty: inboundLogs.reduce((acc, l) => acc + l.qty, 0),
          sparkline: inboundSparkline,
        },
        outbound: {
          count: outboundLogs.length,
          totalQty: outboundLogs.reduce((acc, l) => acc + Math.abs(l.qty), 0),
          sparkline: outboundSparkline,
        },
        discards: {
          count: discardLogs.length,
          totalQty: discardLogs.reduce((acc, l) => acc + l.qty, 0),
          reasons: discardReasons,
          sparkline: discardSparkline,
        },
        adjustments: {
          count: adjustmentLogs.length,
          netQty: adjustmentLogs.reduce((acc, l) => acc + l.qty, 0),
          sparkline: adjustmentSparkline,
        },
        requisitions: {
          count: requisitions.length,
          status: reqStatus,
          sparkline: requisitionSparkline,
        },
        returns: {
          count: returnLogs.length,
          totalQty: returnLogs.reduce((acc, l) => acc + l.qty, 0),
          sparkline: returnSparkline,
        },
        transfers: {
          count: stockTransfers.length,
          status: transferStatus,
          sparkline: transferSparkline,
        },
        dispense: {
          count: dispenseLogs.length,
          totalQty: dispenseLogs.reduce((acc, l) => acc + l.qty, 0),
          pendingBillingCount,
          sparkline: dispenseSparkline,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/live/:section
 * Returns paginated detailed records for a specific section.
 */
const sectionDetail = async (req, res, next) => {
  try {
    const { section } = req.params;
    const { from, to, page = 1, limit = 50, search = '' } = req.query;
    const { startDate, endDate } = parseDateRange(from, to);

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    let data = [];
    let total = 0;

    switch (section) {
      case 'inventory': {
        const where = {
          isArchived: false,
          ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] } : {}),
        };
        const [items, count] = await Promise.all([
          prisma.item.findMany({
            where,
            include: { stockLevels: true, category: { select: { name: true } } },
            orderBy: { name: 'asc' },
            skip,
            take: limitNum,
          }),
          prisma.item.count({ where }),
        ]);

        data = items.map(item => {
          const ecart = item.stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
          const central = item.stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
          return {
            id: item.id,
            name: item.name,
            sku: item.sku,
            itemType: item.itemType,
            unit: item.unit,
            category: item.category?.name || 'Uncategorized',
            ecartQty: ecart,
            centralQty: central,
            totalQty: ecart + central,
            warningLevel: item.warningLevel,
            criticalLevel: item.criticalLevel,
          };
        });
        total = count;
        break;
      }

      case 'low-stock': {
        const items = await prisma.item.findMany({
          where: { isArchived: false },
          include: { stockLevels: true, category: { select: { name: true } } },
          orderBy: { name: 'asc' },
        });

        const lowItems = items.map(item => {
          const ecart = item.stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
          const central = item.stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
          const totalQty = ecart + central;
          let alertType = null;
          if (totalQty === 0) alertType = 'OUT_OF_STOCK';
          else if (totalQty <= item.criticalLevel) alertType = 'CRITICAL';
          else if (totalQty <= item.warningLevel) alertType = 'WARNING';

          return alertType ? {
            id: item.id,
            name: item.name,
            sku: item.sku,
            unit: item.unit,
            category: item.category?.name || 'Uncategorized',
            ecartQty: ecart,
            centralQty: central,
            totalQty,
            warningLevel: item.warningLevel,
            criticalLevel: item.criticalLevel,
            alertType,
          } : null;
        }).filter(Boolean);

        total = lowItems.length;
        data = lowItems.slice(skip, skip + limitNum);
        break;
      }

      case 'expiring': {
        const days = req.query.days ? parseInt(req.query.days, 10) : 200;
        const maxExpDate = new Date();
        maxExpDate.setDate(maxExpDate.getDate() + days);
        const where = {
          expiryDate: { lte: maxExpDate, not: null },
          quantityRemaining: { gt: 0 },
        };
        const [batches, count] = await Promise.all([
          prisma.itemBatch.findMany({
            where,
            include: { item: { select: { name: true, sku: true, unit: true, supplier: { select: { name: true } } } } },
            orderBy: { expiryDate: 'asc' },
            skip,
            take: limitNum,
          }),
          prisma.itemBatch.count({ where }),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        data = batches.map(b => {
          const exp = new Date(b.expiryDate);
          const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
          let categoryTag = 'OPTIMAL';
          if (diffDays <= 0) categoryTag = 'EXPIRED';
          else if (diffDays <= 30) categoryTag = 'CRITICAL_EXPIRY';
          else if (diffDays <= 90) categoryTag = 'NEAR_EXPIRY';
          else if (diffDays <= 200) categoryTag = 'SUPPLIER_RETURN_WARNING';

          return {
            id: b.id,
            itemName: b.item.name,
            sku: b.item.sku,
            batchNo: b.batchNo || 'N/A',
            location: b.location,
            expiryDate: b.expiryDate,
            daysRemaining: diffDays,
            categoryTag,
            supplierName: b.item.supplier?.name || 'N/A',
            quantityRemaining: b.quantityRemaining,
            unit: b.item.unit,
          };
        });
        total = count;
        break;
      }

      case 'inbound': {
        const where = { type: 'INBOUND', timestamp: { gte: startDate, lte: endDate } };
        const [logs, count] = await Promise.all([
          prisma.transactionLog.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              user: { select: { name: true } },
              batch: { select: { batchNo: true } },
            },
            orderBy: { timestamp: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.transactionLog.count({ where }),
        ]);

        data = logs.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          itemName: l.item.name,
          sku: l.item.sku,
          location: l.location,
          qty: l.qty,
          unit: l.item.unit,
          batchNo: l.batch?.batchNo || 'N/A',
          notes: l.notes || '—',
          loggedBy: l.user.name,
        }));
        total = count;
        break;
      }

      case 'outbound': {
        const where = { type: { in: ['OUTBOUND', 'DISPENSE', 'TRANSFER_OUT'] }, timestamp: { gte: startDate, lte: endDate } };
        const [logs, count] = await Promise.all([
          prisma.transactionLog.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              user: { select: { name: true } },
              batch: { select: { batchNo: true } },
            },
            orderBy: { timestamp: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.transactionLog.count({ where }),
        ]);

        data = logs.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          itemName: l.item.name,
          sku: l.item.sku,
          type: l.type,
          location: l.location,
          qty: l.qty,
          unit: l.item.unit,
          batchNo: l.batch?.batchNo || 'N/A',
          loggedBy: l.user.name,
        }));
        total = count;
        break;
      }

      case 'discards': {
        const where = { timestamp: { gte: startDate, lte: endDate } };
        const [logs, count] = await Promise.all([
          prisma.discardLog.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              loggedBy: { select: { name: true } },
              batch: { select: { batchNo: true } },
            },
            orderBy: { timestamp: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.discardLog.count({ where }),
        ]);

        data = logs.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          itemName: l.item.name,
          sku: l.item.sku,
          location: l.location,
          qty: l.qty,
          unit: l.item.unit,
          reason: l.reason,
          batchNo: l.batch?.batchNo || 'N/A',
          notes: l.notes || '—',
          loggedBy: l.loggedBy.name,
        }));
        total = count;
        break;
      }

      case 'adjustments': {
        const where = { type: 'ADJUSTMENT', timestamp: { gte: startDate, lte: endDate } };
        const [logs, count] = await Promise.all([
          prisma.transactionLog.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              user: { select: { name: true } },
            },
            orderBy: { timestamp: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.transactionLog.count({ where }),
        ]);

        data = logs.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          itemName: l.item.name,
          sku: l.item.sku,
          location: l.location,
          qty: l.qty,
          unit: l.item.unit,
          notes: l.notes || '—',
          loggedBy: l.user.name,
        }));
        total = count;
        break;
      }

      case 'requisitions': {
        const where = { createdAt: { gte: startDate, lte: endDate } };
        const [reqs, count] = await Promise.all([
          prisma.requisition.findMany({
            where,
            include: {
              patient: { select: { name: true, chartNumber: true } },
              submittedBy: { select: { name: true } },
              lines: { include: { item: { select: { name: true, unit: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.requisition.count({ where }),
        ]);

        data = reqs.map(r => ({
          id: r.id,
          createdAt: r.createdAt,
          patientName: r.patient.name,
          chartNumber: r.patient.chartNumber,
          submittedBy: r.submittedBy.name,
          status: r.status,
          itemSummary: r.lines.map(l => `${l.item.name} (${l.qtyRequested} ${l.item.unit})`).join(', '),
        }));
        total = count;
        break;
      }

      case 'returns': {
        const where = { type: 'RETURN', timestamp: { gte: startDate, lte: endDate } };
        const [logs, count] = await Promise.all([
          prisma.transactionLog.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              user: { select: { name: true } },
            },
            orderBy: { timestamp: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.transactionLog.count({ where }),
        ]);

        data = logs.map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          itemName: l.item.name,
          sku: l.item.sku,
          location: l.location,
          qty: l.qty,
          unit: l.item.unit,
          notes: l.notes || '—',
          loggedBy: l.user.name,
        }));
        total = count;
        break;
      }

      case 'transfers': {
        const where = { createdAt: { gte: startDate, lte: endDate } };
        const [transfers, count] = await Promise.all([
          prisma.stockTransfer.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              requestedBy: { select: { name: true } },
              approvedBy: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.stockTransfer.count({ where }),
        ]);

        data = transfers.map(t => ({
          id: t.id,
          createdAt: t.createdAt,
          itemName: t.item.name,
          sku: t.item.sku,
          route: `${t.fromLocation} → ${t.toLocation}`,
          qty: t.qty,
          unit: t.item.unit,
          status: t.status,
          requestedBy: t.requestedBy.name,
          approvedBy: t.approvedBy?.name || '—',
          notes: t.notes || '—',
        }));
        total = count;
        break;
      }

      case 'dispense': {
        const where = { dispensedAt: { gte: startDate, lte: endDate } };
        const [dispenses, count] = await Promise.all([
          prisma.dispenseLog.findMany({
            where,
            include: {
              item: { select: { name: true, sku: true, unit: true } },
              patient: { select: { name: true, chartNumber: true } },
              dispensedBy: { select: { name: true } },
              recordedBy: { select: { name: true } },
            },
            orderBy: { dispensedAt: 'desc' },
            skip,
            take: limitNum,
          }),
          prisma.dispenseLog.count({ where }),
        ]);

        data = dispenses.map(d => ({
          id: d.id,
          dispensedAt: d.dispensedAt,
          patientName: d.patient.name,
          chartNumber: d.patient.chartNumber,
          itemName: d.item.name,
          sku: d.item.sku,
          qty: d.qty,
          unit: d.item.unit,
          location: d.location,
          dispensedBy: d.dispensedBy.name,
          billingStatus: d.billingStatus,
          recordedBy: d.recordedBy?.name || '—',
        }));
        total = count;
        break;
      }

      default:
        return res.status(400).json({ error: `Invalid report section: ${section}` });
    }

    res.json({
      section,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/live/:section/export
 * Downloads CSV of the section records.
 */
const sectionExport = async (req, res, next) => {
  try {
    const { section } = req.params;
    const { from, to } = req.query;
    const { startDate, endDate } = parseDateRange(from, to);

    // Call sectionDetail logic without pagination (take: 5000 max)
    req.query.limit = 5000;
    req.query.page = 1;

    // Execute logic to fetch records
    let rows = [];
    let filename = `MedOPS_${section}_${new Date().toISOString().split('T')[0]}.csv`;
    let csvHeader = '';

    const detailResult = await new Promise((resolve, reject) => {
      const mockRes = {
        json: resolve,
        status: () => mockRes,
      };
      sectionDetail(req, mockRes, reject);
    });

    const items = detailResult.data || [];

    if (items.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send('No data found for the selected period.\n');
    }

    // Extract headers dynamically from object keys
    const headers = Object.keys(items[0]);
    csvHeader = headers.map(h => `"${h}"`).join(',');

    const csvBody = items.map(item => {
      return headers.map(h => {
        let val = item[h];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'object') val = JSON.stringify(val);
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      }).join(',');
    }).join('\n');

    const csvContent = `${csvHeader}\n${csvBody}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  liveSummary,
  sectionDetail,
  sectionExport,
};
