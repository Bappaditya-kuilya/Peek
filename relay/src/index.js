const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { handleWebSocket } = require('./relay');
const {
  getSession,
  createSession,
  killSession,
  validateToken,
} = require('./session');
const {
  createView,
  deleteView,
  getView,
  incrementViewCount,
  validateUploadToken,
} = require('./viewStore');
const {
  allowedOrigins,
  getRequestIp,
  isAllowedOrigin,
  requireAllowedOrigin,
  sessionCreateLimiter,
  trustProxy,
  viewDeleteLimiter,
  viewFetchLimiter,
  viewUploadLimiter,
} = require('./security');

const app = express();
const MAX_VIEW_BYTES = 50 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 180;

// A small allowlist of MIME types we are willing to echo back verbatim in the
// Content-Type-ish X-Mime-Type header. Anything outside this set is collapsed to
// application/octet-stream so the relay can never be coaxed into advertising an
// active content type (e.g. text/html) for an attacker-supplied blob. The blob
// is always served as application/octet-stream regardless; this header is only a
// hint the client uses to pick a preview vs. a plain download.
const PREVIEWABLE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function normalizeViewMimeType(mimeType = '') {
  const normalizedMimeType = String(mimeType).trim().toLowerCase();
  if (normalizedMimeType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (PREVIEWABLE_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType;
  }
  return 'application/octet-stream';
}

app.set('trust proxy', trustProxy);
app.use(express.json({ limit: '256kb' }));

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Expires-In, X-Filename, X-Mime-Type, X-Once-Only'
  );
  res.header(
    'Access-Control-Expose-Headers',
    'X-Filename, X-Mime-Type, X-Expires-At, X-Once-Only'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use('/view/:id', (req, res, next) => {
  req.url = req.path;
  next();
});

app.post('/session', requireAllowedOrigin, sessionCreateLimiter, async (req, res) => {
  const fileCountRaw = Number(req.body?.fileCount);
  if (!Number.isFinite(fileCountRaw) || fileCountRaw < 0 || fileCountRaw > 500) {
    res.status(400).json({ error: 'Invalid file count' });
    return;
  }

  const fileCount = Math.floor(fileCountRaw);
  const session = await createSession(fileCount);
  res.json({
    sessionId: session.id,
    token: session.token,
    numericCode: session.numericCode,
    expiresAt: session.expiresAt,
  });
});

app.delete('/session/:id', requireAllowedOrigin, async (req, res) => {
  if (!/^[a-f0-9]{16}$/i.test(req.params.id)) {
    res.status(400).json({ ok: false, error: 'Invalid session id' });
    return;
  }
  const token = String(req.body?.token || '');
  const session = await getSession(req.params.id);
  if (!session || !(await validateToken(req.params.id, token))) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }
  const ok = await killSession(req.params.id, 'Session ended', 4000);
  res.json({ ok });
});

app.post(
  '/view',
  requireAllowedOrigin,
  viewUploadLimiter,
  express.raw({ type: 'application/octet-stream', limit: '50mb' }),
  async (req, res) => {
    const encryptedBlob = Buffer.from(req.body || []);
    const filename = String(req.headers['x-filename'] || '').trim().replace(/[^\x20-\x7E]+/g, '').slice(0, MAX_FILENAME_LENGTH);
    const mimeType = normalizeViewMimeType(req.headers['x-mime-type'] || '');
    const expiresInRaw = Number(req.headers['x-expires-in']);
    const onceOnly = String(req.headers['x-once-only'] || '').toLowerCase() === 'true';

    if (!filename || !Number.isFinite(expiresInRaw)) {
      res.status(400).json({ error: 'Missing required view metadata' });
      return;
    }

    const expiresIn = Math.floor(expiresInRaw);
    if (expiresIn < 1 || expiresIn > 60) {
      res.status(400).json({ error: 'Invalid expiry' });
      return;
    }

    if (!encryptedBlob.length || encryptedBlob.length > MAX_VIEW_BYTES) {
      res.status(413).json({ error: 'Encrypted Peek payload too large' });
      return;
    }

    const view = await createView({
      encryptedBlob,
      expiresIn,
      filename,
      mimeType,
      onceOnly,
    });

    if (!view) {
      res.status(507).json({ error: 'Relay storage is full. Try again shortly.' });
      return;
    }

    res.status(201).json(view);
  }
);

app.get('/view/:id', viewFetchLimiter, async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid view id' });
    return;
  }
  const view = await getView(req.params.id);
  if (!view) {
    res.status(410).json({ error: 'Peek expired or unavailable' });
    return;
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Filename', view.filename);
  res.setHeader('X-Mime-Type', view.mimeType);
  res.setHeader('X-Expires-At', String(view.expiresAt));
  res.setHeader('X-Once-Only', view.onceOnly ? 'true' : 'false');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.write(view.encryptedBlob);
  res.on('finish', async () => {
    await incrementViewCount(req.params.id);
    if (view.onceOnly) {
      await deleteView(req.params.id);
    }
  });
  res.end();
});

app.delete('/view/:id', requireAllowedOrigin, viewDeleteLimiter, express.json({ limit: '32kb' }), async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
    res.status(400).json({ ok: false, error: 'Invalid view id' });
    return;
  }
  const token = String(req.body?.uploadToken || '');
  if (!(await validateUploadToken(req.params.id, token))) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }

  const ok = await deleteView(req.params.id);
  res.json({ ok });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, allowedOrigins, requestIp: getRequestIp(req) });
});

async function start() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
  wss.on('connection', handleWebSocket);

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Peek relay running on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Peek relay failed to start:', error);
  process.exitCode = 1;
});
