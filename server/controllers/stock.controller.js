const prisma = require('../lib/prisma');

// Helper: check and fire stock alerts
const checkAndFireAlerts = async (itemId) => {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { stockLevels: true },
  });
  if (!item || !item.stockLevels) return;

  const stockLevels = item.stockLevels || [];
  const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
  const totalQty = stockLevels.reduce((sum, s) => sum + (s.quantityOnHand || 0), 0);
  let alertLevel = null;
  let alertReason = '';

  if (centralQty === 0 || totalQty === 0) {
    alertLevel = 'CRITICAL';
    alertReason = centralQty === 0 ? `Central Storage out of stock (${centralQty} ${item.unit})` : `Out of stock (${totalQty} ${item.unit})`;
  } else if (centralQty <= item.criticalLevel || totalQty <= item.criticalLevel) {
    alertLevel = 'CRITICAL';
    alertReason = centralQty <= item.criticalLevel ? `Central Storage stock critical (${centralQty} ${item.unit})` : `Total stock critical (${totalQty} ${item.unit})`;
  } else if (centralQty <= item.warningLevel || totalQty <= item.warningLevel) {
    alertLevel = 'WARNING';
    alertReason = centralQty <= item.warningLevel ? `Central Storage stock low (${centralQty} ${item.unit})` : `Total stock low (${totalQty} ${item.unit})`;
  }

  if (!alertLevel) return;

  // Notify Inventory Managers and Top Admins
  const recipients = await prisma.user.findMany({
    where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
    select: { id: true },
  });

  if (recipients.length === 0) return;

  const eventType = `STOCK_${alertLevel}`;
  const link = `/items/${itemId}`;
  const message = `${alertLevel} stock alert: ${item.name} — ${alertReason}`;

  const notificationsToCreate = [];
  for (const recipient of recipients) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: recipient.id,
        eventType,
        link,
        isRead: false,
      },
    });

    if (!existing) {
      notificationsToCreate.push({
        userId: recipient.id,
        eventType,
        message,
        link,
      });
    }
  }

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToCreate,
    });
  }
};

