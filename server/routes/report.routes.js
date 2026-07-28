const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/report.controller');

router.get('/live/summary', authenticate, requirePermission('view_reports'), c.liveSummary);
router.get('/live/:section/export', authenticate, requirePermission('view_reports'), c.sectionExport);
router.get('/live/:section', authenticate, requirePermission('view_reports'), c.sectionDetail);

module.exports = router;
