import User from "../models/user.model.js";
import { logger } from "../config/logger.js";

const LAST_SEEN_DEBOUNCE_MS = 10_000;

/** userId -> Set<socketId>; a user is online while they have at least one socket */
const online = new Map();
/** userId -> timeout handle for the debounced lastSeenAt write */
const lastSeenTimers = new Map();

/** @returns {boolean} true when this socket made the user go online */
export function addSocket(userId, socketId) {
  const id = String(userId);
  const timer = lastSeenTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    lastSeenTimers.delete(id);
  }
  let set = online.get(id);
  const wasOnline = Boolean(set?.size);
  if (!set) {
    set = new Set();
    online.set(id, set);
  }
  set.add(socketId);
  return !wasOnline;
}

/** @returns {boolean} true when this was the user's last socket (they went offline) */
export function removeSocket(userId, socketId) {
  const id = String(userId);
  const set = online.get(id);
  if (!set) return false;
  set.delete(socketId);
  if (set.size > 0) return false;
  online.delete(id);
  return true;
}

export function isOnline(userId) {
  return online.has(String(userId));
}

export function onlineUserIds() {
  return [...online.keys()];
}

export function socketCount(userId) {
  return online.get(String(userId))?.size ?? 0;
}

/** Writes lastSeenAt once the user has stayed offline for a short while (avoids write storms). */
export function scheduleLastSeen(userId, at = new Date()) {
  const id = String(userId);
  const existing = lastSeenTimers.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    lastSeenTimers.delete(id);
    if (online.has(id)) return;
    try {
      await User.updateOne({ _id: id }, { $set: { lastSeenAt: at } });
    } catch (err) {
      logger.warn({ err, userId: id }, "Failed to persist lastSeenAt");
    }
  }, LAST_SEEN_DEBOUNCE_MS);
  timer.unref?.();
  lastSeenTimers.set(id, timer);
}

export function reset() {
  online.clear();
  for (const t of lastSeenTimers.values()) clearTimeout(t);
  lastSeenTimers.clear();
}
