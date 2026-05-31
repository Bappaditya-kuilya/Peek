const {
  getSession,
  killSession,
  updateSession,
  validateToken,
} = require('./session');
const { isAllowedOrigin } = require('./security');

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
  const session = getSession(message.sessionId);
  if (!session || !validateToken(message.sessionId, message.token)) {
    socket.close(4001, 'Invalid token');
    return;
  }

  assignRole(message.sessionId, role, socket);
  socket.sessionId = message.sessionId;
  socket.role = role;

  sendJson(socket, { type: `${role}-ready`, expiresAt: session.expiresAt });
  sendJson(getPeerSocket(session, role), { type: 'peer-connected', role });
}

function handleRelayMessage(socket, rawData, isBinary) {
  if (isBinary) {
    const session = getSession(socket.sessionId);
    const target = getPeerSocket(session, socket.role);
    if (target && target.readyState === 1) {
      target.send(rawData, { binary: true });
    }
    return;
  }

  let message;
  try {
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
    case 'file-manifest': {
      const session = updateSession(socket.sessionId, {
        fileCount: Array.isArray(message.files) ? message.files.length : 0,
      });
      sendJson(getPeerSocket(session, socket.role), message);
      break;
    }
    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'webrtc-candidate':
    case 'relay-control': {
      sendJson(getPeerSocket(getSession(socket.sessionId), socket.role), message);
      break;
    }
    case 'kill-session': {
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

  socket.on('message', (rawData, isBinary) => {
    handleRelayMessage(socket, rawData, isBinary);
  });

  socket.on('close', () => {
    const session = getSession(socket.sessionId);
    const target = getPeerSocket(session, socket.role);
    sendJson(target, { type: 'peer-disconnected' });
  });
}

module.exports = {
  handleWebSocket,
};
