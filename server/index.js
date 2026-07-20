const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config();

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'medops-super-secret-jwt-key-change-in-production')) {
  console.error('FATAL: JWT_SECRET must be set to a secure custom value in production!');
  process.exit(1);
}


const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const permissionRoutes = require('./routes/permission.routes');
const notificationRoutes = require('./routes/notification.routes');
const supplierRoutes = require('./routes/supplier.routes');
const categoryRoutes = require('./routes/category.routes');
const itemRoutes = require('./routes/item.routes');
const stockRoutes = require('./routes/stock.routes');
const patientRoutes = require('./routes/patient.routes');
const requisitionRoutes = require('./routes/requisition.routes');
const discardRoutes = require('./routes/discard.routes');
const stocktakeRoutes = require('./routes/stocktake.routes');
const reportRoutes = require('./routes/report.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const mgmtRoutes = require('./routes/mgmt.routes');
const importRoutes = require('./routes/import.routes');
const dispenseRoutes = require('./routes/dispense.routes');
const returnRoutes = require('./routes/return.routes');

const app = express();


app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Configure Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300, // Limit each IP to 300 requests per 15 mins
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15, // Limit each IP to 15 login attempts per 15 mins
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

// Apply rate limiters
app.use('/api/', globalLimiter);
app.use('/api/auth/login', loginLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/discards', discardRoutes);
app.use('/api/stocktakes', stocktakeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/mgmt', mgmtRoutes);
app.use('/api/import', importRoutes);
app.use('/api/dispense', dispenseRoutes);
app.use('/api/returns', returnRoutes);


// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const prisma = require('./lib/prisma');

// Health check endpoint with database ping & diagnostic details
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'connected',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (dbErr) {
    console.error('[Health Check Failure]:', dbErr.message);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: 'Database query failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(statusCode).json({
    error: statusCode === 500 && isProduction
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error',
  });
});

const { startScheduler } = require('./lib/scheduler');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MedOPS Server running on port ${PORT}`);
  startScheduler();
});
