const fs = require("fs");
const crypto = require("crypto");

/**
 * Compute SHA-256 hash of a file on disk via streams.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Compute SHA-256 hash of an in-memory buffer.
 * @param {Buffer} buffer
 * @returns {string}
 */
function computeBufferSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = {
  computeFileSha256,
  computeBufferSha256,
};
