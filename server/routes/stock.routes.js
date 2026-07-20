const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/stock.controller');

const requireAnyPermission = (permissionsArray) => {
  return async (req, res, next) => {
    try {
      const { id: userId, role } = req.user;
      const { getEffectivePermissions } = require('../middleware/rbac');
      const perms = await getEffectivePermissions(userId, role);
      if (permissionsArray.some(p => perms[p])) {
        return next();
      }
      return res.status(403).json({ error: 'You do not have permission to view stock alerts.' });
    } catch (err) {
      next(err);
    }
  };
};

router.post('/receive', authenticate, requirePermission('receive_stock'), c.receiveStock);
router.get('/transactions', authenticate, requirePermission('view_inventory_logs'), c.getTransactions);
router.get('/alerts', authenticate, requireAnyPermission(['view_inventory_logs', 'submit_requisition', 'manage_items', 'receive_stock']), c.getAlerts);

module.exports = router;
