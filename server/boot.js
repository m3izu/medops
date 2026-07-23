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
    execSync(`npx prisma db push --accept-data-loss --url "file:${dbPath}"`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('[Boot] Error running prisma db push:', err);
    process.exit(1);
  }

  console.log('[Boot] Checking system initialization status...');
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[Boot] Fresh installation detected. Syncing core system configuration & admin credentials...');
      execSync('node prisma/seed.js', { stdio: 'inherit', cwd: __dirname });
      console.log('[Boot] System configuration & admin credentials seeded successfully.');
    } else {
      console.log(`[Boot] Existing system detected (${userCount} active users). Skipping seed execution.`);
    }
  } catch (err) {
    console.error('[Boot] Seed check error:', err.message);
  }

  console.log('[Boot] Verifying and backfilling dual stock levels (ECART & CENTRAL)...');
  try {
    const items = await prisma.item.findMany();
    for (const item of items) {
      // Ensure ECART stock level exists
      const ecartStock = await prisma.stockLevel.findUnique({
        where: { itemId_location: { itemId: item.id, location: 'ECART' } }
      });
      if (!ecartStock) {
        await prisma.stockLevel.create({
          data: { itemId: item.id, location: 'ECART', quantityOnHand: 0 }
        });
      }
      // Ensure CENTRAL stock level exists
      const centralStock = await prisma.stockLevel.findUnique({
        where: { itemId_location: { itemId: item.id, location: 'CENTRAL' } }
      });
      if (!centralStock) {
        await prisma.stockLevel.create({
          data: { itemId: item.id, location: 'CENTRAL', quantityOnHand: 0 }
        });
      }
    }
    console.log('[Boot] Dual stock levels verified successfully.');
  } catch (err) {
    console.error('[Boot] Stock level backfill error:', err.message);
  }

  console.log('[Boot] Launching MedOPS Server...');
  require('./index.js');
}

main();
