const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const uploadToCloudinary = require('../utils/uploadToCloudinary');

router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const imageUrl = await uploadToCloudinary(base64Data, 'user_uploads');

    res.status(201).json({ imageUrl });
  } catch (error) {
    console.error('[UPLOAD ROUTE] Error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

module.exports = router;
