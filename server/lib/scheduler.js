const prisma = require('./prisma');
const { checkAndFireExpiryAlerts } = require('../controllers/stock.controller');
const { createSnapshot, getBackupsDir } = require('../controllers/backup.controller');
const fs = require('fs');
const path = require('path');

const checkScheduleAndRun = async () => {
  try {
    // Proactively generate notifications for expiring batches
    await checkAndFireExpiryAlerts();

    // Automated daily database backup check
    await runDailyBackupCheck();
  } catch (err) {
    console.error('[Scheduler] Error in background task execution:', err);
  }
};

const runDailyBackupCheck = async () => {
  try {
    const today = new Date();
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);

    // Check if an automated backup was already created today
    const alreadyBackedUp = await prisma.databaseBackup.findFirst({
      where: {
        type: 'AUTOMATED',
        createdAt: { gte: startOfToday },
      },
    });

    if (!alreadyBackedUp) {
      console.log('[Scheduler] Creating automated daily database backup...');
      const dateStr = today.toISOString().substring(0, 10);
      await createSnapshot(`AutoDaily_${dateStr}`, 'AUTOMATED', null);
      console.log('[Scheduler] Automated daily database backup created successfully.');

      // Retention cleanup: delete automated backups older than 30 days
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const oldBackups = await prisma.databaseBackup.findMany({
        where: {
          type: 'AUTOMATED',
          createdAt: { lt: thirtyDaysAgo },
        },
      });

      if (oldBackups.length > 0) {
        const backupsDir = getBackupsDir();
        for (const old of oldBackups) {
          const filePath = path.join(backupsDir, old.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          await prisma.databaseBackup.delete({ where: { id: old.id } });
        }
        console.log(`[Scheduler] Cleaned up ${oldBackups.length} automated backup(s) older than 30 days.`);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error during daily database backup:', err.message);
  }
};

const startScheduler = () => {
  console.log('[Scheduler] Background report scheduler initialized.');
  // Check once immediately on boot
  checkScheduleAndRun();
  // Check every 4 hours (14400000 ms)
  setInterval(checkScheduleAndRun, 4 * 60 * 60 * 1000);
};

module.exports = { startScheduler };
