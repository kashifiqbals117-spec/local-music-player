/**
 * Reusable Cloudinary Configuration Module.
 * Configures the official Cloudinary SDK using backend environment variables.
 * Never exposes the API Secret to client code.
 */

require("dotenv").config();
const cloudinary = require("cloudinary").v2;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
const apiKey = process.env.CLOUDINARY_API_KEY || "";
const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

const isConfigured = Boolean(cloudName && apiKey && apiSecret);

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function getCloudinaryStatus() {
  return {
    configured: isConfigured,
    cloudName: isConfigured ? cloudName : null,
    // Never expose apiKey or apiSecret
  };
}

module.exports = {
  cloudinary,
  isConfigured,
  getCloudinaryStatus,
};
