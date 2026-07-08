const prisma = require('./prisma');
const { createReportInternal } = require('../controllers/report.controller');

const checkScheduleAndRun = async () => {
  try {
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

const startScheduler = () => {
  console.log('[Scheduler] Background report scheduler initialized.');
  // Check once immediately on boot
  checkScheduleAndRun();
  // Check every 4 hours (14400000 ms)
  setInterval(checkScheduleAndRun, 4 * 60 * 60 * 1000);
};

module.exports = { startScheduler };
