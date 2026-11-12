# SyncBeat — API & WebSocket Event Specification

---

## 1. REST API Endpoints

### Health Check
* **Endpoint:** `GET /health`
* **Response:** `200 OK`
  ```json
  {
    "status": "ok",
    "uptime": 124.5,
    "timestamp": 1793274592000,
    "activeSessions": 1
  }
  ```

---

### Sessions

#### Create Session
* **Endpoint:** `POST /api/sessions`
* **Body:**
  ```json
  {
    "hostName": "DJ Alice",
    "mode": "offline"
  }
  ```
* **Response:** `201 Created`
  ```json
  {
    "session": {
      "id": "FAVTNB",
      "mode": "offline",
      "participantCount": 1,
      "participants": [...]
    },
    "hostToken": "secret_24_bytes_hex",
    "clientToken": "client_16_bytes_hex",
    "hostParticipantId": "p_host_..."
  }
  ```

#### Get Session Status
* **Endpoint:** `GET /api/sessions/:sessionId`
* **Response:** `200 OK` returns sanitized public state (never exposes hostToken or clientToken).

#### Get Session QR Code
* **Endpoint:** `GET /api/sessions/:sessionId/qr`
* **Response:** `200 OK`
  ```json
  {
    "sessionId": "FAVTNB",
    "joinUrl": "http://172.20.10.3:3001/?session=FAVTNB",
    "qrDataUrl": "data:image/png;base64,..."
  }
  ```

#### Publish / Upload Audio Track
* **Endpoint:** `POST /api/sessions/:sessionId/track`
* **Headers:** `x-host-token: <hostToken>`
* **Body (Multipart Form Data):**
  - `audio`: audio file binary (`.mp3`, `.wav`, `.flac`, etc.)
* **Body (JSON for Desktop Local Path):**
  ```json
  {
    "localFilePath": "C:\\Music\\song.mp3",
    "title": "Neon Horizon",
    "artist": "Synthwave Collective",
    "duration": 214
  }
  ```
* **Response:** `201 Created`

#### Stream / Download Audio Track
* **Endpoint:** `GET /api/sessions/:sessionId/track?v=<version>`
* **Headers:** `Range: bytes=0-1048575` (optional)
* **Response:**
  - `200 OK`: Full file stream
  - `206 Partial Content`: Stream chunk with `Content-Range: bytes 0-1048575/5242880`

#### Kick Participant
* **Endpoint:** `DELETE /api/sessions/:sessionId/participants/:participantId`
* **Headers:** `x-host-token: <hostToken>`
* **Response:** `200 OK`

---

### Media & Cloudinary Integration

#### Check Media Service Status
* **Endpoint:** `GET /api/media/status`
* **Response:** `200 OK`
  ```json
  {
    "success": true,
    "configured": true,
    "cloudName": "syncbeat-cloud"
  }
  ```

#### Upload Artwork or Playlist Cover
* **Endpoint:** `POST /api/media/upload`
* **Body (Multipart Form Data):**
  - `image`: image file binary (`.jpg`, `.png`, `.webp`, `.gif`, max 5 MB)
  - `category`: `"covers"` | `"artwork"` | `"profiles"`
  - `resourceId`: `"all"` | `"playlist_123"`
* **Response:** `201 Created`
  ```json
  {
    "success": true,
    "url": "https://res.cloudinary.com/syncbeat-cloud/image/upload/v1234/syncbeat/covers/xyz.webp",
    "publicId": "syncbeat/covers/xyz",
    "format": "webp",
    "width": 800,
    "height": 800,
    "bytes": 104230
  }
  ```

#### Delete Media Asset
* **Endpoint:** `DELETE /api/media/destroy`
* **Body:**
  ```json
  {
    "publicId": "syncbeat/covers/xyz"
  }
  ```
* **Response:** `200 OK`

---

## 2. Real-Time Socket.IO Protocol

### Client -> Server Events

| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `join-session` | `{ sessionId, name, participantId, clientToken }` | Connect or reconnect to a session |
| `time-sync` | `{ clientSendTime }` | NTP-style clock synchronization ping |
| `track-ready-ack` | `{ sessionId, isReady: true }` | Confirms track downloaded, verified, and pre-buffered |
| `request-play` | `{ sessionId, hostToken, position, leadTimeMs }` | Host requests synchronized playback start |
| `request-pause` | `{ sessionId, hostToken, position }` | Host requests synchronized pause |
| `request-seek` | `{ sessionId, hostToken, position, leadTimeMs }` | Host requests synchronized position seek |
| `playback-telemetry` | `{ sessionId, position, isPlaying, drift, rtt }` | Client reports drift and round-trip time |
| `request-resync` | `{ sessionId, position, isPlaying, trackId }` | Participant requests manual resynchronization |
| `resync-ack` | `{ sessionId, opId, ready: true, position }` | Participant acknowledges alignment during resync |

### Server -> Client Events

| Event | Payload | Purpose |
| :--- | :--- | :--- |
| `session-updated` | Public session state snapshot | Broadcasts whenever participants join/leave or track updates |
| `track-published` | `{ track, downloadUrl }` | Notifies devices to begin downloading shared audio |
| `playback-command` | `{ type: 'play'\|'pause'\|'seek', position, scheduledAt }` | Coordinated playback instruction with future server timestamp |
| `resync-begin` | `{ opId, position, referenceName, timeoutMs }` | Signals devices to pause and align position to reference device |
| `resync-commit` | `{ opId, position, scheduledResumeAt, state }` | Signals devices to resume synchronized playback together |
| `resync-error` | `{ opId, message }` | Resync aborted due to reference device disconnect or mismatch |
| `participant-kicked` | `{ participantId }` | Disconnects removed participant |
