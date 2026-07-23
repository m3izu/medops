const prisma = require('../lib/prisma');
const { checkAndFireAlerts } = require('./stock.controller');

/**
 * POST /api/returns
 * Log return of unused items.
 */
const create = async (req, res, next) => {
  try {
    const { sourceType, sourceId, qty, reason } = req.body;

    if (!sourceType || !sourceId || !qty || !reason) {
      return res.status(400).json({ error: 'sourceType, sourceId, qty, and reason are required.' });
    }

    if (typeof qty !== 'number' || qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
    }

    if (!['DISPENSE', 'REQUISITION'].includes(sourceType)) {
      return res.status(400).json({ error: 'Invalid sourceType. Must be DISPENSE or REQUISITION.' });
    }

    let itemId;
    let targetBatchId = null;
    let patientName = '';
    let patientChart = '';
    let itemName = '';
    let isBatchControlled = false;

    await prisma.$transaction(async (tx) => {
      if (sourceType === 'DISPENSE') {
        // 1. Fetch original DispenseLog
        const dispenseLog = await tx.dispenseLog.findUnique({
          where: { id: sourceId },
          include: {
            item: { include: { category: true } },
            patient: true
          }
        });

        if (!dispenseLog) {
          throw new Error('Original dispense log not found.');
        }

        // Ownership check for nurses
        if (req.user.role === 'NURSE' && dispenseLog.dispensedById !== req.user.id) {
          throw new Error('Nurses can only return items they dispensed themselves.');
        }

        // Check if item is archived (Bug #4)
        if (dispenseLog.item.isArchived) {
          throw new Error('Cannot return items for an archived item.');
        }

        // Concurrency lock: dummy update on dispenseLog to lock the record (Bug #1)
        await tx.dispenseLog.update({
          where: { id: sourceId },
          data: { notes: dispenseLog.notes }
        });

        itemId = dispenseLog.itemId;
        targetBatchId = dispenseLog.batchId;
        patientName = dispenseLog.patient.name;
        patientChart = dispenseLog.patient.chartNumber;
        itemName = dispenseLog.item.name;
        isBatchControlled = dispenseLog.item.itemType === 'MEDICATION' || (dispenseLog.item.category?.hasBatchControl ?? false);

        // Calculate already returned qty
        const priorReturns = await tx.transactionLog.findMany({
          where: { dispenseLogId: sourceId, type: 'RETURN' }
        });
        const totalReturned = priorReturns.reduce((sum, r) => sum + r.qty, 0);
        const maxReturnable = dispenseLog.qty - totalReturned;

        if (qty > maxReturnable) {
          throw new Error(`Cannot return more than dispensed/remaining quantity (max returnable: ${maxReturnable}).`);
        }

        let isExpired = false;
        if (isBatchControlled) {
          if (targetBatchId) {
            const batch = await tx.itemBatch.findUnique({ where: { id: targetBatchId } });
            if (!batch) {
              throw new Error(`Original batch (ID: ${targetBatchId}) no longer exists. Please contact an administrator.`);
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            isExpired = batch.expiryDate && new Date(batch.expiryDate) < today;
          } else {
            const targetLoc = dispenseLog.location || 'ECART';
            const existingBatch = await tx.itemBatch.findFirst({
              where: { itemId, location: targetLoc },
              orderBy: { expiryDate: 'asc' }
            });
            if (existingBatch) {
              targetBatchId = existingBatch.id;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              isExpired = existingBatch.expiryDate && new Date(existingBatch.expiryDate) < today;
            } else {
              const newBatch = await tx.itemBatch.create({
                data: {
                  itemId,
                  location: targetLoc,
                  batchNo: `RETURN-RECOVERY-${dispenseLog.item.sku.trim()}`,
                  expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                  quantityRemaining: 0,
                  supplierId: dispenseLog.item.supplierId
                }
              });
              targetBatchId = newBatch.id;
            }
          }
        }

        const targetLocation = dispenseLog.location || 'ECART';

        if (!isExpired) {
          // Update StockLevel (upsert in case stockLevel record was deleted or is missing)
          await tx.stockLevel.upsert({
            where: { itemId_location: { itemId, location: targetLocation } },
            update: { quantityOnHand: { increment: qty }, lastUpdated: new Date() },
            create: { itemId, location: targetLocation, quantityOnHand: qty, lastUpdated: new Date() },
          });

          // Update ItemBatch if batch-controlled
          if (isBatchControlled && targetBatchId) {
            await tx.itemBatch.update({
              where: { id: targetBatchId },
              data: { quantityRemaining: { increment: qty } }
            });
          }
        } else {
          // It is expired: log discard!
          await tx.discardLog.create({
            data: {
              itemId,
              location: targetLocation,
              batchId: targetBatchId,
              qty,
              reason: 'EXPIRED',
              notes: `Auto-discarded expired return from direct dispense to ${patientName} (${patientChart}). Reason: ${reason}`,
              loggedById: req.user.id
            }
          });

          // Log a DISCARD transaction in the transaction log as well
          await tx.transactionLog.create({
            data: {
              itemId,
              location: targetLocation,
              batchId: targetBatchId,
              type: 'DISCARD',
              qty,
              userId: req.user.id,
              dispenseLogId: sourceId,
              notes: `Auto-discarded expired return: ${reason}`
            }
          });
        }

        // Create TransactionLog (RETURN type is always recorded)
        await tx.transactionLog.create({
          data: {
            itemId,
            location: targetLocation,
            batchId: targetBatchId,
            type: 'RETURN',
            qty,
            userId: req.user.id,
            dispenseLogId: sourceId,
            notes: `Returned ${qty} unused item(s) from direct dispense to ${patientName} (${patientChart}). Reason: ${reason}${isExpired ? ' (AUTO-DISCARDED: EXPIRED)' : ''}`
          }
        });

      } else {
        // REQUISITION
        const reqLine = await tx.requisitionLine.findUnique({
          where: { id: sourceId },
          include: {
            item: { include: { category: true } },
            requisition: {
              include: {
                patient: true,
                submittedBy: true
              }
            }
          }
        });

        if (!reqLine) {
          throw new Error('Original requisition line not found.');
        }

        if (reqLine.status !== 'APPROVED') {
          throw new Error('Cannot return items from a requisition line that was not approved.');
        }

        // Ownership check for nurses
        if (req.user.role === 'NURSE' && reqLine.requisition.submittedById !== req.user.id) {
          throw new Error('Nurses can only return items they requested themselves.');
        }

        // Check if item is archived (Bug #4)
        if (reqLine.item.isArchived) {
          throw new Error('Cannot return items for an archived item.');
        }

        // Concurrency lock: dummy update on requisitionLine to lock the record (Bug #1)
        await tx.requisitionLine.update({
          where: { id: sourceId },
          data: { reason: reqLine.reason }
        });

        itemId = reqLine.itemId;
        patientName = reqLine.requisition.patient.name;
        patientChart = reqLine.requisition.patient.chartNumber;
        itemName = reqLine.item.name;
        isBatchControlled = reqLine.item.itemType === 'MEDICATION' || (reqLine.item.category?.hasBatchControl ?? false);

        // Find all OUTBOUND logs for this requisition line to compute returns per batch (Bug #3)
        const outboundLogs = await tx.transactionLog.findMany({
          where: { requisitionLineId: sourceId, type: 'OUTBOUND' },
          orderBy: { timestamp: 'desc' }
        });

        // Calculate already returned qty
        const priorReturns = await tx.transactionLog.findMany({
          where: { requisitionLineId: sourceId, type: 'RETURN' }
        });
        const totalReturned = priorReturns.reduce((sum, r) => sum + r.qty, 0);
        const maxReturnable = (reqLine.qtyApproved ?? 0) - totalReturned;

        if (qty > maxReturnable) {
          throw new Error(`Cannot return more than approved/remaining quantity (max returnable: ${maxReturnable}).`);
        }

        if (isBatchControlled) {
          const returnedPerBatch = {};
          for (const r of priorReturns) {
            if (r.batchId) {
              returnedPerBatch[r.batchId] = (returnedPerBatch[r.batchId] || 0) + r.qty;
            }
          }

          let remainingToReturn = qty;
          for (const outbound of outboundLogs) {
            if (remainingToReturn <= 0) break;
            const alreadyReturned = returnedPerBatch[outbound.batchId] || 0;
            const capacity = outbound.qty - alreadyReturned;
            if (capacity <= 0) continue;

            const returnQtyForBatch = Math.min(capacity, remainingToReturn);

            if (outbound.batchId) {
              const batch = await tx.itemBatch.findUnique({ where: { id: outbound.batchId } });
              if (!batch) {
                throw new Error(`Original batch (ID: ${outbound.batchId}) no longer exists. Please contact an administrator.`);
              }
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isExpired = batch.expiryDate && new Date(batch.expiryDate) < today;

              const reqLocation = reqLine.location || 'ECART';

              if (!isExpired) {
                // Update StockLevel (upsert in case stockLevel record was deleted or is missing)
                await tx.stockLevel.upsert({
                  where: { itemId_location: { itemId, location: reqLocation } },
                  update: { quantityOnHand: { increment: returnQtyForBatch }, lastUpdated: new Date() },
                  create: { itemId, location: reqLocation, quantityOnHand: returnQtyForBatch, lastUpdated: new Date() },
                });

                // Update ItemBatch
                await tx.itemBatch.update({
                  where: { id: outbound.batchId },
                  data: { quantityRemaining: { increment: returnQtyForBatch } }
                });

                // Create TransactionLog for this batch
                await tx.transactionLog.create({
                  data: {
                    itemId,
                    location: reqLocation,
                    batchId: outbound.batchId,
                    type: 'RETURN',
                    qty: returnQtyForBatch,
                    userId: req.user.id,
                    requisitionLineId: sourceId,
                    notes: `Returned ${returnQtyForBatch} unused item(s) from requisition for ${patientName} (${patientChart}). Reason: ${reason}`
                  }
                });
              } else {
                // Expired: auto-discard!
                await tx.discardLog.create({
                  data: {
                    itemId,
                    location: reqLocation,
                    batchId: outbound.batchId,
                    qty: returnQtyForBatch,
                    reason: 'EXPIRED',
                    notes: `Auto-discarded expired return from requisition for ${patientName} (${patientChart}). Reason: ${reason}`,
                    loggedById: req.user.id
                  }
                });

                await tx.transactionLog.create({
                  data: {
                    itemId,
                    location: reqLocation,
                    batchId: outbound.batchId,
                    type: 'DISCARD',
                    qty: returnQtyForBatch,
                    userId: req.user.id,
                    requisitionLineId: sourceId,
                    notes: `Auto-discarded expired return: ${reason}`
                  }
                });

                // Also log the RETURN
                await tx.transactionLog.create({
                  data: {
                    itemId,
                    location: reqLocation,
                    batchId: outbound.batchId,
                    type: 'RETURN',
                    qty: returnQtyForBatch,
                    userId: req.user.id,
                    requisitionLineId: sourceId,
                    notes: `Returned ${returnQtyForBatch} unused item(s) from requisition for ${patientName} (${patientChart}). Reason: ${reason} (AUTO-DISCARDED: EXPIRED)`
                  }
                });
              }
            } else {
              const reqLocation = reqLine.location || 'ECART';
              // No batchId (non-batch controlled) - upsert stockLevel
              await tx.stockLevel.upsert({
                where: { itemId_location: { itemId, location: reqLocation } },
                update: { quantityOnHand: { increment: returnQtyForBatch }, lastUpdated: new Date() },
                create: { itemId, location: reqLocation, quantityOnHand: returnQtyForBatch, lastUpdated: new Date() },
              });

              await tx.transactionLog.create({
                data: {
                  itemId,
                  location: reqLocation,
                  batchId: null,
                  type: 'RETURN',
                  qty: returnQtyForBatch,
                  userId: req.user.id,
                  requisitionLineId: sourceId,
                  notes: `Returned ${returnQtyForBatch} unused item(s) from requisition for ${patientName} (${patientChart}). Reason: ${reason}`
                }
              });
            }

            remainingToReturn -= returnQtyForBatch;
          }

          if (remainingToReturn > 0) {
            throw new Error('Could not allocate returned quantity to original batches.');
          }
        } else {
          const reqLocation = reqLine.location || 'ECART';
          // Non-batch controlled: single TransactionLog
          await tx.stockLevel.upsert({
            where: { itemId_location: { itemId, location: reqLocation } },
            update: { quantityOnHand: { increment: qty }, lastUpdated: new Date() },
            create: { itemId, location: reqLocation, quantityOnHand: qty, lastUpdated: new Date() }
          });

          await tx.transactionLog.create({
            data: {
              itemId,
              location: reqLocation,
              batchId: null,
              type: 'RETURN',
              qty,
              userId: req.user.id,
              requisitionLineId: sourceId,
              notes: `Returned ${qty} unused item(s) from requisition for ${patientName} (${patientChart}). Reason: ${reason}`
            }
          });
        }
      }
    });

    // Fire stock alerts
    await checkAndFireAlerts(itemId);

    // Notify cashiers if source is direct dispense
    if (sourceType === 'DISPENSE') {
      const cashiers = await prisma.user.findMany({
        where: { role: 'CASHIER', isActive: true, isDeleted: false },
        select: { id: true }
      });
      if (cashiers.length > 0) {
        await prisma.notification.createMany({
          data: cashiers.map(c => ({
            userId: c.id,
            eventType: 'DISPENSE_RETURNED',
            message: `Return Logged: ${qty}× ${itemName} for ${patientName} (${patientChart}) — adjust billing statement`,
            link: '/cashier'
          }))
        });
      }
    }

    res.status(201).json({ success: true, message: 'Item returned successfully.' });

  } catch (err) {
    const knownErrors = [
      'sourceType, sourceId, qty, and reason are required.',
      'Quantity must be a positive whole number.',
      'Invalid sourceType. Must be DISPENSE or REQUISITION.',
      'Original dispense log not found.',
      'Nurses can only return items they dispensed themselves.',
      'Nurses can only return items they requested themselves.',
      'Original requisition line not found.',
      'Cannot return items from a requisition line that was not approved.',
      'Cannot return items for an archived item.'
    ];

    if (
      knownErrors.includes(err.message) ||
      err.message.includes('Cannot return more than') ||
      err.message.includes('no longer exists')
    ) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/returns
 * List return logs (transaction logs of type RETURN).
 */
const list = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    const where = { type: 'RETURN' };

    // Nurses only see their own returns
    if (role === 'NURSE') where.userId = userId;

    const returnLogs = await prisma.transactionLog.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        user: { select: { id: true, name: true, role: true } },
        dispenseLog: {
          include: {
            patient: { select: { name: true, chartNumber: true } }
          }
        },
        requisitionLine: {
          include: {
            requisition: {
              include: {
                patient: { select: { name: true, chartNumber: true } }
              }
            }
          }
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    res.json(returnLogs);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/returns/by-source/:sourceType/:sourceId
 * Get total returned quantity for a specific source log.
 */
const getReturnedQty = async (req, res, next) => {
  try {
    const { sourceType, sourceId } = req.params;

    if (!['DISPENSE', 'REQUISITION'].includes(sourceType)) {
      return res.status(400).json({ error: 'Invalid sourceType' });
    }

    if (sourceType === 'DISPENSE') {
      const dispenseLog = await prisma.dispenseLog.findUnique({
        where: { id: sourceId }
      });
      if (!dispenseLog) {
        return res.status(404).json({ error: 'Dispense log not found.' });
      }
      if (req.user.role === 'NURSE' && dispenseLog.dispensedById !== req.user.id) {
        return res.status(403).json({ error: 'You do not have permission to view these return details.' });
      }
    } else {
      const reqLine = await prisma.requisitionLine.findUnique({
        where: { id: sourceId },
        include: { requisition: true }
      });
      if (!reqLine) {
        return res.status(404).json({ error: 'Requisition line not found.' });
      }
      if (req.user.role === 'NURSE' && reqLine.requisition.submittedById !== req.user.id) {
        return res.status(403).json({ error: 'You do not have permission to view these return details.' });
      }
    }

    const where = { type: 'RETURN' };
    if (sourceType === 'DISPENSE') {
      where.dispenseLogId = sourceId;
    } else {
      where.requisitionLineId = sourceId;
    }

    const logs = await prisma.transactionLog.findMany({ where });
    const totalReturned = logs.reduce((sum, r) => sum + r.qty, 0);

    res.json({ totalReturned });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list, getReturnedQty };
