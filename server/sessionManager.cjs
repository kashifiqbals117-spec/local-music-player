/**
 * Backwards-compatibility bridge for sessionManager.
 * Delegates to backend/src/services/sessionManager.cjs
 */

const sessionManagerModule = require("../backend/src/services/sessionManager.cjs");

module.exports = sessionManagerModule;
