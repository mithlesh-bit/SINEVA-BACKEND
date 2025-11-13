const Image = require('../models/imagegenration.model');
const axios = require('axios');
const uploadToCloudinary = require('../utils/uploadToCloudinary');
const multer = require("multer");

// Multer setup for local file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });


// helper to fetch external URL -> base64
const urlToBase64 = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const base64Data = Buffer.from(response.data, 'binary').toString('base64');
    return { data: base64Data, mimeType: contentType };
  } catch (error) {
    console.error("❌ Error converting URL to Base64:", error.message);
    throw new Error("Failed to process image URL.");
  }
};

exports.createImage = async (req, res) => {
  try {
    const { prompt: rawPrompt, imageUrl: providedImageUrl } = req.body; // note rawPrompt may be empty
    const file = req.file;

    console.log("===== CREATE IMAGE REQUEST =====");
    console.log("Raw prompt:", rawPrompt);
    console.log("Provided imageUrl (from frontend/upload):", providedImageUrl);
    console.log("Uploaded file:", file ? file.originalname : "No file uploaded");
    console.log("User ID:", req.user?.userId);

    if (!rawPrompt && !file && !providedImageUrl) {
      return res.status(400).json({ success: false, message: "Prompt or image is required" });
    }

    // finalImageUrl will hold either the uploaded / provided image URL (old image)
    // or the newly generated image (when prompt triggers Gemini)
    let finalImageUrl = null;

    // base64Image/mimeType used only if we need to call Gemini with image inline
    let base64Image = null;
    let mimeType = null;

    // ---------- Step A: If file uploaded, upload to Cloudinary and treat as "old" image
    if (file) {
      console.log("📁 User uploaded a local file -> uploading to Cloudinary...");
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      const uploadedUrl = await uploadToCloudinary(base64Data);
      console.log("✅ File uploaded, uploadedUrl:", uploadedUrl);

      // Use uploadedUrl as the provided (old) image URL
      finalImageUrl = uploadedUrl;

      // prepare inline base64 for Gemini editing if prompt present
      base64Image = file.buffer.toString("base64");
      mimeType = file.mimetype;
    }

    // ---------- Step B: If frontend provided imageUrl (uploaded earlier by separate endpoint or external),
    // use it as the old image and prepare base64 for Gemini editing
    if (!finalImageUrl && providedImageUrl) {
      console.log("🌐 Using provided imageUrl. Converting to base64 for editing (if needed)...");
      finalImageUrl = providedImageUrl;
      const result = await urlToBase64(finalImageUrl);
      base64Image = result.data;
      mimeType = result.mimeType;
      console.log("✅ Provided image converted to base64");
    }

    // ---------- Build prompt string that will be stored in DB:
    // If an "old" image exists (finalImageUrl from file or provided), store it AS A PREFIX in the prompt field
    // promptInDb = "<oldImageUrl> <userPromptText>"  (if user provided rawPrompt)
    // If no old image, promptInDb = rawPrompt or empty string
    const userPromptText = (rawPrompt || "").trim();
    let promptInDb = userPromptText;
    if (finalImageUrl) {
      // ensure single space separation and that URL is first
      promptInDb = `${finalImageUrl} ${userPromptText}`.trim();
    }

    // ---------- Step C: If prompt exists and Gemini needs to be called for generation/editing:
    // If base64Image exists -> editing; if not and prompt exists -> generation.
    if (userPromptText) {
      console.log(`🤖 Will ${base64Image ? "edit" : "generate"} via Gemini for prompt: "${userPromptText}"`);

      // assemble parts for Gemini request
      const parts = [];
      if (base64Image) {
        // inline image data for editing
        parts.push({ inlineData: { data: base64Image, mimeType: mimeType || "image/jpeg" } });
      }
      parts.push({ text: userPromptText });

      const geminiResp = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
        { contents: [{ parts }] },
        { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" } }
      );

      const candidate = geminiResp.data?.candidates?.[0];
      console.log("Gemini candidate:", candidate);
      if (!candidate) {
        console.log("❌ Gemini returned no candidate");
        return res.status(500).json({ success: false, message: "No candidates returned" });
      }

      // extract generated image base64
      let generatedImageBase64 = null;
      if (Array.isArray(candidate.content?.parts)) {
        const imagePart = candidate.content.parts.find(p => p.inlineData?.data);
        if (imagePart) generatedImageBase64 = imagePart.inlineData.data;
      }

      const textPart = candidate.content?.parts?.find(p => p.text);
      if (!generatedImageBase64 && textPart) {
        console.log("📝 Gemini returned text instead of image:", textPart.text);
        return res.status(200).json({
          success: false,
          message: "The model returned text instead of an image. Try rephrasing your prompt.",
          data: { text: textPart.text },
        });
      }

      if (!generatedImageBase64) {
        console.log("❌ No image found in Gemini response", candidate);
        return res.status(500).json({ success: false, message: "No image found in Gemini response", data: candidate });
      }

      // upload generated image to Cloudinary -> this becomes the NEW imageUrl in DB
      const uploadData = `data:image/png;base64,${generatedImageBase64}`;
      const generatedUrl = await uploadToCloudinary(uploadData);
      console.log("✅ Gemini generated image uploaded, generatedUrl:", generatedUrl);

      // set finalImageUrl to the generated image (we will save it in imageUrl field)
      finalImageUrl = generatedUrl;
    } // end Gemini block

    // ---------- Step D: Save to DB
    console.log("💾 Saving prompt (with old-uploaded-url prefix if any) and final imageUrl into MongoDB...");
    // find by same user and exact promptInDb (keep your previous behavior)
    let existingImage = await Image.findOne({ user: req.user.userId, prompt: promptInDb });

    if (existingImage) {
      console.log("🔄 Found existing record for user+promptInDb — updating imageUrl to generated/used finalImageUrl");
      existingImage.imageUrl = finalImageUrl;
      await existingImage.save();
    } else {
      console.log("➕ Creating new image record (promptInDb + finalImageUrl)");
      existingImage = new Image({
        user: req.user.userId,
        prompt: promptInDb,
        imageUrl: finalImageUrl,
      });
      await existingImage.save();
    }

    console.log("✅ Saved:", existingImage);

    // Respond with both values so frontend can show uploaded image (trim from prompt) and generated image
    return res.status(201).json({
      success: true,
      message: "Image saved successfully",
      data: {
        id: existingImage._id,
        prompt: existingImage.prompt,   // contains "<oldImageUrl> <userText>" if old image existed
        imageUrl: existingImage.imageUrl // generated / final image
      }
    });

  } catch (err) {
    console.error("🔥 [CREATE IMAGE] Error:", err.response?.data || err.message || err);
    return res.status(500).json({ success: false, message: "Internal server error", error: err.message || err });
  }
};




