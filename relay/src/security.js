const { createInMemoryAbuseStore } = require('./stores/inMemoryAbuseStore');

const defaultOrigins = process.env.NODE_ENV === 'production'
  ? 'https://peek.dev,https://*.vercel.app'
  : 'https://peek.dev,https://*.vercel.app,http://localhost:5173,http://localhost:5174,http://*.local:5173,http://*.local:5174,http://192.168.*.*:5173,http://192.168.*.*:5174,http://10.*.*.*:5173,http://10.*.*.*:5174';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
let activeAbuseStore = createInMemoryAbuseStore();

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

function originMatchesAllowedPattern(origin, pattern) {
  if (origin === pattern) {
    return true;
  }

  if (!pattern.includes('*')) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const parsedPattern = new URL(pattern);

    if (parsedOrigin.protocol !== parsedPattern.protocol) {
      return false;
    }

    if (parsedOrigin.port !== parsedPattern.port) {
      return false;
    }

    const hostnamePattern = parsedPattern.hostname;

    if (hostnamePattern.startsWith('*.')) {
      const suffix = hostnamePattern.slice(1);
      return parsedOrigin.hostname.endsWith(suffix);
    }

    const escapedPattern = hostnamePattern
      .split('.')
      .map((segment) => {
        if (segment === '*') {
          return '[^.]+';
        }
        return segment.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
      })
      .join('\\.');

    return new RegExp(`^${escapedPattern}$`, 'i').test(parsedOrigin.hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  return allowedOrigins.some((allowedOrigin) => originMatchesAllowedPattern(origin, allowedOrigin));
}

function requireAllowedOrigin(req, res, next) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin || !isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Forbidden origin' });
    return;
  }
  next();
}

function getAbuseStore() {
  return activeAbuseStore;
}

function setAbuseStore(store) {
  activeAbuseStore = store;
}

function createRateLimiter({ bucket, windowMs, max, message }) {
  return async (req, res, next) => {
    const key = `${bucket}:${getRequestIp(req)}`;
    const result = await activeAbuseStore.consume(key, windowMs, max);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(Math.max(Math.ceil((result.resetAt - Date.now()) / 1000), 0)));

    if (!result.allowed) {
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}

const sessionCreateLimiter = createRateLimiter({
  bucket: 'session-create',
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many sessions created. Please wait.',
});

const sessionLookupLimiter = createRateLimiter({
  bucket: 'session-lookup',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many lookup attempts. Please wait.',
});

const viewUploadLimiter = createRateLimiter({
  bucket: 'view-upload',
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many Peek uploads. Please wait.',
});

const viewFetchLimiter = createRateLimiter({
  bucket: 'view-fetch',
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many Peek views. Please wait.',
});

const viewDeleteLimiter = createRateLimiter({
  bucket: 'view-delete',
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many Peek delete attempts. Please wait.',
});

async function allowWebSocketConnection(ip) {
  return activeAbuseStore.consume(`ws-connect:${normalizeIp(ip)}`, 60 * 1000, 30);
}

async function allowWebSocketMessage(ip) {
  return activeAbuseStore.consume(`ws-message:${normalizeIp(ip)}`, 10 * 1000, 120);
}

module.exports = {
  allowedOrigins,
  allowWebSocketConnection,
  allowWebSocketMessage,
  createRateLimiter,
  createWindowCounter,
  getAbuseStore,
  getRequestIp,
  isAllowedOrigin,
  normalizeIp,
  originMatchesAllowedPattern,
  requireAllowedOrigin,
  sessionCreateLimiter,
  sessionLookupLimiter,
  setAbuseStore,
  trustProxy,
  viewDeleteLimiter,
  viewFetchLimiter,
  viewUploadLimiter,
  parseTrustProxy,
};
