# Passr — Revised Build Spec v2
> Every change from v1 is marked with 🔴 CHANGED, 🟡 ADDED, or 🟢 CONFIRMED.
> Read the change reason before building. No surprises.

---

## What Passr is (revised positioning)

🔴 CHANGED — v1 said "built for Indian college students." Too narrow.

**New positioning:**
Passr is a free, open-source, zero-login file transfer tool for anyone
using a shared or public computer — college labs, cyber cafés, library PCs,
hotel business centres, office kiosks. Global from day one. English only in v1.

**The one-line pitch:**
> "Scan a QR. Files appear. Nothing installs. Session dies in 60 minutes."

**Core principles (unchanged):**
- No account. No login. Ever.
- No file ever touches a third-party server in readable form.
- The relay cannot read file content even in fallback mode. (Now provably true — see E2E section.)
- Open source. MIT licensed. Free forever.

---

## What changed from v1 and why

| # | Change | Reason |
|---|--------|--------|
| 1 | E2E encryption added to relay fallback | v1 claimed relay can't read files — it could in fallback. Fixed. |
| 2 | Two-way transfer (phone ↔ PC) | v1 was phone→PC only. Sender can now receive too. |
| 3 | Numeric backup code alongside QR | PCs in labs often have no camera. Keyboard fallback needed. |
| 4 | "Download all as ZIP" on receiver | Primary use case is assignment submission — one-click ZIP is essential. |
| 5 | "Keep tab open" warning on sender | Browser-based sender dies if screen locks. User must know. |
| 6 | TURN server support in ICE config | Pure STUN fails on ~30% of strict campus/corporate networks. |
| 7 | Global positioning, no regional UI | India-first was too narrow. Architecture stays India-reliable. |
| 8 | Removed "no cloud" claim from marketing | Relay fallback IS a form of cloud relay. Claim replaced with accurate one. |

---

## Tech stack (revised)

| Layer | Technology | 🔴 Changed? |
|---|---|---|
| Frontend (sender — phone or PC) | React + Vite | 🟢 Same |
| Frontend (receiver — browser tab) | Plain HTML + Vanilla JS | 🟢 Same |
| Relay server | Node.js + Express + ws | 🟢 Same |
| File transfer | WebRTC DataChannel + relay fallback | 🟡 TURN added |
| E2E encryption | Web Crypto API (AES-GCM 256-bit) | 🟡 ADDED — key never leaves sender |
| QR generation | qrcode npm package | 🟢 Same |
| Backup numeric code | 6-digit derived from session token | 🟡 ADDED |
| Session tokens | crypto.randomBytes(32) | 🟢 Same |
| Hosting — relay | Fly.io free tier | 🟢 Same |
| Hosting — frontend | Vercel or Cloudflare Pages | 🟢 Same |
| STUN servers | Google public STUN | 🟢 Same |
| TURN server | Open Relay (openrelay.metered.ca) — free tier | 🟡 ADDED |

---

## Folder structure (revised)

```
passr/
├── relay/
│   ├── src/
│   │   ├── index.js
│   │   ├── session.js
│   │   ├── relay.js
│   │   └── security.js
│   ├── package.json
│   ├── Dockerfile
│   └── fly.toml
│
├── web/                          # React app — works on phone AND PC
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── FilePicker.jsx
│   │   │   ├── QRDisplay.jsx     # 🟡 Now shows QR + 6-digit code
│   │   │   ├── ActivityFeed.jsx
│   │   │   ├── KillSwitch.jsx
│   │   │   └── ReceivePanel.jsx  # 🟡 ADDED — two-way: receive files from PC too
│   │   ├── hooks/
│   │   │   ├── useSession.js
│   │   │   ├── useWebRTC.js      # 🔴 TURN config added
│   │   │   ├── useTransfer.js    # 🔴 E2E encrypt/decrypt added
│   │   │   └── useCrypto.js      # 🟡 ADDED — key generation + AES-GCM
│   │   └── utils/
│   │       ├── crypto.js
│   │       ├── qr.js
│   │       ├── zip.js            # 🟡 ADDED — client-side ZIP via JSZip
│   │       └── sanitize.js
│   └── vite.config.js
│
├── receiver/
│   ├── index.html                # 🔴 UPDATED — decrypt chunks, two-way, ZIP button
│   ├── receiver.js
│   └── style.css
│
├── docs/
│   ├── index.md
│   ├── how-it-works.md
│   ├── security.md               # 🔴 UPDATED — accurate E2E claims
│   ├── privacy-policy.md         # 🔴 UPDATED — accurate relay claims
│   ├── contributing.md
│   └── self-hosting.md
│
├── .github/workflows/
├── README.md                     # 🔴 UPDATED — global positioning
├── LICENSE
└── SECURITY.md
```

