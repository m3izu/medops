const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const c = require('../controllers/dashboard.controller');

router.get('/summary', authenticate, c.getSummary);
router.get('/prefs', authenticate, c.getPrefs);
router.put('/prefs', authenticate, c.updatePrefs);

module.exports = router;
