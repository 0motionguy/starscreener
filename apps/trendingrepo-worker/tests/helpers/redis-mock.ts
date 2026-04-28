import type { RedisHandle } from '../../src/lib/types.js';

export function createMockRedis(): RedisHandle & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      store.set(key, value);
    },
    async del(key) {
      store.delete(key);
    },
    async quit() {
      // no-op
    },
  };
}
