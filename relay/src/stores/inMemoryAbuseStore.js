function createInMemoryAbuseStore() {
  const counters = new Map();

  async function consume(key, windowMs, max) {
    const now = Date.now();
    const normalizedKey = String(key || 'unknown');
    const entry = counters.get(normalizedKey);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + windowMs;
      counters.set(normalizedKey, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(max - 1, 0),
        resetAt,
      };
    }

    entry.count += 1;
    return {
      allowed: entry.count <= max,
      remaining: Math.max(max - entry.count, 0),
      resetAt: entry.resetAt,
    };
  }

  async function reset(key) {
    counters.delete(String(key || 'unknown'));
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counters.entries()) {
      if (entry.resetAt <= now) {
        counters.delete(key);
      }
    }
  }, 60 * 1000);

  cleanupTimer.unref?.();

  return {
    consume,
    reset,
  };
}

module.exports = {
  createInMemoryAbuseStore,
};
