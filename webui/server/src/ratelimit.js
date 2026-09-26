// In-memory failed-login limiter: `max` failures per `windowMs` per key.
export function createLoginLimiter({ max = 5, windowMs = 5 * 60 * 1000, now = Date.now } = {}) {
  const failures = new Map(); // key -> number[] (timestamps)

  function recent(key) {
    const t = now();
    const list = (failures.get(key) || []).filter((ts) => t - ts < windowMs);
    if (list.length) failures.set(key, list); else failures.delete(key);
    return list;
  }

  return {
    // seconds to wait, or 0 if allowed
    retryAfter(key) {
      const list = recent(key);
      if (list.length < max) return 0;
      return Math.ceil((list[0] + windowMs - now()) / 1000);
    },
    fail(key) {
      const list = recent(key);
      list.push(now());
      failures.set(key, list);
      if (failures.size > 10000) failures.delete(failures.keys().next().value);
    },
    reset(key) { failures.delete(key); },
  };
}
