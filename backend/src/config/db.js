import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

mongoose.set("strictQuery", true);

let listenersBound = false;

export async function connectDb(uri = env.MONGODB_URI) {
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ host: conn.connection.host, db: conn.connection.name }, "MongoDB connected");
  if (!listenersBound) {
    listenersBound = true;
    mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
    mongoose.connection.on("error", (err) => logger.error({ err }, "MongoDB error"));
  }
  return conn;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export function dbReady() {
  return mongoose.connection.readyState === 1;
}

function isTransactionUnsupported(err) {
  return (
    err?.code === 20 ||
    err?.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed|does not support transactions|replica set/i.test(
      err?.message ?? ""
    )
  );
}

/**
 * Runs `fn(session)` inside a transaction when the deployment supports it (replica set / Atlas),
 * and falls back to running `fn(null)` sequentially on a standalone server. Callers must pass
 * `sessionOptions(session)` to every query so the fallback works unchanged.
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      logger.warn("MongoDB transactions unsupported on this deployment; running without one");
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export function sessionOptions(session) {
  return session ? { session } : {};
}
