const os = require("os");
const path = require("path");
const { createSyncServer } = require("../server/syncServer.cjs");

let runningServer = null;

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  return addresses.length > 0 ? addresses : ["127.0.0.1"];
}

async function startServer(port = 3001) {
  if (runningServer) {
    return {
      running: true,
      port: runningServer.port,
      addresses: getLocalIpAddresses(),
    };
  }

  runningServer = createSyncServer({ port });
  const info = await runningServer.start();
  const addresses = getLocalIpAddresses();

  console.log(`\nSyncBeat local server running on port ${info.port}`);
  console.log("Connect nearby devices on the same Wi-Fi using:");
  for (const addr of addresses) {
    console.log(`  http://${addr}:${info.port}`);
  }

  return {
    running: true,
    port: info.port,
    addresses,
    serverInstance: runningServer,
  };
}

async function stopServer() {
  if (!runningServer) {
    return { running: false };
  }

  await runningServer.stop();
  runningServer = null;
  console.log("SyncBeat local server stopped.");
  return { running: false };
}

function getServerStatus() {
  return {
    running: Boolean(runningServer),
    port: runningServer ? runningServer.port : 3001,
    addresses: getLocalIpAddresses(),
  };
}

function getServerInstance() {
  return runningServer;
}

// If run directly from CLI: node electron/network-server.cjs
if (require.main === module) {
  startServer().catch((err) => {
    console.error("Failed to start local network server:", err);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  stopServer,
  getServerStatus,
  getServerInstance,
  getLocalIpAddresses,
};