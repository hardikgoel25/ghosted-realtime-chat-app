import http from "node:http";
import { pathToFileURL } from "node:url";
import { createAdapter } from "@socket.io/redis-adapter";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { closeRedis, getRedisClients } from "./config/redis.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./sockets/index.js";
import * as presence from "./services/presence.service.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Builds the HTTP + Socket.IO stack without listening; tests call this with port 0. */
export function createServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  return { app, server, io };
}

/** With REDIS_URL set, rooms, broadcasts and presence are shared across API instances. */
async function attachRedis(io) {
  const redis = await getRedisClients();
  if (!redis) return;
  io.adapter(createAdapter(redis.pub, redis.sub));
  presence.useRedis(redis.pub);
}

async function main() {
  await connectDb();
  const { server, io } = createServer();
  await attachRedis(io);

  await new Promise((resolve) => server.listen(env.PORT, resolve));
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "Ghosted API listening");

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const force = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    try {
      await new Promise((resolve) => io.close(resolve));
      server.closeAllConnections?.();
      await closeRedis();
      await disconnectDb();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => logger.error({ err }, "Unhandled promise rejection"));
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    shutdown("uncaughtException");
  });
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun || process.env.GHOSTED_FORCE_MAIN === "1") {
  main().catch((err) => {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  });
}
