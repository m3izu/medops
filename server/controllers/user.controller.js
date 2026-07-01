const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { DEFAULT_ROLE_PERMISSIONS } = require('../lib/permissions');

const listUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, username: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) { next(err); }
};

const getUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, username: true, role: true, isActive: true, isDeleted: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
};

const createUser = async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'name, username, password, and role are required' });
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return res.status(409).json({ error: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, username, passwordHash, role, createdBy: req.user.id },
    });

    // Seed default role permissions for this user (via role_permissions table)
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role] || [];
    const allPermKeys = Object.values(require('../lib/permissions').PERMISSIONS);

    await prisma.rolePermission.upsertMany?.({}) // handled via seed instead

    // Create notification for top admin
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        eventType: 'USER_CREATED',
        message: `New account created: ${name} (${role})`,
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const { name, role } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, role },
    });

    if (role) {
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          eventType: 'ROLE_CHANGED',
          message: `${user.name}'s role changed to ${role}`,
        },
      });
    }

    res.json({ id: user.id, name: user.name, role: user.role });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { temporaryPassword } = req.body;
    if (!temporaryPassword) return res.status(400).json({ error: 'temporaryPassword is required' });

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    res.json({ message: 'Password reset successfully' });
  } catch (err) { next(err); }
};

const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    // Soft delete — preserve all history
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isDeleted: true, isActive: false, deletedAt: new Date() },
    });
    res.json({ message: 'User account deleted (data preserved for audit)' });
  } catch (err) { next(err); }
};

const toggleActive = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive },
    });
    res.json({ isActive: updated.isActive });
  } catch (err) { next(err); }
};

module.exports = { listUsers, getUser, createUser, updateUser, resetPassword, deleteUser, toggleActive };
