const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!user || !user.isActive || user.isDeleted) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Account is inactive or deleted' });
    }

    req.user = user;

    // Sliding session: renew token if close to expiry (e.g. less than 10 minutes remaining or more than half expired)
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = decoded.exp - now;
    const totalDuration = decoded.exp - decoded.iat;
    
    if (timeRemaining < 600 || timeRemaining < totalDuration / 2) {
      const sessionConfig = await prisma.sessionConfig.findUnique({ where: { id: 1 } });
      const timeoutMinutes = sessionConfig?.timeoutMinutes ?? 30;

      const newToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: `${timeoutMinutes}m` }
      );

      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: timeoutMinutes * 60 * 1000,
      });
    }

    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

module.exports = { authenticate };
