const {
  clearRoleSocket,
  getSession,
  killSession,
  markRoleJoined,
  updateSession,
  validateToken,
} = require('./session');
const {
  allowWebSocketConnection,
  allowWebSocketMessage,
  getRequestIp,
  isAllowedOrigin,
  normalizeIp,
} = require('./security');
const MAX_JSON_MESSAGE_BYTES = 32 * 1024;

function sendJson(socket, payload) {
  if (!socket || socket.readyState !== 1) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

function getPeerSocket(session, role) {
  if (!session) {
    return null;
  }
  return role === 'initiator' ? session.joinerSocket : session.initiatorSocket;
}

function assignRole(sessionId, role, socket) {
  return role === 'initiator'
    ? updateSession(sessionId, { initiatorSocket: socket })
    : updateSession(sessionId, { joinerSocket: socket });
}

function handleJoinMessage(socket, message, role) {
  if (
    !/^[a-f0-9]{16}$/i.test(String(message.sessionId || '')) ||
    typeof message.token !== 'string' ||
    !/^[a-f0-9]{32,128}$/i.test(message.token)
  ) {
    socket.close(4002, 'Bad join payload');
    return;
  }

  const session = getSession(message.sessionId);
  if (!session || !validateToken(message.sessionId, message.token)) {
    socket.close(4001, 'Invalid token');
    return;
  }

  // Reconnection support. A valid session token proves this is the same
  // authorized party, so allow it to (re)claim its role. If a previous socket
  // still holds the role — a stale connection after a network blip or a client
  // re-render — replace it instead of rejecting. Rejecting (the old 4004 path)
  // closed the reconnecting peer and ended the session immediately.
  const existing = role === 'initiator' ? session.initiatorSocket : session.joinerSocket;
  if (existing && existing !== socket) {
    existing.replaced = true;
    try {
      existing.close(4005, 'Replaced by reconnect');
    } catch {}
  }

  assignRole(message.sessionId, role, socket);
  markRoleJoined(message.sessionId, role);
  socket.sessionId = message.sessionId;
  socket.role = role;

  sendJson(socket, { type: `${role}-ready`, expiresAt: session.expiresAt });
  sendJson(getPeerSocket(session, role), { type: 'peer-connected', role });
}

function handleRelayMessage(socket, rawData, isBinary) {
  const messageAllowance = allowWebSocketMessage(socket.clientIp);
  if (!messageAllowance.allowed) {
    socket.close(4008, 'Rate limited');
    return;
  }

  if (isBinary) {
    if (!socket.sessionId || !socket.role) {
      socket.close(4002, 'Join required');
      return;
    }
    const session = getSession(socket.sessionId);
    const target = getPeerSocket(session, socket.role);
    if (target && target.readyState === 1) {
      target.send(rawData, { binary: true });
    }
    return;
  }

  let message;
  try {
    if (Buffer.byteLength(rawData) > MAX_JSON_MESSAGE_BYTES) {
      socket.close(4002, 'Message too large');
      return;
    }
    message = JSON.parse(rawData.toString());
  } catch {
    socket.close(4002, 'Bad message');
    return;
  }

  switch (message.type) {
    case 'initiator-join':
      handleJoinMessage(socket, message, 'initiator');
      break;
    case 'joiner-join':
      handleJoinMessage(socket, message, 'joiner');
      break;
    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'webrtc-candidate':
    case 'clipboard-push':
    case 'view-share-push':
    case 'relay-control': {
      if (!socket.sessionId || !socket.role) {
        socket.close(4002, 'Join required');
        return;
      }
      sendJson(getPeerSocket(getSession(socket.sessionId), socket.role), message);
      break;
    }
    case 'kill-session': {
      if (!socket.sessionId) {
        socket.close(4002, 'Join required');
        return;
      }
      killSession(socket.sessionId, 'Session ended', 4000);
      break;
    }
    default:
      socket.close(4002, 'Unsupported message');
  }
}

function handleWebSocket(socket, req) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    socket.close(4003, 'Forbidden origin');
    return;
  }

  socket.clientIp = normalizeIp(getRequestIp(req));
  const connectionAllowance = allowWebSocketConnection(socket.clientIp);
  if (!connectionAllowance.allowed) {
    socket.close(4008, 'Rate limited');
    return;
  }

  socket.on('message', (rawData, isBinary) => {
    handleRelayMessage(socket, rawData, isBinary);
  });

  socket.on('close', () => {
    // If this socket was superseded by a reconnect, the role already points at
    // a newer socket — do not clear it or tell the peer we disconnected.
    if (socket.replaced) {
      return;
    }
    const session = getSession(socket.sessionId);
    if (!session) {
      return;
    }
    const current = socket.role === 'initiator' ? session.initiatorSocket : session.joinerSocket;
    if (current && current !== socket) {
      return;
    }
    clearRoleSocket(socket.sessionId, socket.role);
    const target = getPeerSocket(getSession(socket.sessionId), socket.role);
    sendJson(target, { type: 'peer-disconnected' });
  });
}

module.exports = {
  handleWebSocket,
};
