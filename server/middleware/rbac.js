const prisma = require('../lib/prisma');
const { LOCKED_PERMISSIONS } = require('../lib/permissions');

/**
 * Resolves the effective permissions for a user.
 * Priority: user-specific overrides > role-level permissions
 */
const getEffectivePermissions = async (userId, role) => {
  // Get role-level permissions
  const rolePerms = await prisma.rolePermission.findMany({
    where: { role },
  });

  // Get user-level overrides
  const userPerms = await prisma.userPermission.findMany({
    where: { userId },
  });

  const { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } = require('../lib/permissions');
  const permMap = {};

  // Apply role defaults from database overrides first
  for (const rp of rolePerms) {
    permMap[rp.permissionKey] = rp.isEnabled;
  }

  // Fall back to default role permission config if no database overrides exist
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
  for (const key of Object.values(PERMISSIONS)) {
    if (permMap[key] === undefined) {
      permMap[key] = defaults.includes(key);
    }
  }

  // Apply user overrides
  for (const up of userPerms) {
    permMap[up.permissionKey] = up.isEnabled;
  }

  // TOP_ADMIN always has locked permissions regardless of any overrides
  if (role === 'TOP_ADMIN') {
    for (const lp of LOCKED_PERMISSIONS) {
      permMap[lp] = true;
    }
  }

  return permMap;
};

/**
 * Middleware factory: checks if user has a specific permission.
 * Usage: requirePermission('manage_items')
 */
const requirePermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      const { id: userId, role } = req.user;

      // TOP_ADMIN always passes for locked permissions
      if (role === 'TOP_ADMIN' && LOCKED_PERMISSIONS.includes(permissionKey)) {
        return next();
      }

      const perms = await getEffectivePermissions(userId, role);
      
      console.log(`[RBAC] User: ${req.user.username}, Role: ${role}, Checking: ${permissionKey}, HasPerm: ${!!perms[permissionKey]}`);

      if (perms[permissionKey]) {
        return next();
      }

      return res.status(403).json({
        error: 'You do not have permission to perform this action',
        required: permissionKey,
      });
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Middleware: only allows TOP_ADMIN role
 */
const requireTopAdmin = (req, res, next) => {
  if (req.user.role !== 'TOP_ADMIN') {
    return res.status(403).json({ error: 'This action requires Top Admin access' });
  }
  next();
};

module.exports = { requirePermission, requireTopAdmin, getEffectivePermissions };
