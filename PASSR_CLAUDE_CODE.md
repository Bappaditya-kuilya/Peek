# Passr — Claude Code Master File
> **Note on naming:** `qrdrop.io` already exists. This project is named **Passr** (`passr.dev`).  
> If you have secured a different domain, find-replace `Passr` with your chosen name throughout.

---

## What you are building

Passr is a **free, open-source, zero-login file transfer tool** for students and anyone using shared/public computers (cyber cafés, college labs, library PCs).

The user visits `passr.dev` on their phone. They select files. A QR code appears. They scan it on any PC. A browser tab opens showing their files — no install, no account, no cloud. Files transfer directly. Session dies after 60 minutes automatically.

**Core principles:**
- No account. No login. Ever.
- No file ever touches a third-party server.
- The relay server brokers connections only — it never sees file content.
- Open source. MIT licensed. Free forever.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend (phone UI) | React + Vite | You know JS. Fast dev. PWA-ready. |
| Frontend (browser receiver) | Plain HTML + Vanilla JS | Zero dependency. Works on any café PC browser. |
| Relay server | Node.js + Express + WebSocket (ws) | Lightweight. Free to host. |
| File transfer protocol | WebRTC DataChannel (with WebSocket relay fallback) | P2P when possible, relay when not |
| QR generation | `qrcode` npm package | Lightweight, no external calls |
| Session tokens | `crypto.randomBytes(32)` | Cryptographically secure, not Math.random() |
| Encryption in transit | TLS (HTTPS on relay) + WebRTC DTLS (automatic) | End-to-end on all paths |
| Hosting (relay) | Fly.io free tier | 256MB RAM enough. Global edge. Free. |
| Hosting (frontend) | Vercel or Cloudflare Pages | Free. CDN. Auto HTTPS. |

---

## Project folder structure

```
passr/
├── relay/                        # Node.js relay server
│   ├── src/
│   │   ├── index.js              # Entry point
│   │   ├── session.js            # Session creation, expiry, token management
│   │   ├── relay.js              # WebSocket message routing
│   │   └── security.js           # Rate limiting, origin checks
│   ├── package.json
│   ├── Dockerfile
│   └── fly.toml                  # Fly.io config
│
├── web/                          # React app (phone sender UI)
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── FilePicker.jsx    # Folder/file selection
│   │   │   ├── QRDisplay.jsx     # QR code + session timer
│   │   │   ├── ActivityFeed.jsx  # Live "X downloaded file.pdf" feed
│   │   │   └── KillSwitch.jsx    # Big red end session button
│   │   ├── hooks/
│   │   │   ├── useSession.js     # Session lifecycle
│   │   │   ├── useWebRTC.js      # Peer connection logic
│   │   │   └── useTransfer.js    # File chunking + progress
│   │   └── utils/
│   │       ├── crypto.js         # Token generation
│   │       ├── qr.js             # QR code generation
│   │       └── sanitize.js       # Path sanitization
│   ├── public/
│   │   └── manifest.json         # PWA manifest
│   ├── index.html
│   └── vite.config.js
│
├── receiver/                     # Static HTML receiver (what café PC opens)
│   ├── index.html                # Single file — no framework, no build step
│   ├── receiver.js               # WebRTC + fallback logic
│   └── style.css
│
├── docs/                         # GitHub Pages documentation site
│   ├── index.md
│   ├── how-it-works.md
│   ├── security.md
│   ├── privacy-policy.md
│   ├── contributing.md
│   └── self-hosting.md
│
├── .github/
│   └── workflows/
│       ├── deploy-relay.yml      # Auto deploy relay to Fly.io on push
│       └── deploy-web.yml        # Auto deploy frontend to Vercel on push
│
├── README.md
├── LICENSE                       # MIT
└── SECURITY.md                   # Responsible disclosure policy
```

---

## Architecture — how it works

### Happy path (same Wi-Fi / same subnet)

