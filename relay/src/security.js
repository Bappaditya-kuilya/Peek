const rateLimit = require('express-rate-limit');

const defaultOrigins = process.env.NODE_ENV === 'production'
  ? 'https://peek.dev'
  : 'https://peek.dev,http://localhost:5173,http://localhost:5174';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const baseLimiterConfig = {
  standardHeaders: true,
  legacyHeaders: false,
};

function parseTrustProxy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  const hopCount = Number(normalized);
  if (Number.isInteger(hopCount) && hopCount >= 0) {
    return hopCount;
  }
  return normalized;
}

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

function normalizeIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw) {
    return 'unknown';
  }
  return raw.replace(/^::ffff:/, '').toLowerCase();
}

function getRequestIp(req) {
  return normalizeIp(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress);
}

function createWindowCounter({ windowMs, max }) {
  const entries = new Map();

  function consume(key) {
    const normalizedKey = String(key || 'unknown');
    const now = Date.now();
    const entry = entries.get(normalizedKey);

    if (!entry || entry.resetAt <= now) {
      entries.set(normalizedKey, { count: 1, resetAt: now + windowMs });
      return {
        allowed: true,
        remaining: Math.max(max - 1, 0),
        resetAt: now + windowMs,
      };
    }

    entry.count += 1;
    const allowed = entry.count <= max;
    return {
      allowed,
      remaining: Math.max(max - entry.count, 0),
      resetAt: entry.resetAt,
    };
  }

  function reset(key) {
    entries.delete(String(key || 'unknown'));
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries.entries()) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }, Math.min(windowMs, 60 * 1000));

  cleanupTimer.unref?.();

  return {
    consume,
    reset,
  };
}

const sessionCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  ...baseLimiterConfig,
  message: {
    error: 'Too many sessions created. Please wait.',
  },
});

const sessionLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  ...baseLimiterConfig,
  message: {
    error: 'Too many lookup attempts. Please wait.',
  },
});

const viewUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  ...baseLimiterConfig,
  message: {
    error: 'Too many Peek uploads. Please wait.',
  },
});

const viewFetchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  ...baseLimiterConfig,
  message: {
    error: 'Too many Peek views. Please wait.',
  },
});

const viewDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  ...baseLimiterConfig,
  message: {
    error: 'Too many Peek delete attempts. Please wait.',
  },
});

function isAllowedOrigin(origin) {
  return allowedOrigins.includes(origin);
}

function requireAllowedOrigin(req, res, next) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin || !isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Forbidden origin' });
    return;
  }
  next();
}

const websocketConnectionLimiter = createWindowCounter({
  windowMs: 60 * 1000,
  max: 30,
});

const websocketMessageLimiter = createWindowCounter({
  windowMs: 10 * 1000,
  max: 120,
});

function allowWebSocketConnection(ip) {
  return websocketConnectionLimiter.consume(normalizeIp(ip));
}

function allowWebSocketMessage(ip) {
  return websocketMessageLimiter.consume(normalizeIp(ip));
}

module.exports = {
  allowedOrigins,
  allowWebSocketConnection,
  allowWebSocketMessage,
  createWindowCounter,
  getRequestIp,
  isAllowedOrigin,
  normalizeIp,
  requireAllowedOrigin,
  sessionCreateLimiter,
  sessionLookupLimiter,
  trustProxy,
  viewDeleteLimiter,
  viewFetchLimiter,
  viewUploadLimiter,
  parseTrustProxy,
};
