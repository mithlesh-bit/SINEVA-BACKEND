const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user:  process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASS, // Use App Password if using 
  }
});

const sendOTP = async (email, otp) => {
  const mailOptions = {
    from: process.env.ADMIN_EMAIL,
    to: email,
    subject: 'Your SINEVA OTP Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #f9f9f9; padding: 20px; color: #333;">
        <div style="background-color: #000; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">SINEVA</h1>
          <p>Your 7CR marketing Style. Your Story.</p>
        </div>

        <div style="background: #fff; padding: 30px; border-radius: 8px; margin-top: 20px; text-align: center;">
          <h2>Your One-Time Password (OTP)</h2>
          <p style="font-size: 20px; margin: 20px 0;"><strong>${otp}</strong></p>
          <p>This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.</p>
        </div>

        <p style="text-align: center; font-size: 12px; color: #777; margin-top: 30px;">
          Need help? Contact us at <a href="mailto:mithleshrawte6@gmail.com">mithleshrawte6@gmail.com</a>
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};


module.exports = sendOTP;
