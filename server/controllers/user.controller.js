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

const VALID_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS);

const createUser = async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'name, username, password, and role are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }
    if (req.user.role !== 'TOP_ADMIN' && (role === 'MANAGEMENT_OFFICE' || role === 'TOP_ADMIN')) {
      return res.status(403).json({ error: 'Only Top Admin users can create accounts with Management Office or Top Admin roles' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return res.status(409).json({ error: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, username, passwordHash, role, createdBy: req.user.id },
    });

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
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }
    if (role && req.user.role !== 'TOP_ADMIN' && (role === 'MANAGEMENT_OFFICE' || role === 'TOP_ADMIN')) {
      return res.status(403).json({ error: 'Only Top Admin users can assign Management Office or Top Admin roles' });
    }
    // Prevent changing own role (could lock self out of admin)
    if (role && req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isDeleted) return res.status(404).json({ error: 'User not found' });

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
    if (!temporaryPassword || typeof temporaryPassword !== 'string') {
      return res.status(400).json({ error: 'temporaryPassword is required' });
    }
    if (temporaryPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isDeleted) return res.status(404).json({ error: 'User not found' });

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

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isDeleted) return res.status(404).json({ error: 'User not found' });

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
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive },
    });
    res.json({ isActive: updated.isActive });
  } catch (err) { next(err); }
};

const listCoVerifiers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        role: { in: ['NURSE', 'SUPPLY_OFFICER', 'INVENTORY_MANAGER', 'TOP_ADMIN'] }
      },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) { next(err); }
};

module.exports = { listUsers, getUser, createUser, updateUser, resetPassword, deleteUser, toggleActive, listCoVerifiers };
