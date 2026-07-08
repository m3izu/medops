const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
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

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

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

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MedOPS Server running on port ${PORT}`);
});
