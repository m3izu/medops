const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/return.controller');

router.post('/', authenticate, requirePermission('return_item'), c.create);
router.get('/', authenticate, requirePermission('return_item'), c.list);
router.get('/by-source/:sourceType/:sourceId', authenticate, requirePermission('return_item'), c.getReturnedQty);

module.exports = router;
