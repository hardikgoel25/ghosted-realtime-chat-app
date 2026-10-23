import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import {
  PASSWORD,
  agent,
  cookieHeaderFrom,
  createGroup,
  sendText,
  signup,
  startServer,
  uniqueUser,
} from "./helpers.js";

const messagesOf = async (a, id) =>
  (await a.get(`/api/v1/conversations/${id}/messages`)).body.data.items;
const kinds = (items) => items.filter((m) => m.type === "system").map((m) => m.system.kind);

describe("group creation", () => {
  it("creates a group with the creator as admin and a system message everyone sees", async () => {
    expect((await agent().get("/api/v1/config")).body.data.features.groups).toBe(true);

    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const c = agent();
    const { user: casey } = await signup(c);

    const group = await createGroup(a, "  Weekend plans ", [bob._id, casey._id, alice._id]);
    expect(group.type).toBe("group");
    expect(group.group).toMatchObject({ name: "Weekend plans", memberCount: 3 });
    expect(group.me).toMatchObject({ role: "admin", unread: 0 });
    expect(group.participants.find((p) => p.userId === alice._id).role).toBe("admin");
    expect(group.participants.find((p) => p.userId === bob._id).role).toBe("member");
    expect(group.blocked).toEqual({ byMe: false, byThem: false });
    expect(group.lastMessage.type).toBe("system");
    expect(group.lastMessage.system).toMatchObject({
      kind: "group_created",
      targetIds: expect.arrayContaining([bob._id, casey._id]),
    });

    const bobList = (await b.get("/api/v1/conversations")).body.data.items;
    expect(bobList.map((x) => x._id)).toContain(group._id);
    expect(bobList[0].me.unread).toBe(0);
    const bobMessages = await messagesOf(b, group._id);
    expect(kinds(bobMessages)).toEqual(["group_created"]);
    expect(bobMessages[0].senderId).toBe(alice._id);

    const stranger = agent();
    await signup(stranger);
    expect((await stranger.get(`/api/v1/conversations/${group._id}`)).status).toBe(404);
  });

  it("validates input and refuses blocked people", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);

    const post = (body) => a.post("/api/v1/conversations/group").send(body);
    expect((await post({ name: "x", memberIds: [] })).status).toBe(400);
    expect((await post({ name: "", memberIds: [bob._id] })).status).toBe(400);
    expect((await post({ name: "a".repeat(61), memberIds: [bob._id] })).status).toBe(400);
    expect((await post({ name: "Only me", memberIds: [alice._id] })).status).toBe(400);
    expect((await post({ name: "Ghost", memberIds: ["64b000000000000000000000"] })).status).toBe(
      404
    );

    await b.post(`/api/v1/users/${alice._id}/block`);
    const blocked = await post({ name: "Nope", memberIds: [bob._id] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("BLOCKED");
  });
});

