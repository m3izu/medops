const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/discard.controller');

router.post('/', authenticate, requirePermission('log_discard'), c.logDiscard);
router.get('/', authenticate, requirePermission('view_inventory_logs'), c.list);

module.exports = router;
