/**
 * Centralized Media Service for SyncBeat.
 * Handles Cloudinary uploads for playlist covers, album artwork, and status checks.
 */

import api from "./api";

export const mediaService = {
  /**
   * Check if Cloudinary media integration is active on backend.
   * @param {string} [baseUrl]
   * @returns {Promise<{success: boolean, configured: boolean, cloudName?: string}>}
   */
  async getStatus(baseUrl) {
    try {
      const url = api.resolveApiUrl("/api/media/status", baseUrl);
      const res = await fetch(url);
      if (!res.ok) {
        return { success: false, configured: false };
      }
      return await res.json();
    } catch (err) {
      console.warn("Could not fetch media status:", err.message);
      return { success: false, configured: false };
    }
  },

  /**
   * Upload an image to Cloudinary (playlist cover, album art).
   * @param {Object} options
   * @param {File|Blob} options.file - Selected image file
   * @param {string} [options.category='covers'] - 'covers' | 'artwork' | 'profiles'
   * @param {string} [options.resourceId] - ID of playlist or album
   * @param {string} [options.baseUrl]
   * @returns {Promise<{success: boolean, url?: string, publicId?: string, error?: string}>}
   */
  async uploadImage({ file, category = "covers", resourceId, baseUrl }) {
    if (!file) {
      return { success: false, error: "No image file provided." };
    }

    const formData = new FormData();
    formData.append("image", file);
    if (category) formData.append("category", category);
    if (resourceId) formData.append("resourceId", resourceId);

    const url = api.resolveApiUrl("/api/media/upload", baseUrl);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `Upload failed with HTTP ${res.status}`,
          configured: data.configured,
        };
      }

      return data;
    } catch (err) {
      console.error("Image upload request error:", err);
      return { success: false, error: err.message || "Network error during image upload." };
    }
  },

  /**
   * Delete a Cloudinary asset by publicId.
   * @param {string} publicId
   * @param {string} [baseUrl]
   */
  async deleteImage(publicId, baseUrl) {
    if (!publicId) return { success: false, error: "Public ID is required." };

    const url = api.resolveApiUrl("/api/media/destroy", baseUrl);
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
      return await res.json();
    } catch (err) {
      console.error("Delete media request error:", err);
      return { success: false, error: err.message };
    }
  },
};

export default mediaService;