describe("group membership", () => {
  it("lets admins rename, add, remove and promote; members cannot", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const c = agent();
    const { user: casey } = await signup(c);
    const d = agent();
    const { user: dana } = await signup(d);
    const group = await createGroup(a, "Team", [bob._id]);
    const url = `/api/v1/conversations/${group._id}`;

    // Members are not admins
    expect((await b.patch(`${url}/group`).send({ name: "Hijack" })).status).toBe(403);
    expect((await b.post(`${url}/members`).send({ userIds: [casey._id] })).status).toBe(403);
    expect((await b.delete(`${url}/members/${alice._id}`)).status).toBe(403);
    // Outsiders see nothing at all
    expect((await c.patch(`${url}/group`).send({ name: "Hijack" })).status).toBe(404);

    const renamed = await a.patch(`${url}/group`).send({ name: "Core team", description: "hi" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.conversation.group).toMatchObject({
      name: "Core team",
      description: "hi",
    });

    const added = await a.post(`${url}/members`).send({ userIds: [casey._id, dana._id] });
    expect(added.status).toBe(200);
    expect(added.body.data.conversation.group.memberCount).toBe(4);
    expect(kinds(await messagesOf(c, group._id))).toEqual(["member_added"]);

    const promoted = await a.patch(`${url}/members/${casey._id}`).send({ role: "admin" });
    expect(promoted.status).toBe(200);
    expect(
      promoted.body.data.conversation.participants.find((p) => p.userId === casey._id).role
    ).toBe("admin");
    // The new admin can act, and a lone admin cannot demote themselves
    expect((await c.post(`${url}/members`).send({ userIds: [dana._id] })).status).toBe(200);
    expect((await c.patch(`${url}/members/${casey._id}`).send({ role: "member" })).status).toBe(
      200
    );
    expect((await a.patch(`${url}/members/${alice._id}`).send({ role: "member" })).status).toBe(
      400
    );

    const removed = await a.delete(`${url}/members/${dana._id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.conversation.group.memberCount).toBe(3);
    expect((await d.get(url)).status).toBe(404);
    expect((await d.get("/api/v1/conversations")).body.data.items.map((x) => x._id)).not.toContain(
      group._id
    );
    expect((await sendText(d, group._id, "still here?")).status).toBe(404);

    const all = await messagesOf(a, group._id);
    expect(kinds(all)).toEqual([
      "group_created",
      "group_renamed",
      "group_description",
      "member_added",
      "admin_granted",
      "admin_revoked",
      "member_removed",
    ]);
    expect(all.find((m) => m.system?.kind === "group_renamed").system.text).toBe("Core team");
    // Former members stay listed (for history) but flagged
    const view = (await a.get(url)).body.data.conversation;
    expect(view.participants.find((p) => p.userId === dana._id).leftAt).toBeTruthy();
  });

  it("re-adding someone hides the history they missed", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const group = await createGroup(a, "Rejoin", [bob._id]);
    await sendText(a, group._id, "before bob left");
    await b.delete(`/api/v1/conversations/${group._id}`);
    await sendText(a, group._id, "while bob was away");
    expect(
      (await a.post(`/api/v1/conversations/${group._id}/members`).send({ userIds: [bob._id] }))
        .status
    ).toBe(200);
    await sendText(a, group._id, "welcome back");
    const texts = (await messagesOf(b, group._id)).map((m) => m.text || m.system?.kind);
    expect(texts).toEqual(["member_added", "welcome back"]);
  });

  it("passes admin rights on when the last admin leaves and deletes an empty group", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const c = agent();
    const { user: casey } = await signup(c);
    const group = await createGroup(a, "Handover", [bob._id, casey._id]);
    const url = `/api/v1/conversations/${group._id}`;

    const left = await a.delete(url);
    expect(left.status).toBe(200);
    expect(left.body.data.left).toBe(true);
    expect((await a.get(url)).status).toBe(404);

    const view = (await b.get(url)).body.data.conversation;
    expect(view.group.memberCount).toBe(2);
    // Bob joined before Casey (same batch, creation order) so he inherits admin
    expect(view.participants.find((p) => p.userId === bob._id).role).toBe("admin");
    expect(kinds(await messagesOf(b, group._id)).at(-1)).toBe("member_left");

    await c.delete(url);
    await b.delete(url);
    expect((await b.get(url)).status).toBe(404);
    expect((await a.get(url)).status).toBe(404);
  });

  it("groups keep working between people who block each other and after account deletion", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const c = agent();
    const { user: casey } = await signup(c);
    const group = await createGroup(a, "Mixed", [bob._id, casey._id]);

    await b.post(`/api/v1/users/${alice._id}/block`);
    expect((await sendText(a, group._id, "group still works")).status).toBe(201);
    expect((await sendText(b, group._id, "yes it does")).status).toBe(201);
    const bobView = (await b.get(`/api/v1/conversations/${group._id}`)).body.data.conversation;
    expect(bobView.blocked).toEqual({ byMe: false, byThem: false });
    expect(bobView.me.unread).toBe(1);
    expect(
      (await a.get(`/api/v1/conversations/${group._id}`)).body.data.conversation.me.unread
    ).toBe(1);

    expect((await c.delete("/api/v1/auth/account").send({ password: PASSWORD })).status).toBe(200);
    const after = (await a.get(`/api/v1/conversations/${group._id}`)).body.data.conversation;
    expect(after.group.memberCount).toBe(2);
    expect(kinds(await messagesOf(a, group._id)).at(-1)).toBe("member_left");
  });

  it("lets admins delete anyone's message for everyone, but not system messages", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const group = await createGroup(a, "Moderated", [bob._id]);
    const sent = (await sendText(b, group._id, "oops")).body.data.message;
    const fromA = (await sendText(a, group._id, "mine")).body.data.message;

    expect(
      (
        await b.delete(`/api/v1/conversations/${group._id}/messages/${fromA._id}`).query({
          scope: "everyone",
        })
      ).status
    ).toBe(403);
    const byAdmin = await a
      .delete(`/api/v1/conversations/${group._id}/messages/${sent._id}`)
      .query({ scope: "everyone" });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.message.deletedAt).toBeTruthy();

    const system = (await messagesOf(a, group._id))[0];
    expect(system.type).toBe("system");
    expect(
      (
        await a.delete(`/api/v1/conversations/${group._id}/messages/${system._id}`).query({
          scope: "everyone",
        })
      ).status
    ).toBe(403);
    expect(
      (await a.put(`/api/v1/conversations/${group._id}/messages/${system._id}/reactions/👍`)).status
    ).toBe(400);
    expect((await a.patch("/api/v1/conversations/x/group").send({ name: "y" })).status).toBe(400);
  });
});

describe("group realtime", () => {
  let srv;
  const sockets = [];
  const ORIGIN = "http://localhost:5173";

  beforeAll(async () => {
    srv = await startServer();
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });
  afterAll(async () => {
    await srv.close();
  });

  const http = () => request(srv.server);
  async function createUser() {
    const data = uniqueUser();
    const res = await http().post("/api/v1/auth/signup").set("Origin", ORIGIN).send(data);
    return { ...data, user: res.body.data.user, cookie: cookieHeaderFrom(res) };
  }
  function connect(cookie) {
    const socket = ioClient(srv.url, {
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { cookie },
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once("presence:snapshot", () => resolve(socket));
      socket.once("connect_error", reject);
    });
  }
  const waitFor = (socket, event, predicate = () => true) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), 3000);
      const handler = (payload) => {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });

  it("fans messages out to every member and tells removed members to drop the chat", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const casey = await createUser();
    const bobSocket = await connect(bob.cookie);
    const caseySocket = await connect(casey.cookie);

    const bobCreated = waitFor(bobSocket, "conversation:updated");
    const res = await http()
      .post("/api/v1/conversations/group")
      .set("Origin", ORIGIN)
      .set("Cookie", alice.cookie)
      .send({ name: "Live", memberIds: [bob.user._id, casey.user._id] });
    expect(res.status).toBe(201);
    const group = res.body.data.conversation;
    expect((await bobCreated).conversation._id).toBe(group._id);

    const bobGets = waitFor(bobSocket, "message:new", (p) => p.message.type === "text");
    const caseyGets = waitFor(caseySocket, "message:new", (p) => p.message.type === "text");
    await http()
      .post(`/api/v1/conversations/${group._id}/messages`)
      .set("Origin", ORIGIN)
      .set("Cookie", alice.cookie)
      .send({ text: "hello group" });
    expect((await bobGets).message.text).toBe("hello group");
    expect((await caseyGets).message.text).toBe("hello group");

    const caseyRemoved = waitFor(caseySocket, "conversation:removed");
    const bobNotice = waitFor(bobSocket, "message:new", (p) => p.message.type === "system");
    await http()
      .delete(`/api/v1/conversations/${group._id}/members/${casey.user._id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", alice.cookie);
    expect(await caseyRemoved).toEqual({ conversationId: group._id, reason: "removed" });
    expect((await bobNotice).message.system).toMatchObject({
      kind: "member_removed",
      targetIds: [casey.user._id],
    });
  });
});
