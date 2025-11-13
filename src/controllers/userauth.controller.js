const User = require('../models/user.model');
const { emailQueue, cleanupQueue } = require('../queue/bullmq');
const jwt = require('jsonwebtoken');
const { encryptOtp, decryptOtp } = require('../utils/crypto');
const sendOTP = require('../utils/nodemailer');
require('dotenv').config();

exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date();
    const genrateencyptotp = encryptOtp(otp);

    const existingUser = await User.findOne({ email });

    const updateFields = {
      otp: genrateencyptotp,
      updatedAt: now,
    };

    if (!existingUser?.isVerified) {
      updateFields.isVerified = false;
    }

    await User.findOneAndUpdate(
      { email },
      {
        $set: updateFields,
        $setOnInsert: { createdAt: now }
      },
      { upsert: true, new: true }
    );

    // Simple email validation regex
    const isValidEmail = (email) => {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return regex.test(email);
    };

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Not a valid email',
      });
    }

    await sendOTP(email, otp);
    await cleanupQueue.add('delete-unverified', { email }, { delay: 10 * 60 * 1000 });

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email',
    });
  } catch (err) {
    console.error('sendOtp error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    // console.log(email,otp);
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.otp) {
      return res.status(400).json({ success: false, message: 'OTP expired or user not found. Please resend OTP.' });
    }

    const decryptedOtp = decryptOtp(user.otp);
    // const recievedOtp = decryptOtp(otp)
    // console.log(otp,user.otp,decryptedOtp );
    if (decryptedOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    user.isVerified = true;
    user.otp = null;
    await user.save();

    console.log(process.env.JWT_SECRET);
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );


    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      token
    });
  } catch (err) {
    console.error('verifyOtp error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
