const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

// Helper to determine the database file path
const getDbPath = () => {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }
  return path.resolve(__dirname, '../prisma/medops.db');
};

// Helper to get backups folder
const getBackupsDir = () => {
  const dbPath = getDbPath();
  const baseDir = path.dirname(dbPath);
  const backupsDir = path.join(baseDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  return backupsDir;
};

/**
 * Creates an online, atomic SQLite snapshot using PRAGMA vacuum into
 */
const createSnapshot = async (label, type, createdById = null) => {
  const dbPath = getDbPath();
  const backupsDir = getBackupsDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedLabel = (label || 'checkpoint').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `checkpoint_${timestamp}_${sanitizedLabel}.db`;
  const backupFilePath = path.join(backupsDir, filename);

  // Escaped file path for SQLite query
  const targetPathSql = backupFilePath.replace(/'/g, "''");

  // Execute atomic online backup
  await prisma.$executeRawUnsafe(`VACUUM INTO '${targetPathSql}'`);

  const stats = fs.statSync(backupFilePath);

  // Record backup in database
  const record = await prisma.databaseBackup.create({
    data: {
      filename,
      label: label || 'Point-in-Time Checkpoint',
      type: type || 'MANUAL',
      sizeBytes: BigInt(stats.size),
      createdById,
    },
  });

  return { record, filePath: backupFilePath };
};

/**
 * GET /api/backup/list
 * List all checkpoints
 */
const listBackups = async (req, res, next) => {
  try {
    const records = await prisma.databaseBackup.findMany({
      include: { createdBy: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const backupsDir = getBackupsDir();
    const formatted = records.map(r => {
      const filePath = path.join(backupsDir, r.filename);
      const existsOnDisk = fs.existsSync(filePath);
      return {
        id: r.id,
        filename: r.filename,
        label: r.label,
        type: r.type,
        sizeBytes: Number(r.sizeBytes),
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        existsOnDisk,
      };
    });

    res.json(formatted);
  } catch (err) { next(err); }
};

/**
 * POST /api/backup/checkpoint
 * Top Admin manually creates a snapshot checkpoint
 */
const createCheckpoint = async (req, res, next) => {
  try {
    const { label } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Checkpoint label is required.' });
    }

    const { record } = await createSnapshot(label.trim(), 'MANUAL', req.user.id);
    res.status(201).json({
      id: record.id,
      filename: record.filename,
      label: record.label,
      type: record.type,
      sizeBytes: Number(record.sizeBytes),
      createdAt: record.createdAt,
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/backup/download/:id
 * Download a .db backup file directly
 */
const downloadBackup = async (req, res, next) => {
  try {
    const record = await prisma.databaseBackup.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: 'Backup checkpoint not found.' });

    const backupsDir = getBackupsDir();
    const filePath = path.join(backupsDir, record.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file no longer exists on storage.' });
    }

    res.download(filePath, record.filename);
  } catch (err) { next(err); }
};

/**
 * GET /api/backup/export-json
 * Dump full application state as human-readable JSON
 */
const exportJson = async (req, res, next) => {
  try {
    const [
      users, categories, suppliers, items, itemBatches, stockLevels,
      patients, requisitions, requisitionLines, transactionLogs,
      discardLogs, stocktakes, stocktakeLines, dispenseLogs
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, username: true, role: true, isActive: true, isDeleted: true, createdAt: true } }),
      prisma.category.findMany(),
      prisma.supplier.findMany(),
      prisma.item.findMany(),
      prisma.itemBatch.findMany(),
      prisma.stockLevel.findMany(),
      prisma.patient.findMany(),
      prisma.requisition.findMany(),
      prisma.requisitionLine.findMany(),
      prisma.transactionLog.findMany(),
      prisma.discardLog.findMany(),
      prisma.stocktake.findMany(),
      prisma.stocktakeLine.findMany(),
      prisma.dispenseLog.findMany(),
    ]);

    const dump = {
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username,
        system: 'MedOPS Dialysis Operations & Inventory System',
        version: '1.0.0',
      },
      data: {
        users, categories, suppliers, items, itemBatches, stockLevels,
        patients, requisitions, requisitionLines, transactionLogs,
        discardLogs, stocktakes, stocktakeLines, dispenseLogs
      }
    };

    const timestamp = new Date().toISOString().substring(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="medops_data_export_${timestamp}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) { next(err); }
};

/**
 * POST /api/backup/restore/:id
 * Point-in-Time Rollback Engine
 * Requires Top Admin password confirmation.
 * Creates an emergency pre-rollback snapshot before restoring.
 */
const restoreRollback = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Top Admin password is required to authorize rollback.' });
    }

    // Verify Admin Password
    const adminUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!adminUser) return res.status(404).json({ error: 'Admin user not found.' });

    const validPassword = await bcrypt.compare(password, adminUser.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password authorization. Rollback aborted.' });
    }

    // Find target backup record
    const targetRecord = await prisma.databaseBackup.findUnique({ where: { id: req.params.id } });
    if (!targetRecord) return res.status(404).json({ error: 'Target backup checkpoint not found.' });

    const backupsDir = getBackupsDir();
    const sourceFilePath = path.join(backupsDir, targetRecord.filename);
    if (!fs.existsSync(sourceFilePath)) {
      return res.status(404).json({ error: 'Target backup checkpoint file no longer exists on disk.' });
    }

    // 1. Create an Emergency Pre-Rollback Snapshot FIRST
    console.log(`[Rollback] Creating emergency safety snapshot before restoring "${targetRecord.label}"...`);
    const emergencyLabel = `PreRollback_To_${targetRecord.label.replace(/\s+/g, '_')}`;
    const { record: emergencyRec } = await createSnapshot(emergencyLabel, 'EMERGENCY_PRE_ROLLBACK', req.user.id);

    // 2. Perform atomic database file copy
    const activeDbPath = getDbPath();
    console.log(`[Rollback] Replacing active DB (${activeDbPath}) with checkpoint (${sourceFilePath})...`);

    // Disconnect Prisma connections briefly
    await prisma.$disconnect();

    // Copy checkpoint file over active database
    fs.copyFileSync(sourceFilePath, activeDbPath);

    // Reconnect Prisma
    await prisma.$connect();

    console.log('[Rollback] Database successfully restored to checkpoint:', targetRecord.label);

    res.json({
      message: `System successfully rolled back to "${targetRecord.label}" (${new Date(targetRecord.createdAt).toLocaleString()}).`,
      emergencyBackupCreated: emergencyRec.label,
    });
  } catch (err) { next(err); }
};

/**
 * DELETE /api/backup/:id
 * Delete a checkpoint file
 */
const deleteBackup = async (req, res, next) => {
  try {
    const record = await prisma.databaseBackup.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: 'Checkpoint not found.' });

    const backupsDir = getBackupsDir();
    const filePath = path.join(backupsDir, record.filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.databaseBackup.delete({ where: { id: req.params.id } });
    res.json({ message: 'Checkpoint deleted successfully.' });
  } catch (err) { next(err); }
};

module.exports = {
  listBackups,
  createCheckpoint,
  downloadBackup,
  exportJson,
  restoreRollback,
  deleteBackup,
  createSnapshot,
  getBackupsDir,
};
