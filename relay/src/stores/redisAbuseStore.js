function createRedisAbuseStore({ redis }) {
  async function consume(key, windowMs, max) {
    const normalizedKey = `peek:abuse:${String(key || 'unknown')}`;
    const windowSeconds = Math.max(Math.ceil(windowMs / 1000), 1);
    const count = await redis.incr(normalizedKey);

    if (count === 1) {
      await redis.expire(normalizedKey, windowSeconds);
    }

    const ttlSeconds = await redis.ttl(normalizedKey);
    const resetAt = Date.now() + Math.max(ttlSeconds, 0) * 1000;

    return {
      allowed: count <= max,
      remaining: Math.max(max - count, 0),
      resetAt,
    };
  }

  async function reset(key) {
    await redis.del(`peek:abuse:${String(key || 'unknown')}`);
  }

  return {
    consume,
    reset,
  };
}

module.exports = {
  createRedisAbuseStore,
};
