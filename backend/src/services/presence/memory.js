/**
 * Single-process presence: userId -> Set<socketId>. A user is online while they have at least
 * one socket. Used unless REDIS_URL is set (see ./redis.js for the multi-instance version).
 */
export function createMemoryPresence() {
  const online = new Map();

  return {
    addSocket(userId, socketId) {
      const id = String(userId);
      let set = online.get(id);
      const wasOnline = Boolean(set?.size);
      if (!set) {
        set = new Set();
        online.set(id, set);
      }
      set.add(socketId);
      return !wasOnline;
    },

    removeSocket(userId, socketId) {
      const id = String(userId);
      const set = online.get(id);
      if (!set) return false;
      set.delete(socketId);
      if (set.size > 0) return false;
      online.delete(id);
      return true;
    },

    isOnline(userId) {
      return online.has(String(userId));
    },

    onlineUserIds() {
      return [...online.keys()];
    },

    socketCount(userId) {
      return online.get(String(userId))?.size ?? 0;
    },

    reset() {
      online.clear();
    },

    close() {},
  };
}
