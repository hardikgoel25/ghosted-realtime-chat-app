/**
 * Zero-install local database for development.
 *
 * Starts a real MongoDB binary (downloaded and cached by mongodb-memory-server) that keeps its
 * data in backend/.data/mongo between runs, then runs the given command with MONGODB_URI
 * pointing at it. Example (from the repo root):
 *
 *   node backend/src/scripts/local-mongo.js npm run dev
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 27117;
const DB_NAME = "ghosted";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../.data/mongo");
fs.mkdirSync(dbPath, { recursive: true });

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node local-mongo.js <command> [args...]");
  process.exit(1);
}

const { MongoMemoryServer } = await import("mongodb-memory-server");
const mongod = await MongoMemoryServer.create({
  instance: { dbPath, storageEngine: "wiredTiger", port: PORT, dbName: DB_NAME },
});
const uri = mongod.getUri(DB_NAME);
console.log(`[local-mongo] MongoDB ${mongod.instanceInfo?.version ?? ""} ready at ${uri}`);
console.log(`[local-mongo] data directory: ${dbPath}`);

const child = spawn(command, args, {
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: uri },
  shell: process.platform === "win32",
});

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  await mongod.stop().catch(() => {});
  process.exit(code ?? 0);
}

child.on("exit", (code) => stop(code));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
    setTimeout(() => stop(0), 2000).unref();
  });
}
