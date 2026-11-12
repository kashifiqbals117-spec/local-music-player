# SyncBeat — Production Deployment & Operations Guide

SyncBeat turns a group of phones, laptops, and desktop computers into a shared, synchronized speaker system. This guide covers local development, cloud deployment, and media storage configuration.

---

## 1. Development & Startup Commands

### Start Desktop App (Host Environment)
```bash
npm run dev
```
Starts:
1. **Vite Development Server** on `http://0.0.0.0:5173`
2. **SyncBeat Node.js Server** on port `3001` (auto-started by Electron)
3. **Electron Desktop Application**

### Start Backend Server Standalone
```bash
npm run backend
# or
npm run server
```
Runs the Express + Socket.IO server on `http://0.0.0.0:3001` without Electron.

### Start Web-Only Development Mode
```bash
npm run dev:web
```
Runs the backend server concurrently with the Vite dev server for browser-only testing.

### Run Automated Tests
```bash
npm test
```
Runs all 8 test suites (Session Manager, Resync Protocol, Integration, E2E, Song Sharing, Timing, CORS, Media Upload).

### Build Production Web Client
```bash
npm run build
```
Generates production static SPA assets in `dist/`.

---

## 2. Cloud Deployment (Mode A: Online Sessions)

When deploying SyncBeat to cloud platforms (Render, Railway, Fly.io, AWS, DigitalOcean):

### A. Environment Variables
Set the following environment variables in your cloud provider's dashboard:

```env
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://syncbeat.yourdomain.com
CORS_ORIGINS=https://syncbeat.yourdomain.com,https://app.yourdomain.com
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### B. Persistent WebSocket Support
SyncBeat relies on Socket.IO for NTP clock synchronization and low-latency commands. The hosting environment **must support persistent WebSocket connections**:

* **Reverse Proxy (Nginx)**: Ensure WebSocket upgrade headers are passed:
  ```nginx
  location /socket.io/ {
      proxy_pass http://localhost:3001;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
      proxy_read_timeout 86400s;
      proxy_send_timeout 86400s;
  }
  ```
* **Cloudflare**: Ensure WebSockets are enabled in the Cloudflare Network settings.
* **Sticky Sessions**: If running multiple server instances behind a load balancer, sticky sessions (session affinity) must be enabled so WebSocket polling and upgrades route to the same instance.

### C. Containerized / Node.js Deployment
* **Build Command**: `npm install && npm run build`
* **Start Command**: `node backend/src/server.cjs`

When `dist/` is present, `server.cjs` automatically serves the built frontend SPA on the root route while providing all `/api` and Socket.IO endpoints on the same port.

---

## 3. Offline Local-Network Sessions (Mode B)

* Requires **zero external internet connectivity**.
* Host laptop connects to the same Wi-Fi router or personal hotspot as the participating phones and laptops.
* Host desktop app launches local server on port `3001`.
* Guests open `http://<HOST_LAN_IP>:5173` or `http://<HOST_LAN_IP>:3001` directly on their phones/Macs.
* Audio files stream directly across the local network with SHA-256 integrity verification.

---

## 4. Cloudinary Media Storage Setup

Cloudinary provides secure cloud-hosted storage for playlist covers and album artwork:

1. Sign up for a free account at [Cloudinary](https://cloudinary.com).
2. Copy your **Cloud Name**, **API Key**, and **API Secret** from the Cloudinary Console Dashboard.
3. Add them to your `.env` file:
   ```env
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
4. Verify media status via `GET /api/media/status`:
   ```bash
   curl http://localhost:3001/api/media/status
   ```
   Should return `{"success": true, "configured": true, "cloudName": "your_cloud_name"}`.

SyncBeat organizes uploaded assets safely into:
* `syncbeat/covers/`: Custom playlist cover artwork
* `syncbeat/artwork/`: Track and album cover images
* `syncbeat/profiles/`: User avatar badges
