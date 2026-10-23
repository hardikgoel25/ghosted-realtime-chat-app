/**
 * Presence shared by several API instances through Redis.
 *
 * Every socket is a member of the sorted set `presence:user:<userId>` and every user with a
 * live socket a member of `presence:online`, both scored with the time of the last heartbeat.
 * Each instance refreshes the scores of its own sockets every HEARTBEAT_MS, so an instance
 * that dies without cleaning up simply ages out: anything older than STALE_MS is ignored by
 * the reads and swept on the next heartbeat. No Lua, no locks, and every read is one command.
 *
 * `client` is a connected node-redis v4+ client (only zAdd / zRem / zCount / zRangeByScore /
 * zRemRangeByScore are used, which keeps it easy to fake in tests).
 */
export const HEARTBEAT_MS = 20_000;
export const STALE_MS = 60_000;
const ONLINE_KEY = "presence:online";
const userKey = (userId) => `presence:user:${userId}`;

export function createRedisPresence(client, { now = Date.now, heartbeatMs = HEARTBEAT_MS } = {}) {
  /** Sockets owned by this instance: userId -> Set<socketId> */
  const local = new Map();
  let timer = null;

  const fresh = () => now() - STALE_MS;

  async function liveSockets(userId) {
    return client.zCount(userKey(userId), fresh(), "+inf");
  }

  async function heartbeat() {
    const at = now();
    for (const [userId, sockets] of local) {
      for (const socketId of sockets) {
        await client.zAdd(userKey(userId), { score: at, value: socketId });
      }
      await client.zAdd(ONLINE_KEY, { score: at, value: userId });
      await client.zRemRangeByScore(userKey(userId), "-inf", fresh());
    }
    await client.zRemRangeByScore(ONLINE_KEY, "-inf", fresh());
  }

  function ensureTimer() {
    if (timer || heartbeatMs <= 0) return;
    timer = setInterval(() => heartbeat().catch(() => {}), heartbeatMs);
    timer.unref?.();
  }

  return {
    async addSocket(userId, socketId) {
      const id = String(userId);
      const wasOnline = (await liveSockets(id)) > 0;
      const at = now();
      await client.zAdd(userKey(id), { score: at, value: socketId });
      await client.zAdd(ONLINE_KEY, { score: at, value: id });
      if (!local.has(id)) local.set(id, new Set());
      local.get(id).add(socketId);
      ensureTimer();
      return !wasOnline;
    },

    async removeSocket(userId, socketId) {
      const id = String(userId);
      const mine = local.get(id);
      if (mine) {
        mine.delete(socketId);
        if (mine.size === 0) local.delete(id);
      }
      await client.zRem(userKey(id), socketId);
      if ((await liveSockets(id)) > 0) return false;
      await client.zRem(ONLINE_KEY, id);
      return true;
    },

    async isOnline(userId) {
      return (await liveSockets(String(userId))) > 0;
    },

    async onlineUserIds() {
      return client.zRangeByScore(ONLINE_KEY, fresh(), "+inf");
    },

    async socketCount(userId) {
      return liveSockets(String(userId));
    },

    /** Refreshes this instance's sockets now (exposed for tests). */
    heartbeat,

    reset() {
      local.clear();
    },

    close() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
