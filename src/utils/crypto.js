const crypto = require('crypto');

const algorithm = 'aes-256-ctr';
const secret = process.env.OTP_SECRET || 'hehkejmbfckmhekfh';

// Convert the secret to a 32-byte key using a hash
const key = crypto.createHash('sha256').update(secret).digest();

exports.encryptOtp = (otp) => {
  const iv = crypto.randomBytes(16); // Initialization Vector
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(otp, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

exports.decryptOtp = (encryptedOtp) => {
  const [ivHex, encrypted] = encryptedOtp.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