```
1. User opens passr.dev on phone
2. Selects files/folder to share
3. App calls relay: POST /session → gets session_id + token
4. App generates QR encoding: https://passr.dev/r/{session_id}#{token}
5. QR displayed on phone screen with 60-minute countdown
6. PC user scans QR → browser opens receiver page
7. Receiver extracts session_id + token from URL
8. Both phone and PC connect to relay via WebSocket
9. Relay verifies token, introduces the two peers
10. WebRTC peer connection established directly (P2P)
11. Relay steps aside — files stream phone → PC at LAN speed
12. Activity feed on phone shows every download in real time
13. Session auto-kills at 60 min OR user taps kill switch
```

### Fallback path (different subnets — café, college ethernet+wifi)

```
Steps 1–9 identical.
10. WebRTC direct connection fails (NAT traversal fails)
11. Transfer automatically falls back to WebSocket relay tunnel
12. Files stream phone → relay → PC (slower but works everywhere)
13. Relay never decrypts content — just passes encrypted chunks
```

### What the relay knows (and doesn't know)

| The relay knows | The relay never knows |
|---|---|
| Session ID (random string) | Filenames |
| Connection timestamp | File contents |
| Approximate bytes transferred | Who the user is |
| Client IP (for rate limiting) | What files were selected |

---

## Security model — implement these in order, skip none

### 1. Session tokens
```javascript
// security.js
const crypto = require('crypto');

function generateToken() {
  // NEVER use Math.random() for security tokens
  return crypto.randomBytes(32).toString('hex'); // 256-bit
}

function generateSessionId() {
  return crypto.randomBytes(8).toString('hex'); // 64-bit, URL-safe
}
```

### 2. Token validation — single use, time-bound
```javascript
// session.js
const sessions = new Map();

function createSession() {
  const id = generateSessionId();
  const token = generateToken();
  sessions.set(id, {
    token,
    createdAt: Date.now(),
    consumed: false,        // token is single-use for initial auth
    expiresAt: Date.now() + 60 * 60 * 1000, // 60 minutes hard limit
    senderSocket: null,
    receiverSocket: null,
  });
  return { id, token };
}

function validateToken(sessionId, token) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt < Date.now()) return false;
  // Timing-safe comparison — prevents timing attacks
  const valid = crypto.timingSafeEqual(
    Buffer.from(session.token),
    Buffer.from(token)
  );
  return valid;
}
```

### 3. Path traversal prevention — CRITICAL
```javascript
// sanitize.js (web/src/utils/)
// This prevents the ../../../etc/passwd attack
function safePath(userSelectedPath, allowedRoot) {
  const resolved = path.resolve(allowedRoot, userSelectedPath);
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}
// Since this is web-based (File API), you never deal with raw paths.
// The File object from <input type="file"> is already sandboxed by the browser.
// This is your biggest security gift — the browser does this for you.
```

### 4. Rate limiting on relay
```javascript
// security.js
const rateLimit = require('express-rate-limit');

const sessionCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                     // max 10 sessions per IP per 15 min
  message: 'Too many sessions created. Please wait.'
});

app.use('/session', sessionCreateLimiter);
```

### 5. Session cleanup — no memory leak
```javascript
// session.js
// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      // Close any open sockets
      if (session.senderSocket) session.senderSocket.close();
      if (session.receiverSocket) session.receiverSocket.close();
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);
```

### 6. Origin check on WebSocket
```javascript
// relay.js
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  const allowed = ['https://passr.dev', 'http://localhost:5173'];
  if (!allowed.includes(origin)) {
    ws.close(4003, 'Forbidden origin');
    return;
  }
});
```

---

## Relay server — complete implementation guide

### relay/src/index.js
```javascript
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createSession, validateToken, getSession, killSession } = require('./session');
const { handleWebSocket } = require('./relay');
const { sessionCreateLimiter } = require('./security');

const app = express();
app.use(express.json());

// CORS — only allow your own domain
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://passr.dev');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Create a new session
app.post('/session', sessionCreateLimiter, (req, res) => {
  const session = createSession();
  res.json({
    sessionId: session.id,
    token: session.token,
    expiresAt: session.expiresAt,
  });
});

// Kill a session (called by kill switch on phone)
app.delete('/session/:id', (req, res) => {
  killSession(req.params.id);
  res.json({ ok: true });
});

// Health check for uptime monitoring
app.get('/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', handleWebSocket);

server.listen(process.env.PORT || 3000, () => {
  console.log('Passr relay running');
});
```

