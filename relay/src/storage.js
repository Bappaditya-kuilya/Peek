const { createInMemorySessionStore } = require('./stores/inMemorySessionStore');
const { createInMemoryViewStore } = require('./stores/inMemoryViewStore');
const { createInMemoryAbuseStore } = require('./stores/inMemoryAbuseStore');
const { createRedisAbuseStore } = require('./stores/redisAbuseStore');
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
    return { mode: 'memory' };
  }

  try {
    const { createClient } = require('redis');
    const { createRedisSessionStore } = require('./stores/redisSessionStore');
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

    setSessionStore(createRedisSessionStore({ redis }));
    setViewStore(createRedisViewStore({ redis }));
    setAbuseStore(createRedisAbuseStore({ redis }));

    return {
      mode: 'redis',
      redis,
    };
  } catch (error) {
    if (requireRedis) {
      throw error;
    }
    console.warn(`Peek storage fallback to memory: ${error.message}`);
    setSessionStore(createInMemorySessionStore());
    setViewStore(createInMemoryViewStore());
    setAbuseStore(createInMemoryAbuseStore());
    return {
      mode: 'memory-fallback',
      error,
    };
  }
}

module.exports = {
  initializeStorage,
};
