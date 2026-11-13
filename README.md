# SyncBeat 🎵⚡

**SyncBeat** is a modern music player and multi-device synchronized audio playback system. It turns a group of phones, laptops, and desktop computers into a coordinated speaker system.

---

## 🌟 Key Features

* **Desktop Music Player (Electron + React)**: Lightweight, fast desktop music player with SQLite library indexing, recursive folder imports, and ID3 metadata extraction.
* **Online Music Streaming & Discovery (Audius API)**: Access millions of online tracks directly inside SyncBeat—browse trending hits, search tracks/artists, view high-res artwork, and stream instantly without uploading audio files.
* **Multi-Device Coordinated Playback**: Millisecond-accurate synchronized playback across laptops, iPhones, Android phones, and Macs for both local files and online Audius streams.
* **Listening Queue**: Add online and local tracks to a unified playback queue with automatic progression.
* **Two Operating Modes**:
  * **Mode A (Online Cloud Sessions)**: Host and listen from anywhere via browser join links and QR codes.
  * **Mode B (Offline Local Network)**: 100% offline playback over Wi-Fi or mobile personal hotspots with zero internet required.
* **NTP Clock Synchronization**: Multi-sample minimum-RTT network time synchronization measuring client-server clock offset.
* **Audio Distribution & Buffer Gating**: Verifies pre-buffering readiness across all devices before triggering synchronized playback.
* **Manual Resynchronization Protocol**: One-click "Sync Playback" protocol allowing any device to act as an alignment reference if latency drifts.
* **Cloudinary Media Storage**: Cloud-hosted artwork and custom playlist covers with strict format and size validation.
* **Robust Security & CORS**: Centralized Express CORS middleware, environment-based origin whitelisting, and strict asset deletion boundaries.

---

## 📁 Project Structure

```
SyncBeat/
├── frontend/                 # Frontend Application (React 19 + Vite 8)
│   ├── public/               # Static public assets
│   ├── src/
│   │   ├── components/       # UI components (Player, Library, Sidebar)
│   │   ├── hooks/            # Custom React hooks (useSyncSession, useAudioPlayer)
│   │   ├── pages/            # Home, Songs, Albums, Artists, Playlists, SyncSession
│   │   ├── services/         # Centralized API, Socket, and Media services
│   │   └── utils/            # Formatting utilities
│   ├── eslint.config.js      # ESLint configuration
│   ├── index.html            # SPA entry HTML
│   ├── package.json          # Standalone frontend manifest & build scripts
│   └── vite.config.js        # Vite configuration (outputs to frontend/dist)
│
├── backend/                  # Backend & Electron Desktop Runtime
│   ├── electron/             # Electron Desktop Application
│   │   ├── main.cjs          # Electron main process & server supervisor
│   │   ├── preload.cjs       # Context isolation IPC bridge
│   │   ├── database.cjs      # SQLite local library storage (better-sqlite3)
│   │   └── network-server.cjs# Local sync server bridge
│   ├── src/
│   │   ├── config/           # CORS, Cloudinary, and Env validation
│   │   ├── controllers/      # Session and Media controllers
│   │   ├── middleware/       # Upload and CORS middlewares
│   │   ├── routes/           # REST API routes (/api/sessions, /api/media)
│   │   ├── services/         # SessionManager and CloudinaryService
│   │   ├── sockets/          # Socket.IO synchronization engine
│   │   ├── utils/            # SHA-256 hashing and utilities
│   │   ├── app.cjs           # Express 5 application setup (serves frontend/dist)
│   │   └── server.cjs        # HTTP + Socket.IO server entry point
│   ├── .env.example
│   └── package.json          # Standalone backend manifest & start scripts
│
├── docs/                     # Architecture, API & Deployment Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEPLOYMENT.md
│
├── tests/                    # Automated Test Suites
├── render.yaml               # Render Blueprint deployment configuration
├── .env.example              # Environment configuration template
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Fill in your configuration (optional Cloudinary credentials, port, CORS origins).

### 3. Start Development Application
```bash
npm run dev
```
Launches the Vite dev server, starts the SyncBeat backend server on port 3001, and opens the Electron desktop app.

---

## 🧪 Testing

SyncBeat includes 8 automated test suites covering all system layers:

```bash
npm test
```

Test breakdown:
* `npm run test:session`: Session creation, participant join/reconnect, token authorization.
* `npm run test:resync`: Resync protocol state machine and timeout recovery.
* `npm run test:server`: REST API endpoints, QR codes, and WebSocket integration.
* `npm run test:e2e`: End-to-end simulated host and mobile guest flow.
* `npm run test:share`: Local library song sharing and SHA-256 integrity verification.
* `npm run test:timing`: NTP clock offset calculations and lead-time scheduling.
* `npm run test:cors`: Permitted origins, preflights, and private network hotspot access.
* `npm run test:media`: Cloudinary validation, format checking, and asset protection.
* `npm run test:audius`: Audius network discovery, trending tracks, search, artist lookup, caching, and failover.
* `npm run test:onlinesync`: Multi-device synchronized online playback with buffer readiness gating and late joiners.

---

## 🌐 Audius API Integration & Online Playback

SyncBeat integrates with the **Audius API** (`https://api.audius.co/v1`) to provide a decentralized catalog of tracks and artists:

### Architecture:
1. **Dynamic Discovery Node Resolution & Failover**: On startup, `AudiusService` queries the Audius gateway for healthy discovery nodes. If a node fails or times out, it automatically fails over to alternative healthy nodes.
2. **In-Memory TTL Caching**: Trending music and search results are cached in-memory (5-minute TTL) to avoid hitting API rate limits and eliminate unnecessary round-trips.
3. **Audio Stream Resolution**: Audio streams route through `/api/music/stream/:id` which handles HTTP byte ranges (206 Partial Content) and transparent 302 redirects to Audius content nodes with CORS enabled.
4. **Synchronized Online Sessions**:
   - The host selects an Audius track and shares it with the listening room.
   - The server distributes track metadata and streaming reference via `track-published`.
   - Each device buffers the audio stream and emits `track-ready-ack`.
   - The server schedules a unified playback start time (`scheduledAt = serverTime + leadTime`).
   - All participants start audible playback in millisecond lockstep.
   - The existing drift detection and manual resync protocols align playback seamlessly across network jitters.

### Configuration Variables:
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `AUDIUS_APP_NAME` | `SyncBeat` | Identifier for the Audius network and discovery nodes |
| `AUDIUS_API_KEY` | *(optional)* | API Key for elevated rate limits |

---

## 📖 Documentation

* [System Architecture](docs/ARCHITECTURE.md)
* [API & Socket Event Reference](docs/API.md)
* [Production Deployment Guide](docs/DEPLOYMENT.md)