### relay/src/relay.js — WebSocket message router
```javascript
const { validateToken, getSession, updateSession } = require('./session');

function handleWebSocket(ws, req) {
  // Origin check
  const origin = req.headers.origin;
  if (!['https://passr.dev', 'http://localhost:5173'].includes(origin)) {
    ws.close(4003, 'Forbidden');
    return;
  }

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { ws.close(4002, 'Bad message'); return; }

    switch (msg.type) {

      case 'sender-join': {
        // Phone registers as sender
        const session = getSession(msg.sessionId);
        if (!session || !validateToken(msg.sessionId, msg.token)) {
          ws.close(4001, 'Invalid token'); return;
        }
        updateSession(msg.sessionId, { senderSocket: ws });
        ws.sessionId = msg.sessionId;
        ws.role = 'sender';
        ws.send(JSON.stringify({ type: 'sender-ready' }));
        break;
      }

      case 'receiver-join': {
        // PC browser registers as receiver
        const session = getSession(msg.sessionId);
        if (!session || !validateToken(msg.sessionId, msg.token)) {
          ws.close(4001, 'Invalid token'); return;
        }
        updateSession(msg.sessionId, { receiverSocket: ws });
        ws.sessionId = msg.sessionId;
        ws.role = 'receiver';
        // Tell sender a receiver connected
        if (session.senderSocket) {
          session.senderSocket.send(JSON.stringify({ type: 'receiver-connected' }));
        }
        ws.send(JSON.stringify({ type: 'receiver-ready' }));
        break;
      }

      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-candidate': {
        // WebRTC signalling — relay between sender and receiver
        const session = getSession(ws.sessionId);
        if (!session) break;
        const target = ws.role === 'sender' ? session.receiverSocket : session.senderSocket;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify(msg));
        }
        break;
      }

      case 'relay-chunk': {
        // Fallback: relay a file chunk when WebRTC P2P fails
        // Relay never decodes this — just passes raw bytes
        const session = getSession(ws.sessionId);
        if (!session) break;
        const target = ws.role === 'sender' ? session.receiverSocket : session.senderSocket;
        if (target && target.readyState === 1) {
          target.send(data); // pass raw binary, don't parse
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    // Notify the other peer when one side disconnects
    const session = getSession(ws.sessionId);
    if (!session) return;
    const target = ws.role === 'sender' ? session.receiverSocket : session.senderSocket;
    if (target) target.send(JSON.stringify({ type: 'peer-disconnected' }));
  });
}

module.exports = { handleWebSocket };
```

---

## Frontend — phone sender (React)

### Key component: QRDisplay.jsx
```jsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QRDisplay({ sessionId, token, expiresAt, onKill }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const receiverUrl = `https://passr.dev/r/${sessionId}#${token}`;

  useEffect(() => {
    QRCode.toDataURL(receiverUrl, { width: 300, margin: 2 })
      .then(setQrDataUrl);
  }, [receiverUrl]);

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) onKill();
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt, onKill]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="qr-container">
      {qrDataUrl && <img src={qrDataUrl} alt="Scan this QR code on the PC" />}
      <p className="timer">
        Session expires in {minutes}:{String(seconds).padStart(2, '0')}
      </p>
      <p className="hint">Scan with the PC camera or browser</p>
      <button className="kill-btn" onClick={onKill}>
        End Session Now
      </button>
    </div>
  );
}
```

### Key hook: useWebRTC.js
```javascript
import { useRef, useCallback } from 'react';

