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
  router.get("/:sessionId/queue", sessionController.getQueue);
  router.post("/:sessionId/queue", sessionController.addToQueue);
  router.delete("/:sessionId/queue/:queueId", sessionController.removeFromQueue);
  router.put("/:sessionId/queue/reorder", sessionController.reorderQueue);
  router.post("/:sessionId/queue/next", sessionController.playNextInQueue);
  router.delete("/:sessionId/queue", sessionController.clearQueue);
  router.delete("/:sessionId/participants/:participantId", sessionController.removeParticipant);

  return router;
}

module.exports = { createSessionRoutes };
