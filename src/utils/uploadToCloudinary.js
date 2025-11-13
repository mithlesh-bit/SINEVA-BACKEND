const cloudinary = require('../config/cloudinary');

/**
 * Uploads a base64 image or local file to Cloudinary.
 * @param {string} base64Data - Base64 string or local file path
 * @param {string} folder - Optional folder name
 * @returns {Promise<string>} - URL of uploaded image
 */
const uploadToCloudinary = async (base64Data, folder = 'ai_generated_images') => {
  try {
    const result = await cloudinary.uploader.upload(base64Data, {
      folder,
    });
    return result.secure_url;
  } catch (error) {
    console.error('[CLOUDINARY UPLOAD] Error:', error);
    throw new Error('Cloudinary upload failed');
  }
};

module.exports = uploadToCloudinary;