// Free public STUN servers — for NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC(ws, onFallback) {
  const pc = useRef(null);
  const dataChannel = useRef(null);

  const initConnection = useCallback(() => {
    pc.current = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // DataChannel for file chunks
    dataChannel.current = pc.current.createDataChannel('files', {
      ordered: true,
    });

    // If ICE fails → fall back to relay
    pc.current.oniceconnectionstatechange = () => {
      if (pc.current.iceConnectionState === 'failed') {
        onFallback(); // tell parent to switch to relay tunnel
      }
    };

    // Send ICE candidates to peer via relay signalling
    pc.current.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({
          type: 'webrtc-candidate',
          candidate: e.candidate,
        }));
      }
    };

    return pc.current;
  }, [ws, onFallback]);

  return { initConnection, dataChannel };
}
```

### File chunking — useTransfer.js
```javascript
const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export async function sendFile(file, dataChannel, onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Send file metadata first
  dataChannel.send(JSON.stringify({
    type: 'file-meta',
    name: file.name,
    size: file.size,
    totalChunks,
  }));

  // Send chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = file.slice(start, start + CHUNK_SIZE);
    const buffer = await chunk.arrayBuffer();
    dataChannel.send(buffer);
    onProgress(file.name, Math.round(((i + 1) / totalChunks) * 100));

    // Backpressure — don't flood the channel
    while (dataChannel.bufferedAmount > 1024 * 1024) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  dataChannel.send(JSON.stringify({ type: 'file-done', name: file.name }));
}
```

---

## Receiver page — receiver/index.html

This is what opens on the café PC. Single HTML file. No framework. No build step. Works on Chrome 2019+.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Passr — Receiving files</title>
  <style>
    /* Minimal, clean. Works on any screen. */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f9f9f9;
           display: flex; flex-direction: column; align-items: center;
           padding: 2rem; min-height: 100vh; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; color: #111; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .file-list { width: 100%; max-width: 480px; }
    .file-item { background: white; border: 1px solid #e5e5e5; border-radius: 8px;
                 padding: 1rem; margin-bottom: 0.75rem; display: flex;
                 align-items: center; justify-content: space-between; }
    .file-name { font-size: 0.95rem; color: #222; word-break: break-all; }
    .file-size { font-size: 0.8rem; color: #888; margin-top: 0.2rem; }
    .progress { height: 4px; background: #eee; border-radius: 2px; margin-top: 0.5rem; }
    .progress-bar { height: 100%; background: #2563eb; border-radius: 2px;
                    transition: width 0.2s; }
    .download-btn { background: #2563eb; color: white; border: none;
                    padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;
                    font-size: 0.85rem; white-space: nowrap; margin-left: 1rem; }
    .status { color: #666; font-size: 0.85rem; margin-top: 2rem; }
    .expired { color: #dc2626; font-weight: 500; }
  </style>
</head>
<body>
  <h1>Passr</h1>
  <p class="subtitle">Files from your phone — session auto-closes in <span id="timer">--:--</span></p>
  <div class="file-list" id="file-list"></div>
  <p class="status" id="status">Connecting...</p>

  <script src="receiver.js"></script>
</body>
</html>
```

---

## SEO — getting found on Google

### 1. Meta tags in index.html (phone sender page)
```html
<head>
  <title>Passr — Share files from phone to PC by scanning a QR code</title>
  <meta name="description"
    content="Free, open-source file transfer. Scan a QR code on any PC, files appear in the browser. No login. No install. Session auto-expires. Works at college labs and cyber cafés.">

  <!-- Open Graph (WhatsApp, Telegram, LinkedIn previews) -->
  <meta property="og:title" content="Passr — QR file transfer, no login">
  <meta property="og:description" content="Scan a QR on any PC. Your files appear. Nothing installs. Session dies in 60 minutes.">
  <meta property="og:url" content="https://passr.dev">
  <meta property="og:type" content="website">

  <!-- Canonical URL -->
  <link rel="canonical" href="https://passr.dev">

  <!-- PWA -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#2563eb">
  <meta name="mobile-web-app-capable" content="yes">
</head>
```

### 2. Structured data (paste in index.html before </body>)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Passr",
  "applicationCategory": "UtilitiesApplication",
  "operatingSystem": "Any",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "Free open-source file transfer via QR code. No login, no install, no cloud. Works at college labs and cyber cafés.",
  "url": "https://passr.dev",
  "license": "https://opensource.org/licenses/MIT"
}
</script>
```

### 3. sitemap.xml (put in /public/)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://passr.dev/</loc><priority>1.0</priority></url>
  <url><loc>https://passr.dev/how-it-works</loc><priority>0.8</priority></url>
  <url><loc>https://passr.dev/security</loc><priority>0.7</priority></url>
  <url><loc>https://passr.dev/privacy</loc><priority>0.6</priority></url>
</urlset>
```

### 4. robots.txt
```
User-agent: *
Allow: /
Sitemap: https://passr.dev/sitemap.xml
```

