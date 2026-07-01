const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/stock.controller');

router.post('/receive', authenticate, requirePermission('receive_stock'), c.receiveStock);
router.get('/transactions', authenticate, requirePermission('view_inventory_logs'), c.getTransactions);
router.get('/alerts', authenticate, c.getAlerts);

module.exports = router;
