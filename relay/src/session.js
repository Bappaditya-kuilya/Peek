const { createInMemorySessionStore, SESSION_TTL_MS } = require('./stores/inMemorySessionStore');

let activeSessionStore = createInMemorySessionStore();

function getSessionStore() {
  return activeSessionStore;
}

function setSessionStore(store) {
  activeSessionStore = store;
}

module.exports = {
  SESSION_TTL_MS,
  getSessionStore,
  setSessionStore,
  canJoinRole: (...args) => activeSessionStore.canJoinRole(...args),
  clearRoleSocket: (...args) => activeSessionStore.clearRoleSocket(...args),
  createSession: (...args) => activeSessionStore.createSession(...args),
  getSession: (...args) => activeSessionStore.getSession(...args),
  killSession: (...args) => activeSessionStore.killSession(...args),
  lookupSessionByCode: (...args) => activeSessionStore.lookupSessionByCode(...args),
  markRoleJoined: (...args) => activeSessionStore.markRoleJoined(...args),
  updateSession: (...args) => activeSessionStore.updateSession(...args),
  validateToken: (...args) => activeSessionStore.validateToken(...args),
};
