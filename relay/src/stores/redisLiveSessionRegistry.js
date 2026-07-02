// ponytail: WebSocket socket objects are live TCP connections and cannot be
// serialized to Redis. This adapter keeps socket references in a local Map and
// uses Redis Sets only to track which sessions are live and which roles are
// filled, so other relay processes can observe live-session membership. The
// socket-routing methods (getRoleSocket/getPeerSocket) are necessarily local.
// This matches the in-memory interface exactly; the Redis Sets add cross-process
// visibility of live session membership as a side benefit.

const logger = require('../logger');

const LIVE_SET = 'peek:live:sessions';
const rolesKey = (sessionId) => `peek:live:${sessionId}:roles`;

function createRedisLiveSessionRegistry(client) {
  const localSockets = new Map();

  function ensureLocal(sessionId) {
    let entry = localSockets.get(sessionId);
    if (!entry) {
      entry = { initiator: null, joiner: null };
      localSockets.set(sessionId, entry);
    }
    return entry;
  }

  function getRoleSocket(sessionId, role) {
    const entry = localSockets.get(sessionId);
    if (!entry) {
      return null;
    }
    return role === 'initiator' ? entry.initiator : entry.joiner;
  }

  function getPeerSocket(sessionId, role) {
    const entry = localSockets.get(sessionId);
    if (!entry) {
      return null;
    }
    return role === 'initiator' ? entry.joiner : entry.initiator;
  }

  // Socket is stored locally before the await so synchronous getRoleSocket
  // callers (relay.js calls setRoleSocket then immediately getRoleSocket) see it.
  async function setRoleSocket(sessionId, role, socket) {
    const entry = ensureLocal(sessionId);
    if (role === 'initiator') {
      entry.initiator = socket;
    } else if (role === 'joiner') {
      entry.joiner = socket;
    }
    try {
      await client.sAdd(LIVE_SET, sessionId);
      await client.sAdd(rolesKey(sessionId), role);
    } catch (err) {
      logger.error({ err, event: 'redis_setRoleSocket' }, 'redisLiveSessionRegistry.setRoleSocket failed');
    }
    return socket;
  }

  async function clearRoleSocket(sessionId, role, socket) {
    const entry = localSockets.get(sessionId);
    if (!entry) {
      return null;
    }
    if (role === 'initiator' && (!socket || entry.initiator === socket)) {
      entry.initiator = null;
    }
    if (role === 'joiner' && (!socket || entry.joiner === socket)) {
      entry.joiner = null;
    }
    try {
      await client.sRem(rolesKey(sessionId), role);
      if (!entry.initiator && !entry.joiner) {
        localSockets.delete(sessionId);
        await client.sRem(LIVE_SET, sessionId);
        await client.del(rolesKey(sessionId));
      }
    } catch (err) {
      logger.error({ err, event: 'redis_clearRoleSocket' }, 'redisLiveSessionRegistry.clearRoleSocket failed');
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

  async function closeSessionSockets(sessionId, reason = 'Session ended', closeCode = 4000) {
    const entry = localSockets.get(sessionId);
    if (entry) {
      closeSocket(entry.initiator, closeCode, reason);
      closeSocket(entry.joiner, closeCode, reason);
      localSockets.delete(sessionId);
    }
    try {
      await client.sRem(LIVE_SET, sessionId);
      await client.del(rolesKey(sessionId));
    } catch (err) {
      logger.error({ err, event: 'redis_closeSessionSockets' }, 'redisLiveSessionRegistry.closeSessionSockets failed');
    }
    return Boolean(entry);
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
  createRedisLiveSessionRegistry,
};