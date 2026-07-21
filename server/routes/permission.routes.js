const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/permission.controller');

// Get all role permissions (for the permissions management UI)
router.get('/roles', authenticate, requirePermission('manage_permissions'), c.getRolePermissions);
// Update a role's permission
router.put('/roles/:role/:permissionKey', authenticate, requirePermission('manage_permissions'), c.setRolePermission);
// Get a specific user's permission overrides
router.get('/users/:userId', authenticate, requirePermission('manage_permissions'), c.getUserPermissions);
// Set a user-specific permission override
router.put('/users/:userId/:permissionKey', authenticate, requirePermission('manage_permissions'), c.setUserPermission);
// Get permission audit log
router.get('/audit', authenticate, requirePermission('manage_permissions'), c.getAuditLog);
// Get session config
router.get('/session', authenticate, requirePermission('configure_session'), c.getSessionConfig);
// Update session config
router.put('/session', authenticate, requirePermission('configure_session'), c.updateSessionConfig);

module.exports = router;
