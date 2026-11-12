const assert = require("assert");
const { createSyncServer } = require("../backend/src/server.cjs");

const TEST_PORT = 3195;

async function runCorsTests() {
  console.log("=== RUNNING SYNCBEAT CORS CONFIGURATION TESTS ===");

  const server = createSyncServer({
    port: TEST_PORT,
    corsOrigin: ["http://localhost:5173", "https://syncbeat.example.com"],
  });
  await server.start();
  const baseUrl = `http://localhost:${TEST_PORT}`;

  try {
    // 1. Allowed Origin (Vite dev server)
    const res1 = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.strictEqual(res1.status, 200, "Health check should succeed for allowed origin");
    const allowOrigin1 = res1.headers.get("access-control-allow-origin");
    assert.strictEqual(
      allowOrigin1,
      "http://localhost:5173",
      "Must return exact matching allowed origin"
    );
    console.log("✔ Test 1: Permitted origin http://localhost:5173 accepted");

    // 2. Preflight OPTIONS request
    const preflightRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, x-host-token, Range",
      },
    });
    assert.strictEqual(preflightRes.status, 200, "OPTIONS preflight must return 200");
    const allowMethods = preflightRes.headers.get("access-control-allow-methods");
    assert(allowMethods.includes("POST"), "Preflight must allow POST");
    assert(allowMethods.includes("GET"), "Preflight must allow GET");

    const exposedHeaders = preflightRes.headers.get("access-control-expose-headers") || "";
    assert(
      exposedHeaders.includes("Content-Length") ||
      res1.headers.get("access-control-expose-headers")?.includes("Content-Length"),
      "Must expose Content-Length for audio progress"
    );
    console.log("✔ Test 2: Preflight OPTIONS request handled properly with required methods & headers");

    // 3. No Origin (Electron desktop app / local curl)
    const noOriginRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(noOriginRes.status, 200, "Requests without origin header must be allowed");
    console.log("✔ Test 3: Same-origin / Electron / desktop requests without origin allowed");

    // 4. Private LAN origin in offline mode (hotspot connectivity)
    const lanRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "http://172.20.10.3:5173" },
    });
    assert.strictEqual(lanRes.status, 200, "LAN hotspot origin must be permitted");
    console.log("✔ Test 4: Private network hotspot origin permitted in offline/dev mode");

    // 5. Unapproved external origin
    const disallowedRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "http://untrusted-external-site.com" },
    });
    // In Express cors, rejected origin either returns 403 or omits Access-Control-Allow-Origin
    const disallowedHeader = disallowedRes.headers.get("access-control-allow-origin");
    assert.notStrictEqual(
      disallowedHeader,
      "http://untrusted-external-site.com",
      "Disallowed origin must never receive matching allow-origin header"
    );
    console.log("✔ Test 5: Untrusted external origin correctly blocked");

    console.log("=== ALL CORS CONFIGURATION TESTS PASSED ===");
  } finally {
    await server.stop();
  }
}

if (require.main === module) {
  runCorsTests().catch((err) => {
    console.error("❌ CORS test failed:", err);
    process.exit(1);
  });
}

module.exports = { runCorsTests };
