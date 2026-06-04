# Peek v2.1 — Architecture Document

**Important Rules for Claude / Codex**

- Project name is **Peek** everywhere in UI text.
- Never hardcode any domain. Use `window.location.origin` for generating view links.
- The `?k=` parameter must NEVER be read, logged, or stored by the server under any circumstances.
- Build exactly in the 12-step order. Give one-line confirmation after finishing each step.
- PDF.js must be loaded from CDN only on the `/view` page.
- Watermark must be clearly visible, repeating, and non-removable.
- Be extremely strict about "no download" — do not add any download buttons or expose blob URLs in the DOM.

**Identity Sentence:** "Peek any file without sending it. View-only. Timed. No install."

**Project Name:** Peek
**Tagline:** Show any file without sending it. View-only. Timed. No install.

**Domain Strategy:** Use Vercel/Netlify free deployment. All URLs are generated dynamically using `window.location.origin`. Relay URLs come from environment variables.

## What We Are Building

### Feature 1 — Instant Clipboard Sync

Inside an active session, text typed or pasted appears instantly on the other device (500ms debounce). No Send button. Bidirectional. Encrypted with session AES-GCM key.

### Feature 2 — View-Only Timed Share

Two modes using the same viewer:

- **Mode A (Session):** Mark a file as "Peek" inside active session.
- **Mode B (Magic Link):** Standalone upload → shareable link.

## What We Are NOT Building

- Animated QR offline transfer
- Clipboard images (text only)
- Screenshot blocking (show honest warning instead)
- Full DRM
- File types other than PDF and images in v1

## Feature 1: Instant Clipboard Sync — Details

**Relay Message**

```javascript
case 'clipboard-push': {
  // SECURITY: Never read, log, or modify msg.text
  const session = getSession(ws.sessionId);
  if (!session) break;
  const target = ws.role === 'initiator' ? session.joinerSocket : session.initiatorSocket;
  if (target && target.readyState === 1) target.send(data);
  break;
}
```

**UI (`ClipboardBar.jsx`)**

Always visible in active session.
Placeholder: "Type or paste — sends automatically..."
Shows "Received: [text]" with [Copy] button.

**Hook (`useClipboard.js`)**

500ms debounce on input.

## Feature 2: View-Only Timed Share — Details

### Magic Link Format

`https://your-vercel.app/view/{viewId}?k={encKeyBase64}`

Security Rule: Server must ignore and never log `?k=`.

### View Store (`relay/src/viewStore.js`)

```javascript
const MAX_VIEWS = 500;
const views = new Map();

function createView({ encryptedBlob, filename, mimeType, expiresIn, onceOnly }) {
  if (views.size >= MAX_VIEWS) views.delete(views.keys().next().value);
  const id = crypto.randomBytes(12).toString('hex');
  const uploadToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + expiresIn * 60 * 1000;

  views.set(id, {
    id,
    uploadToken,
    encryptedBlob,
    filename,
    mimeType,
    expiresAt,
    onceOnly,
    viewCount: 0
  });

  return { id, uploadToken, expiresAt };
}
```

### Logging Protection

```javascript
app.use('/view/:id', (req, res, next) => {
  req.url = req.path;   // Strip query string for logging
  next();
});
```

### GET `/view/:id`

```javascript
res.write(view.encryptedBlob);
res.on('finish', () => {
  view.viewCount++;
  if (view.onceOnly) deleteView(req.params.id);
});
res.end();
```

### Viewer (`receiver/view.html + view.js`)

**Watermark CSS**

```css
#watermark {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  color: rgba(0,0,0,0.14);
  font-size: 22px;
  font-weight: 700;
  transform: rotate(-32deg);
  background: repeating-linear-gradient(transparent 0px, transparent 80px, rgba(0,0,0,0.06) 80px, rgba(0,0,0,0.06) 160px);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

Always show banner:
`⚠ This is a view-only peek. Screenshots and screen recording are not prevented.`

## Session View-Only (Mode A)

- User clicks "Peek" on a file.
- Generate new AES-GCM key.
- Encrypt + upload to `/view`.
- Create magic link with `?k=`.
- Send `view-share-push` via WebSocket.
- Receiver gets button to open in new tab.

## Folder Structure (Key Additions)

- `relay/src/viewStore.js`
- `web/src/components/ClipboardBar.jsx`
- `web/src/components/ViewShare.jsx`
- `web/src/hooks/useClipboard.js`
- `web/src/utils/viewCrypto.js`
- `receiver/view.html`
- `receiver/view.js`

## Build Order (Strict)

Step 1: Add `clipboard-push` routing to relay + redeploy
Step 2: Full `viewStore.js` (`MAX_VIEWS=500`), all `/view` endpoints, rate limiting, logging protection middleware
Step 3: Clipboard crypto functions
Step 4: `ClipboardBar` + `useClipboard` hook
Step 5: Clipboard support in static receiver
Step 6: Redeploy frontend + test clipboard
Step 7: View crypto utilities
Step 8: `ViewShare` component (UI only)
Step 9: Connect `ViewShare` to real upload
Step 10: Build full `view.html` + `view.js` (watermark, PDF.js, image render, timer, errors)
Step 11: Session view-only with `view-share-push`
Step 12: Final redeploy + complete smoke test

## Security Summary

- Files encrypted client-side
- Max 10MB for Peek, 2000 chars for clipboard
- Key only in `?k=` (never logged by server)
- Server-side expiry (`410 Gone`)
- Watermark always visible
