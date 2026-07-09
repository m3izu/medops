const prisma = require('./prisma');

/**
 * Checks if an item is batch-controlled either because it's a medication
 * or because its category/subcategory has hasBatchControl enabled.
 * @param {string} itemId
 * @returns {Promise<boolean>}
 */
async function isItemBatchControlled(itemId) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { category: true }
  });
  if (!item) return false;
  return item.itemType === 'MEDICATION' || (item.category?.hasBatchControl ?? false);
}

module.exports = { isItemBatchControlled };
