const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/rbac');
const c = require('../controllers/patient.controller');

router.get('/', authenticate, c.list);
router.post('/', authenticate, requirePermission('manage_patients'), c.create);
router.get('/:id', authenticate, c.getOne);
router.put('/:id', authenticate, requirePermission('manage_patients'), c.update);
router.patch('/:id/status', authenticate, requirePermission('manage_patients'), c.toggleStatus);

module.exports = router;
