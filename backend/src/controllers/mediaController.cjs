/**
 * Cloudinary Media Controller.
 * Handles upload, status check, and deletion of application media assets.
 */

const cloudinaryService = require("../services/cloudinaryService.cjs");

async function getMediaStatus(req, res) {
  const status = cloudinaryService.getStatus();
  res.json({
    success: true,
    ...status,
  });
}

async function uploadMedia(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image file provided in request." });
  }

  const { category, resourceId } = req.body;

  try {
    const result = await cloudinaryService.uploadImage({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalName: req.file.originalname,
      category: category || "covers",
      resourceId: resourceId || null,
    });

    if (!result.success) {
      const statusCode = result.configured === false ? 503 : 400;
      return res.status(statusCode).json(result);
    }

    res.status(201).json(result);
  } catch (err) {
    console.error("Media controller upload error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to process image upload." });
  }
}

async function deleteMedia(req, res) {
  const publicId = req.params.publicId || req.body.publicId || req.query.publicId;

  if (!publicId) {
    return res.status(400).json({ success: false, error: "publicId parameter is required." });
  }

  try {
    const result = await cloudinaryService.deleteImage(publicId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("Media controller delete error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to delete media asset." });
  }
}

module.exports = {
  getMediaStatus,
  uploadMedia,
  deleteMedia,
};
