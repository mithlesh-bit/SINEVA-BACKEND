const express = require('express');
const router = express.Router();
const { createImage, getImages, getAllImages, uploadMiddleware, updateImage, getImagesByUser } = require('../controllers/imagegenration.controller');
const verifyToken = require('../middlewares/auth.middleware');
// const { authMiddleware } = require('../middleware/auth'); // uncomment if using auth

// Generate AI image
router.post('/createimage', verifyToken,uploadMiddleware, createImage);
router.get('/getimage', verifyToken,getImages);
router.get('/getimagebyuser', verifyToken,getImagesByUser);
router.get('/getallimages',getAllImages);
router.put("/update/:id", verifyToken, uploadMiddleware, updateImage);

module.exports = router;
