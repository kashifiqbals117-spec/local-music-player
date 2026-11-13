/**
 * Test Suite: Audius Service & Music API Integration
 * Verifies Audius discovery, track search, trending tracks, track details,
 * artist discovery, stream resolution, caching, and error resilience.
 */

const assert = require("assert");
const http = require("http");
const { AudiusService } = require("../backend/src/services/audiusService.cjs");
const { createSyncServer } = require("../backend/src/server.cjs");

async function runAudiusServiceTests() {
  console.log("=== RUNNING AUDIUS SERVICE & API TESTS ===");

  // 1. Initialize AudiusService
  const audius = new AudiusService({
    appName: "SyncBeat-Test",
    timeoutMs: 6000,
  });

  assert(audius.appName === "SyncBeat-Test", "App name must be configured");
  assert(Array.isArray(audius.discoveryNodes) && audius.discoveryNodes.length > 0, "Discovery nodes must be present");
  console.log("✔ Test 1: AudiusService initialized with active discovery nodes");

  // 2. Fetch trending tracks
  console.log("  Fetching trending tracks from Audius network...");
  let trending;
  try {
    trending = await audius.getTrendingTracks({ limit: 5 });
    assert(Array.isArray(trending.tracks), "Trending tracks must be an array");
    assert(trending.tracks.length > 0, "Trending tracks should return items");
    const first = trending.tracks[0];
    assert(first.id, "Track must have an id");
    assert(first.title, "Track must have a title");
    assert(first.artist, "Track must have an artist name");
    assert(first.source === "audius", "Track source must be 'audius'");
    assert(first.streamUrl.startsWith("/api/music/stream/"), "Stream URL must route via proxy stream");
    console.log(`✔ Test 2: Trending tracks retrieved successfully (${trending.tracks.length} tracks, top: "${first.title}" by ${first.artist})`);
  } catch (err) {
    console.warn("  Trending request failed:", err.message);
    throw err;
  }

  // 3. Test Caching: Second call must return cached result instantly
  const t0 = Date.now();
  const cachedTrending = await audius.getTrendingTracks({ limit: 5 });
  const cacheDuration = Date.now() - t0;
  assert(cacheDuration < 50, `Cached call must be near-instant (took ${cacheDuration}ms)`);
  assert.strictEqual(cachedTrending.tracks.length, trending.tracks.length, "Cached count must match");
  console.log(`✔ Test 3: In-memory TTL cache verified (response served in ${cacheDuration}ms)`);

  // 4. Track Search
  console.log("  Searching for 'electronic' tracks...");
  const searchResults = await audius.searchTracks({ query: "electronic", limit: 5 });
  assert(Array.isArray(searchResults.tracks), "Search results must be an array");
  assert(searchResults.tracks.length > 0, "Search results should return matching tracks");
  console.log(`✔ Test 4: Search returned ${searchResults.tracks.length} tracks for query 'electronic'`);

  // 5. Artist Search & Profile
  console.log("  Searching for artists...");
  const artistResults = await audius.searchArtists({ query: "beats", limit: 3 });
  assert(Array.isArray(artistResults.artists), "Artist search must return array");
  assert(artistResults.artists.length > 0, "Artist search should return artists");
  const sampleArtist = artistResults.artists[0];
  console.log(`✔ Test 5: Artist search returned: "${sampleArtist.name}" (ID: ${sampleArtist.id})`);

  // 6. Direct Stream URL Resolution
  const sampleTrack = trending.tracks[0];
  const directStreamUrl = audius.getDirectStreamUrl(sampleTrack.id);
  assert(directStreamUrl.includes(`/v1/tracks/${encodeURIComponent(sampleTrack.id)}/stream`), "Stream URL must point to track stream");
  assert(directStreamUrl.includes("app_name=SyncBeat-Test"), "Stream URL must include app_name");
  console.log(`✔ Test 6: Direct stream URL generated: ${directStreamUrl}`);

  // 7. Test HTTP API Endpoints via SyncBeat Server
  const testPort = 3193;
  const syncServer = createSyncServer({ port: testPort });
  await syncServer.start();
  console.log(`✔ Test sync server online at http://localhost:${testPort}`);

  try {
    // 7a. GET /api/music/trending
    const resTrending = await fetch(`http://localhost:${testPort}/api/music/trending?limit=3`);
    assert.strictEqual(resTrending.status, 200, "Trending endpoint must return 200");
    const jsonTrending = await resTrending.json();
    assert(jsonTrending.success, "Trending response must have success: true");
    assert(jsonTrending.tracks.length > 0, "Trending tracks array must have items");
    console.log("✔ Test 7a: HTTP GET /api/music/trending returned valid JSON");

    // 7b. GET /api/music/search
    const resSearch = await fetch(`http://localhost:${testPort}/api/music/search?query=lofi&limit=3`);
    assert.strictEqual(resSearch.status, 200, "Search endpoint must return 200");
    const jsonSearch = await resSearch.json();
    assert(jsonSearch.success, "Search response must have success: true");
    assert(jsonSearch.tracks.length > 0, "Search tracks array must have items");
    console.log("✔ Test 7b: HTTP GET /api/music/search returned valid JSON");

    // 7c. GET /api/music/search with missing query rejected with 400
    const resEmptySearch = await fetch(`http://localhost:${testPort}/api/music/search`);
    assert.strictEqual(resEmptySearch.status, 400, "Missing search query must return 400 Bad Request");
    console.log("✔ Test 7c: HTTP GET /api/music/search cleanly rejected empty query (400)");

    // 7d. GET /api/music/stream/:id (check redirect or range streaming)
    const streamTargetId = jsonTrending.tracks[0].id;
    const resStream = await fetch(`http://localhost:${testPort}/api/music/stream/${streamTargetId}?redirect=true`, {
      redirect: "manual",
    });
    assert(resStream.status === 302 || resStream.status === 200 || resStream.status === 206, `Stream must respond with redirect or 200/206 (status: ${resStream.status})`);
    console.log(`✔ Test 7d: HTTP GET /api/music/stream/:id successfully handled stream request (HTTP ${resStream.status})`);

    // 7e. GET /api/music/tracks/:id
    const resTrack = await fetch(`http://localhost:${testPort}/api/music/tracks/${streamTargetId}`);
    assert.strictEqual(resTrack.status, 200, "Track details must return 200");
    const jsonTrack = await resTrack.json();
    assert.strictEqual(jsonTrack.track.id, streamTargetId, "Track ID must match");
    console.log(`✔ Test 7e: HTTP GET /api/music/tracks/:id returned track metadata`);

    // 7f. Node rotation on network failure test
    const failoverAudius = new AudiusService({
      appName: "SyncBeat-Failover",
      discoveryNodes: ["https://invalid-nonexistent-node-12345.audius.co", "https://api.audius.co"],
      timeoutMs: 1500,
    });
    const failoverResult = await failoverAudius.getTrendingTracks({ limit: 1 });
    assert(failoverResult.tracks.length > 0, "Failover to healthy node must succeed");
    console.log("✔ Test 8: Node failover resilience verified (switched from failed host to healthy host)");

  } finally {
    await syncServer.stop();
    console.log("✔ Test sync server stopped cleanly");
  }

  console.log("\n=== ALL AUDIUS SERVICE & API TESTS PASSED SUCCESSFULLY ===\n");
}

runAudiusServiceTests().catch((err) => {
  console.error("Audius service test failed:", err);
  process.exit(1);
});

