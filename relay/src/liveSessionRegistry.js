function createLiveSessionRegistry() {
  const socketsBySession = new Map();

  function ensureEntry(sessionId) {
    let entry = socketsBySession.get(sessionId);
    if (!entry) {
      entry = { initiator: null, joiner: null };
      socketsBySession.set(sessionId, entry);
    }
    return entry;
  }

  function getRoleSocket(sessionId, role) {
    const entry = socketsBySession.get(sessionId);
    if (!entry) {
      return null;
    }
    return role === 'initiator' ? entry.initiator : entry.joiner;
  }

  function getPeerSocket(sessionId, role) {
    const entry = socketsBySession.get(sessionId);
    if (!entry) {
      return null;
    }
    return role === 'initiator' ? entry.joiner : entry.initiator;
  }

  function setRoleSocket(sessionId, role, socket) {
    const entry = ensureEntry(sessionId);
    if (role === 'initiator') {
      entry.initiator = socket;
    } else if (role === 'joiner') {
      entry.joiner = socket;
    }
    return socket;
  }

  function clearRoleSocket(sessionId, role, socket) {
    const entry = socketsBySession.get(sessionId);
    if (!entry) {
      return null;
    }

    if (role === 'initiator' && (!socket || entry.initiator === socket)) {
      entry.initiator = null;
    }

    if (role === 'joiner' && (!socket || entry.joiner === socket)) {
      entry.joiner = null;
    }

    if (!entry.initiator && !entry.joiner) {
      socketsBySession.delete(sessionId);
    }

    return getRoleSocket(sessionId, role);
  }

  function closeSocket(socket, closeCode, reason) {
    if (!socket) {
      return;
    }
    try {
      socket.close(closeCode, reason);
    } catch {}
  }

  function closeSessionSockets(sessionId, reason = 'Session ended', closeCode = 4000) {
    const entry = socketsBySession.get(sessionId);
    if (!entry) {
      return false;
    }

    closeSocket(entry.initiator, closeCode, reason);
    closeSocket(entry.joiner, closeCode, reason);
    socketsBySession.delete(sessionId);
    return true;
  }

  return {
    clearRoleSocket,
    closeSessionSockets,
    getPeerSocket,
    getRoleSocket,
    setRoleSocket,
  };
}

module.exports = {
  createLiveSessionRegistry,
};
