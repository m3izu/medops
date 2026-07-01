const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const c = require('../controllers/notification.controller');

router.get('/', authenticate, c.getNotifications);
router.patch('/:id/read', authenticate, c.markRead);
router.patch('/read-all', authenticate, c.markAllRead);

module.exports = router;
