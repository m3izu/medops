const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireTopAdmin } = require('../middleware/rbac');
const c = require('../controllers/permission.controller');

// Get all role permissions (for the permissions management UI)
router.get('/roles', authenticate, requireTopAdmin, c.getRolePermissions);
// Update a role's permission
router.put('/roles/:role/:permissionKey', authenticate, requireTopAdmin, c.setRolePermission);
// Get a specific user's permission overrides
router.get('/users/:userId', authenticate, requireTopAdmin, c.getUserPermissions);
// Set a user-specific permission override
router.put('/users/:userId/:permissionKey', authenticate, requireTopAdmin, c.setUserPermission);
// Get permission audit log
router.get('/audit', authenticate, requireTopAdmin, c.getAuditLog);
// Get session config
router.get('/session', authenticate, requireTopAdmin, c.getSessionConfig);
// Update session config
router.put('/session', authenticate, requireTopAdmin, c.updateSessionConfig);

module.exports = router;
