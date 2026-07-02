const cron = require('node-cron');
const { runMonthlyCycle } = require('../controllers/scheduler.controller');

// Runs at 00:00 IST on the 1st of every month
cron.schedule('0 0 1 * *', async () => {
  console.log('[CRON] Monthly subscription cycle started —', new Date().toISOString());
  try {
    const summary = await runMonthlyCycle();
    console.log(`[CRON] Done — tickets created: ${summary.ticketsGenerated}, skipped: ${summary.accountsSkipped}`);
  } catch (err) {
    console.error('[CRON] Monthly cycle failed:', err.message);
  }
}, {
  timezone: 'Asia/Kolkata',
});

console.log('[CRON] Monthly subscription scheduler registered (runs 1st of every month, IST).');
