const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireTopAdmin, requirePermission } = require('../middleware/rbac');
const c = require('../controllers/user.controller');

router.get('/', authenticate, requirePermission('view_inventory_logs'), c.listUsers);
router.post('/', authenticate, requireTopAdmin, c.createUser);
router.get('/:id', authenticate, c.getUser);
router.put('/:id', authenticate, requireTopAdmin, c.updateUser);
router.post('/:id/reset-password', authenticate, requireTopAdmin, c.resetPassword);
router.delete('/:id', authenticate, requireTopAdmin, c.deleteUser);
router.patch('/:id/activate', authenticate, requireTopAdmin, c.toggleActive);

module.exports = router;
