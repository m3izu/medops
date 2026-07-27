const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'NURSE') {
      where.status = 'IN_PROGRESS';
    }
    const stocktakes = await prisma.stocktake.findMany({
      where,
      include: { initiatedBy: { select: { name: true } } },
      orderBy: { initiatedAt: 'desc' },
    });
    res.json(stocktakes);
  } catch (err) { next(err); }
};

const initiate = async (req, res, next) => {
  try {
    const { locationScope = 'ALL' } = req.body || {};
    const existing = await prisma.stocktake.findFirst({
      where: { status: 'IN_PROGRESS' },
    });
    if (existing) {
      return res.status(400).json({ error: 'A stocktake session is already in progress.' });
    }

    const items = await prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevels: true },
    });

    const linesToCreate = [];
    for (const item of items) {
      const stockLevels = item.stockLevels || [];
      const ecartQty = stockLevels.find(s => s.location === 'ECART')?.quantityOnHand ?? 0;
      const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;

      if (locationScope === 'ECART' || locationScope === 'ALL') {
        linesToCreate.push({
          itemId: item.id,
          location: 'ECART',
          systemQty: ecartQty,
        });
      }
      if (locationScope === 'CENTRAL' || locationScope === 'ALL') {
        linesToCreate.push({
          itemId: item.id,
          location: 'CENTRAL',
          systemQty: centralQty,
        });
      }
    }

    const stocktake = await prisma.stocktake.create({
      data: {
        initiatedById: req.user.id,
        lines: { create: linesToCreate },
      },
    });

    const scopeLabel = locationScope === 'ECART' ? 'eCart' : locationScope === 'CENTRAL' ? 'Central Storage' : 'Multi-location';

    // Notify all clinic staff
    const staff = await prisma.user.findMany({
      where: { isActive: true, isDeleted: false, role: { notIn: ['MANAGEMENT_OFFICE'] } },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: staff.map(s => ({
        userId: s.id,
        eventType: 'STOCKTAKE_INITIATED',
        message: `A ${scopeLabel} stocktake has been initiated. Please assist with physical counting.`,
        link: '/stocktake',
      })),
    });

    res.status(201).json(stocktake);
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const st = await prisma.stocktake.findUnique({
      where: { id: req.params.id },
      include: {
        initiatedBy: { select: { name: true } },
        lines: {
          include: { item: { select: { id: true, name: true, sku: true, unit: true } } },
        },
      },
    });
    if (!st) return res.status(404).json({ error: 'Stocktake not found' });
    if (req.user.role === 'NURSE' && st.status !== 'IN_PROGRESS') {
      return res.status(403).json({ error: 'Nurses can only access active in-progress stocktakes.' });
    }
    res.json(st);
  } catch (err) { next(err); }
};

const updateLine = async (req, res, next) => {
  try {
    const { physicalQty } = req.body;
    if (typeof physicalQty !== 'number' || physicalQty < 0 || !Number.isInteger(physicalQty)) {
      return res.status(400).json({ error: 'Physical quantity must be a non-negative whole number.' });
    }

    const line = await prisma.stocktakeLine.findUnique({
      where: { id: req.params.lineId },
      include: { stocktake: true },
    });
    if (!line) return res.status(404).json({ error: 'Stocktake line not found' });
    if (line.stocktake.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Cannot update counts on a completed or cancelled stocktake.' });
    }

    const discrepancy = physicalQty - line.systemQty;
    await prisma.stocktakeLine.update({
      where: { id: req.params.lineId },
      data: { physicalQty, discrepancy, approvedById: req.user.id },
    });
    res.json({ discrepancy });
  } catch (err) { next(err); }
};

const complete = async (req, res, next) => {
  try {
    const stocktake = await prisma.stocktake.findUnique({ where: { id: req.params.id } });
    if (!stocktake) return res.status(404).json({ error: 'Stocktake not found' });
    if (stocktake.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This stocktake has already been completed' });
    }

    // Execute all adjustments, checks, and state changes inside a single atomic database transaction
    await prisma.$transaction(async (tx) => {
      const stDb = await tx.stocktake.findUnique({ where: { id: req.params.id } });
      if (!stDb || stDb.status !== 'IN_PROGRESS') {
        throw new Error('Stocktake is not in progress or has already been processed.');
      }

      let lines = await tx.stocktakeLine.findMany({
        where: { stocktakeId: req.params.id },
        include: { item: { include: { category: true } } }
      });

      for (const line of lines) {
        if (line.physicalQty !== null && line.discrepancy !== 0) {
          const loc = line.location || 'CENTRAL';
          // Update StockLevel for location
          await tx.stockLevel.upsert({
            where: { itemId_location: { itemId: line.itemId, location: loc } },
            update: { quantityOnHand: line.physicalQty, lastUpdated: new Date() },
            create: { itemId: line.itemId, location: loc, quantityOnHand: line.physicalQty, lastUpdated: new Date() },
          });

          // Reconcile batch quantities if item is batch-controlled
          const isBatchControlled = line.item.itemType === 'MEDICATION' || (line.item.category?.hasBatchControl ?? false);
          if (isBatchControlled) {
            if (line.discrepancy < 0) {
              // Deduct from batches in FIFO order in this location
              let diff = Math.abs(line.discrepancy);
              const batches = await tx.itemBatch.findMany({
                where: { itemId: line.itemId, location: loc, quantityRemaining: { gt: 0 } },
                orderBy: { expiryDate: 'asc' }
              });
              for (const batch of batches) {
                if (diff <= 0) break;
                const deduct = Math.min(batch.quantityRemaining, diff);
                await tx.itemBatch.update({
                  where: { id: batch.id },
                  data: { quantityRemaining: { decrement: deduct } }
                });
                diff -= deduct;
              }
            } else {
              // Excess stock: add to earliest expiring batch or create fallback adjustment batch
              const batch = await tx.itemBatch.findFirst({
                where: { itemId: line.itemId, location: loc },
                orderBy: { expiryDate: 'asc' }
              });
              if (batch) {
                await tx.itemBatch.update({
                  where: { id: batch.id },
                  data: { quantityRemaining: { increment: line.discrepancy } }
                });
              } else {
                await tx.itemBatch.create({
                  data: {
                    itemId: line.itemId,
                    location: loc,
                    batchNo: `RECONCILIATION-${line.item.sku.trim()}`,
                    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year default
                    quantityRemaining: line.discrepancy,
                    supplierId: line.item.supplierId
                  }
                });
              }
            }
          }

          // Transaction log for count adjustment
          await tx.transactionLog.create({
            data: {
              itemId: line.itemId,
              location: loc,
              type: 'ADJUSTMENT',
              qty: line.discrepancy,
              userId: req.user.id,
              notes: `Physical Stocktake Reconciliation adjustment (${loc}): system count was ${line.systemQty}, physical count was ${line.physicalQty}`,
            }
          });
        }
      }

      // Mark stocktake as completed
      await tx.stocktake.update({
        where: { id: req.params.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });

    res.json({ message: 'Stocktake completed and adjustments applied' });
  } catch (err) {
    if (err.uncountedItems) {
      return res.status(400).json({ error: err.message, uncountedItems: err.uncountedItems });
    }
    if (err.message === 'Stocktake is not in progress or has already been processed.') {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

module.exports = { list, initiate, getOne, updateLine, complete };
