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

module.exports = {
  allowedOrigins,
  isAllowedOrigin,
  sessionCreateLimiter,
  sessionLookupLimiter,
  viewDeleteLimiter,
  viewFetchLimiter,
  viewUploadLimiter,
};
