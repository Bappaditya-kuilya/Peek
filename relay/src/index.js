const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { handleWebSocket } = require('./relay');
const {
  getSession,
  createSession,
  killSession,
  lookupSessionByCode,
  validateToken,
} = require('./session');
const {
  createView,
  deleteView,
  getView,
  validateUploadToken,
} = require('./viewStore');
const {
  allowedOrigins,
  isAllowedOrigin,
  sessionCreateLimiter,
  sessionLookupLimiter,
  viewDeleteLimiter,
  viewFetchLimiter,
  viewUploadLimiter,
} = require('./security');

const app = express();
const TEN_MB = 10 * 1024 * 1024;

app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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

app.post('/session', sessionCreateLimiter, (req, res) => {
  const fileCount = Number.isFinite(req.body?.fileCount) ? Math.max(0, Number(req.body.fileCount)) : 0;
  const session = createSession(fileCount);
  res.json({
    sessionId: session.id,
    token: session.token,
    numericCode: session.numericCode,
    expiresAt: session.expiresAt,
  });
});

app.post('/session/lookup', sessionLookupLimiter, (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Invalid code' });
    return;
  }

  const result = lookupSessionByCode(code);
  if (!result) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(result);
});

app.delete('/session/:id', (req, res) => {
  const token = String(req.body?.token || '');
  const session = getSession(req.params.id);
  if (!session || !validateToken(req.params.id, token)) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }
  const ok = killSession(req.params.id, 'Session ended', 4000);
  res.json({ ok });
});

app.post(
  '/view',
  viewUploadLimiter,
  express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  (req, res) => {
    const encryptedBlob = Buffer.from(req.body || []);
    const filename = String(req.headers['x-filename'] || '').trim();
    const mimeType = String(req.headers['x-mime-type'] || '').trim();
    const expiresInRaw = Number(req.headers['x-expires-in']);
    const onceOnly = String(req.headers['x-once-only'] || '').toLowerCase() === 'true';

    if (!filename || !mimeType || !Number.isFinite(expiresInRaw)) {
      res.status(400).json({ error: 'Missing required view metadata' });
      return;
    }

    const expiresIn = Math.floor(expiresInRaw);
    if (expiresIn < 1 || expiresIn > 60) {
      res.status(400).json({ error: 'Invalid expiry' });
      return;
    }

    if (!encryptedBlob.length || encryptedBlob.length > TEN_MB) {
      res.status(413).json({ error: 'Encrypted Peek payload too large' });
      return;
    }

    const view = createView({
      encryptedBlob,
      expiresIn,
      filename,
      mimeType,
      onceOnly,
    });

    res.status(201).json(view);
  }
);

app.get('/view/:id', viewFetchLimiter, (req, res) => {
  const view = getView(req.params.id);
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
  res.on('finish', () => {
    view.viewCount += 1;
    if (view.onceOnly) {
      deleteView(req.params.id);
    }
  });
  res.end();
});

app.delete('/view/:id', viewDeleteLimiter, express.json({ limit: '32kb' }), (req, res) => {
  const token = String(req.body?.uploadToken || '');
  if (!validateUploadToken(req.params.id, token)) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }

  const ok = deleteView(req.params.id);
  res.json({ ok });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, allowedOrigins });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', handleWebSocket);

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Peek relay running on port ${port}`);
});
