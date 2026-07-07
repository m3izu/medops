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

          // Check if supplier already exists
          const existing = await prisma.supplier.findFirst({
            where: { name: { equals: row.name.trim() } }
          });
          if (existing) {
            throw new Error(`Row ${lineNum}: Supplier "${row.name}" already exists.`);
          }

          await prisma.supplier.create({
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

          // Check unique SKU
          const existingSku = await prisma.item.findUnique({
            where: { sku: row.sku.trim() }
          });
          if (existingSku) {
            throw new Error(`Row ${lineNum}: SKU "${row.sku}" is already in use.`);
          }

          // Validate Category and Supplier if provided
          let categoryId = row.categoryId?.trim() || null;
          if (categoryId) {
            const cat = await prisma.category.findUnique({ where: { id: categoryId } });
            if (!cat) {
              throw new Error(`Row ${lineNum}: Category ID "${categoryId}" not found.`);
            }
          }

          let supplierId = row.supplierId?.trim() || null;
          if (supplierId) {
            const sup = await prisma.supplier.findUnique({ where: { id: supplierId } });
            if (!sup) {
              throw new Error(`Row ${lineNum}: Supplier ID "${supplierId}" not found.`);
            }
          }

          const warningLevel = parseInt(row.warningLevel) || 10;
          const criticalLevel = parseInt(row.criticalLevel) || 5;
          const initialQty = parseInt(row.initialQty) || 0;

          if (initialQty < 0) {
            throw new Error(`Row ${lineNum}: Initial quantity cannot be negative.`);
          }

          // Create item and its stock level
          const newItem = await prisma.item.create({
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
              acquisitionDate: row.acquisitionDate ? new Date(row.acquisitionDate) : null,
              condition: row.condition?.trim() || 'GOOD',
              createdById: req.user.id,
              stockLevel: {
                create: {
                  quantityOnHand: initialQty,
                  lastUpdated: new Date()
                }
              }
            }
          });

          // Create a default batch for medications with initial quantity
          let batchId = null;
          if (itemType === 'MEDICATION' && initialQty > 0) {
            const batch = await prisma.itemBatch.create({
              data: {
                itemId: newItem.id,
                batchNo: `IMPORT-${row.sku.trim()}`,
                expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year default
                quantityRemaining: initialQty,
                supplierId
              }
            });
            batchId = batch.id;
          }

          // Log transaction if there is initial qty
          if (initialQty > 0) {
            await prisma.transactionLog.create({
              data: {
                itemId: newItem.id,
                batchId,
                type: 'INBOUND',
                qty: initialQty,
                userId: req.user.id,
                notes: 'Initial stock intake from CSV bulk import'
              }
            });
          }

          rowsSuccess++;

        } else if (type === 'patients') {
          // Validate Patient
          if (!row.name || !row.name.trim()) {
            throw new Error(`Row ${lineNum}: Patient name is required.`);
          }
          if (!row.chartNumber || !row.chartNumber.trim()) {
            throw new Error(`Row ${lineNum}: Chart number is required.`);
          }

          // Check chart number uniqueness
          const existingPatient = await prisma.patient.findUnique({
            where: { chartNumber: row.chartNumber.trim() }
          });
          if (existingPatient) {
            throw new Error(`Row ${lineNum}: Chart number "${row.chartNumber}" is already in use.`);
          }

          const status = row.status?.trim().toUpperCase() || 'ACTIVE';
          if (status !== 'ACTIVE' && status !== 'INACTIVE') {
            throw new Error(`Row ${lineNum}: Invalid status "${status}". Must be ACTIVE or INACTIVE.`);
          }

          await prisma.patient.create({
            data: {
              name: row.name.trim(),
              chartNumber: row.chartNumber.trim(),
              diagnosis: row.diagnosis?.trim() || null,
              schedule: row.schedule?.trim() || null,
              firstSessionDate: row.firstSessionDate ? new Date(row.firstSessionDate) : null,
              contact: row.contact?.trim() || null,
              status,
              managedById: req.user.id
            }
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
