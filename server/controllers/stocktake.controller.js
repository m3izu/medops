const prisma = require('../lib/prisma');

const list = async (req, res, next) => {
  try {
    const stocktakes = await prisma.stocktake.findMany({
      include: { initiatedBy: { select: { name: true } } },
      orderBy: { initiatedAt: 'desc' },
    });
    res.json(stocktakes);
  } catch (err) { next(err); }
};

const initiate = async (req, res, next) => {
  try {
    const existing = await prisma.stocktake.findFirst({
      where: { status: 'IN_PROGRESS' },
    });
    if (existing) {
      return res.status(400).json({ error: 'A stocktake session is already in progress.' });
    }

    const items = await prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevel: true },
    });

    const stocktake = await prisma.stocktake.create({
      data: {
        initiatedById: req.user.id,
        lines: {
          create: items.map(item => ({
            itemId: item.id,
            systemQty: item.stockLevel?.quantityOnHand ?? 0,
          })),
        },
      },
    });

    // Notify all clinic staff
    const staff = await prisma.user.findMany({
      where: { isActive: true, isDeleted: false, role: { notIn: ['MANAGEMENT_OFFICE'] } },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: staff.map(s => ({
        userId: s.id,
        eventType: 'STOCKTAKE_INITIATED',
        message: 'A stocktake has been initiated. Please assist with physical counting.',
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
    res.json(st);
  } catch (err) { next(err); }
};

const updateLine = async (req, res, next) => {
  try {
    const { physicalQty } = req.body;
    if (typeof physicalQty !== 'number' || physicalQty < 0) {
      return res.status(400).json({ error: 'Physical quantity must be a non-negative number' });
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

    const lines = await prisma.stocktakeLine.findMany({
      where: { stocktakeId: req.params.id },
      include: { item: { include: { category: true } } }
    });

    // Verify all lines have been counted (Bug #2)
    const uncounted = lines.filter(l => l.physicalQty === null);
    if (uncounted.length > 0) {
      return res.status(400).json({
        error: 'Cannot complete stocktake. Some items have not been counted.',
        uncountedItems: uncounted.map(l => ({ id: l.itemId, name: l.item.name, sku: l.item.sku }))
      });
    }

    // Execute all adjustments and state changes in a single atomic database transaction
    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        if (line.physicalQty !== null && line.discrepancy !== 0) {
          // Update global stock level (upsert in case stockLevel record was deleted or is missing)
          await tx.stockLevel.upsert({
            where: { itemId: line.itemId },
            update: { quantityOnHand: line.physicalQty, lastUpdated: new Date() },
            create: { itemId: line.itemId, quantityOnHand: line.physicalQty, lastUpdated: new Date() },
          });

          // Reconcile batch quantities if item is batch-controlled
          const isBatchControlled = line.item.itemType === 'MEDICATION' || (line.item.category?.hasBatchControl ?? false);
          if (isBatchControlled) {
            if (line.discrepancy < 0) {
              // Deduct from batches in FIFO order
              let diff = Math.abs(line.discrepancy);
              const batches = await tx.itemBatch.findMany({
                where: { itemId: line.itemId, quantityRemaining: { gt: 0 } },
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

              // Reconcile remaining discrepancy if active batch totals were insufficient
              if (diff > 0) {
                const fallbackBatch = await tx.itemBatch.findFirst({
                  where: { itemId: line.itemId },
                  orderBy: { expiryDate: 'asc' }
                });
                if (fallbackBatch) {
                  await tx.itemBatch.update({
                    where: { id: fallbackBatch.id },
                    data: { quantityRemaining: { decrement: diff } }
                  });
                } else {
                  await tx.itemBatch.create({
                    data: {
                      itemId: line.itemId,
                      batchNo: 'RECONCILED',
                      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
                      quantityRemaining: -diff,
                    }
                  });
                }
              }
            } else if (line.discrepancy > 0) {
              // Add stock discrepancy to the oldest active batch
              const oldestBatch = await tx.itemBatch.findFirst({
                where: { itemId: line.itemId, quantityRemaining: { gt: 0 } },
                orderBy: { expiryDate: 'asc' }
              });
              if (oldestBatch) {
                await tx.itemBatch.update({
                  where: { id: oldestBatch.id },
                  data: { quantityRemaining: { increment: line.discrepancy } }
                });
              } else {
                // Fall back: try to find any batch (even if 0 remaining or expired)
                const anyBatch = await tx.itemBatch.findFirst({
                  where: { itemId: line.itemId },
                  orderBy: { expiryDate: 'asc' }
                });
                if (anyBatch) {
                  await tx.itemBatch.update({
                    where: { id: anyBatch.id },
                    data: { quantityRemaining: { increment: line.discrepancy } }
                  });
                } else {
                  // No batches exist at all; create a default RECONCILED batch
                  await tx.itemBatch.create({
                    data: {
                      itemId: line.itemId,
                      batchNo: 'RECONCILED',
                      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
                      quantityRemaining: line.discrepancy,
                    }
                  });
                }
              }
            }
          }

          // Create stocktake audit log
          await tx.transactionLog.create({
            data: {
              itemId: line.itemId,
              type: 'ADJUSTMENT',
              qty: line.discrepancy,
              userId: req.user.id,
              notes: `Stocktake adjustment. System: ${line.systemQty}, Physical: ${line.physicalQty}`,
            },
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
  } catch (err) { next(err); }
};

module.exports = { list, initiate, getOne, updateLine, complete };
