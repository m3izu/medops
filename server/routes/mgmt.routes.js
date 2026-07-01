const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/mgmt.controller');

router.get('/logs', authenticate, requirePermission('view_inventory_logs'), c.getLogs);
router.post('/logs/:logId/comment', authenticate, requirePermission('comment_on_logs'), c.addComment);
router.patch('/logs/:logId/comments/:commentId/flag', authenticate, requirePermission('comment_on_logs'), c.toggleFlag);

module.exports = router;
