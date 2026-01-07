/**
 * Simple in-memory daily rate limiter for user queries (free vs paid)
 * Note: intended for unit testing and local dev. In production use a shared
 * store (Redis) so counts are consistent across instances.
 */

function createDailyRateLimiter(opts = {}) {
  // Input validation
  if (opts && typeof opts !== 'object') {
    throw new Error('opts must be an object');
  }
  
  const freeLimit = typeof opts.freeLimit === 'number' && opts.freeLimit > 0 ? opts.freeLimit : 5;
  const paidLimit = typeof opts.paidLimit === 'number' && opts.paidLimit > 0 ? opts.paidLimit : 50;
  const nowDateFn = typeof opts.nowDateFn === 'function' ? opts.nowDateFn : (() => new Date());
  const maxStoredDays = typeof opts.maxStoredDays === 'number' && opts.maxStoredDays > 0 ? opts.maxStoredDays : 7; // Keep last 7 days

  // Map of dateKey -> Map(userId -> count)
  const store = new Map();

  function dateKey(d) {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return dt.toISOString().slice(0, 10);
  }

  function ensureDateKey(key) {
    if (!store.has(key)) store.set(key, new Map());
    return store.get(key);
  }
  
  // Clean up old date keys to prevent memory leaks
  function cleanupOldKeys() {
    const today = dateKey(nowDateFn());
    const oldKeys = [];
    
    for (const key of store.keys()) {
      if (key < today) {
        const daysDiff = Math.floor((new Date(today) - new Date(key)) / (1000 * 60 * 60 * 24));
        if (daysDiff > maxStoredDays) {
          oldKeys.push(key);
        }
      }
    }
    
    for (const key of oldKeys) {
      store.delete(key);
    }
    
    return oldKeys.length;
  }

  function hit(userId, { paid = false } = {}) {
    // Input validation
    if (!userId || (typeof userId !== 'string' && typeof userId !== 'number')) {
      throw new Error('userId is required and must be a string or number');
    }
    
    // Periodically cleanup old keys (10% chance on each hit)
    if (Math.random() < 0.1) {
      cleanupOldKeys();
    }
    
    const key = dateKey(nowDateFn());
    const map = ensureDateKey(key);
    const prev = map.get(userId) || 0;
    const limit = paid ? paidLimit : freeLimit;
    if (prev >= limit) return { allowed: false, remaining: 0, used: prev, limit };
    const next = prev + 1;
    map.set(userId, next);
    return { allowed: true, remaining: Math.max(0, limit - next), used: next, limit };
  }

  function getUsage(userId) {
    // Input validation
    if (!userId || (typeof userId !== 'string' && typeof userId !== 'number')) {
      return 0;
    }
    
    const key = dateKey(nowDateFn());
    const map = store.get(key) || new Map();
    return map.get(userId) || 0;
  }

  function resetAll() {
    store.clear();
  }
  
  function getStats() {
    const stats = {
      totalDays: store.size,
      totalUsers: 0,
      totalHits: 0
    };
    
    for (const dayMap of store.values()) {
      stats.totalUsers += dayMap.size;
      for (const count of dayMap.values()) {
        stats.totalHits += count;
      }
    }
    
    return stats;
  }

  return { hit, getUsage, resetAll, cleanupOldKeys, getStats };
}

module.exports = { createDailyRateLimiter };
