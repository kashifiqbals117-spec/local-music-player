/**
 * Session Routes.
 * Mounts endpoints for sessions, tracks, QR codes, and participant kicking.
 */

const express = require("express");

function createSessionRoutes({ sessionController, audioUpload }) {
  const router = express.Router();

  router.post("/", sessionController.createSession);
  router.get("/:sessionId", sessionController.getSession);
  router.get("/:sessionId/qr", sessionController.getQrCode);
  router.post("/:sessionId/track", audioUpload.single("audio"), sessionController.setTrack);
  router.get("/:sessionId/track", sessionController.streamTrack);
  router.delete("/:sessionId/participants/:participantId", sessionController.removeParticipant);

  return router;
}

module.exports = { createSessionRoutes };
