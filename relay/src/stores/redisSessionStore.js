const crypto = require('crypto');
const { SESSION_TTL_MS } = require('./inMemorySessionStore');

const SESSION_KEY_PREFIX = 'peek:session:';
const SESSION_CODE_PREFIX = 'peek:session-code:';

function createRedisSessionStore({ redis }) {
  function generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  function deriveNumericCode(sessionId) {
    const hex = sessionId.slice(0, 6);
    const num = parseInt(hex, 16) % 1000000;
    return String(num).padStart(6, '0');
  }

  function getSessionKey(sessionId) {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }

  function getSessionCodeKey(code) {
    return `${SESSION_CODE_PREFIX}${code}`;
  }

  async function createSession(fileCount = 0) {
    const id = generateSessionId();
    const token = generateToken();
    const now = Date.now();
    const session = {
      id,
      token,
      numericCode: deriveNumericCode(id),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      initiatorJoinedAt: null,
      joinerJoinedAt: null,
      fileCount,
    };
    const ttlSeconds = Math.max(Math.ceil((session.expiresAt - now) / 1000), 1);

    await redis.set(getSessionKey(id), JSON.stringify(session), {
      EX: ttlSeconds,
    });
    await redis.set(getSessionCodeKey(session.numericCode), id, {
      EX: ttlSeconds,
    });

    return session;
  }

  async function getSession(sessionId) {
    const encoded = await redis.get(getSessionKey(sessionId));
    if (!encoded) {
      return null;
    }

    const session = JSON.parse(encoded);
    if (session.expiresAt < Date.now()) {
      await killSession(sessionId);
      return null;
    }

    return session;
  }

  async function updateSession(sessionId, patch) {
    const session = await getSession(sessionId);
    if (!session) {
      return null;
    }

    Object.assign(session, patch);
    const ttlSeconds = Math.max(Math.ceil((session.expiresAt - Date.now()) / 1000), 1);
    await redis.set(getSessionKey(sessionId), JSON.stringify(session), {
      EX: ttlSeconds,
    });
    return session;
  }

  async function markRoleJoined(sessionId, role) {
    if (role === 'initiator') {
      return updateSession(sessionId, { initiatorJoinedAt: Date.now() });
    }

    if (role === 'joiner') {
      return updateSession(sessionId, { joinerJoinedAt: Date.now() });
    }

    return null;
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

  async function lookupSessionByCode(code) {
    const sessionId = await redis.get(getSessionCodeKey(code));
    if (!sessionId) {
      return null;
    }

    const session = await getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      filesAvailable: session.fileCount,
    };
  }

  async function killSession(sessionId) {
    const session = await getSession(sessionId);
    if (!session) {
      return false;
    }

    await redis.del(getSessionKey(sessionId));
    await redis.del(getSessionCodeKey(session.numericCode));
    return true;
  }

  return {
    SESSION_TTL_MS,
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
  createRedisSessionStore,
};
