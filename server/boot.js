const { execSync } = require('child_process');
const prisma = require('./lib/prisma');

async function main() {
  console.log('[Boot] Ensuring database schema is up-to-date...');
  try {
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (err) {
    console.error('[Boot] Error running prisma db push:', err);
    process.exit(1);
  }

  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[Boot] New or empty database detected. Running seed...');
      execSync('node prisma/seed.js', { stdio: 'inherit' });
      console.log('[Boot] Seeding completed successfully.');
    } else {
      console.log(`[Boot] Existing database found (${userCount} users). Preserving persistent storage & skipping seed.`);
    }
  } catch (err) {
    console.error('[Boot] Error checking database state:', err);
  }

  console.log('[Boot] Launching MedOPS Server...');
  require('./index.js');
}

main();
