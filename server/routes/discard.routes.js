const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/discard.controller');

router.post('/', authenticate, requirePermission('log_discard'), c.logDiscard);
// List discard history (accessible if user has log_discard or view_inventory_logs permission)
router.get('/', authenticate, requirePermission(['log_discard', 'view_inventory_logs']), c.list);

module.exports = router;
