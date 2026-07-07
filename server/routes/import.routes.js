const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/import.controller');

router.post('/', authenticate, requirePermission('bulk_import'), c.importCsv);
router.get('/logs', authenticate, requirePermission('bulk_import'), c.getLogs);

module.exports = router;
