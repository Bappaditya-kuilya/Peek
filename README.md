# Peek

**Move files between any two devices. No install. No account. No trace.**

Peek is a browser-based file transfer tool with end-to-end encryption. One device picks files, the other scans a QR code. Files transfer directly between browsers — encrypted before they leave, decrypted on arrival. The server never sees your data.

**[Launch Peek](https://peekapp.vercel.app)**

---

## How It Works

**1. Select** &mdash; Choose files on the sending device.

**2. Scan** &mdash; Open the QR code on the receiving device. No app needed — just a browser.

**3. Transfer** &mdash; Files move encrypted, peer-to-peer when possible.

**4. Done** &mdash; Close the tab. Nothing is stored, nothing is left behind.

---

## Key Features

| | |
|---|---|
| **End-to-end encrypted** | AES-256-GCM. The key stays in your browser — it's embedded in the URL fragment and never sent to any server. |
| **Peer-to-peer** | Files transfer directly via WebRTC when both devices support it. Falls back to an encrypted relay automatically. |
| **Two-way** | Once paired, send and receive files in both directions within the same session. |
| **Clipboard sync** | Move text, passwords, or snippets between devices without creating a file. |
| **Peek Links** | Generate a temporary link to a single file. Images and PDFs preview inline. Set view limits or expiry. |
| **Zero footprint** | 60-minute session TTL. Either side can kill the session instantly. No history, no cookies, no local storage. |

---

## Designed For

- Library and lab computers where you can't install software
- Locked-down work machines without cloud access
- Quick handoffs at conferences, classrooms, or coffee shops
- Sensitive documents that shouldn't touch third-party storage
- Public terminals where you need to transfer and leave clean

---

## Security

All file data is encrypted client-side before transmission. The relay server handles session coordination only — it never has access to plaintext file contents, file names, or encryption keys.

| | |
|---|---|
| **Encryption** | AES-256-GCM, fresh IV per chunk |
| **Key exchange** | URL fragment (never sent to server) |
| **Transport** | DTLS (WebRTC) or encrypted relay fallback |
| **Storage** | None. Files exist only in browser memory during transfer. |

---

## Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18, Vite |
| Relay | Cloudflare Workers, Durable Objects (SQLite), WebSockets (Hibernation API) |
| Receiver | Vanilla JavaScript (zero dependencies) |
| Encryption | Web Crypto API (AES-256-GCM) |
| Hosting | Vercel (frontend), Cloudflare Workers (relay) |

[**Launch Peek**](https://peekapp.vercel.app)

---

## Self-Host

Deploy your own relay and frontend:

```bash
# Frontend (any static host — Vercel, Netlify, Cloudflare Pages)
cd web && npm install && npm run build

# Relay (Cloudflare Workers)
cd cloudflare-relay && npm install && wrangler deploy
```

For complete guide including environment variables, TURN setup, and custom domains, see the [Self-Host page in the webapp](https://peekapp.vercel.app/self-host).

---

## Development

```bash
git clone https://github.com/Bappaditya-kuilya/Peek.git && cd Peek
npm install && npm --prefix web install
npm --prefix relay start &
npm --prefix web dev
```

```bash
npm test
```

---

## v1.0.0

The first public release of Peek.

**Highlights**

- End-to-end encrypted file transfer (AES-256-GCM, key in URL fragment)
- QR-based device pairing — no account, no install
- Two-way transfer within a single session
- Clipboard sharing
- Multiple file transfer with ZIP download
- Cross-browser support (Chromium, Firefox)
- Automatic encrypted relay fallback when direct WebRTC is blocked

**Known limitations**

- The relay runs as a single instance by default (in-memory stores). Set `STORE_BACKEND=redis` with a `REDIS_URL` for persistence and horizontal scaling.
- A TURN server is not deployed by default, so some symmetric-NAT pairs fall back to the relay.
- Edge and Safari have not been validated in this environment (the code uses only baseline Web Crypto, WebRTC, and WebSocket APIs).
- Transfers of very large files (e.g. 15 GB) have not been manually validated; the chunked transfer path is size-agnostic.

**Next**

- Redis-backed relay (persistence + scale-out) — already supported via `STORE_BACKEND=redis`
- TURN server for restrictive networks
- Resume interrupted transfers
- Better observability

---

## License

MIT