const receiveStock = async (req, res, next) => {
  try {
    const { itemId, batchNo, expiryDate, quantity, supplierId, notes, location } = req.body;

    const targetLocation = location || 'ECART';
    if (!['ECART', 'CENTRAL'].includes(targetLocation)) {
      return res.status(400).json({ error: 'Location must be either ECART or CENTRAL.' });
    }

    if (!itemId || !quantity) {
      return res.status(400).json({ error: 'itemId and quantity are required.' });
    }
    if (typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Verify item exists with category
      const item = await tx.item.findUnique({ 
        where: { id: itemId },
        include: { category: true }
      });
      if (!item) {
        throw new Error('Item not found');
      }
      if (item.isArchived) {
        throw new Error('Cannot receive stock for an archived item');
      }

      const isEquipment = item.itemType === 'MEDICAL_EQUIPMENT';
      const isBatch = item.itemType === 'MEDICATION' || isEquipment || (item.category?.hasBatchControl ?? false);
      if (isBatch) {
        if (!batchNo || !batchNo.trim()) {
          throw new Error(isEquipment ? 'Serial / Asset number is required for equipment intake.' : 'Batch / Lot number is required for batch-controlled items.');
        }
        if (!expiryDate) {
          throw new Error(isEquipment ? 'Acquisition / Warranty date is required for equipment intake.' : 'Expiry date is required for batch-controlled items.');
        }
      }

      // Create or update batch if batch details provided
      let batchId = null;
      if (batchNo || expiryDate) {
        if (expiryDate) {
          const expDate = new Date(expiryDate);
          if (isNaN(expDate.getTime())) {
            throw new Error('Invalid expiry date format.');
          }
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (expDate < today) {
            throw new Error('Medication batch cannot be registered with a past expiry date.');
          }
        }

        // Find existing batch in target location
        let existingBatch = null;
        if (batchNo && batchNo.trim()) {
          const candidateBatch = await tx.itemBatch.findFirst({
            where: { itemId, batchNo: batchNo.trim(), location: targetLocation }
          });

          if (candidateBatch) {
            const incomingExpStr = expiryDate ? new Date(expiryDate).toISOString().slice(0, 10) : null;
            const existingExpStr = candidateBatch.expiryDate ? new Date(candidateBatch.expiryDate).toISOString().slice(0, 10) : null;

            if (incomingExpStr === existingExpStr) {
              existingBatch = candidateBatch;
            }
          }
        }

        if (existingBatch) {
          await tx.itemBatch.update({
            where: { id: existingBatch.id },
            data: { quantityRemaining: { increment: quantity } }
          });
          batchId = existingBatch.id;
        } else {
          const batch = await tx.itemBatch.create({
            data: {
              itemId,
              location: targetLocation,
              batchNo: batchNo ? batchNo.trim() : null,
              expiryDate: expiryDate ? new Date(expiryDate) : null,
              quantityRemaining: quantity,
              supplierId,
            },
          });
          batchId = batch.id;
        }
      }

      // Transaction log
      const txn = await tx.transactionLog.create({
        data: {
          itemId,
          location: targetLocation,
          batchId,
          type: 'INBOUND',
          qty: quantity,
          userId: req.user.id,
          notes,
        },
      });

      // Update stock level for target location
      await tx.stockLevel.upsert({
        where: { itemId_location: { itemId, location: targetLocation } },
        update: { quantityOnHand: { increment: quantity }, lastUpdated: new Date() },
        create: { itemId, location: targetLocation, quantityOnHand: quantity },
      });

      return { txn, batchId };
    });

    await checkAndFireAlerts(itemId);

    res.status(201).json({ transaction: result.txn, batchId: result.batchId });
  } catch (err) {
    if (err.message === 'Item not found') {
      return res.status(404).json({ error: err.message });
    }
    if (
      err.message === 'Cannot receive stock for an archived item' ||
      err.message === 'Medication batch cannot be registered with a past expiry date.' ||
      err.message.includes('number is required') ||
      err.message.includes('date is required')
    ) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

// Stock Transfer Handlers (Two-Step Workflow)
const requestTransfer = async (req, res, next) => {
  try {
    const { fromLocation, toLocation, itemId, batchId, qty, notes } = req.body;

    if (!fromLocation || !toLocation || !['ECART', 'CENTRAL'].includes(fromLocation) || !['ECART', 'CENTRAL'].includes(toLocation)) {
      return res.status(400).json({ error: 'Valid fromLocation and toLocation (ECART or CENTRAL) are required.' });
    }
    if (fromLocation === toLocation) {
      return res.status(400).json({ error: 'Source location and destination location must be different.' });
    }
    if (!itemId || !qty || typeof qty !== 'number' || qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({ error: 'Valid itemId and positive whole number quantity are required.' });
    }

    // Verify stock availability at fromLocation
    const stockLevel = await prisma.stockLevel.findUnique({
      where: { itemId_location: { itemId, location: fromLocation } }
    });
    const currentQty = stockLevel?.quantityOnHand || 0;
    if (currentQty < qty) {
      return res.status(400).json({ error: `Insufficient stock in ${fromLocation}. Available: ${currentQty}` });
    }

    if (batchId) {
      const batch = await prisma.itemBatch.findUnique({ where: { id: batchId } });
      if (!batch) {
        return res.status(400).json({ error: 'Selected batch was not found.' });
      }
      if (batch.location !== fromLocation) {
        return res.status(400).json({ error: `Selected batch is located in ${batch.location}, not ${fromLocation}.` });
      }
      if (batch.quantityRemaining < qty) {
        return res.status(400).json({ error: `Selected batch has insufficient stock in ${fromLocation}. Available: ${batch.quantityRemaining}` });
      }
    }

    const transfer = await prisma.stockTransfer.create({
      data: {
        fromLocation,
        toLocation,
        itemId,
        batchId,
        qty,
        notes,
        requestedById: req.user.id,
        status: 'PENDING',
      },
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(transfer);
  } catch (err) { next(err); }
};

const approveTransfer = async (req, res, next) => {
  try {
    const transferId = req.params.id;

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { batch: true, item: true }
    });

    if (!transfer) return res.status(404).json({ error: 'Transfer request not found' });
    if (transfer.status !== 'PENDING') {
      return res.status(400).json({ error: `Transfer request is already ${transfer.status}` });
    }

    const { fromLocation, toLocation, itemId, batchId, qty } = transfer;

    await prisma.$transaction(async (tx) => {
      // 1. Verify stock availability at source location
      const sourceStock = await tx.stockLevel.findUnique({
        where: { itemId_location: { itemId, location: fromLocation } }
      });

      if (!sourceStock || sourceStock.quantityOnHand < qty) {
        throw new Error(`Insufficient stock in ${fromLocation} to fulfill transfer.`);
      }

      let targetBatchId = null;

      // 2. If batch specified, check source batch & transfer/create batch in destination (Bug #4 Fix)
      if (batchId) {
        const sourceBatch = await tx.itemBatch.findUnique({ where: { id: batchId } });
        if (!sourceBatch || sourceBatch.quantityRemaining < qty) {
          throw new Error(`Insufficient batch quantity in ${fromLocation} to fulfill transfer.`);
        }

        // Deduct source batch atomically (Bug #1 Fix)
        const updatedBatch = await tx.itemBatch.updateMany({
          where: { id: batchId, quantityRemaining: { gte: qty } },
          data: { quantityRemaining: { decrement: qty } }
        });
        if (updatedBatch.count === 0) {
          throw new Error(`Concurrent modification detected: Insufficient batch quantity in ${fromLocation}.`);
        }

        // Preserve exact batch number, expiration date, and supplier ID (Bug #4 Fix)
        const targetBatchNo = sourceBatch.batchNo || transfer.batch?.batchNo || `TRANSFER-${transfer.item?.sku || 'ITEM'}`;
        const targetExpiryDate = sourceBatch.expiryDate || transfer.batch?.expiryDate || null;
        const targetSupplierId = sourceBatch.supplierId || transfer.batch?.supplierId || null;

        // Find or create matching batch in target location
        let targetBatch = await tx.itemBatch.findFirst({
          where: { itemId, batchNo: targetBatchNo, location: toLocation }
        });

        if (targetBatch) {
          await tx.itemBatch.update({
            where: { id: targetBatch.id },
            data: { quantityRemaining: { increment: qty } }
          });
          targetBatchId = targetBatch.id;
        } else {
          const newBatch = await tx.itemBatch.create({
            data: {
              itemId,
              location: toLocation,
              batchNo: targetBatchNo,
              expiryDate: targetExpiryDate,
              quantityRemaining: qty,
              supplierId: targetSupplierId,
            }
          });
          targetBatchId = newBatch.id;
        }
      }

      // 3. Deduct source stock level atomically (Bug #1 Fix)
      const updatedStock = await tx.stockLevel.updateMany({
        where: { itemId, location: fromLocation, quantityOnHand: { gte: qty } },
        data: { quantityOnHand: { decrement: qty }, lastUpdated: new Date() }
      });
      if (updatedStock.count === 0) {
        throw new Error(`Concurrent modification detected: Insufficient stock in ${fromLocation} to fulfill transfer.`);
      }

      // 4. Increment target stock level
      await tx.stockLevel.upsert({
        where: { itemId_location: { itemId, location: toLocation } },
        update: { quantityOnHand: { increment: qty }, lastUpdated: new Date() },
        create: { itemId, location: toLocation, quantityOnHand: qty, lastUpdated: new Date() }
      });

      // 5. Log transfer transactions
      await tx.transactionLog.create({
        data: {
          itemId,
          location: fromLocation,
          batchId: batchId || null,
          type: 'TRANSFER_OUT',
          qty,
          userId: req.user.id,
          notes: `Transferred ${qty} to ${toLocation}. ${transfer.notes || ''}`.trim(),
        }
      });

      await tx.transactionLog.create({
        data: {
          itemId,
          location: toLocation,
          batchId: targetBatchId || null,
          type: 'TRANSFER_IN',
          qty,
          userId: req.user.id,
          notes: `Received ${qty} from ${fromLocation}. ${transfer.notes || ''}`.trim(),
        }
      });

      // 6. Atomically update transfer request status (guarantees single execution)
      const updateResult = await tx.stockTransfer.updateMany({
        where: { id: transferId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approvedById: req.user.id,
          updatedAt: new Date(),
        }
      });

      if (updateResult.count === 0) {
        throw new Error('Transfer request has already been processed or cancelled by another user.');
      }
    });

    await checkAndFireAlerts(itemId);

    const updatedTransfer = await prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      }
    });

    res.json(updatedTransfer);
  } catch (err) {
    if (err.message.includes('Insufficient stock') || err.message.includes('Insufficient batch') || err.message.includes('already been processed')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

const rejectTransfer = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    const transferId = req.params.id;

    const updatedResult = await prisma.stockTransfer.updateMany({
      where: { id: transferId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason?.trim() || 'Rejected by manager',
        approvedById: req.user.id,
        updatedAt: new Date(),
      },
    });

    if (updatedResult.count === 0) {
      return res.status(400).json({ error: 'Transfer request is not pending and cannot be rejected.' });
    }

    const updated = await prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: {
        item: { select: { id: true, name: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      }
    });

    res.json(updated);
  } catch (err) { next(err); }
};

