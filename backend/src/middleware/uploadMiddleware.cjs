/**
 * Centralized File Upload Middleware.
 * Distinguishes between local session audio files and Cloudinary media assets.
 */

const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const MAX_AUDIO_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".m4a",
  ".aac",
  ".flac",
  ".opus",
  ".webm",
]);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/**
 * Audio storage for multi-device session distribution.
 * Writes to disk temp folder for fast local streaming & HTTP range requests.
 */
function createAudioUploadMiddleware(uploadDir) {
  const dir = uploadDir || path.join(os.tmpdir(), "syncbeat-shared");

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_AUDIO_SIZE, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
        return cb(new Error("Unsupported audio format. Supported: .mp3, .wav, .m4a, .ogg, .flac"));
      }
      cb(null, true);
    },
  });
}

/**
 * Image upload middleware for Cloudinary media assets.
 * Holds file in memory buffer for streaming directly to Cloudinary.
 */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return cb(
        new Error("Unsupported image format. Allowed formats: .jpg, .jpeg, .png, .webp, .gif")
      );
    }
    cb(null, true);
  },
});

module.exports = {
  createAudioUploadMiddleware,
  imageUpload,
  MAX_AUDIO_SIZE,
  MAX_IMAGE_SIZE,
};
