import { createRequire } from "node:module";
import { dbReady } from "../config/db.js";
import { ok } from "../utils/response.js";

const { version } = createRequire(import.meta.url)("../../package.json");

export function health(_req, res) {
  ok(res, {
    status: "ok",
    version,
    uptime: Math.round(process.uptime()),
    db: dbReady() ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
}

export function ready(_req, res) {
  if (!dbReady()) {
    return res
      .status(503)
      .json({ ok: false, error: { code: "NOT_READY", message: "Database not connected" } });
  }
  ok(res, { status: "ready" });
}
