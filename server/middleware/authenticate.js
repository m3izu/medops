const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

let cachedTimeoutMinutes = 30;
let lastConfigFetch = 0;

const getSessionTimeout = async () => {
  const now = Date.now();
  if (now - lastConfigFetch > 5 * 60 * 1000) {
    try {
      const config = await prisma.sessionConfig.findUnique({ where: { id: 1 } });
      cachedTimeoutMinutes = config?.timeoutMinutes ?? 30;
      lastConfigFetch = now;
    } catch (err) {
      // Use cached fallback on error
    }
  }
  return cachedTimeoutMinutes;
};

const authenticate = async (req, res, next) => {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

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

    // Sliding session: renew token if close to expiry (less than 10 minutes remaining or less than 1/3 remaining)
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = decoded.exp - now;
    const totalDuration = decoded.exp - decoded.iat;
    
    if (timeRemaining < 600 || timeRemaining < totalDuration / 3) {
      const timeoutMinutes = await getSessionTimeout();

      const newToken = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: `${timeoutMinutes}m` }
      );

      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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
