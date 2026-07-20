const prisma = require('../lib/prisma');
const { LOCKED_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } = require('../lib/permissions');

const getRolePermissions = async (req, res, next) => {
  try {
    const rolePerms = await prisma.rolePermission.findMany();
    const allKeys = Object.values(PERMISSIONS);

    // Build a structured map: { ROLE: { permKey: bool } }
    const result = {};
    for (const [role, defaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      result[role] = {};
      for (const key of allKeys) {
        const override = rolePerms.find(rp => rp.role === role && rp.permissionKey === key);
        result[role][key] = override ? override.isEnabled : defaults.includes(key);
      }
    }

    res.json({ permissions: result, lockedPermissions: LOCKED_PERMISSIONS, allKeys });
  } catch (err) { next(err); }
};

const setRolePermission = async (req, res, next) => {
  try {
    const { role, permissionKey } = req.params;
    const { isEnabled } = req.body;

    const validRoles = Object.keys(DEFAULT_ROLE_PERMISSIONS);
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role "${role}". Valid roles: ${validRoles.join(', ')}` });
    }

    if (LOCKED_PERMISSIONS.includes(permissionKey)) {
      return res.status(403).json({ error: 'This permission is locked and cannot be modified' });
    }

    // Get current value for audit log
    const current = await prisma.rolePermission.findUnique({
      where: { role_permissionKey: { role, permissionKey } },
    });
    const oldValue = current ? current.isEnabled : DEFAULT_ROLE_PERMISSIONS[role]?.includes(permissionKey) ?? false;

    await prisma.rolePermission.upsert({
      where: { role_permissionKey: { role, permissionKey } },
      update: { isEnabled },
      create: { role, permissionKey, isEnabled },
    });

    // Audit log
    await prisma.permissionAuditLog.create({
      data: {
        changedById: req.user.id,
        targetType: 'role',
        targetRole: role,
        permissionKey,
        oldValue,
        newValue: isEnabled,
      },
    });

    res.json({ role, permissionKey, isEnabled });
  } catch (err) { next(err); }
};

const getUserPermissions = async (req, res, next) => {
  try {
    const overrides = await prisma.userPermission.findMany({
      where: { userId: req.params.userId },
    });
    res.json(overrides);
  } catch (err) { next(err); }
};

const setUserPermission = async (req, res, next) => {
  try {
    const { userId, permissionKey } = req.params;
    const { isEnabled } = req.body;

    if (LOCKED_PERMISSIONS.includes(permissionKey)) {
      return res.status(403).json({ error: 'This permission is locked and cannot be modified' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { getEffectivePermissions } = require('../middleware/rbac');
    const effectivePerms = await getEffectivePermissions(userId, user.role);
    const oldValue = !!effectivePerms[permissionKey];

    await prisma.userPermission.upsert({
      where: { userId_permissionKey: { userId, permissionKey } },
      update: { isEnabled },
      create: { userId, permissionKey, isEnabled },
    });

    await prisma.permissionAuditLog.create({
      data: {
        changedById: req.user.id,
        targetType: 'user',
        targetUserId: userId,
        permissionKey,
        oldValue,
        newValue: isEnabled,
      },
    });

    res.json({ userId, permissionKey, isEnabled });
  } catch (err) { next(err); }
};

const getAuditLog = async (req, res, next) => {
  try {
    const logs = await prisma.permissionAuditLog.findMany({
      orderBy: { changedAt: 'desc' },
      take: 200,
      include: {
        changedBy: { select: { name: true, username: true } },
        targetUser: { select: { name: true, username: true } },
      },
    });
    res.json(logs);
  } catch (err) { next(err); }
};

const getSessionConfig = async (req, res, next) => {
  try {
    const config = await prisma.sessionConfig.findUnique({ where: { id: 1 } });
    res.json(config || { timeoutMinutes: 30 });
  } catch (err) { next(err); }
};

const updateSessionConfig = async (req, res, next) => {
  try {
    const { timeoutMinutes } = req.body;
    const parsed = parseInt(timeoutMinutes, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 1440) {
      return res.status(400).json({ error: 'timeoutMinutes must be a valid integer between 1 and 1440 (24 hours)' });
    }
    const config = await prisma.sessionConfig.upsert({
      where: { id: 1 },
      update: { timeoutMinutes: parsed },
      create: { id: 1, timeoutMinutes: parsed },
    });
    res.json(config);
  } catch (err) { next(err); }
};

module.exports = {
  getRolePermissions,
  setRolePermission,
  getUserPermissions,
  setUserPermission,
  getAuditLog,
  getSessionConfig,
  updateSessionConfig,
};
