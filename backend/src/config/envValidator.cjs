/**
 * Environment Variable Validator.
 * Validates configuration at startup without printing sensitive secret values.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();
const rootEnvPath = path.resolve(__dirname, "..", "..", "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

function validateEnv() {
  const warnings = [];
  const info = [];

  // Port check
  const port = process.env.PORT || 3001;
  info.push(`Backend port configured as ${port}`);

  // CORS check
  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGINS;
  if (!frontendUrl) {
    info.push("FRONTEND_URL not set; using local development origins (localhost:5173, etc.)");
  } else {
    info.push("Custom CORS origins configured");
  }

  // Cloudinary check
  const hasCloudName = Boolean(process.env.CLOUDINARY_CLOUD_NAME);
  const hasApiKey = Boolean(process.env.CLOUDINARY_API_KEY);
  const hasApiSecret = Boolean(process.env.CLOUDINARY_API_SECRET);

  if (hasCloudName && hasApiKey && hasApiSecret) {
    info.push("Cloudinary integration is active (credentials present)");
  } else if (hasCloudName || hasApiKey || hasApiSecret) {
    warnings.push(
      "Cloudinary credentials incomplete: ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are all set."
    );
  } else {
    info.push("Cloudinary credentials not set; media uploads will run in local fallback mode");
  }

  return {
    valid: warnings.length === 0,
    warnings,
    info,
  };
}

module.exports = { validateEnv };
