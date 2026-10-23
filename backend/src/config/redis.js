import { createClient } from "redis";
import { env } from "./env.js";
import { features } from "./features.js";
import { logger } from "./logger.js";

let clients = null;

/**
 * Connected node-redis clients for the Socket.IO adapter (pub + sub) and presence. Only
 * created when REDIS_URL is set; the memory implementations are used otherwise.
 */
export async function getRedisClients() {
  if (!features.redis) return null;
  if (clients) return clients;
  const pub = createClient({ url: env.REDIS_URL });
  pub.on("error", (err) => logger.error({ err }, "Redis error"));
  await pub.connect();
  const sub = pub.duplicate();
  sub.on("error", (err) => logger.error({ err }, "Redis (subscriber) error"));
  await sub.connect();
  clients = { pub, sub };
  logger.info("Redis connected: Socket.IO adapter and shared presence enabled");
  return clients;
}

export function redisStatus() {
  if (!features.redis) return "disabled";
  return clients?.pub?.isReady ? "connected" : "disconnected";
}

export async function closeRedis() {
  if (!clients) return;
  const { pub, sub } = clients;
  clients = null;
  await Promise.allSettled([pub.quit(), sub.quit()]);
}