/**
 * Update image endpoint
 * Handles:
 * 1️⃣ Local file upload
 * 2️⃣ External image URL
 * 3️⃣ Text update
 */
exports.updateImage = async (req, res) => {
  try {
    const { text, imageUrl } = req.body; // text or external URL
    const { id } = req.params; // Image ID to update
    const file = req.file;
    let uploadedImageUrl = null;

    if (!text && !file && !imageUrl) {
      return res.status(400).json({ success: false, message: "Text or image is required" });
    }

    // 1️⃣ Handle local file upload
    if (file) {
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      uploadedImageUrl = await uploadToCloudinary(base64Data);
    }

    // 2️⃣ Handle provided image URL
    if (imageUrl) {
      uploadedImageUrl = imageUrl;
    }

    // 3️⃣ Update existing record
    const updatedImage = await Image.findByIdAndUpdate(
      id,
      { prompt: text || undefined, imageUrl: uploadedImageUrl || undefined },
      { new: true }
    );

    if (!updatedImage) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }

    res.json({
      success: true,
      message: "Image updated successfully",
      data: updatedImage,
    });

  } catch (error) {
    console.error("[UPDATE IMAGE] Error:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

/**
 * Get images for logged-in user
 */
exports.getImages = async (req, res) => {
  try {
    console.log('[GET IMAGES] Fetching images for user:', req.user.userId);

    const images = await Image.find({ user: req.user.userId }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      message: 'Images fetched successfully',
      data: images
    });

  } catch (error) {
    console.error('[GET IMAGES] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * Get all images (admin or general view)
 */
exports.getAllImages = async (req, res) => {
  try {
    console.log('[GET ALL IMAGES] Fetching all images from database');

    // Parse query params
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalImages = await Image.countDocuments();

    // Fetch images with pagination
    const images = await Image.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate total pages
    const totalPages = Math.ceil(totalImages / limit);

    res.status(200).json({
      success: true,
      message: 'All images fetched successfully',
      data: images,
      pagination: {
        totalItems: totalImages,
        totalPages,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('[GET ALL IMAGES] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};


// Multer middleware for routes
exports.uploadMiddleware = upload.single("file");

exports.getImagesByUser = async (req, res) => {
  try {
    console.log('[GET IMAGES] Fetching images for user:', req.user.userId);

    // Read page and limit from query parameters (defaults: page 1, limit 10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total number of images for this user
    const total = await Image.countDocuments({ user: req.user.userId });

    // Fetch images with pagination
    const images = await Image.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      message: 'Images fetched successfully',
      data: images,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('[GET IMAGES] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};
