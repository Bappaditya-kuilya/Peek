const crypto = require('crypto');

const ROLE_KEY_PREFIX = 'peek:relay-role:';
const CHANNEL_PREFIX = 'peek:relay-instance:';

function createRedisRelayBus({ pub, sub, redis }) {
  const instanceId = crypto.randomBytes(8).toString('hex');
  let messageHandler = null;

  function getRoleKey(sessionId, role) {
    return `${ROLE_KEY_PREFIX}${sessionId}:${role}`;
  }

  function getChannel(instance) {
    return `${CHANNEL_PREFIX}${instance}`;
  }

  sub.subscribe(getChannel(instanceId), async (rawMessage) => {
    if (!messageHandler) {
      return;
    }

    try {
      await messageHandler(JSON.parse(rawMessage));
    } catch (error) {
      console.error('Peek relay bus message error:', error.message);
    }
  });

  return {
    async claimRole(sessionId, role) {
      const key = getRoleKey(sessionId, role);
      const previous = await redis.get(key);
      await redis.set(key, instanceId);
      return previous && previous !== instanceId ? previous : null;
    },
    getInstanceId() {
      return instanceId;
    },
    async getRoleOwner(sessionId, role) {
      const owner = await redis.get(getRoleKey(sessionId, role));
      return owner || null;
    },
    async releaseRole(sessionId, role) {
      const key = getRoleKey(sessionId, role);
      const owner = await redis.get(key);
      if (owner !== instanceId) {
        return false;
      }
      await redis.del(key);
      return true;
    },
    async sendToInstance(targetInstanceId, payload) {
      if (!targetInstanceId || targetInstanceId === instanceId) {
        return false;
      }
      await pub.publish(getChannel(targetInstanceId), JSON.stringify(payload));
      return true;
    },
    setMessageHandler(handler) {
      messageHandler = handler;
    },
  };
}

module.exports = {
  createRedisRelayBus,
};