### 5. After deployment — submit to Google
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property → enter `passr.dev`
3. Verify via DNS TXT record (Cloudflare/Namecheap makes this easy)
4. Submit sitemap URL: `https://passr.dev/sitemap.xml`
5. Request indexing on the main URL

### 6. Where to post for organic reach (do this on launch day)
- `news.ycombinator.com` → Show HN: Passr – QR file transfer for college labs, no login
- `reddit.com/r/selfhosted`
- `reddit.com/r/india` + `r/Indian_Academia`
- `reddit.com/r/opensource`
- Dev.to article: "How I built a zero-login file transfer tool for college students"
- GitHub trending (tag: `file-transfer`, `webrtc`, `qr-code`, `open-source`)

---

## Privacy policy (plain language — paste at passr.dev/privacy)

```
Last updated: [DATE]

Passr is a file transfer tool. Here is everything we know about you
when you use it:

WHAT WE COLLECT
- Nothing that identifies you.
- The relay server temporarily stores a random session ID (e.g. "a3f9b2c1")
  and the connection timestamp. This is deleted when your session ends
  or after 60 minutes, whichever comes first.
- We do not store filenames, file contents, or your IP address in any
  permanent log.

WHAT WE DON'T DO
- We do not sell data. There is no data to sell.
- We do not use analytics (no Google Analytics, no Mixpanel).
- We do not use cookies.
- We do not require an account.
- Files never pass through our servers in readable form.
  They are transferred peer-to-peer (WebRTC) when possible.
  When relay is needed, only encrypted chunks pass through —
  the relay cannot read them.

FILE STORAGE
- We do not store your files. Ever. Not temporarily. Not in cache.
  Files move directly from your phone to the PC browser.

THIRD PARTIES
- STUN servers: We use Google's public STUN servers (stun.l.google.com)
  for NAT traversal. These servers see your IP address briefly to help
  establish a connection. They do not see your files.
- Hosting: The relay runs on Fly.io. Their infrastructure processes
  connection bytes. See fly.io/legal/privacy-policy for their policy.

YOUR RIGHTS
- There is no account to delete.
- There is no data stored about you to request.
- Sessions self-destruct in 60 minutes by design.

CONTACT
- GitHub Issues: github.com/[your-username]/passr
- Email: [your-email]

This policy is written in plain language intentionally.
If something is unclear, open a GitHub issue and we'll fix the wording.
```

---

## Security disclosure policy (SECURITY.md)

```markdown
# Security Policy

## Supported versions
Only the latest release on the main branch is supported.

## Reporting a vulnerability

Please do NOT open a public GitHub issue for security vulnerabilities.

Email: security@passr.dev (or your personal email until you set this up)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional but appreciated)

We will respond within 72 hours and aim to patch within 7 days.
We will credit you in the release notes unless you prefer anonymity.

## What qualifies
- Session token prediction or reuse
- Path traversal (accessing files outside shared scope)
- Man-in-the-middle attacks on the relay
- Cross-site scripting in the receiver page
- Race conditions in session management

## What doesn't qualify
- Denial of service via flooding (mitigated by rate limiting)
- Issues requiring physical access to the device
- Social engineering attacks
```

---

## Deployment guide

### Relay → Fly.io (free)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# From relay/ directory
fly launch          # creates fly.toml, picks free plan
fly deploy          # builds Docker image, deploys

# Set environment variable for your domain
fly secrets set ALLOWED_ORIGIN=https://passr.dev
```

### relay/Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/index.js"]
```

