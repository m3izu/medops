const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const bcrypt = require('bcryptjs');
const { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } = require('../lib/permissions');

const dbPath = path.resolve(__dirname, 'medops.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Session config
  await prisma.sessionConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, timeoutMinutes: 30 },
  });

  // 2. Report schedule
  await prisma.reportSchedule.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, dayOfMonth: 1, isActive: true },
  });

  // 3. Seed default role permissions
  const allPermKeys = Object.values(PERMISSIONS);
  for (const [role, enabledPerms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const key of allPermKeys) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: key } },
        update: { isEnabled: enabledPerms.includes(key) },
        create: { role, permissionKey: key, isEnabled: enabledPerms.includes(key) },
      });
    }
  }
  console.log('Role permissions seeded');

  // 4. Top Admin account
  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'System Administrator',
      username: 'admin',
      passwordHash: adminPassword,
      role: 'TOP_ADMIN',
    },
  });
  console.log(`Top Admin created: username=admin password=Admin@123`);

  // 5. Sample categories
  await prisma.category.upsert({
    where: { id: 'cat-medication' },
    update: { hasBatchControl: true },
    create: { id: 'cat-medication', name: 'Medications', hasBatchControl: true, createdById: admin.id },
  });

  const subcats = [
    { id: 'cat-med-injectable', name: 'Injectable', parentId: 'cat-medication', hasBatchControl: true },
    { id: 'cat-med-oral', name: 'Oral', parentId: 'cat-medication', hasBatchControl: true },
    { id: 'cat-med-topical', name: 'Topical', parentId: 'cat-medication', hasBatchControl: true },
    { id: 'cat-consumable', name: 'Medical Consumables', parentId: null, hasBatchControl: false },
    { id: 'cat-consumable-dialysis', name: 'Dialysis Supplies', parentId: 'cat-consumable', hasBatchControl: false },
    { id: 'cat-consumable-wound', name: 'Wound Care', parentId: 'cat-consumable', hasBatchControl: false },
    { id: 'cat-equipment', name: 'Medical Equipment', parentId: null, hasBatchControl: false },
    { id: 'cat-ppe', name: 'PPE', parentId: null, hasBatchControl: false },
    { id: 'cat-ppe-gloves', name: 'Gloves', parentId: 'cat-ppe', hasBatchControl: false },
    { id: 'cat-ppe-masks', name: 'Masks', parentId: 'cat-ppe', hasBatchControl: false },
    { id: 'cat-office', name: 'Office & Cleaning Supplies', parentId: null, hasBatchControl: false },
  ];

  for (const cat of subcats) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { hasBatchControl: cat.hasBatchControl },
      create: { id: cat.id, name: cat.name, parentId: cat.parentId, hasBatchControl: cat.hasBatchControl, createdById: admin.id },
    });
  }
  console.log('Categories seeded');

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Username: admin');
  console.log('  Password: Admin@123');
  console.log('─────────────────────────────────────');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
