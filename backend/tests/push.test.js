import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import {
  PASSWORD,
  agent,
  cookieHeaderFrom,
  openDirect,
  sendText,
  signup,
  startServer,
  uniqueUser,
} from "./helpers.js";

const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(async () => ({ statusCode: 201 })),
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));

const SUB = (n = 1) => ({
  endpoint: `https://push.example.com/send/device-${n}`,
  expirationTime: null,
  keys: { p256dh: "BPyLI3NJN1Gse4NOnwt2cRyczcW", auth: "GknVr3NmQnZLxiln" },
});

const flush = () => new Promise((r) => setTimeout(r, 150));
const sentTo = (endpoint) =>
  sendNotification.mock.calls
    .filter(([sub]) => sub.endpoint === endpoint)
    .map(([, body]) => JSON.parse(body));

beforeEach(() => sendNotification.mockClear());

describe("push subscriptions", () => {
  it("advertises the VAPID key and validates subscriptions", async () => {
    const config = (await agent().get("/api/v1/config")).body.data;
    expect(config.features.push).toBe(true);
    expect(config.push.vapidPublicKey).toMatch(/^B[A-Za-z0-9_-]{80,}$/);

    const a = agent();
    await signup(a);
    expect(
      (await a.post("/api/v1/push/subscriptions").send({ ...SUB(), endpoint: "http://insecure" }))
        .status
    ).toBe(400);
    expect(
      (await a.post("/api/v1/push/subscriptions").send({ endpoint: SUB().endpoint })).status
    ).toBe(400);
    const first = await a.post("/api/v1/push/subscriptions").send(SUB());
    expect(first.status).toBe(201);
    expect(first.body.data.devices).toBe(1);
    const again = await a.post("/api/v1/push/subscriptions").send(SUB());
    expect(again.body.data.devices).toBe(1);
    const second = await a.post("/api/v1/push/subscriptions").send(SUB(2));
    expect(second.body.data.devices).toBe(2);

    const removed = await a
      .delete("/api/v1/push/subscriptions")
      .send({ endpoint: SUB(2).endpoint });
    expect(removed.status).toBe(200);
    expect(removed.body.data.devices).toBe(1);
    expect((await agent().post("/api/v1/push/subscriptions").send(SUB())).status).toBe(401);
  });

  it("pushes to offline recipients, respecting mutes, previews and dead endpoints", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    await b.post("/api/v1/push/subscriptions").send(SUB(10));
    const conv = await openDirect(a, bob._id);

    await sendText(a, conv._id, "are you there?");
    await flush();
    const [payload] = sentTo(SUB(10).endpoint);
    expect(payload).toMatchObject({
      title: alice.fullname,
      body: "are you there?",
      tag: conv._id,
      url: `/c/${conv._id}`,
    });
    // The sender's own devices are never pushed
    expect(sendNotification.mock.calls.every(([sub]) => sub.endpoint === SUB(10).endpoint)).toBe(
      true
    );

    await b.patch("/api/v1/users/me/notifications").send({ preview: false });
    await sendText(a, conv._id, "secret text");
    await flush();
    expect(sentTo(SUB(10).endpoint).at(-1).body).toBe("New message");

    await b.patch(`/api/v1/conversations/${conv._id}`).send({ muted: true });
    sendNotification.mockClear();
    await sendText(a, conv._id, "muted");
    await flush();
    expect(sendNotification).not.toHaveBeenCalled();
    await b.patch(`/api/v1/conversations/${conv._id}`).send({ muted: false });

    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await sendText(a, conv._id, "last one");
    await flush();
    sendNotification.mockClear();
    await sendText(a, conv._id, "nobody listening");
    await flush();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("drops a device when its session ends", async () => {
    const a = agent();
    const { username } = await signup(a);
    await a.post("/api/v1/push/subscriptions").send(SUB(20));
    const other = agent();
    await other.post("/api/v1/auth/login").send({ username, password: PASSWORD });
    await other.post("/api/v1/push/subscriptions").send(SUB(21));

    await other.post("/api/v1/auth/logout");
    expect((await a.post("/api/v1/push/subscriptions").send(SUB(20))).body.data.devices).toBe(1);
    await a.post("/api/v1/auth/logout-all");
    const back = agent();
    await back.post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect((await back.post("/api/v1/push/subscriptions").send(SUB(22))).body.data.devices).toBe(1);
  });
});

describe("push and presence", () => {
  let srv;
  const sockets = [];
  const ORIGIN = "http://localhost:5173";
  beforeAll(async () => {
    srv = await startServer();
  });
  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await srv.close();
  });

  it("does not push to someone who is connected", async () => {
    const http = () => request(srv.server);
    const make = async () => {
      const data = uniqueUser();
      const res = await http().post("/api/v1/auth/signup").set("Origin", ORIGIN).send(data);
      return { user: res.body.data.user, cookie: cookieHeaderFrom(res) };
    };
    const alice = await make();
    const bob = await make();
    await http()
      .post("/api/v1/push/subscriptions")
      .set("Origin", ORIGIN)
      .set("Cookie", bob.cookie)
      .send(SUB(30));
    const conv = (
      await http()
        .post("/api/v1/conversations/direct")
        .set("Origin", ORIGIN)
        .set("Cookie", alice.cookie)
        .send({ userId: bob.user._id })
    ).body.data.conversation;

    const socket = ioClient(srv.url, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { cookie: bob.cookie },
    });
    sockets.push(socket);
    await new Promise((resolve) => socket.once("presence:snapshot", resolve));

    const received = new Promise((resolve) => socket.once("message:new", resolve));
    await http()
      .post(`/api/v1/conversations/${conv._id}/messages`)
      .set("Origin", ORIGIN)
      .set("Cookie", alice.cookie)
      .send({ text: "online, no push" });
    await received;
    await flush();
    expect(sentTo(SUB(30).endpoint)).toEqual([]);
  });
});
