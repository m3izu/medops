const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/stocktake.controller');

router.get('/', authenticate, c.list);
router.post('/', authenticate, requirePermission('initiate_stocktake'), c.initiate);
router.get('/:id', authenticate, c.getOne);
router.patch('/:id/lines/:lineId', authenticate, requirePermission('initiate_stocktake'), c.updateLine);
router.patch('/:id/complete', authenticate, requirePermission('initiate_stocktake'), c.complete);

module.exports = router;
