const {
  clearRoleSocket,
  getSession,
  getPeerSocket,
  getRoleSocket,
  killSession,
  markRoleJoined,
  setRoleSocket,
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

async function handleJoinMessage(socket, message, role) {
  if (
    !/^[a-f0-9]{16}$/i.test(String(message.sessionId || '')) ||
    typeof message.token !== 'string' ||
    !/^[a-f0-9]{32,128}$/i.test(message.token)
  ) {
    socket.close(4002, 'Bad join payload');
    return;
  }

  const session = await getSession(message.sessionId);
  if (!session || !(await validateToken(message.sessionId, message.token))) {
    socket.close(4001, 'Invalid token');
    return;
  }

  // Reconnection support. A valid session token proves this is the same
  // authorized party, so allow it to (re)claim its role. If a previous socket
  // still holds the role — a stale connection after a network blip or a client
  // re-render — replace it instead of rejecting. Rejecting (the old 4004 path)
  // closed the reconnecting peer and ended the session immediately.
  const existing = getRoleSocket(message.sessionId, role);
  if (existing && existing !== socket) {
    existing.replaced = true;
    try {
      existing.close(4005, 'Replaced by reconnect');
    } catch {}
  }

  setRoleSocket(message.sessionId, role, socket);
  await markRoleJoined(message.sessionId, role);
  socket.sessionId = message.sessionId;
  socket.role = role;

  sendJson(socket, { type: `${role}-ready`, expiresAt: session.expiresAt });
  sendJson(getPeerSocket(message.sessionId, role), { type: 'peer-connected', role });
}

async function handleRelayMessage(socket, rawData, isBinary) {
  const messageAllowance = await allowWebSocketMessage(socket.clientIp);
  if (!messageAllowance.allowed) {
    socket.close(4008, 'Rate limited');
    return;
  }

  if (isBinary) {
    if (!socket.sessionId || !socket.role) {
      socket.close(4002, 'Join required');
      return;
    }
    const session = await getSession(socket.sessionId);
    const target = session ? getPeerSocket(socket.sessionId, socket.role) : null;
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
      await handleJoinMessage(socket, message, 'initiator');
      break;
    case 'joiner-join':
      await handleJoinMessage(socket, message, 'joiner');
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
      sendJson(getPeerSocket(socket.sessionId, socket.role), message);
      break;
    }
    case 'kill-session': {
      if (!socket.sessionId) {
        socket.close(4002, 'Join required');
        return;
      }
      await killSession(socket.sessionId, 'Session ended', 4000);
      break;
    }
    default:
      socket.close(4002, 'Unsupported message');
  }
}

async function handleWebSocket(socket, req) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    socket.close(4003, 'Forbidden origin');
    return;
  }

  socket.clientIp = normalizeIp(getRequestIp(req));
  const connectionAllowance = await allowWebSocketConnection(socket.clientIp);
  if (!connectionAllowance.allowed) {
    socket.close(4008, 'Rate limited');
    return;
  }

  socket.on('message', (rawData, isBinary) => {
    handleRelayMessage(socket, rawData, isBinary).catch(() => {
      socket.close(1011, 'Relay failure');
    });
  });

  socket.on('close', async () => {
    // If this socket was superseded by a reconnect, the role already points at
    // a newer socket — do not clear it or tell the peer we disconnected.
    if (socket.replaced) {
      return;
    }
    const session = await getSession(socket.sessionId);
    if (!session) {
      return;
    }
    const current = getRoleSocket(socket.sessionId, socket.role);
    if (current && current !== socket) {
      return;
    }
    clearRoleSocket(socket.sessionId, socket.role, socket);
    const target = getPeerSocket(socket.sessionId, socket.role);
    sendJson(target, { type: 'peer-disconnected' });
  });
}

module.exports = {
  handleWebSocket,
};
