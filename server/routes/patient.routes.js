const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/patient.controller');

const requireAnyPermission = (permissionsArray) => {
  return async (req, res, next) => {
    try {
      const { id: userId, role } = req.user;
      const { getEffectivePermissions } = require('../middleware/rbac');
      const perms = await getEffectivePermissions(userId, role);
      if (permissionsArray.some(p => perms[p])) {
        return next();
      }
      return res.status(403).json({ error: 'You do not have permission to access patient records.' });
    } catch (err) {
      next(err);
    }
  };
};

router.get('/', authenticate, requireAnyPermission(['manage_patients', 'submit_requisition', 'view_inventory_logs']), c.list);
router.post('/', authenticate, requirePermission('manage_patients'), c.create);
router.get('/:id', authenticate, requireAnyPermission(['manage_patients', 'submit_requisition', 'view_inventory_logs']), c.getOne);
router.put('/:id', authenticate, requirePermission('manage_patients'), c.update);
router.patch('/:id/status', authenticate, requirePermission('manage_patients'), c.toggleStatus);

module.exports = router;
