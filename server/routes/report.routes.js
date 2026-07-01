const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission, requireTopAdmin } = require('../middleware/rbac');
const c = require('../controllers/report.controller');

router.get('/', authenticate, requirePermission('generate_reports'), c.list);
router.post('/generate', authenticate, requireTopAdmin, c.generate);
router.get('/schedule', authenticate, requireTopAdmin, c.getSchedule);
router.put('/schedule', authenticate, requireTopAdmin, c.updateSchedule);

module.exports = router;
