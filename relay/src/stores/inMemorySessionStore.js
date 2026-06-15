const crypto = require('crypto');

const SESSION_TTL_MS = 60 * 60 * 1000;

function createInMemorySessionStore() {
  const sessions = new Map();

  function generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  function createSession(fileCount = 0) {
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
    sessions.set(id, session);
    return session;
  }

  function getSession(sessionId) {
    return sessions.get(sessionId) || null;
  }

  function updateSession(sessionId, patch) {
    const session = sessions.get(sessionId);
    if (!session) {
      return null;
    }
    Object.assign(session, patch);
    return session;
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

  function markRoleJoined(sessionId, role) {
    if (role === 'initiator') {
      return updateSession(sessionId, { initiatorJoinedAt: Date.now() });
    }

    if (role === 'joiner') {
      return updateSession(sessionId, { joinerJoinedAt: Date.now() });
    }

    return null;
  }

  function validateToken(sessionId, token) {
    const session = sessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
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
    // Numeric-code lookup has been removed. Sessions are reachable only via the
    // full link carrying the secret token + key, so there is no enumerable code.
    return null;
  }

  function killSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return false;
    }
    sessions.delete(sessionId);
    return true;
  }

  function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      if (session.expiresAt < now) {
        killSession(sessionId, 'Session expired', 4001);
      }
    }
  }

  const cleanupTimer = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
  cleanupTimer.unref?.();

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
  createInMemorySessionStore,
};
