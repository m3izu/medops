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

  console.log('[Boot] Syncing core system configuration & admin credentials...');
  try {
    execSync('node prisma/seed.js', { stdio: 'inherit' });
    console.log('[Boot] System configuration & admin credentials synced successfully.');
  } catch (err) {
    console.error('[Boot] Seed sync error:', err.message);
  }

  console.log('[Boot] Launching MedOPS Server...');
  require('./index.js');
}

main();
