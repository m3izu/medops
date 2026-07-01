const express = require('express');
const router = express.Router();
const { login, logout, me } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authenticate');

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);

module.exports = router;
