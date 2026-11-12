/**
 * Cloudinary Media Service for SyncBeat.
 * Handles secure upload, validation, and deletion of playlist covers and album artwork.
 */

const { cloudinary, isConfigured, getCloudinaryStatus } = require("../config/cloudinary.cjs");
const { randomBytes } = require("crypto");

// Strictly allowed media formats for artwork and covers
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Upload an image buffer (playlist cover, album art) to Cloudinary.
 * @param {Object} options
 * @param {Buffer} options.buffer - Raw image file buffer
 * @param {string} options.mimetype - MIME type (e.g. 'image/jpeg')
 * @param {string} [options.originalName] - Original file name
 * @param {string} [options.category='covers'] - 'covers' | 'artwork' | 'profiles'
 * @param {string} [options.resourceId] - Associated playlist or album identifier
 * @returns {Promise<{success: boolean, url?: string, publicId?: string, format?: string, error?: string}>}
 */
async function uploadImage({ buffer, mimetype, originalName, category = "covers", resourceId }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { success: false, error: "No image file data provided." };
  }

  if (!ALLOWED_IMAGE_MIMES.has(mimetype)) {
    return {
      success: false,
      error: `Unsupported image format: ${mimetype}. Allowed formats: JPG, PNG, WEBP, GIF.`,
    };
  }

  if (buffer.length > MAX_IMAGE_SIZE) {
    return {
      success: false,
      error: `Image file exceeds maximum permitted size of 5 MB (received ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  if (!isConfigured) {
    return {
      success: false,
      configured: false,
      error: "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.",
    };
  }

  // Safe folder & public ID generation
  const safeCategory = ["covers", "artwork", "profiles"].includes(category) ? category : "covers";
  const uniqueSuffix = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  const publicId = resourceId
    ? `syncbeat/${safeCategory}/${encodeURIComponent(resourceId)}_${uniqueSuffix}`
    : `syncbeat/${safeCategory}/${uniqueSuffix}`;

  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "image",
        folder: `syncbeat/${safeCategory}`,
        overwrite: false,
        transformation: [
          { width: 800, height: 800, crop: "limit", quality: "auto", fetch_format: "auto" },
        ],
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return resolve({
            success: false,
            error: error.message || "Failed to upload image to Cloudinary.",
          });
        }

        resolve({
          success: true,
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Delete a media asset from Cloudinary by its public ID.
 * @param {string} publicId
 * @returns {Promise<{success: boolean, result?: string, error?: string}>}
 */
async function deleteImage(publicId) {
  if (!publicId || typeof publicId !== "string") {
    return { success: false, error: "Valid public ID is required for deletion." };
  }

  // Guard: Only allow deleting assets within syncbeat/ folders
  if (!publicId.startsWith("syncbeat/")) {
    return {
      success: false,
      error: "Deletion rejected: asset does not belong to SyncBeat storage.",
    };
  }

  if (!isConfigured) {
    return {
      success: false,
      configured: false,
      error: "Cloudinary is not configured.",
    };
  }

  try {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    if (res.result === "ok" || res.result === "not found") {
      return { success: true, result: res.result };
    }
    return { success: false, error: `Cloudinary response: ${res.result}` };
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    return { success: false, error: err.message || "Failed to delete image." };
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  getStatus: getCloudinaryStatus,
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_SIZE,
};
