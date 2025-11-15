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

    // console.log("===== CREATE IMAGE REQUEST =====");
    // console.log("Raw prompt:", rawPrompt);
    // console.log("Provided imageUrl (from frontend/upload):", providedImageUrl);
    // console.log("Uploaded file:", file ? file.originalname : "No file uploaded");
    // console.log("User ID:", req.user?.userId);

    if (!rawPrompt && !file && !providedImageUrl) {
      return res.status(400).json({ success: false, message: "Prompt or image is required" });
    }

    let finalImageUrl = null;
    let base64Image = null;
    let mimeType = null;

    if (file) {
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      const uploadedUrl = await uploadToCloudinary(base64Data);
      // console.log("File uploaded, uploadedUrl:", uploadedUrl);

      finalImageUrl = uploadedUrl;

      base64Image = file.buffer.toString("base64");
      mimeType = file.mimetype;
    }

    if (!finalImageUrl && providedImageUrl) {
      // console.log(" Using provided imageUrl. Converting to base64 for editing (if needed)...");
      finalImageUrl = providedImageUrl;
      const result = await urlToBase64(finalImageUrl);
      base64Image = result.data;
      mimeType = result.mimeType;
      // console.log("Provided image converted to base64");
    }

    const userPromptText = (rawPrompt || "").trim();
    let promptInDb = userPromptText;
    if (finalImageUrl) {
      promptInDb = `${finalImageUrl} ${userPromptText}`.trim();
    }

    if (userPromptText) {
      // console.log(` Will ${base64Image ? "edit" : "generate"} via Gemini for prompt: "${userPromptText}"`);
      const parts = [];
      if (base64Image) {
        parts.push({ inlineData: { data: base64Image, mimeType: mimeType || "image/jpeg" } });
      }
      parts.push({ text: userPromptText });

      const geminiResp = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
        { contents: [{ parts }] },
        { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" } }
      );

      const candidate = geminiResp.data?.candidates?.[0];
      // console.log("Gemini candidate:", candidate);
      if (!candidate) {
        // console.log("Gemini returned no candidate");
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
        // console.log("Gemini returned text instead of image:", textPart.text);
        return res.status(200).json({
          success: false,
          message: "The model returned text instead of an image. Try rephrasing your prompt.",
          data: { text: textPart.text },
        });
      }

      if (!generatedImageBase64) {
        // console.log("No image found in Gemini response", candidate);
        return res.status(500).json({ success: false, message: "No image found in Gemini response", data: candidate });
      }
      const uploadData = `data:image/png;base64,${generatedImageBase64}`;
      const generatedUrl = await uploadToCloudinary(uploadData);
      // console.log("Gemini generated image uploaded, generatedUrl:", generatedUrl);
      finalImageUrl = generatedUrl;
    } 

    let existingImage = await Image.findOne({ user: req.user.userId, prompt: promptInDb });

    if (existingImage) {
      // console.log(" Found existing record for user+promptInDb — updating imageUrl to generated/used finalImageUrl");
      existingImage.imageUrl = finalImageUrl;
      await existingImage.save();
    } else {
      // console.log("Creating new image record (promptInDb + finalImageUrl)");
      existingImage = new Image({
        user: req.user.userId,
        prompt: promptInDb,
        imageUrl: finalImageUrl,
      });
      await existingImage.save();
    }

    // console.log("Saved:", existingImage);
    return res.status(201).json({
      success: true,
      message: "Image saved successfully",
      data: {
        id: existingImage._id,
        prompt: existingImage.prompt,   
        imageUrl: existingImage.imageUrl
      }
    });

  } catch (err) {
    console.error("[CREATE IMAGE] Error:", err.response?.data || err.message || err);
    return res.status(500).json({ success: false, message: "Internal server error", error: err.message || err });
  }
};


exports.updateImage = async (req, res) => {
  try {
    const { text, imageUrl } = req.body; 
    const { id } = req.params;
    const file = req.file;
    let uploadedImageUrl = null;

    if (!text && !file && !imageUrl) {
      return res.status(400).json({ success: false, message: "Text or image is required" });
    }

    if (file) {
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      uploadedImageUrl = await uploadToCloudinary(base64Data);
    }

    if (imageUrl) {
      uploadedImageUrl = imageUrl;
    }

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


exports.generatePrompts = async (req, res) => {
  try {
    const { details } = req.body;

    if (!details) {
      return res.status(400).json({
        success: false,
        message: "details is required"
      });
    }

    const parts = [
      {
        text: `You are an expert AI prompt generator. 
Using the user's input: "${details}", generate EXACTLY 3 highly detailed image prompts.

Rules:
1. Output must be ONLY a valid JSON array of 3 strings.
2. No markdown, no labels, no explanations.
3. Each prompt should be 1–2 sentences.
4. Make prompts vivid, specific, and visually rich.
5. DO NOT include the user's raw text; reinterpret it creatively.

Example output format (structure only):
[
  "prompt 1...",
  "prompt 2...",
  "prompt 3..."
]

Now generate the 3 prompts.`
      }
    ];

    const geminiResp = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
      { contents: [{ parts }] },
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    const rawText =
      geminiResp.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!rawText) {
      console.error("[GENERATE PROMPTS] No text returned from Gemini");
      return res.status(500).json({
        success: false,
        message: "No response from Gemini"
      });
    }

    // Attempt to parse JSON cleanly
    let prompts;
    try {
      prompts = JSON.parse(rawText);
    } catch (err) {
      // Fallback: split lines if Gemini didn't follow JSON perfectly
      prompts = rawText.split("\n").filter((line) => line.trim());
    }

    res.status(200).json({
      success: true,
      message: "Prompts generated successfully",
      data: prompts
    });

  } catch (error) {
    console.error("[GENERATE PROMPTS] Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

