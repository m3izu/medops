const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/requisition.controller');

router.get('/', authenticate, c.list);
router.post('/', authenticate, requirePermission('submit_requisition'), c.create);
router.get('/:id', authenticate, c.getOne);
router.patch('/:id/cancel', authenticate, c.cancel);
router.patch('/:id/lines/:lineId/approve', authenticate, requirePermission('approve_requisition'), c.approveLine);
router.patch('/:id/lines/:lineId/reject', authenticate, requirePermission('approve_requisition'), c.rejectLine);
router.post('/:id/lines/:lineId/resubmit', authenticate, requirePermission('submit_requisition'), c.resubmitLine);

module.exports = router;
