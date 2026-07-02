const crypto = require('crypto');
const logger = require('../logger');

const MAX_VIEWS = 500;
// ponytail: the in-memory MAX_TOTAL_VIEW_BYTES cap guards relay RAM. In Redis
// mode the blobs live in Redis, not relay RAM, so that specific DoS vector does
// not apply here. Redis has its own maxmemory policy. Add a byte counter back if
// a shared Redis instance needs bounding.
const MAX_TOTAL_VIEW_BYTES = 300 * 1024 * 1024;

const key = (id) => `peek:view:${id}`;
const IDS_SET = 'peek:views';

function createRedisViewStore(client) {
  function dropView(id) {
    return Promise.all([
      client.del(key(id)),
      client.sRem(IDS_SET, id),
    ]).then(([n]) => n > 0).catch((err) => {
      logger.error({ err, event: 'redis_dropView' }, 'redisViewStore.dropView failed');
      return false;
    });
  }

  async function createView({ encryptedBlob, filename, mimeType, expiresIn, onceOnly }) {
    const blobSize = encryptedBlob.length;
    try {
      const count = await client.sCard(IDS_SET);
      if (count >= MAX_VIEWS) {
        return null;
      }
      const id = crypto.randomBytes(12).toString('hex');
      const uploadToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + expiresIn * 60 * 1000;
      const ttlSec = expiresIn * 60;
      const view = {
        id,
        uploadToken,
        encryptedBlob: encryptedBlob.toString('base64'),
        filename,
        mimeType,
        expiresAt,
        onceOnly,
        viewCount: 0,
      };
      await client.set(key(id), JSON.stringify(view), { EX: ttlSec });
      await client.sAdd(IDS_SET, id);
      return { id, uploadToken, expiresAt };
    } catch (err) {
      logger.error({ err, event: 'redis_createView' }, 'redisViewStore.createView failed');
      return null;
    }
  }

  async function getView(id) {
    try {
      const raw = await client.get(key(id));
      if (!raw) {
        return null;
      }
      const view = JSON.parse(raw);
      if (view.expiresAt <= Date.now()) {
        await dropView(id);
        return null;
      }
      view.encryptedBlob = Buffer.from(view.encryptedBlob, 'base64');
      return view;
    } catch (err) {
      logger.error({ err, event: 'redis_getView' }, 'redisViewStore.getView failed');
      return null;
    }
  }

  async function deleteView(id) {
    try {
      const raw = await client.get(key(id));
      if (!raw) {
        return false;
      }
      return await dropView(id);
    } catch (err) {
      logger.error({ err, event: 'redis_deleteView' }, 'redisViewStore.deleteView failed');
      return false;
    }
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

  // ponytail: read-modify-write, not atomic. Matches in-memory semantics (single
  // event loop). Two concurrent increments could lose one; acceptable for view
  // counters. Use INCR on a separate counter key if exactness matters.
  async function incrementViewCount(id) {
    try {
      const raw = await client.get(key(id));
      if (!raw) {
        return false;
      }
      const view = JSON.parse(raw);
      view.viewCount = (view.viewCount || 0) + 1;
      const ttl = Math.max(1, Math.ceil((view.expiresAt - Date.now()) / 1000));
      await client.set(key(id), JSON.stringify(view), { EX: ttl });
      return true;
    } catch (err) {
      logger.error({ err, event: 'redis_incrementViewCount' }, 'redisViewStore.incrementViewCount failed');
      return false;
    }
  }

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
  createRedisViewStore,
};