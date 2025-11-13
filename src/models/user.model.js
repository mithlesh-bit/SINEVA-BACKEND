const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: false },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('users', userSchema);
