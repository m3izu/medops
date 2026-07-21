const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/report.controller');

router.get('/', authenticate, requirePermission('generate_reports'), c.list);
router.post('/generate', authenticate, requirePermission('generate_reports'), c.generate);
router.get('/schedule', authenticate, requirePermission('configure_report_schedule'), c.getSchedule);
router.put('/schedule', authenticate, requirePermission('configure_report_schedule'), c.updateSchedule);
router.get('/:id', authenticate, requirePermission('generate_reports'), c.getOne);

module.exports = router;