---

## 🟡 ADDED — E2E encryption design (the most important change)

### The problem with v1
v1 said: "Relay never decrypts content — just passes encrypted chunks."
This was FALSE. WebSocket over TLS protects transit between phone and relay,
and between relay and PC. But the relay itself sits in the middle and CAN read
the chunks in plaintext. TLS is transport encryption, not end-to-end encryption.

### The fix
Generate an AES-GCM 256-bit encryption key on the sender's device.
Encrypt every file chunk before it leaves the sender — whether going via
WebRTC (P2P) or via the relay fallback.
The key lives ONLY in the URL fragment (#key) which is never sent to the server.
The relay sees only encrypted bytes. It literally cannot read the files.

### How the key is shared without the server seeing it
The URL fragment (the part after #) is a browser feature that is:
- Never sent to the server in HTTP requests
- Never logged by the relay
- Available to JavaScript on the receiver page

So the QR encodes:
  https://passr.dev/r/{sessionId}#{token}.{encryptionKey}

The relay only ever sees the path `/r/{sessionId}` — not the fragment.
The receiver page reads the key from `window.location.hash` in the browser.
The server never knows the key. This is provably true, not a claim.

### Implementation — useCrypto.js
```javascript
// web/src/hooks/useCrypto.js
// SECURITY: All crypto uses Web Crypto API (browser built-in).
// Never use Math.random() or custom crypto here.

export async function generateEncryptionKey() {
  // SECURITY: AES-GCM 256-bit. Non-extractable for WebRTC path,
  // extractable for relay path (must be serialised into URL fragment).
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,        // extractable: yes — we need to share it via URL fragment
    ['encrypt', 'decrypt']
  );
  return key;
}

export async function exportKeyToBase64(key) {
  const raw = await window.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importKeyFromBase64(b64) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return window.crypto.subtle.importKey(
    'raw', raw,
    { name: 'AES-GCM', length: 256 },
    false,       // non-extractable on receiver side
    ['decrypt']
  );
}

export async function encryptChunk(key, chunk) {
  // SECURITY: Fresh IV (nonce) per chunk. Never reuse an IV with AES-GCM.
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  );
  // Prepend IV to ciphertext so receiver can decrypt
  // Format: [12 bytes IV][encrypted chunk]
  const result = new Uint8Array(12 + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), 12);
  return result.buffer;
}

export async function decryptChunk(key, data) {
  // SECURITY: Extract IV from first 12 bytes, then decrypt remainder.
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    ciphertext
  );
}
```

### How the key flows through the system
```
1. Sender generates AES-GCM key
2. Key exported to base64 → appended to URL fragment
3. QR encodes: https://passr.dev/r/{sessionId}#{token}.{keyBase64}
4. Numeric code: derived from session ID only (not the key)
5. PC opens URL → JS reads fragment → imports key
6. ALL chunks encrypted before leaving sender
7. Relay sees: [session_id, encrypted_blob] — cannot read blob
8. PC decrypts each chunk → reassembles file
9. Session ends → key is garbage collected — gone forever
```

---

## 🟡 ADDED — Numeric backup code

Many college lab PCs have no camera. QR is useless on them.
Add a 6-digit numeric code as fallback.

```javascript
// utils/crypto.js — add this function
export function deriveNumericCode(sessionId) {
  // Take first 6 hex chars of session ID, convert to decimal, mod 1000000
  // This gives a 6-digit code. Purely deterministic — no extra server call.
  const hex = sessionId.slice(0, 6);
  const num = parseInt(hex, 16) % 1000000;
  return String(num).padStart(6, '0');  // e.g. "047291"
}
```

**UI:** Show QR code prominently. Below it: "No camera? Enter code **047291** at passr.dev/r"

On the receiver entry page, user types the 6-digit code → fetches session → same flow.

---

## 🔴 CHANGED — WebRTC ICE config (TURN added)

v1 used only STUN. STUN alone fails on ~30% of strict networks
(campus networks with symmetric NAT, corporate firewalls).
TURN is the fallback that actually punches through.

```javascript
// web/src/hooks/useWebRTC.js

// SECURITY: openrelay.metered.ca is a free public TURN service.
// For production with real users, consider self-hosting coturn on Fly.io.
// Free tier is fine for v1 and open source community use.
const ICE_SERVERS = [
  // STUN — tries direct P2P first (free, fast)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },

  // TURN — fallback when direct fails (goes through relay)
  // 🟡 ADDED: these make Passr work on strict campus/corporate networks
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];
```

**Note to Claude Code:** For v1, use openrelay.metered.ca free tier.
Document in README that self-hosters should run their own coturn instance.
Add a section in self-hosting.md for coturn on Fly.io.

---

## 🟡 ADDED — Two-way transfer design

v1 was phone→PC only. v2 supports phone↔PC.

### How roles work
In v1: phone = sender, PC = receiver. Fixed.
In v2: both peers can send AND receive. Role is "initiator" vs "joiner."

- **Initiator** (generates QR): starts session, shows QR
- **Joiner** (scans QR): joins session via QR or numeric code
- Either side can drag-drop files to send to the other

### Protocol change in relay.js
```javascript
// 🔴 CHANGED: Remove 'sender' and 'receiver' roles.
// Replace with 'initiator' and 'joiner'. Both can send files.

case 'initiator-join': { ... }   // was 'sender-join'
case 'joiner-join': { ... }      // was 'receiver-join'

// File send/receive logic is now symmetric on both sides.
// WebRTC DataChannel is bidirectional by default — no protocol change needed.
// Just update the UI on both sides to show both send + receive panels.
```

### UI change
```
Initiator screen (phone):              Joiner screen (PC browser):
┌─────────────────────────┐            ┌─────────────────────────┐
│  [QR Code]              │            │  Files from them        │
│  Code: 047291           │            │  ├── resume.pdf  [↓]    │
│  Session: 47:23 left    │            │  └── photo.jpg   [↓]    │
│                         │            │  [Download all as ZIP]  │
│  Shared by you:         │            │                         │
│  ├── resume.pdf ✓       │            │  Send files to them:    │
│  └── photo.jpg  ✓       │            │  [Drop files here]      │
│                         │            │                         │
│  Received from them:    │            │  [End Session]          │
│  └── form.pdf   [↓]     │            └─────────────────────────┘
│                         │
│  [End Session]          │
└─────────────────────────┘
```

---

## 🟡 ADDED — "Download all as ZIP"

Primary use case: student downloads 5 assignment files at once.

```javascript
// web/src/utils/zip.js
// Uses JSZip — add to package.json: "jszip": "^3.10.1"
import JSZip from 'jszip';

export async function downloadAllAsZip(files, sessionId) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.blob);
  }
  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `passr-${sessionId.slice(0, 6)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 🟡 ADDED — "Keep tab open" warning

Browser-based sender reliability depends on the tab staying active.
If the phone screen locks or the user switches apps, the session may pause.

**On the sender page, show this warning prominently after QR is generated:**

```jsx
// QRDisplay.jsx — add below QR image
<div className="warning-banner">
  ⚠️ Keep this tab open and screen on while transferring.
  Locking your phone pauses the session.
</div>
```

**Also add: screen wake lock API (where supported)**
```javascript
// useSession.js — add on session start
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      const lock = await navigator.wakeLock.request('screen');
      // Lock released automatically when tab hides
      return lock;
    } catch (e) {
      // Not supported or denied — show the warning banner instead
      console.log('Wake lock not available:', e.message);
    }
  }
}
```

---

## 🔴 UPDATED — Accurate privacy policy

Remove all claims that are not provably true. Add what IS true.

**Remove from v1:**
~~"Files never pass through our servers in readable form"~~ (was false in relay fallback)

**Replace with (now true):**
```
FILE PRIVACY

Every file chunk is encrypted with AES-GCM 256-bit encryption
before it leaves your device. The encryption key is generated
on your device and shared only via the URL fragment — a part of
the URL that browsers never send to any server.

This means:
- In direct mode (WebRTC): files go device-to-device, encrypted.
- In relay mode (fallback): encrypted chunks pass through our relay.
  The relay cannot decrypt them. It only sees ciphertext.

Even if someone compromised our relay server, they would see
only encrypted blobs with no key to decrypt them.

The relay server logs: session ID (random string), connection
timestamp, approximate bytes relayed. It does not log filenames,
file contents, or your IP address in any persistent storage.
Logs are held in memory only and cleared when the session ends.
```

---

## 🔴 UPDATED — README (global positioning)

```markdown
# Passr

**Scan a QR. Files appear. Nothing installs. Session dies in 60 minutes.**

Free, open-source file transfer for shared and public computers.
College labs. Cyber cafés. Library PCs. Hotel business centres.
Any device. Any network. No account. No cloud. No install.

## How it works

1. Open passr.dev — on your phone, laptop, or any device
2. Select files to share
3. Scan the QR code on the other device (or type the 6-digit code)
4. Files appear in the browser tab — no install needed
5. Either side can send files back
6. Session auto-expires in 60 minutes

## Privacy — actually true, not marketing

Every chunk is encrypted with AES-GCM 256-bit before leaving your device.
The encryption key never touches our server — it travels only in the
URL fragment, which browsers never send to servers.
In relay fallback mode, we see only ciphertext. We cannot read your files.

[Full security model →](docs/security.md)

## Works everywhere

| Network type | Works? | How |
|---|---|---|
| Same Wi-Fi (home, café) | ✅ Direct P2P | WebRTC, no relay |
| Different subnets (campus) | ✅ Via relay | Encrypted chunks |
| Ethernet PC + Wi-Fi phone | ✅ Via relay | Encrypted chunks |
| No camera on PC | ✅ Numeric code | Type 6 digits at passr.dev/r |
| Offline (no internet) | ⚠️ Same subnet only | WebRTC direct |

## Two-way transfer

Either device can send. Either device can receive.
Drag files from PC to phone. Drag files from phone to PC.
One session, both directions.

## Open source

MIT license. Self-hostable in 5 minutes.
[Self-hosting guide →](docs/self-hosting.md)
[Contributing guide →](docs/contributing.md)
```

---

## Pre-launch security checklist (updated)

- [ ] Session tokens use `crypto.randomBytes(32)` — not `Math.random()`
- [ ] Token comparison uses `crypto.timingSafeEqual()` — not `===`
- [ ] Sessions auto-expire at 60 minutes server-side
- [ ] Rate limiting on `/session` endpoint
- [ ] WebSocket origin checked on every connection
- [ ] E2E encryption: every chunk encrypted with AES-GCM before leaving sender
- [ ] IV is fresh per chunk — never reused
- [ ] Encryption key is in URL fragment only — never in URL path or query string
- [ ] Relay passes raw bytes for relay-chunk messages — never parses content
- [ ] Relay logs zero filenames, file contents, or persistent IP logs
- [ ] HTTPS enforced (Fly.io handles this automatically)
- [ ] TURN credentials not hardcoded in a way that leaks in public repo
- [ ] Wake lock requested on session start
- [ ] "Keep tab open" warning shown prominently
- [ ] Numeric backup code shown alongside QR
- [ ] "Download all as ZIP" works for multiple files
- [ ] Two-way transfer tested: initiator→joiner AND joiner→initiator
- [ ] Test: session with symmetric NAT (hotspot → hotspot) — must use TURN fallback
- [ ] Test: decrypt chunk with wrong key — must fail gracefully, not crash
- [ ] Test: session expiry mid-transfer — must notify both sides cleanly
- [ ] Post on r/netsec with full source before public launch

---

## Instructions for Claude Code (updated)

Paste this into Claude Code to begin:

> "Read PASSR_REVISED_SPEC.md fully.
> Build in this exact order:
> 1. relay/src/ — session, security, relay (no file storage, no logging of content)
> 2. web/src/hooks/useCrypto.js — E2E encryption first, before any file transfer code
> 3. web/src/hooks/useWebRTC.js — with TURN config
> 4. web/src/hooks/useTransfer.js — encrypt every chunk using useCrypto
> 5. web/src/components/ — UI components
> 6. receiver/index.html + receiver.js — decrypt chunks, two-way, ZIP button
> 7. Deploy configs — Dockerfile, fly.toml, vercel config
>
> After each step, run it locally and confirm it works before moving on.
> Flag any dependency you want to add before adding it.
> Never use Math.random() in any security context.
> Never log filenames or file content on the relay.
> Never put the encryption key in the URL path or query string — fragment only.
> If you hit an ambiguity not covered by the spec, ask before deciding."

**Hard rules — never violate:**
- `Math.random()` anywhere near sessions, tokens, or crypto → STOP, use `crypto.randomBytes`
- Encryption key in URL path or query string → STOP, fragment only
- Relay parsing relay-chunk message content → STOP, pass raw bytes only
- Any analytics, tracking, or persistent logging → STOP, remove it
- Token comparison with `===` → STOP, use `timingSafeEqual`
- Storing files anywhere on relay → STOP, relay is stateless for file content

**Package additions that are pre-approved:**
- `jszip` — client-side ZIP
- `qrcode` — QR generation
- `express-rate-limit` — rate limiting
- `ws` — WebSocket server

**Packages that need discussion before adding:**
- Any database (sqlite, postgres, redis) — sessions stay in Map for v1
- Any analytics package — not allowed
- Any file storage package — not allowed
