const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }, // linked to user
  prompt: { type: String, required: true },
  imageUrl: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('images', imageSchema);
