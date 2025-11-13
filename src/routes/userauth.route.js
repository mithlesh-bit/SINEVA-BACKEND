const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp } = require('../controllers/userauth.controller');

router.post('/send-otp', sendOtp);
router.post('/validate',verifyOtp)
module.exports = router;
