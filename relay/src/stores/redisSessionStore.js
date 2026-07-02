const crypto = require('crypto');
const logger = require('../logger');

const SESSION_TTL_MS = 60 * 60 * 1000;
const SESSION_TTL_SEC = Math.ceil(SESSION_TTL_MS / 1000);

const key = (id) => `peek:session:${id}`;

function createRedisSessionStore(client) {
  function generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  function canJoinRole(session, role) {
    if (!session) {
      return false;
    }
    if (role === 'initiator') {
      return !session.initiatorJoinedAt;
    }
    if (role === 'joiner') {
      return !session.joinerJoinedAt;
    }
    return false;
  }

  async function createSession(fileCount = 0) {
    const id = generateSessionId();
    const token = generateToken();
    const now = Date.now();
    const session = {
      id,
      token,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      initiatorJoinedAt: null,
      joinerJoinedAt: null,
      fileCount,
    };
    try {
      await client.set(key(id), JSON.stringify(session), { EX: SESSION_TTL_SEC });
    } catch (err) {
      logger.error({ err, event: 'redis_createSession' }, 'redisSessionStore.createSession failed');
      return null;
    }
    return session;
  }

  async function getSession(sessionId) {
    try {
      const raw = await client.get(key(sessionId));
      if (!raw) {
        return null;
      }
      const session = JSON.parse(raw);
      if (session.expiresAt < Date.now()) {
        await client.del(key(sessionId));
        return null;
      }
      return session;
    } catch (err) {
      logger.error({ err, event: 'redis_getSession' }, 'redisSessionStore.getSession failed');
      return null;
    }
  }

  async function updateSession(sessionId, patch) {
    try {
      const raw = await client.get(key(sessionId));
      if (!raw) {
        return null;
      }
      const session = Object.assign(JSON.parse(raw), patch);
      await client.set(key(sessionId), JSON.stringify(session), { KEEPTTL: true });
      return session;
    } catch (err) {
      logger.error({ err, event: 'redis_updateSession' }, 'redisSessionStore.updateSession failed');
      return null;
    }
  }

  function markRoleJoined(sessionId, role) {
    if (role === 'initiator') {
      return updateSession(sessionId, { initiatorJoinedAt: Date.now() });
    }
    if (role === 'joiner') {
      return updateSession(sessionId, { joinerJoinedAt: Date.now() });
    }
    return Promise.resolve(null);
  }

  async function validateToken(sessionId, token) {
    const session = await getSession(sessionId);
    if (!session) {
      return false;
    }
    const expected = Buffer.from(session.token);
    const actual = Buffer.from(token || '');
    if (expected.length !== actual.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, actual);
  }

  function lookupSessionByCode() {
    // Numeric-code lookup has been removed. See inMemorySessionStore for context.
    return null;
  }

  async function killSession(sessionId) {
    try {
      const count = await client.del(key(sessionId));
      return count > 0;
    } catch (err) {
      logger.error({ err, event: 'redis_killSession' }, 'redisSessionStore.killSession failed');
      return false;
    }
  }

  return {
    SESSION_TTL_MS,
    canJoinRole,
    createSession,
    getSession,
    killSession,
    lookupSessionByCode,
    markRoleJoined,
    updateSession,
    validateToken,
  };
}

module.exports = {
  SESSION_TTL_MS,
  createRedisSessionStore,
};