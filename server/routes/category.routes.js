const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/category.controller');

router.get('/', authenticate, c.list);
router.post('/', authenticate, requirePermission('manage_categories'), c.create);
router.put('/:id', authenticate, requirePermission('manage_categories'), c.update);
router.delete('/:id', authenticate, requirePermission('manage_categories'), c.remove);

module.exports = router;
