/**
 * Backwards-compatibility bridge for syncServer.
 * Delegates to backend/src/server.cjs
 */

const backendServer = require("../backend/src/server.cjs");

module.exports = backendServer;

if (require.main === module) {
  const syncServer = backendServer.createSyncServer();
  syncServer.start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
