/**
 * Drops every collection in the configured database. Development helper only.
 *
 *   node src/scripts/reset-db.js --yes            # required confirmation flag
 *   node src/scripts/reset-db.js --yes --force    # additionally required in production
 */
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { env, isProd } from "../config/env.js";
import { logger } from "../config/logger.js";
import { connectDb, disconnectDb } from "../config/db.js";

export async function resetDb() {
  const db = mongoose.connection.db;
  const collections = await db.collections();
  for (const collection of collections) {
    await collection.drop();
  }
  return collections.map((c) => c.collectionName);
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  if (!process.argv.includes("--yes")) {
    logger.error("Refusing to drop the database without --yes");
    process.exitCode = 1;
  } else if (isProd && !process.argv.includes("--force")) {
    logger.error("Refusing to drop a production database without --force");
    process.exitCode = 1;
  } else {
    connectDb()
      .then(resetDb)
      .then(async (dropped) => {
        logger.info({ dropped, db: env.MONGODB_URI.split("@").pop() }, "Database cleared");
        await disconnectDb();
      })
      .catch(async (err) => {
        logger.error({ err }, "Reset failed");
        await disconnectDb().catch(() => {});
        process.exitCode = 1;
      });
  }
}
