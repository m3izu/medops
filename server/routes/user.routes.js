const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/user.controller');

router.get('/co-verifiers', authenticate, c.listCoVerifiers);
router.put('/me/password', authenticate, c.changeOwnPassword);
router.get('/:id/profile', authenticate, c.getUserProfile);
router.get('/', authenticate, requirePermission(['create_users', 'manage_permissions', 'view_inventory_logs']), c.listUsers);
router.post('/', authenticate, requirePermission('create_users'), c.createUser);
router.get('/:id', authenticate, c.getUser);
router.put('/:id', authenticate, requirePermission('create_users'), c.updateUser);
router.post('/:id/reset-password', authenticate, requirePermission('create_users'), c.resetPassword);
router.delete('/:id', authenticate, requirePermission('create_users'), c.deleteUser);
router.patch('/:id/activate', authenticate, requirePermission('create_users'), c.toggleActive);

module.exports = router;
