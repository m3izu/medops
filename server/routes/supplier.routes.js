const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/supplier.controller');

router.get('/', authenticate, c.list);
router.post('/', authenticate, requirePermission('manage_suppliers'), c.create);
router.get('/:id', authenticate, c.getOne);
router.put('/:id', authenticate, requirePermission('manage_suppliers'), c.update);
router.delete('/:id', authenticate, requirePermission('manage_suppliers'), c.remove);

module.exports = router;
