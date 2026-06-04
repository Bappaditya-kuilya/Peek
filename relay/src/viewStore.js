const crypto = require('crypto');

const MAX_VIEWS = 500;
const views = new Map();

function createView({ encryptedBlob, filename, mimeType, expiresIn, onceOnly }) {
  if (views.size >= MAX_VIEWS) {
    views.delete(views.keys().next().value);
  }

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
    viewCount: 0,
  });

  return { id, uploadToken, expiresAt };
}

function getView(id) {
  const view = views.get(id) || null;
  if (!view) {
    return null;
  }

  if (view.expiresAt <= Date.now()) {
    views.delete(id);
    return null;
  }

  return view;
}

function deleteView(id) {
  return views.delete(id);
}

function validateUploadToken(id, token) {
  const view = getView(id);
  if (!view) {
    return false;
  }

  const expected = Buffer.from(view.uploadToken);
  const actual = Buffer.from(String(token || ''));
  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

function cleanupExpiredViews() {
  const now = Date.now();
  for (const [id, view] of views.entries()) {
    if (view.expiresAt <= now) {
      views.delete(id);
    }
  }
}

setInterval(cleanupExpiredViews, 5 * 60 * 1000);

module.exports = {
  MAX_VIEWS,
  createView,
  deleteView,
  getView,
  validateUploadToken,
};
