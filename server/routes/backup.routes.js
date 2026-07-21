const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requireTopAdmin } = require('../middleware/rbac');
const c = require('../controllers/backup.controller');

// All backup operations require Top Admin authorization
router.get('/list', authenticate, requireTopAdmin, c.listBackups);
router.post('/checkpoint', authenticate, requireTopAdmin, c.createCheckpoint);
router.get('/download/:id', authenticate, requireTopAdmin, c.downloadBackup);
router.get('/export-json', authenticate, requireTopAdmin, c.exportJson);
router.post('/restore/:id', authenticate, requireTopAdmin, c.restoreRollback);
router.delete('/:id', authenticate, requireTopAdmin, c.deleteBackup);

module.exports = router;