const cancelTransfer = async (req, res, next) => {
  try {
    const transferId = req.params.id;

    const updatedResult = await prisma.stockTransfer.updateMany({
      where: { id: transferId, status: 'PENDING' },
      data: { status: 'CANCELLED', updatedAt: new Date() }
    });

    if (updatedResult.count === 0) {
      return res.status(400).json({ error: 'Transfer request is not pending and cannot be cancelled.' });
    }

    const updated = await prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: {
        item: { select: { id: true, name: true } },
        requestedBy: { select: { name: true } },
      }
    });

    res.json(updated);
  } catch (err) { next(err); }
};

const getTransfers = async (req, res, next) => {
  try {
    const { fromLocation, toLocation, status, itemId } = req.query;
    const where = {};
    if (fromLocation) where.fromLocation = fromLocation;
    if (toLocation) where.toLocation = toLocation;
    if (status) where.status = status;
    if (itemId) where.itemId = itemId;

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
        requestedBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(transfers);
  } catch (err) { next(err); }
};

const getTransactions = async (req, res, next) => {
  try {
    const { itemId, type, userId, location, from, to, limit = '100' } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const where = {};
    if (itemId) where.itemId = itemId;
    if (type) where.type = type;
    if (userId) where.userId = userId;
    if (location) where.location = location;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const transactions = await prisma.transactionLog.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        user: { select: { id: true, name: true, role: true } },
        batch: { select: { batchNo: true, expiryDate: true } },
        mgmtComments: {
          include: { commentedBy: { select: { name: true } } },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit,
    });

    res.json(transactions);
  } catch (err) { next(err); }
};

