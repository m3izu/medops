const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { getEffectivePermissions } = require('../middleware/rbac');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || user.isDeleted) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!user.isActive) {
      return res.status(401).json({ error: 'Your account has been deactivated. Contact the Top Admin.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Get session timeout config
    const sessionConfig = await prisma.sessionConfig.findUnique({ where: { id: 1 } });
    const timeoutMinutes = sessionConfig?.timeoutMinutes ?? 30;

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: `${timeoutMinutes}m` }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: timeoutMinutes * 60 * 1000,
    });

    // Get effective permissions for client
    const permissions = await getEffectivePermissions(user.id, user.role);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
      permissions,
      sessionTimeoutMinutes: timeoutMinutes,
    });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully' });
};

const me = async (req, res, next) => {
  try {
    const permissions = await getEffectivePermissions(req.user.id, req.user.role);
    const sessionConfig = await prisma.sessionConfig.findUnique({ where: { id: 1 } });

    return res.json({
      user: req.user,
      permissions,
      sessionTimeoutMinutes: sessionConfig?.timeoutMinutes ?? 30,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, logout, me };
