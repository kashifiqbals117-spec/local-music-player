# SyncBeat 🎵⚡

**SyncBeat** is a modern music player and multi-device synchronized audio playback system. It turns a group of phones, laptops, and desktop computers into a coordinated speaker system.

---

## 🌟 Key Features

* **Desktop Music Player (Electron + React)**: Lightweight, fast desktop music player with SQLite library indexing, recursive folder imports, and ID3 metadata extraction.
* **Multi-Device Coordinated Playback**: Millisecond-accurate synchronized playback across laptops, iPhones, Android phones, and Macs.
* **Two Operating Modes**:
  * **Mode A (Online Cloud Sessions)**: Host and listen from anywhere via browser join links and QR codes.
  * **Mode B (Offline Local Network)**: 100% offline playback over Wi-Fi or mobile personal hotspots with zero internet required.
* **NTP Clock Synchronization**: Multi-sample minimum-RTT network time synchronization measuring client-server clock offset.
* **Audio File Distribution**: Fast local chunked streaming with SHA-256 integrity verification and pre-buffering readiness checks.
* **Manual Resynchronization Protocol**: One-click "Sync Playback" protocol allowing any device to act as an alignment reference if latency drifts.
* **Cloudinary Media Storage**: Cloud-hosted artwork and custom playlist covers with strict format and size validation.
* **Robust Security & CORS**: Centralized Express CORS middleware, environment-based origin whitelisting, and strict asset deletion boundaries.

---

## 📁 Project Structure

```
SyncBeat/
├── backend/                  # Restructured Backend Architecture
│   ├── src/
│   │   ├── config/           # CORS, Cloudinary, and Env validation
│   │   ├── controllers/      # Session and Media controllers
│   │   ├── middleware/       # Upload and CORS middlewares
│   │   ├── routes/           # REST API routes (/api/sessions, /api/media)
│   │   ├── services/         # SessionManager and CloudinaryService
│   │   ├── sockets/          # Socket.IO synchronization engine
│   │   ├── utils/            # SHA-256 hashing and utilities
│   │   ├── app.cjs           # Express 5 application setup
│   │   └── server.cjs        # HTTP + Socket.IO server entry point
│   ├── .env.example
│   └── package.json
│
├── electron/                 # Electron Desktop Application
│   ├── main.cjs              # Electron main process & server supervisor
│   ├── preload.cjs           # Context isolation IPC bridge
│   ├── database.cjs          # SQLite local library storage (better-sqlite3)
│   └── network-server.cjs    # Local sync server bridge
│
├── src/                      # Frontend Application (React 19 + Vite 8)
│   ├── components/           # UI components (Player, Library, Sidebar)
│   ├── hooks/                # Custom React hooks (useSyncSession, useAudioPlayer)
│   ├── pages/                # Home, Songs, Albums, Artists, Playlists, SyncSession
│   ├── services/             # Centralized API, Socket, and Media services
│   └── utils/                # Formatting utilities
│
├── docs/                     # Architecture, API & Deployment Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEPLOYMENT.md
│
├── tests/                    # 8 Automated Test Suites
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

---

## 📖 Documentation

* [System Architecture](docs/ARCHITECTURE.md)
* [API & Socket Event Reference](docs/API.md)
* [Production Deployment Guide](docs/DEPLOYMENT.md)
