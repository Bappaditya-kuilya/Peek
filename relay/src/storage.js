const { createInMemorySessionStore } = require('./stores/inMemorySessionStore');
const { createInMemoryViewStore } = require('./stores/inMemoryViewStore');
const { createInMemoryAbuseStore } = require('./stores/inMemoryAbuseStore');
const { createRedisAbuseStore } = require('./stores/redisAbuseStore');
const { createInMemoryRelayBus, setRelayBus } = require('./relayBus');
const { setAbuseStore } = require('./security');
const { setSessionStore } = require('./session');
const { setViewStore } = require('./viewStore');

async function initializeStorage() {
  const redisUrl = String(process.env.REDIS_URL || '').trim();
  const requireRedis = String(process.env.REQUIRE_REDIS || '').trim().toLowerCase() === 'true';

  if (!redisUrl) {
    if (requireRedis) {
      throw new Error('REQUIRE_REDIS is enabled but REDIS_URL is not set');
    }
    setSessionStore(createInMemorySessionStore());
    setViewStore(createInMemoryViewStore());
    setAbuseStore(createInMemoryAbuseStore());
    setRelayBus(createInMemoryRelayBus());
    return { mode: 'memory' };
  }

  try {
    const { createClient } = require('redis');
    const { createRedisSessionStore } = require('./stores/redisSessionStore');
    const { createRedisRelayBus } = require('./stores/redisRelayBus');
    const { createRedisViewStore } = require('./stores/redisViewStore');

    const redis = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: false,
      },
    });

    redis.on('error', (error) => {
      console.error('Peek Redis client error:', error.message);
    });

    await redis.connect();

    const pub = redis.duplicate();
    const sub = redis.duplicate();
    await pub.connect();
    await sub.connect();

    setSessionStore(createRedisSessionStore({ redis }));
    setViewStore(createRedisViewStore({ redis }));
    setAbuseStore(createRedisAbuseStore({ redis }));
    setRelayBus(createRedisRelayBus({ pub, redis, sub }));

    return {
      mode: 'redis',
      pub,
      redis,
      sub,
    };
  } catch (error) {
    if (requireRedis) {
      throw error;
    }
    console.warn(`Peek storage fallback to memory: ${error.message}`);
    setSessionStore(createInMemorySessionStore());
    setViewStore(createInMemoryViewStore());
    setAbuseStore(createInMemoryAbuseStore());
    setRelayBus(createInMemoryRelayBus());
    return {
      mode: 'memory-fallback',
      error,
    };
  }
}

module.exports = {
  initializeStorage,
};
