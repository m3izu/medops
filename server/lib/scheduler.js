const prisma = require('./prisma');
const { createReportInternal } = require('../controllers/report.controller');
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

    const schedule = await prisma.reportSchedule.findUnique({ where: { id: 1 } });
    if (!schedule || !schedule.isActive) return;

    const today = new Date();
    const currentDay = today.getDate();

    if (currentDay === schedule.dayOfMonth) {
      // Check if a report was already generated today
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);

      const alreadyGenerated = await prisma.monthlyReport.findFirst({
        where: {
          generatedAt: {
            gte: startOfToday,
          },
        },
      });

      if (!alreadyGenerated) {
        console.log(`[Scheduler] Scheduled day ${currentDay} matched. Triggering auto monthly report generation...`);
        
        // Find the first active Top Admin user to associate as the generator
        const admin = await prisma.user.findFirst({ where: { role: 'TOP_ADMIN', isDeleted: false } });
        if (admin) {
          await createReportInternal(admin.id);
          console.log('[Scheduler] Automated monthly report generated successfully.');
        } else {
          console.error('[Scheduler] Aborted: No active Top Admin user found to trigger report generation.');
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in automated report check:', err);
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