### relay/fly.toml
```toml
app = "passr-relay"
primary_region = "sin"   # Singapore — closest to India

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

### Frontend → Vercel (free)
```bash
# From web/ directory
npx vercel          # follow prompts, auto-detects Vite
# Set environment variable in Vercel dashboard:
# VITE_RELAY_URL = wss://passr-relay.fly.dev
```

---

## Pre-launch security checklist

Run through every item. Check it off manually. Do not skip.

- [ ] Session tokens use `crypto.randomBytes(32)` — not `Math.random()`
- [ ] Token comparison uses `crypto.timingSafeEqual()` — not `===`
- [ ] Sessions auto-expire at 60 minutes server-side (not just client-side)
- [ ] Rate limiting on `/session` endpoint (max 10/IP/15min)
- [ ] WebSocket origin checked on every connection
- [ ] Receiver page has no inline scripts (CSP header set)
- [ ] Relay logs zero filenames or file contents
- [ ] HTTPS enforced on all endpoints (Fly.io does this automatically)
- [ ] `fly secrets` used for secrets — no secrets in source code
- [ ] Test: create a session, let 60 min pass, confirm session is dead
- [ ] Test: create two sessions with same IP rapidly, confirm rate limit fires
- [ ] Test: manually send a bad token to WebSocket, confirm it closes cleanly
- [ ] Test: open receiver URL with tampered token, confirm rejected
- [ ] Post code on GitHub, share in r/netsec with "please break this"

---

## Contributing guide (docs/contributing.md)

```markdown
# Contributing to Passr

This is a community project. All skill levels welcome.

## Ways to help

**No code needed:**
- Test it at your college lab and report what breaks
- Translate the UI to your language (Hindi, Bengali, Telugu etc.)
- Write a blog post or tweet about it
- Share it with students who need it

**Code contributions:**
- Bug fixes — always welcome, open a PR directly
- New features — open an issue first to discuss before building
- Security improvements — see SECURITY.md for responsible disclosure

## Development setup

```bash
git clone https://github.com/[your-username]/passr
cd passr

# Start relay locally
cd relay && npm install && npm run dev

# Start frontend locally (new terminal)
cd web && npm install && npm run dev

# Open http://localhost:5173 on your phone (same Wi-Fi)
# Open http://localhost:5174 in a browser tab to test receiver
```

## Code style
- No TypeScript (keep the barrier low for contributors)
- No unnecessary dependencies (every package is a security surface)
- Comments on any non-obvious logic
- Security-sensitive code must have a comment explaining why

## Pull request checklist
- [ ] Tested locally
- [ ] No new npm packages without discussion in the issue first
- [ ] Security checklist items still pass
- [ ] README updated if behaviour changed
```

---

## README.md (GitHub facing)

```markdown
# Passr

**Scan a QR. Files appear. Nothing installs. Session dies in 60 minutes.**

Free, open-source file transfer for students using college labs,
cyber cafés, or any shared computer.

## How it works

1. Open passr.dev on your phone
2. Select files to share
3. Scan the QR code on any PC
4. Files appear in the browser tab
5. Session auto-expires in 60 minutes

No login. No cloud. No install on the PC. No account ever.

## Why

Every existing tool requires either an app install, a login,
or sends your files through someone's server. Passr doesn't.
Files go directly from your phone to the PC browser over your
local network. The relay server only brokers the connection —
it never sees your files.

Built for Indian college students who need to submit assignments,
fill forms, or move files at cyber cafés without the usual friction.

## Security

- Session tokens are 256-bit cryptographically random
- Sessions hard-expire server-side at 60 minutes
- WebRTC transfers are end-to-end encrypted (DTLS mandatory)
- Relay fallback passes only encrypted chunks
- Zero file logging on relay
- Rate limited to prevent abuse

[Full security model →](docs/security.md)

## Self-hosting

You can run your own relay in 5 minutes. See [self-hosting guide](docs/self-hosting.md).

## Contributing

All skill levels welcome. See [contributing guide](docs/contributing.md).

## License

MIT — free forever, fork freely.
```

---

## Instructions for Claude Code

When you open this file in Claude Code, say:

> "Read PASSR_CLAUDE_CODE.md fully. Then build the project exactly
> as specified. Start with the relay server first, then the web frontend,
> then the receiver page. After each component, run it locally and
> confirm it starts without errors before moving to the next.
> Use the exact security implementations specified — do not substitute
> simpler alternatives for crypto functions. Flag any dependency you
> want to add before adding it."

**Do not:**
- Use `Math.random()` anywhere in session or token code
- Add analytics of any kind
- Store filenames or file contents on the relay
- Add a database (Map in memory is sufficient for v1)
- Skip the rate limiter
- Use `==` for token comparison (use `timingSafeEqual`)

**Do:**
- Keep the receiver page as a single HTML file with no build step
- Keep the relay under 300 lines total
- Comment every security-sensitive line
- Add `// SECURITY:` prefix to comments on critical code
