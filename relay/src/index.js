const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { handleWebSocket } = require('./relay');
const {
  createSession,
  killSession,
  lookupSessionByCode,
} = require('./session');
const {
  allowedOrigins,
  isAllowedOrigin,
  sessionCreateLimiter,
} = require('./security');

const app = express();
app.use(express.json());

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

app.post('/session/lookup', (req, res) => {
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
  const ok = killSession(req.params.id, 'Session ended', 4000);
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
  console.log(`Passr relay running on port ${port}`);
});
