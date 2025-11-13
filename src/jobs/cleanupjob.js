// cleanupJob.js
const { Worker, connection } = require('../queue/bullmq');
const User = require('../models/user.model');

new Worker('cleanupQueue', async job => {
  const { email } = job.data;
  const user = await User.findOne({ email });
  if (user && !user.isVerified) {
    await User.deleteOne({ email });
    console.log(`Deleted unverified user: ${email}`);
  }
}, { connection });
