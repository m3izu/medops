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
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

module.exports = { authenticate };
