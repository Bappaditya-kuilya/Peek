const { createInMemorySessionStore } = require('./stores/inMemorySessionStore');
const { createInMemoryViewStore } = require('./stores/inMemoryViewStore');
const { setSessionStore } = require('./session');
const { setViewStore } = require('./viewStore');

async function initializeStorage() {
  const redisUrl = String(process.env.REDIS_URL || '').trim();

  if (!redisUrl) {
    setSessionStore(createInMemorySessionStore());
    setViewStore(createInMemoryViewStore());
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

    return {
      mode: 'redis',
      redis,
    };
  } catch (error) {
    console.warn(`Peek storage fallback to memory: ${error.message}`);
    setSessionStore(createInMemorySessionStore());
    setViewStore(createInMemoryViewStore());
    return {
      mode: 'memory-fallback',
      error,
    };
  }
}

module.exports = {
  initializeStorage,
};
