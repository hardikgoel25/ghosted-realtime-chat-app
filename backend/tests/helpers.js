import request from "supertest";
import { createApp } from "../src/app.js";
import { createServer } from "../src/server.js";

export const PASSWORD = "correct-horse-battery-staple-42";
export const ORIGIN = "http://localhost:5173";

let appInstance;

export function app() {
  appInstance ??= createApp();
  return appInstance;
}

/** A cookie-keeping client that behaves like our own front end (sends an allowed Origin). */
export function agent(target = app()) {
  const a = request.agent(target);
  a.set("Origin", ORIGIN);
  return a;
}

let counter = 0;

export function uniqueUser(overrides = {}) {
  counter += 1;
  return {
    fullname: "Test User",
    username: `user${counter}_${Date.now().toString(36)}`,
    password: PASSWORD,
    gender: "other",
    ...overrides,
  };
}

export async function signup(a, overrides = {}) {
  const data = uniqueUser(overrides);
  const res = await a.post("/api/v1/auth/signup").send(data);
  if (res.status !== 201) {
    throw new Error(`signup failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { ...data, user: res.body.data.user, res };
}

export function parseSetCookies(res) {
  const out = {};
  for (const raw of res.headers["set-cookie"] ?? []) {
    const [pair, ...attrParts] = raw.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    const attrs = {};
    for (const part of attrParts) {
      const [k, v] = part.trim().split("=");
      attrs[k.toLowerCase()] = v === undefined ? true : v;
    }
    out[name] = { value, attrs };
  }
  return out;
}

export function cookieHeaderFrom(res) {
  return (res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
}

export async function startServer() {
  const { app: serverApp, server, io } = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    app: serverApp,
    server,
    io,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => io.close(resolve)),
  };
}
