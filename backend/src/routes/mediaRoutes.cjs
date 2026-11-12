/**
 * Cloudinary Media Routes.
 * Mounts endpoints for uploading, querying, and deleting media assets.
 */

const express = require("express");
const mediaController = require("../controllers/mediaController.cjs");
const { imageUpload } = require("../middleware/uploadMiddleware.cjs");

function createMediaRoutes() {
  const router = express.Router();

  router.get("/status", mediaController.getMediaStatus);
  router.post("/upload", imageUpload.single("image"), mediaController.uploadMedia);
  router.delete("/destroy", mediaController.deleteMedia);
  router.delete("/:publicId", mediaController.deleteMedia);
  router.delete("/", mediaController.deleteMedia);

  return router;
}

module.exports = { createMediaRoutes };
