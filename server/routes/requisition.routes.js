const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/requisition.controller');

const requireAnyPermission = (permissionsArray) => {
  return async (req, res, next) => {
    try {
      const { id: userId, role } = req.user;
      const { getEffectivePermissions } = require('../middleware/rbac');
      const perms = await getEffectivePermissions(userId, role);
      if (permissionsArray.some(p => perms[p])) {
        return next();
      }
      return res.status(403).json({ error: 'You do not have permission to view requisitions.' });
    } catch (err) {
      next(err);
    }
  };
};

router.get('/', authenticate, requireAnyPermission(['submit_requisition', 'approve_requisition', 'view_inventory_logs', 'view_own_forms']), c.list);
router.post('/', authenticate, requirePermission('submit_requisition'), c.create);
router.post('/batch', authenticate, requirePermission('submit_requisition'), c.createBatch);
router.patch('/batch-session-date', authenticate, requirePermission('approve_requisition'), c.batchUpdateSessionDate);
router.get('/:id', authenticate, c.getOne);
router.patch('/:id/cancel', authenticate, c.cancel);
router.patch('/:id/session-date', authenticate, requirePermission('approve_requisition'), c.updateSessionDate);
router.patch('/:id/lines/:lineId/edit', authenticate, requirePermission('approve_requisition'), c.editLine);
router.patch('/:id/lines/:lineId/approve', authenticate, requirePermission('approve_requisition'), c.approveLine);
router.patch('/:id/lines/:lineId/reject', authenticate, requirePermission('approve_requisition'), c.rejectLine);
router.patch('/:id/lines/:lineId/co-verify', authenticate, requirePermission('receive_stock'), c.coVerifyLine);
router.post('/:id/lines/:lineId/resubmit', authenticate, requirePermission('submit_requisition'), c.resubmitLine);

module.exports = router;
