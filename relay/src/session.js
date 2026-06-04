const { createInMemorySessionStore, SESSION_TTL_MS } = require('./stores/inMemorySessionStore');
const { createLiveSessionRegistry } = require('./liveSessionRegistry');

let activeSessionStore = createInMemorySessionStore();
let activeLiveSessionRegistry = createLiveSessionRegistry();

function getSessionStore() {
  return activeSessionStore;
}

function setSessionStore(store) {
  activeSessionStore = store;
}

function getLiveSessionRegistry() {
  return activeLiveSessionRegistry;
}

function setLiveSessionRegistry(registry) {
  activeLiveSessionRegistry = registry;
}

function canJoinRole(session, role) {
  if (!session) {
    return false;
  }

  if (role === 'initiator') {
    return !activeLiveSessionRegistry.getRoleSocket(session.id, role) && !session.initiatorJoinedAt;
  }

  if (role === 'joiner') {
    return !activeLiveSessionRegistry.getRoleSocket(session.id, role) && !session.joinerJoinedAt;
  }

  return false;
}

function clearRoleSocket(sessionId, role, socket) {
  return activeLiveSessionRegistry.clearRoleSocket(sessionId, role, socket);
}

function getRoleSocket(sessionId, role) {
  return activeLiveSessionRegistry.getRoleSocket(sessionId, role);
}

function getPeerSocket(sessionId, role) {
  return activeLiveSessionRegistry.getPeerSocket(sessionId, role);
}

function setRoleSocket(sessionId, role, socket) {
  return activeLiveSessionRegistry.setRoleSocket(sessionId, role, socket);
}

function killSession(sessionId, reason = 'Session ended', closeCode = 4000) {
  activeLiveSessionRegistry.closeSessionSockets(sessionId, reason, closeCode);
  return activeSessionStore.killSession(sessionId, reason, closeCode);
}

module.exports = {
  SESSION_TTL_MS,
  canJoinRole,
  clearRoleSocket,
  getLiveSessionRegistry,
  getPeerSocket,
  getRoleSocket,
  getSessionStore,
  killSession,
  setLiveSessionRegistry,
  setRoleSocket,
  setSessionStore,
  createSession: (...args) => activeSessionStore.createSession(...args),
  getSession: (...args) => activeSessionStore.getSession(...args),
  lookupSessionByCode: (...args) => activeSessionStore.lookupSessionByCode(...args),
  markRoleJoined: (...args) => activeSessionStore.markRoleJoined(...args),
  updateSession: (...args) => activeSessionStore.updateSession(...args),
  validateToken: (...args) => activeSessionStore.validateToken(...args),
};
