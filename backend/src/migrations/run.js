import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../config/db.js";
import { logger } from "../config/logger.js";
import * as m001 from "./001-users.js";

export const MIGRATIONS = [m001];

export async function runMigrations({ dryRun = false, force = false } = {}) {
  const db = mongoose.connection.db;
  const applied = db.collection("_migrations");
  const results = [];

  for (const migration of MIGRATIONS) {
    const already = await applied.findOne({ id: migration.id });
    if (already && !force) {
      logger.info({ id: migration.id }, "Migration already applied; skipping");
      continue;
    }
    logger.info({ id: migration.id, dryRun }, `Running migration: ${migration.description}`);
    const summary = await migration.up(db, { dryRun, logger });
    logger.info({ id: migration.id, summary }, "Migration finished");
    if (!dryRun) {
      await applied.updateOne(
        { id: migration.id },
        { $set: { id: migration.id, appliedAt: new Date(), summary } },
        { upsert: true }
      );
    }
    results.push({ id: migration.id, summary });
  }
  return results;
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  connectDb()
    .then(() => runMigrations({ dryRun, force }))
    .then(async (results) => {
      logger.info(
        { migrations: results.length },
        dryRun ? "Dry run complete" : "Migrations complete"
      );
      await disconnectDb();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, "Migration failed");
      await disconnectDb().catch(() => {});
      process.exit(1);
    });
}
