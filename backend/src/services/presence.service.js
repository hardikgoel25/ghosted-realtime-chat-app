import User from "../models/user.model.js";
import { logger } from "../config/logger.js";
import { createMemoryPresence } from "./presence/memory.js";
import { createRedisPresence } from "./presence/redis.js";

/**
 * Who is online. Backed by an in-process map by default, or by Redis when the server was
 * started with REDIS_URL (see `useRedis`). The memory version answers synchronously and the
 * Redis one with promises, so callers always `await` the result.
 */
const LAST_SEEN_DEBOUNCE_MS = 10_000;

let impl = createMemoryPresence();
/** userId -> timeout handle for the debounced lastSeenAt write */
const lastSeenTimers = new Map();

function clearTimer(id) {
  const timer = lastSeenTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    lastSeenTimers.delete(id);
  }
}

export function useRedis(client) {
  impl.close?.();
  impl = createRedisPresence(client);
}

export function useMemory() {
  impl.close?.();
  impl = createMemoryPresence();
}

/** @returns {boolean | Promise<boolean>} true when this socket made the user go online */
export function addSocket(userId, socketId) {
  clearTimer(String(userId));
  return impl.addSocket(userId, socketId);
}

/** @returns {boolean | Promise<boolean>} true when this was the user's last socket anywhere */
export function removeSocket(userId, socketId) {
  return impl.removeSocket(userId, socketId);
}

export function isOnline(userId) {
  return impl.isOnline(userId);
}

export function onlineUserIds() {
  return impl.onlineUserIds();
}

export function socketCount(userId) {
  return impl.socketCount(userId);
}

/** Writes lastSeenAt once the user has stayed offline for a short while (avoids write storms). */
export function scheduleLastSeen(userId, at = new Date()) {
  const id = String(userId);
  clearTimer(id);
  const timer = setTimeout(async () => {
    lastSeenTimers.delete(id);
    try {
      if (await impl.isOnline(id)) return;
      await User.updateOne({ _id: id }, { $set: { lastSeenAt: at } });
    } catch (err) {
      logger.warn({ err, userId: id }, "Failed to persist lastSeenAt");
    }
  }, LAST_SEEN_DEBOUNCE_MS);
  timer.unref?.();
  lastSeenTimers.set(id, timer);
}

export function reset() {
  impl.reset();
  for (const t of lastSeenTimers.values()) clearTimeout(t);
  lastSeenTimers.clear();
}
