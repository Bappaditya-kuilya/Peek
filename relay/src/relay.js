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
const { getRelayBus } = require('./relayBus');
const MAX_JSON_MESSAGE_BYTES = 32 * 1024;

function sendJson(socket, payload) {
  if (!socket || socket.readyState !== 1) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

async function closeRemoteRole(sessionId, role) {
  const relayBus = getRelayBus();
  const owner = await relayBus.getRoleOwner(sessionId, role);
  if (!owner || owner === relayBus.getInstanceId()) {
    return false;
  }

  await relayBus.sendToInstance(owner, {
    type: 'close-role',
    sessionId,
    role,
  });
  return true;
}

async function sendToPeer(sessionId, role, payload, options = {}) {
  const target = getPeerSocket(sessionId, role);
  if (target && target.readyState === 1) {
    if (options.binary) {
      target.send(payload, { binary: true });
    } else {
      sendJson(target, payload);
    }
    return true;
  }

  const peerRole = role === 'initiator' ? 'joiner' : 'initiator';
  const relayBus = getRelayBus();
  const owner = await relayBus.getRoleOwner(sessionId, peerRole);
  if (!owner || owner === relayBus.getInstanceId()) {
    return false;
  }

  await relayBus.sendToInstance(owner, {
    type: options.binary ? 'relay-binary' : 'relay-json',
    sessionId,
    role: peerRole,
    payload: options.binary ? Buffer.from(payload).toString('base64') : payload,
  });
  return true;
}

async function notifyPeerConnected(sessionId, role) {
  await sendToPeer(sessionId, role, { type: 'peer-connected', role });
}

async function notifyPeerDisconnected(sessionId, role) {
  await sendToPeer(sessionId, role, { type: 'peer-disconnected' });
}

async function closeSessionAcrossInstances(sessionId, reason = 'Session ended', closeCode = 4000) {
  const relayBus = getRelayBus();
  for (const role of ['initiator', 'joiner']) {
    const owner = await relayBus.getRoleOwner(sessionId, role);
    if (owner && owner !== relayBus.getInstanceId()) {
      await relayBus.sendToInstance(owner, {
        type: 'kill-session',
        closeCode,
        reason,
        sessionId,
      });
    }
  }
}

function attachRelayBusHandler() {
  const relayBus = getRelayBus();
  if (relayBus._attached) {
    return;
  }

  relayBus.setMessageHandler(async (message) => {
    if (!message?.sessionId) {
      return;
    }

    switch (message.type) {
      case 'close-role': {
        const socket = getRoleSocket(message.sessionId, message.role);
        if (socket) {
          socket.replaced = true;
          socket.close(4005, 'Replaced by reconnect');
        }
        break;
      }
      case 'relay-json': {
        const socket = getRoleSocket(message.sessionId, message.role);
        sendJson(socket, message.payload);
        break;
      }
      case 'relay-binary': {
        const socket = getRoleSocket(message.sessionId, message.role);
        if (socket && socket.readyState === 1) {
          socket.send(Buffer.from(message.payload, 'base64'), { binary: true });
        }
        break;
      }
      case 'kill-session': {
        const initiator = getRoleSocket(message.sessionId, 'initiator');
        const joiner = getRoleSocket(message.sessionId, 'joiner');
        for (const socket of [initiator, joiner]) {
          if (socket) {
            socket.close(message.closeCode || 4000, message.reason || 'Session ended');
          }
        }
        clearRoleSocket(message.sessionId, 'initiator');
        clearRoleSocket(message.sessionId, 'joiner');
        break;
      }
      default:
        break;
    }
  });
  relayBus._attached = true;
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
  await closeRemoteRole(message.sessionId, role);

  setRoleSocket(message.sessionId, role, socket);
  await getRelayBus().claimRole(message.sessionId, role);
  await markRoleJoined(message.sessionId, role);
  socket.sessionId = message.sessionId;
  socket.role = role;

  sendJson(socket, { type: `${role}-ready`, expiresAt: session.expiresAt });
  await notifyPeerConnected(message.sessionId, role);
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
    if (session) {
      await sendToPeer(socket.sessionId, socket.role, rawData, { binary: true });
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
      await sendToPeer(socket.sessionId, socket.role, message);
      break;
    }
    case 'kill-session': {
      if (!socket.sessionId) {
        socket.close(4002, 'Join required');
        return;
      }
      await closeSessionAcrossInstances(socket.sessionId, 'Session ended', 4000);
      await killSession(socket.sessionId, 'Session ended', 4000);
      break;
    }
    default:
      socket.close(4002, 'Unsupported message');
  }
}

async function handleWebSocket(socket, req) {
  attachRelayBusHandler();
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
    await getRelayBus().releaseRole(socket.sessionId, socket.role);
    await notifyPeerDisconnected(socket.sessionId, socket.role);
  });
}

module.exports = {
  handleWebSocket,
};