let lastExpiryAlertCheck = 0;

const checkAndFireExpiryAlerts = async () => {
  const now = Date.now();
  if (now - lastExpiryAlertCheck < 5 * 60 * 1000) {
    return;
  }
  lastExpiryAlertCheck = now;

  const today = new Date();
  const in90 = new Date(today);
  in90.setDate(today.getDate() + 90);

  const batches = await prisma.itemBatch.findMany({
    where: {
      expiryDate: { lte: in90, gte: today },
      quantityRemaining: { gt: 0 },
    },
    include: { item: true },
  });

  if (batches.length === 0) return;

  const recipients = await prisma.user.findMany({
    where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
    select: { id: true },
  });

  if (recipients.length === 0) return;

  for (const batch of batches) {
    const daysLeft = Math.ceil((new Date(batch.expiryDate) - today) / (1000 * 60 * 60 * 24));
    let threshold = 90;
    if (daysLeft <= 30) threshold = 30;
    else if (daysLeft <= 60) threshold = 60;

    const eventType = `EXPIRY_ALERT_${threshold}`;
    const message = `Medication batch ${batch.batchNo || 'N/A'} (${batch.location}) of ${batch.item.name} is expiring in ${daysLeft} days (Batch ID: ${batch.id})`;

    for (const recipient of recipients) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: recipient.id,
          eventType,
          message: { contains: `Batch ID: ${batch.id}` },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: recipient.id,
            eventType,
            message,
            link: '/items',
          },
        });
      }
    }
  }
};

const getAlerts = async (req, res, next) => {
  try {
    await checkAndFireExpiryAlerts();

    const items = await prisma.item.findMany({
      where: { isArchived: false },
      include: { stockLevels: true },
    });

    const today = new Date();
    const in90 = new Date(today); in90.setDate(today.getDate() + 90);

    const stockAlerts = items
      .map(i => {
        const stockLevels = i.stockLevels || [];
        const centralQty = stockLevels.find(s => s.location === 'CENTRAL')?.quantityOnHand ?? 0;
        const totalQty = stockLevels.reduce((sum, s) => sum + (s.quantityOnHand || 0), 0);
        if (totalQty === 0 || centralQty === 0) return { ...i, alertLevel: 'OUT_OF_STOCK', centralQty, totalQty };
        if (totalQty <= i.criticalLevel || centralQty <= i.criticalLevel) return { ...i, alertLevel: 'CRITICAL', centralQty, totalQty };
        if (totalQty <= i.warningLevel || centralQty <= i.warningLevel) return { ...i, alertLevel: 'WARNING', centralQty, totalQty };
        return null;
      })
      .filter(Boolean);

    const expiringBatches = await prisma.itemBatch.findMany({
      where: {
        expiryDate: { lte: in90, not: null },
        quantityRemaining: { gt: 0 },
      },
      include: { item: { select: { id: true, name: true, sku: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    res.json({ stockAlerts, expiringBatches });
  } catch (err) { next(err); }
};

module.exports = {
  receiveStock,
  getTransactions,
  getAlerts,
  checkAndFireAlerts,
  checkAndFireExpiryAlerts,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  cancelTransfer,
  getTransfers,
};
