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
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    } catch (err) {
      next(err);
    }
  };
};

router.post('/receive', authenticate, requirePermission('receive_stock'), c.receiveStock);
router.get('/transactions', authenticate, requirePermission('view_inventory_logs'), c.getTransactions);
router.get('/alerts', authenticate, requireAnyPermission(['view_inventory_logs', 'submit_requisition', 'manage_items', 'receive_stock']), c.getAlerts);

// Stock Transfers (Two-Step Workflow)
router.post('/transfers/request', authenticate, requireAnyPermission(['receive_stock', 'manage_items', 'submit_requisition']), c.requestTransfer);
router.post('/transfers/:id/approve', authenticate, requireAnyPermission(['receive_stock', 'manage_items']), c.approveTransfer);
router.post('/transfers/:id/reject', authenticate, requireAnyPermission(['receive_stock', 'manage_items']), c.rejectTransfer);
router.post('/transfers/:id/cancel', authenticate, requireAnyPermission(['receive_stock', 'manage_items', 'submit_requisition']), c.cancelTransfer);
router.get('/transfers', authenticate, requireAnyPermission(['view_inventory_logs', 'receive_stock', 'manage_items', 'submit_requisition']), c.getTransfers);

module.exports = router;
