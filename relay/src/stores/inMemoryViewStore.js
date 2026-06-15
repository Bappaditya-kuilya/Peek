const crypto = require('crypto');

const MAX_VIEWS = 500;
// Hard ceiling on the total bytes held across all live views. The relay keeps
// every encrypted blob in memory, so without this an attacker could upload many
// large Peeks and exhaust the host's RAM (a trivial DoS on a 512MB free tier).
// 300MB leaves headroom for Node, sockets, and request buffers.
const MAX_TOTAL_VIEW_BYTES = 300 * 1024 * 1024;

function createInMemoryViewStore() {
  const views = new Map();
  let totalBytes = 0;

  function dropView(id) {
    const existing = views.get(id);
    if (!existing) {
      return false;
    }
    totalBytes -= existing.encryptedBlob.length;
    return views.delete(id);
  }

  function createView({ encryptedBlob, filename, mimeType, expiresIn, onceOnly }) {
    const blobSize = encryptedBlob.length;

    // Reject rather than evict: silently dropping someone else's live Peek to
    // make room would let one uploader knock out everyone else's links.
    if (views.size >= MAX_VIEWS || totalBytes + blobSize > MAX_TOTAL_VIEW_BYTES) {
      return null;
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
    totalBytes += blobSize;

    return { id, uploadToken, expiresAt };
  }

  function getView(id) {
    const view = views.get(id) || null;
    if (!view) {
      return null;
    }

    if (view.expiresAt <= Date.now()) {
      dropView(id);
      return null;
    }

    return view;
  }

  function deleteView(id) {
    return dropView(id);
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

  function incrementViewCount(id) {
    const view = getView(id);
    if (!view) {
      return false;
    }
    view.viewCount += 1;
    return true;
  }

  function cleanupExpiredViews() {
    const now = Date.now();
    for (const [id, view] of views.entries()) {
      if (view.expiresAt <= now) {
        dropView(id);
      }
    }
  }

  const cleanupTimer = setInterval(cleanupExpiredViews, 5 * 60 * 1000);
  cleanupTimer.unref?.();

  return {
    MAX_VIEWS,
    MAX_TOTAL_VIEW_BYTES,
    createView,
    deleteView,
    getView,
    incrementViewCount,
    validateUploadToken,
  };
}

module.exports = {
  MAX_VIEWS,
  MAX_TOTAL_VIEW_BYTES,
  createInMemoryViewStore,
};
