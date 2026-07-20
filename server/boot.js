const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const prisma = require('./lib/prisma');

async function main() {
  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(__dirname, 'prisma/medops.db');

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`[Boot] Ensuring database schema is up-to-date at ${dbPath}...`);
  try {
    execSync(`npx prisma db push --url "file:${dbPath}"`, { stdio: 'inherit' });
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
    console.error('[Boot] Error checking database state, running fallback seed:', err.message);
    try {
      execSync('node prisma/seed.js', { stdio: 'inherit' });
    } catch (seedErr) {
      console.error('[Boot] Fallback seed error:', seedErr.message);
    }
  }

  console.log('[Boot] Launching MedOPS Server...');
  require('./index.js');
}

main();
