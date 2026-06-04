const crypto = require('crypto');
const { MAX_VIEWS } = require('./inMemoryViewStore');

const VIEW_KEY_PREFIX = 'peek:view:';

function createRedisViewStore({ redis }) {
  function getViewKey(id) {
    return `${VIEW_KEY_PREFIX}${id}`;
  }

  async function createView({ encryptedBlob, filename, mimeType, expiresIn, onceOnly }) {
    const id = crypto.randomBytes(12).toString('hex');
    const uploadToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + expiresIn * 60 * 1000;
    const ttlSeconds = Math.max(expiresIn * 60, 1);
    const serialized = JSON.stringify({
      id,
      uploadToken,
      encryptedBlob: Buffer.from(encryptedBlob).toString('base64'),
      filename,
      mimeType,
      expiresAt,
      onceOnly,
      viewCount: 0,
    });

    await redis.set(getViewKey(id), serialized, { EX: ttlSeconds });
    return { id, uploadToken, expiresAt };
  }

  async function getView(id) {
    const encoded = await redis.get(getViewKey(id));
    if (!encoded) {
      return null;
    }

    const view = JSON.parse(encoded);
    if (view.expiresAt <= Date.now()) {
      await redis.del(getViewKey(id));
      return null;
    }

    return {
      ...view,
      encryptedBlob: Buffer.from(view.encryptedBlob, 'base64'),
    };
  }

  async function deleteView(id) {
    const deleted = await redis.del(getViewKey(id));
    return deleted > 0;
  }

  async function validateUploadToken(id, token) {
    const view = await getView(id);
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

  async function incrementViewCount(id) {
    const view = await getView(id);
    if (!view) {
      return false;
    }

    view.viewCount += 1;
    const ttlSeconds = Math.max(Math.ceil((view.expiresAt - Date.now()) / 1000), 1);
    await redis.set(
      getViewKey(id),
      JSON.stringify({
        ...view,
        encryptedBlob: Buffer.from(view.encryptedBlob).toString('base64'),
      }),
      { EX: ttlSeconds }
    );
    return true;
  }

  return {
    MAX_VIEWS,
    createView,
    deleteView,
    getView,
    incrementViewCount,
    validateUploadToken,
  };
}

module.exports = {
  createRedisViewStore,
};
