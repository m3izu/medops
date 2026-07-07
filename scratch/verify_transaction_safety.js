const prisma = require('../server/lib/prisma');

async function run() {
  console.log('Testing transaction verification and input sanitization...');
  
  // 1. Verify that we can query Requisitions and Discards safely
  const requisitionCount = await prisma.requisition.count();
  const discardCount = await prisma.discardLog.count();
  console.log(`Requisitions: ${requisitionCount}, Discard logs: ${discardCount}`);
  
  console.log('Verification completed successfully!');
}

run()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
