const prisma = require('../lib/prisma');

const importCsv = async (req, res, next) => {
  try {
    const { type, rows, fileName } = req.body;
    if (!type || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Type and rows array are required.' });
    }

    let rowsSuccess = 0;
    let rowsFailed = 0;
    const errorDetails = [];

    // Process rows sequentially inside a transaction wrapper (or one by one to log specific failures per line)
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const lineNum = index + 1;

      try {
        if (type === 'suppliers') {
          // Validate Supplier
          if (!row.name || !row.name.trim()) {
            throw new Error(`Row ${lineNum}: Supplier name is required.`);
          }

          await prisma.$transaction(async (tx) => {
            // Check if supplier already exists
            const existing = await tx.supplier.findFirst({
              where: { name: { equals: row.name.trim() } }
            });
            if (existing) {
              throw new Error(`Row ${lineNum}: Supplier "${row.name}" already exists.`);
            }

            await tx.supplier.create({
              data: {
                name: row.name.trim(),
                contactPerson: row.contactPerson?.trim() || null,
                phone: row.phone?.trim() || null,
                email: row.email?.trim() || null,
                address: row.address?.trim() || null,
                notes: row.notes?.trim() || null,
                createdById: req.user.id
              }
            });
          });
          rowsSuccess++;

        } else if (type === 'items') {
          // Validate Item
          if (!row.name || !row.name.trim()) {
            throw new Error(`Row ${lineNum}: Item name is required.`);
          }
          if (!row.sku || !row.sku.trim()) {
            throw new Error(`Row ${lineNum}: SKU is required.`);
          }
          if (!row.itemType || !row.itemType.trim()) {
            throw new Error(`Row ${lineNum}: Item Type is required.`);
          }
          if (!row.unit || !row.unit.trim()) {
            throw new Error(`Row ${lineNum}: Unit is required.`);
          }

          const itemType = row.itemType.trim().toUpperCase();
          const validTypes = ['MEDICATION', 'MEDICAL_CONSUMABLE', 'MEDICAL_EQUIPMENT', 'PPE', 'OFFICE_SUPPLY'];
          if (!validTypes.includes(itemType)) {
            throw new Error(`Row ${lineNum}: Invalid Item Type "${itemType}". Must be one of: ${validTypes.join(', ')}`);
          }

          await prisma.$transaction(async (tx) => {
            // Check unique SKU
            const existingSku = await tx.item.findUnique({
              where: { sku: row.sku.trim() }
            });

            // Validate Category and Supplier if provided
            let categoryId = row.categoryId?.trim() || null;
            let cat = null;
            if (categoryId) {
              cat = await tx.category.findUnique({ where: { id: categoryId } });
              if (!cat) {
                throw new Error(`Row ${lineNum}: Category ID "${categoryId}" not found.`);
              }
            }

            let supplierId = row.supplierId?.trim() || null;
            if (supplierId) {
              const sup = await tx.supplier.findUnique({ where: { id: supplierId } });
              if (!sup) {
                throw new Error(`Row ${lineNum}: Supplier ID "${supplierId}" not found.`);
              }
            }

            const parsedWarn = parseInt(row.warningLevel, 10);
            const warningLevel = isNaN(parsedWarn) ? 10 : parsedWarn;

            const parsedCrit = parseInt(row.criticalLevel, 10);
            const criticalLevel = isNaN(parsedCrit) ? 5 : parsedCrit;

            const hasInitialQty = row.initialQty !== undefined && row.initialQty !== null && String(row.initialQty).trim() !== '';
            const parsedInit = hasInitialQty ? parseInt(row.initialQty, 10) : undefined;
            const initialQty = parsedInit !== undefined ? (isNaN(parsedInit) ? 0 : parsedInit) : undefined;

            if (initialQty !== undefined && initialQty < 0) {
              throw new Error(`Row ${lineNum}: Initial quantity cannot be negative.`);
            }

            let acquisitionDate = null;
            if (row.acquisitionDate) {
              const parsedDate = new Date(row.acquisitionDate);
              if (isNaN(parsedDate.getTime())) {
                throw new Error(`Row ${lineNum}: Invalid acquisition date format.`);
              }
              acquisitionDate = parsedDate;
            }

            let targetItem;

            const rowLoc = row.location?.trim().toUpperCase();
            const targetLocation = ['ECART', 'CENTRAL'].includes(rowLoc) ? rowLoc : 'CENTRAL';
            const otherLocation = targetLocation === 'CENTRAL' ? 'ECART' : 'CENTRAL';

            if (existingSku) {
              // UPSERT / UPDATE existing item
              targetItem = await tx.item.update({
                where: { id: existingSku.id },
                data: {
                  name: row.name.trim(),
                  itemType,
                  unit: row.unit.trim(),
                  warningLevel,
                  criticalLevel,
                  condition: row.condition?.trim() || existingSku.condition,
                  ...(categoryId ? { categoryId } : {}),
                  ...(supplierId ? { supplierId } : {}),
                  ...(row.serialNumber?.trim() ? { serialNumber: row.serialNumber.trim() } : {}),
                  ...(acquisitionDate ? { acquisitionDate } : {}),
                }
              });

              // Upsert stock level for target location (only update if initialQty is explicitly supplied)
              if (initialQty !== undefined) {
                await tx.stockLevel.upsert({
                  where: { itemId_location: { itemId: targetItem.id, location: targetLocation } },
                  update: { quantityOnHand: initialQty, lastUpdated: new Date() },
                  create: { itemId: targetItem.id, location: targetLocation, quantityOnHand: initialQty, lastUpdated: new Date() }
                });
              }

              await tx.stockLevel.upsert({
                where: { itemId_location: { itemId: targetItem.id, location: otherLocation } },
                update: {},
                create: { itemId: targetItem.id, location: otherLocation, quantityOnHand: 0, lastUpdated: new Date() }
              });
            } else {
                // CREATE new item and stock levels
                targetItem = await tx.item.create({
                  data: {
                    name: row.name.trim(),
                    sku: row.sku.trim(),
                    itemType,
                    unit: row.unit.trim(),
                    categoryId,
                    supplierId,
                    warningLevel,
                    criticalLevel,
                    serialNumber: row.serialNumber?.trim() || null,
                    acquisitionDate,
                    condition: row.condition?.trim() || 'GOOD',
                    createdById: req.user.id,
                    stockLevels: {
                      create: [
                        { location: targetLocation, quantityOnHand: initialQty ?? 0, lastUpdated: new Date() },
                        { location: otherLocation, quantityOnHand: 0, lastUpdated: new Date() },
                      ]
                    }
                  }
                });
              }

              // Create or update batch for medications/batch-controlled items with initial quantity
              let batchId = null;
              const isBatchControlled = itemType === 'MEDICATION' || (cat?.hasBatchControl ?? false);
              if (isBatchControlled && initialQty > 0) {
                const importBatchNo = row.batchNo?.trim() || `IMPORT-${row.sku.trim()}`;
                
                let importExpiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
                if (row.expiryDate) {
                  const parsedExpiry = new Date(row.expiryDate);
                  if (isNaN(parsedExpiry.getTime())) {
                    throw new Error(`Row ${lineNum}: Invalid expiry date format.`);
                  }
                  importExpiryDate = parsedExpiry;
                }
                
                // Check if batch already exists for this item, batchNo & location
                const existingBatch = await tx.itemBatch.findFirst({
                  where: { itemId: targetItem.id, batchNo: importBatchNo, location: targetLocation }
                });

                if (existingBatch) {
                  const updatedBatch = await tx.itemBatch.update({
                    where: { id: existingBatch.id },
                    data: {
                      quantityRemaining: initialQty,
                      expiryDate: importExpiryDate
                    }
                  });
                  batchId = updatedBatch.id;
                } else {
                  const batch = await tx.itemBatch.create({
                    data: {
                      itemId: targetItem.id,
                      location: targetLocation,
                      batchNo: importBatchNo,
                      expiryDate: importExpiryDate,
                      quantityRemaining: initialQty,
                      supplierId
                    }
                  });
                  batchId = batch.id;
                }
              }

              // Log transaction if there is initial qty
              if (initialQty > 0) {
                await tx.transactionLog.create({
                  data: {
                    itemId: targetItem.id,
                    location: targetLocation,
                    batchId,
                    type: 'INBOUND',
                    qty: initialQty,
                    userId: req.user.id,
                    notes: existingSku 
                      ? `Stock count updated via CSV bulk import (Upsert - ${targetLocation})`
                      : `Initial stock intake from CSV bulk import (${targetLocation})`
                  }
                });
              }
          });
          rowsSuccess++;

        } else if (type === 'patients') {
          // Validate Patient
          if (!row.name || !row.name.trim()) {
            throw new Error(`Row ${lineNum}: Patient name is required.`);
          }
          if (!row.chartNumber || !row.chartNumber.trim()) {
            throw new Error(`Row ${lineNum}: Chart number is required.`);
          }

          await prisma.$transaction(async (tx) => {
            // Check chart number uniqueness
            const existingPatient = await tx.patient.findUnique({
              where: { chartNumber: row.chartNumber.trim() }
            });
            if (existingPatient) {
              throw new Error(`Row ${lineNum}: Chart number "${row.chartNumber}" is already in use.`);
            }

            const status = row.status?.trim().toUpperCase() || 'ACTIVE';
            if (status !== 'ACTIVE' && status !== 'INACTIVE') {
              throw new Error(`Row ${lineNum}: Invalid status "${status}". Must be ACTIVE or INACTIVE.`);
            }

            let firstSessionDate = null;
            if (row.firstSessionDate) {
              const parsedDate = new Date(row.firstSessionDate);
              if (isNaN(parsedDate.getTime())) {
                throw new Error(`Row ${lineNum}: Invalid first session date format.`);
              }
              firstSessionDate = parsedDate;
            }

            await tx.patient.create({
              data: {
                name: row.name.trim(),
                chartNumber: row.chartNumber.trim(),
                diagnosis: row.diagnosis?.trim() || null,
                schedule: row.schedule?.trim() || null,
                firstSessionDate,
                contact: row.contact?.trim() || null,
                status,
                managedById: req.user.id
              }
            });
          });
          rowsSuccess++;
        } else {
          throw new Error(`Unsupported import type: ${type}`);
        }
      } catch (err) {
        rowsFailed++;
        errorDetails.push(err.message);
      }
    }

    // Save Log to DB
    const log = await prisma.importLog.create({
      data: {
        fileName: fileName || `bulk_import_${type}_${Date.now()}.csv`,
        importedById: req.user.id,
        rowsSuccess,
        rowsFailed,
        errorDetails: errorDetails.length > 0 ? JSON.stringify(errorDetails) : null
      }
    });

    res.json({
      success: true,
      log,
      rowsSuccess,
      rowsFailed,
      errors: errorDetails
    });

  } catch (err) {
    next(err);
  }
};

const getLogs = async (req, res, next) => {
  try {
    const logs = await prisma.importLog.findMany({
      include: {
        importedBy: {
          select: { name: true, role: true }
        }
      },
      orderBy: { importedAt: 'desc' }
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
};

module.exports = { importCsv, getLogs };
