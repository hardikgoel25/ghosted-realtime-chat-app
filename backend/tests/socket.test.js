import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import { PASSWORD, cookieHeaderFrom, startServer, uniqueUser } from "./helpers.js";

let srv;
const openSockets = [];

beforeAll(async () => {
  srv = await startServer();
});

afterEach(() => {
  for (const s of openSockets.splice(0)) s.disconnect();
});

afterAll(async () => {
  await srv.close();
});

function http() {
  return request(srv.server);
}

async function createUser() {
  const data = uniqueUser();
  const res = await http()
    .post("/api/v1/auth/signup")
    .set("Origin", "http://localhost:5173")
    .send(data);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return { ...data, user: res.body.data.user, cookie: cookieHeaderFrom(res) };
}

function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function expectSilence(socket, event, ms = 400) {
  return new Promise((resolve, reject) => {
    const onEvent = (payload) => {
      clearTimeout(timer);
      reject(new Error(`unexpected ${event}: ${JSON.stringify(payload)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, ms);
    socket.once(event, onEvent);
  });
}

/** Connects and resolves once the presence snapshot has arrived, so later events are ordered. */
function connect(cookie, extra = {}) {
  const socket = ioClient(srv.url, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: cookie ? { cookie } : {},
    ...extra,
  });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("presence:snapshot", (snapshot) => resolve({ socket, snapshot }));
    socket.once("connect_error", (err) => reject(Object.assign(err, { socket })));
  });
}

describe("socket authentication", () => {
  it("rejects connections without a valid access cookie", async () => {
    await expect(connect()).rejects.toMatchObject({ message: "UNAUTHORIZED" });
    await expect(connect("access=forged.token.value")).rejects.toMatchObject({
      message: "UNAUTHORIZED",
    });
  });

  it("derives identity from the cookie and ignores a forged userId in the query", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { snapshot } = await connect(alice.cookie, { query: { userId: bob.user._id } });
    expect(snapshot.userIds).toContain(alice.user._id);
    expect(snapshot.userIds).not.toContain(bob.user._id);
  });

  it("rejects sockets after logout revokes the session", async () => {
    const alice = await createUser();
    await http()
      .post("/api/v1/auth/logout")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", alice.cookie);
    await expect(connect(alice.cookie)).rejects.toMatchObject({ message: "UNAUTHORIZED" });
  });
});

describe("presence", () => {
  it("keeps a user online while any of their devices is connected", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { socket: bobSocket } = await connect(bob.cookie);

    const onlineEvent = waitFor(bobSocket, "presence:update");
    const { socket: phone } = await connect(alice.cookie);
    expect(await onlineEvent).toMatchObject({ userId: alice.user._id, online: true });

    const { socket: laptop } = await connect(alice.cookie);
    phone.disconnect();
    await expectSilence(bobSocket, "presence:update");

    const offlineEvent = waitFor(bobSocket, "presence:update");
    laptop.disconnect();
    const payload = await offlineEvent;
    expect(payload).toMatchObject({ userId: alice.user._id, online: false });
    expect(payload.lastSeenAt).toBeTruthy();
  });
});

describe("realtime messaging", () => {
  it("delivers new messages to the receiver and to the sender's other devices", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { socket: bobSocket } = await connect(bob.cookie);
    const { socket: aliceTablet } = await connect(alice.cookie);

    const bobGets = waitFor(bobSocket, "message:new");
    const aliceTabletGets = waitFor(aliceTablet, "message:new");
    const res = await http()
      .post(`/api/v1/messages/${bob.user._id}`)
      .set("Origin", "http://localhost:5173")
      .set("Cookie", alice.cookie)
      .send({ text: "ping" });
    expect(res.status).toBe(201);

    const received = await bobGets;
    expect(received).toMatchObject({
      text: "ping",
      senderId: alice.user._id,
      receiverId: bob.user._id,
    });
    expect(received._id).toBe(res.body.data.message._id);
    expect((await aliceTabletGets)._id).toBe(res.body.data.message._id);
  });

  it("relays typing indicators with validation and throttling", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { socket: bobSocket } = await connect(bob.cookie);
    const { socket: aliceSocket } = await connect(alice.cookie);

    const typing = waitFor(bobSocket, "typing");
    const ack = await aliceSocket.emitWithAck("typing:start", { to: bob.user._id });
    expect(ack).toEqual({ ok: true });
    expect(await typing).toEqual({ from: alice.user._id, isTyping: true });

    const throttled = await aliceSocket.emitWithAck("typing:start", { to: bob.user._id });
    expect(throttled).toMatchObject({ ok: true, throttled: true });

    const invalid = await aliceSocket.emitWithAck("typing:start", { to: "nope" });
    expect(invalid).toMatchObject({ ok: false });

    const stopped = waitFor(bobSocket, "typing");
    await aliceSocket.emitWithAck("typing:stop", { to: bob.user._id });
    expect(await stopped).toEqual({ from: alice.user._id, isTyping: false });
  });

  it("disconnects a user's sockets when the account is disabled and tells everyone else", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { socket: aliceSocket } = await connect(alice.cookie);
    const { socket: bobSocket } = await connect(bob.cookie);

    const aliceDropped = waitFor(aliceSocket, "disconnect");
    const bobNotified = waitFor(bobSocket, "user:disabled");
    const res = await http()
      .post("/api/v1/auth/disable")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", alice.cookie)
      .send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await aliceDropped).toBe("io server disconnect");
    expect(await bobNotified).toEqual({ userId: alice.user._id });
  });
});
