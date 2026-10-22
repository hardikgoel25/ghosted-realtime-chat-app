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

const ORIGIN = "http://localhost:5173";

function http() {
  return request(srv.server);
}

async function createUser() {
  const data = uniqueUser();
  const res = await http().post("/api/v1/auth/signup").set("Origin", ORIGIN).send(data);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return { ...data, user: res.body.data.user, cookie: cookieHeaderFrom(res) };
}

async function directBetween(a, b) {
  const res = await http()
    .post("/api/v1/conversations/direct")
    .set("Origin", ORIGIN)
    .set("Cookie", a.cookie)
    .send({ userId: b.user._id });
  return res.body.data.conversation;
}

function send(as, conversationId, text) {
  return http()
    .post(`/api/v1/conversations/${conversationId}/messages`)
    .set("Origin", ORIGIN)
    .set("Cookie", as.cookie)
    .send({ text });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
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
    await http().post("/api/v1/auth/logout").set("Origin", ORIGIN).set("Cookie", alice.cookie);
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
  it("delivers new messages and conversation updates to every participant device", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const conv = await directBetween(alice, bob);
    const { socket: bobSocket } = await connect(bob.cookie);
    const { socket: aliceTablet } = await connect(alice.cookie);

    const bobGets = waitFor(bobSocket, "message:new");
    const bobConv = waitFor(bobSocket, "conversation:updated");
    const aliceTabletGets = waitFor(aliceTablet, "message:new");
    const aliceConv = waitFor(aliceTablet, "conversation:updated");
    const res = await send(alice, conv._id, "ping");
    expect(res.status).toBe(201);

    const received = await bobGets;
    expect(received.conversationId).toBe(conv._id);
    expect(received.message).toMatchObject({ text: "ping", senderId: alice.user._id });
    expect(received.message._id).toBe(res.body.data.message._id);
    expect((await aliceTabletGets).message._id).toBe(res.body.data.message._id);

    // Each side gets its own view: Bob has 1 unread, Alice sees Bob's delivery cursor advance
    expect((await bobConv).conversation.me.unread).toBe(1);
    const aliceView = (await aliceConv).conversation;
    expect(aliceView.me.unread).toBe(0);
    const bobCursor = aliceView.participants.find((p) => p.userId === bob.user._id);
    expect(new Date(bobCursor.lastDeliveredAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body.data.message.createdAt).getTime()
    );
  });

  it("reports seen status when the other side reads", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const conv = await directBetween(alice, bob);
    const { socket: aliceSocket } = await connect(alice.cookie);
    await send(alice, conv._id, "read me");

    const seen = waitFor(aliceSocket, "message:status", (p) => p.status === "seen");
    const res = await http()
      .post(`/api/v1/conversations/${conv._id}/read`)
      .set("Origin", ORIGIN)
      .set("Cookie", bob.cookie);
    expect(res.status).toBe(200);
    expect(await seen).toMatchObject({
      conversationId: conv._id,
      userId: bob.user._id,
      status: "seen",
    });
  });

  it("catches up missed messages on sync and marks them delivered", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const conv = await directBetween(alice, bob);
    const { socket: aliceSocket } = await connect(alice.cookie);
    const since = new Date().toISOString();
    await send(alice, conv._id, "while you were away 1");
    await send(alice, conv._id, "while you were away 2");

    const delivered = waitFor(aliceSocket, "message:status", (p) => p.status === "delivered");
    const { socket: bobSocket } = await connect(bob.cookie);
    const ack = await bobSocket.emitWithAck("sync", { conversations: [{ id: conv._id, since }] });
    expect(ack.ok).toBe(true);
    expect(ack.conversations[0].messages.map((m) => m.text)).toEqual([
      "while you were away 1",
      "while you were away 2",
    ]);
    expect(await delivered).toMatchObject({ conversationId: conv._id, userId: bob.user._id });

    const foreign = await bobSocket.emitWithAck("sync", {
      conversations: [{ id: "64b000000000000000000000" }],
    });
    expect(foreign.conversations).toEqual([]);
  });

  it("relays typing indicators per conversation with validation and throttling", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const stranger = await createUser();
    const conv = await directBetween(alice, bob);
    const { socket: bobSocket } = await connect(bob.cookie);
    const { socket: aliceSocket } = await connect(alice.cookie);
    const { socket: strangerSocket } = await connect(stranger.cookie);

    expect(
      await aliceSocket.emitWithAck("conversation:open", { conversationId: conv._id })
    ).toEqual({ ok: true });
    expect(
      await strangerSocket.emitWithAck("conversation:open", { conversationId: conv._id })
    ).toMatchObject({ ok: false });

    const typing = waitFor(bobSocket, "typing");
    expect(await aliceSocket.emitWithAck("typing:start", { conversationId: conv._id })).toEqual({
      ok: true,
    });
    expect(await typing).toEqual({
      conversationId: conv._id,
      userId: alice.user._id,
      isTyping: true,
    });

    expect(
      await aliceSocket.emitWithAck("typing:start", { conversationId: conv._id })
    ).toMatchObject({ throttled: true });
    expect(await aliceSocket.emitWithAck("typing:start", { conversationId: "nope" })).toMatchObject(
      { ok: false }
    );
    expect(
      await strangerSocket.emitWithAck("typing:start", { conversationId: conv._id })
    ).toMatchObject({ ok: false });

    const stopped = waitFor(bobSocket, "typing");
    await aliceSocket.emitWithAck("typing:stop", { conversationId: conv._id });
    expect(await stopped).toEqual({
      conversationId: conv._id,
      userId: alice.user._id,
      isTyping: false,
    });
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
      .set("Origin", ORIGIN)
      .set("Cookie", alice.cookie)
      .send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(await aliceDropped).toBe("io server disconnect");
    expect(await bobNotified).toEqual({ userId: alice.user._id });
  });
});
