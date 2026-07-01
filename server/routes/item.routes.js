const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/item.controller');

router.get('/', authenticate, c.list);
router.post('/', authenticate, requirePermission('manage_items'), c.create);
router.get('/:id', authenticate, c.getOne);
router.put('/:id', authenticate, requirePermission('manage_items'), c.update);
router.patch('/:id/archive', authenticate, requirePermission('manage_items'), c.toggleArchive);

module.exports = router;
