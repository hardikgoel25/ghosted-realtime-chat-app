/**
 * Boots the production server (serving the built frontend) against a throwaway MongoDB for
 * the Playwright suite. Builds the frontend first unless E2E_SKIP_BUILD=1 and a build exists.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "backend", "package.json"));
const { MongoMemoryServer } = require("mongodb-memory-server");

const PORT = Number(process.env.E2E_PORT || 5100);
const dist = path.join(root, "frontend", "dist", "index.html");

if (process.env.E2E_SKIP_BUILD !== "1" || !fs.existsSync(dist)) {
  console.log("[e2e] building frontend…");
  const build = spawnSync("npm", ["run", "build", "-w", "frontend"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const mongod = await MongoMemoryServer.create();
console.log(`[e2e] MongoDB ready, starting server on :${PORT}`);

const child = spawn(process.execPath, ["src/server.js"], {
  cwd: path.join(root, "backend"),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    MONGODB_URI: mongod.getUri("ghosted_e2e"),
    JWT_SECRET: "e2e-only-secret-".padEnd(48, "x"),
    CLIENT_ORIGINS: `http://localhost:${PORT}`,
    LOG_LEVEL: process.env.E2E_LOG_LEVEL || "warn",
    CLOUDINARY_CLOUD_NAME: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: "",
    DNS_SERVERS: "",
  },
});

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill();
  await mongod.stop().catch(() => {});
  process.exit(code);
}

child.on("exit", (code) => stop(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(0));
