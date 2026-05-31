const crypto = require('crypto');

const SESSION_TTL_MS = 60 * 60 * 1000;
const sessions = new Map();

function generateToken() {
  // SECURITY: Session tokens must be cryptographically random.
  return crypto.randomBytes(32).toString('hex');
}

function generateSessionId() {
  // SECURITY: Session IDs must not be predictable.
  return crypto.randomBytes(8).toString('hex');
}

function deriveNumericCode(sessionId) {
  // SECURITY: numeric code is a session lookup shortcut only.
  // It is NOT an authenticator. Authorization requires the full
  // token + encryption key from the URL fragment.
  // Collisions are acceptable — worst case, user sees "session not found."
  const hex = sessionId.slice(0, 6);
  const num = parseInt(hex, 16) % 1000000;
  return String(num).padStart(6, '0');
}

function createSession(fileCount = 0) {
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
    initiatorSocket: null,
    joinerSocket: null,
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
    return !session.initiatorSocket && !session.initiatorJoinedAt;
  }

  if (role === 'joiner') {
    return !session.joinerSocket && !session.joinerJoinedAt;
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

function clearRoleSocket(sessionId, role) {
  if (role === 'initiator') {
    return updateSession(sessionId, { initiatorSocket: null });
  }

  if (role === 'joiner') {
    return updateSession(sessionId, { joinerSocket: null });
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

  // SECURITY: Timing-safe comparison prevents token oracle leaks.
  return crypto.timingSafeEqual(expected, actual);
}

function lookupSessionByCode(code) {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.expiresAt < now) {
      continue;
    }
    if (session.numericCode === code) {
      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        filesAvailable: session.fileCount,
      };
    }
  }
  return null;
}

function closeSocket(socket, closeCode, reason) {
  if (!socket) {
    return;
  }
  try {
    socket.close(closeCode, reason);
  } catch {}
}

function killSession(sessionId, reason = 'Session ended', closeCode = 4000) {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  closeSocket(session.initiatorSocket, closeCode, reason);
  closeSocket(session.joinerSocket, closeCode, reason);
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

setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

module.exports = {
  canJoinRole,
  clearRoleSocket,
  createSession,
  getSession,
  killSession,
  lookupSessionByCode,
  markRoleJoined,
  updateSession,
  validateToken,
};
