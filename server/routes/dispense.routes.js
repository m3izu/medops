const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/dispense.controller');

// Cashier dashboard widget — count of pending billing entries
router.get('/pending-count', authenticate, requirePermission('record_billing'), c.pendingCount);

// Bulk record (must be before /:id routes to avoid route collision)
router.patch('/bulk-record', authenticate, requirePermission('record_billing'), c.bulkRecord);

// Create a direct dispense entry
router.post('/', authenticate, requirePermission('dispense_item'), c.create);

// List dispense logs (accessible if user has view_dispense_logs, dispense_item, or return_item permission)
router.get('/', authenticate, requirePermission(['view_dispense_logs', 'dispense_item', 'return_item']), c.list);

// Cashier marks a single entry as recorded
router.patch('/:id/record', authenticate, requirePermission('record_billing'), c.recordOne);

module.exports = router;
