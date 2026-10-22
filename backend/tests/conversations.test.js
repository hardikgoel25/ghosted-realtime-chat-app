import { describe, expect, it } from "vitest";
import { PASSWORD, agent, openDirect, sendText, signup } from "./helpers.js";

const idsOf = (res) => res.body.data.items.map((c) => c._id);

describe("direct conversations", () => {
  it("is created once per pair, with populated participants and a zero unread count", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);

    const first = await a.post("/api/v1/conversations/direct").send({ userId: bob._id });
    expect(first.status).toBe(201);
    const conv = first.body.data.conversation;
    expect(conv.type).toBe("direct");
    expect(conv.participants.map((p) => p.userId).sort()).toEqual([alice._id, bob._id].sort());
    const bobSide = conv.participants.find((p) => p.userId === bob._id);
    expect(bobSide.user.username).toBe(bob.username);
    expect(bobSide.user).not.toHaveProperty("email");
    expect(conv.me.unread).toBe(0);
    expect(conv.lastMessage).toBeNull();

    const again = await b.post("/api/v1/conversations/direct").send({ userId: alice._id });
    expect(again.status).toBe(200);
    expect(again.body.data.conversation._id).toBe(conv._id);
  });

  it("refuses self, disabled and deleted counterparts", async () => {
    const a = agent();
    const { user: me } = await signup(a);
    expect((await a.post("/api/v1/conversations/direct").send({ userId: me._id })).status).toBe(
      400
    );

    const d = agent();
    const { user: disabled } = await signup(d);
    await d.post("/api/v1/auth/disable").send({ password: PASSWORD });
    expect(
      (await a.post("/api/v1/conversations/direct").send({ userId: disabled._id })).status
    ).toBe(403);

    const g = agent();
    const { user: gone } = await signup(g);
    await g.delete("/api/v1/auth/account").send({ password: PASSWORD });
    expect((await a.post("/api/v1/conversations/direct").send({ userId: gone._id })).status).toBe(
      404
    );
  });

  it("hides an empty conversation from everyone but its creator until the first message", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);

    expect(idsOf(await a.get("/api/v1/conversations"))).toContain(conv._id);
    expect(idsOf(await b.get("/api/v1/conversations"))).not.toContain(conv._id);

    await sendText(a, conv._id, "hi bob");
    const bobList = await b.get("/api/v1/conversations");
    expect(idsOf(bobList)).toContain(conv._id);
    expect(bobList.body.data.items[0].lastMessage.text).toBe("hi bob");
    expect(bobList.body.data.items[0].me.unread).toBe(1);
  });
});

describe("messages in a conversation", () => {
  it("sends and lists messages in chronological order with cursor pagination", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);

    for (let i = 1; i <= 35; i++) {
      const res = await sendText(i % 2 ? a : b, conv._id, `msg ${i}`);
      expect(res.status, `msg ${i}`).toBe(201);
      expect(res.body.data.message.conversationId).toBe(conv._id);
    }

    const page1 = await a.get(`/api/v1/conversations/${conv._id}/messages?limit=30`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(30);
    expect(page1.body.data.items[0].text).toBe("msg 6");
    expect(page1.body.data.items.at(-1).text).toBe("msg 35");

    const page2 = await a.get(
      `/api/v1/conversations/${conv._id}/messages?limit=30&cursor=${page1.body.data.nextCursor}`
    );
    expect(page2.body.data.items.map((m) => m.text)).toEqual([
      "msg 1",
      "msg 2",
      "msg 3",
      "msg 4",
      "msg 5",
    ]);
    expect(page2.body.data.nextCursor).toBeNull();

    const bobView = await b.get(`/api/v1/conversations/${conv._id}/messages?limit=5`);
    expect(bobView.body.data.items.map((m) => m.text)).toEqual([
      "msg 31",
      "msg 32",
      "msg 33",
      "msg 34",
      "msg 35",
    ]);
  });

  it("is idempotent for retries that carry the same clientId", async () => {
    const a = agent();
    await signup(a);
    const { user: bob } = await signup(agent());
    const conv = await openDirect(a, bob._id);
    const clientId = "4b1e5a0e-9c8f-4d2a-9b7e-1f2a3c4d5e6f";

    const first = await sendText(a, conv._id, "once", { clientId });
    const retry = await sendText(a, conv._id, "once", { clientId });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.message._id).toBe(first.body.data.message._id);
    expect(
      (await a.get(`/api/v1/conversations/${conv._id}/messages`)).body.data.items
    ).toHaveLength(1);
  });

  it("refuses access to conversations the user is not part of", async () => {
    const a = agent();
    await signup(a);
    const { user: bob } = await signup(agent());
    const conv = await openDirect(a, bob._id);
    const stranger = agent();
    await signup(stranger);
    expect((await stranger.get(`/api/v1/conversations/${conv._id}`)).status).toBe(404);
    expect((await stranger.get(`/api/v1/conversations/${conv._id}/messages`)).status).toBe(404);
    expect((await sendText(stranger, conv._id, "let me in")).status).toBe(404);
  });
});

describe("unread counts and read receipts", () => {
  it("counts unread per participant, resets on read, and exposes read cursors reciprocally", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);

    await sendText(a, conv._id, "one");
    const last = await sendText(a, conv._id, "two");

    const aliceView = await a.get(`/api/v1/conversations/${conv._id}`);
    expect(aliceView.body.data.conversation.me.unread).toBe(0);
    let bobView = await b.get(`/api/v1/conversations/${conv._id}`);
    expect(bobView.body.data.conversation.me.unread).toBe(2);
    const bobCursorBefore = aliceView.body.data.conversation.participants.find(
      (p) => p.userId === bob._id
    );
    expect(bobCursorBefore.lastReadAt).toBeNull();

    const read = await b.post(`/api/v1/conversations/${conv._id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.conversation.me.unread).toBe(0);

    const afterRead = await a.get(`/api/v1/conversations/${conv._id}`);
    const bobCursor = afterRead.body.data.conversation.participants.find(
      (p) => p.userId === bob._id
    );
    expect(new Date(bobCursor.lastReadAt).getTime()).toBeGreaterThanOrEqual(
      new Date(last.body.data.message.createdAt).getTime()
    );

    // Bob turns read receipts off: Alice no longer sees his cursor, and vice versa
    await b.patch("/api/v1/users/me/privacy").send({ readReceipts: false });
    const hidden = await a.get(`/api/v1/conversations/${conv._id}`);
    expect(
      hidden.body.data.conversation.participants.find((p) => p.userId === bob._id).lastReadAt
    ).toBeNull();
    bobView = await b.get(`/api/v1/conversations/${conv._id}`);
    expect(
      bobView.body.data.conversation.participants.find((p) => p.userId === alice._id).lastReadAt
    ).toBeNull();
    // but each still sees their own
    expect(bobView.body.data.conversation.me.lastReadAt).not.toBeNull();
  });
});

describe("conversation list, filters and flags", () => {
  it("orders by latest activity, filters unread and archived, and un-archives on new messages", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const c = agent();
    const { user: carol } = await signup(c);

    const withBob = await openDirect(a, bob._id);
    const withCarol = await openDirect(a, carol._id);
    await sendText(a, withBob._id, "to bob");
    await sendText(a, withCarol._id, "to carol");

    let list = await a.get("/api/v1/conversations");
    expect(idsOf(list)).toEqual([withCarol._id, withBob._id]);

    await sendText(b, withBob._id, "bob replies");
    list = await a.get("/api/v1/conversations");
    expect(idsOf(list)).toEqual([withBob._id, withCarol._id]);
    expect(idsOf(await a.get("/api/v1/conversations?filter=unread"))).toEqual([withBob._id]);

    const archived = await a
      .patch(`/api/v1/conversations/${withCarol._id}`)
      .send({ archived: true, pinned: true, muted: 60 });
    expect(archived.status).toBe(200);
    expect(archived.body.data.conversation.me.archived).toBe(true);
    expect(archived.body.data.conversation.me.pinned).toBe(true);
    expect(archived.body.data.conversation.me.muted).toBe(true);
    expect(idsOf(await a.get("/api/v1/conversations"))).toEqual([withBob._id]);
    expect(idsOf(await a.get("/api/v1/conversations?filter=archived"))).toEqual([withCarol._id]);
    // Carol does not see Alice's private flags
    expect(
      (await c.get(`/api/v1/conversations/${withCarol._id}`)).body.data.conversation.me.archived
    ).toBe(false);

    await sendText(c, withCarol._id, "carol again");
    expect(idsOf(await a.get("/api/v1/conversations"))).toEqual([withCarol._id, withBob._id]);

    const unmuted = await a.patch(`/api/v1/conversations/${withCarol._id}`).send({ muted: false });
    expect(unmuted.body.data.conversation.me.muted).toBe(false);
    expect((await a.patch(`/api/v1/conversations/${withCarol._id}`).send({})).status).toBe(400);
    expect((await a.patch(`/api/v1/conversations/${withCarol._id}`).send({ nope: 1 })).status).toBe(
      400
    );
  });

  it("paginates the list with a composite cursor", async () => {
    const a = agent();
    await signup(a);
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const { user } = await signup(agent());
      const conv = await openDirect(a, user._id);
      await sendText(a, conv._id, `hello ${i}`);
      ids.unshift(conv._id);
    }
    const page1 = await a.get("/api/v1/conversations?limit=2");
    expect(idsOf(page1)).toEqual(ids.slice(0, 2));
    expect(page1.body.data.nextCursor).toBeTruthy();
    const page2 = await a.get(`/api/v1/conversations?limit=2&cursor=${page1.body.data.nextCursor}`);
    expect(idsOf(page2)).toEqual(ids.slice(2));
    expect(page2.body.data.nextCursor).toBeNull();
    expect((await a.get("/api/v1/conversations?cursor=garbage")).status).toBe(400);
  });

  it("clears a chat for one side only and archives it", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);
    await sendText(a, conv._id, "old 1");
    await sendText(b, conv._id, "old 2");

    const cleared = await a.delete(`/api/v1/conversations/${conv._id}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.conversation.me.archived).toBe(true);
    expect(
      (await a.get(`/api/v1/conversations/${conv._id}/messages`)).body.data.items
    ).toHaveLength(0);
    expect(
      (await b.get(`/api/v1/conversations/${conv._id}/messages`)).body.data.items
    ).toHaveLength(2);

    await sendText(b, conv._id, "new one");
    const mine = await a.get(`/api/v1/conversations/${conv._id}/messages`);
    expect(mine.body.data.items.map((m) => m.text)).toEqual(["new one"]);
  });
});

describe("users directory", () => {
  it("lists other active users with search and excludes self, disabled and deleted accounts", async () => {
    const a = agent();
    const { user: me } = await signup(a, { fullname: "Zed Searcher" });
    const { user: findMe } = await signup(agent(), {
      fullname: "Find Me Please",
      username: `findme_${Date.now().toString(36)}`,
    });
    const d = agent();
    const { user: disabled } = await signup(d);
    await d.post("/api/v1/auth/disable").send({ password: PASSWORD });
    const g = agent();
    const { user: gone } = await signup(g);
    await g.delete("/api/v1/auth/account").send({ password: PASSWORD });

    const all = await a.get("/api/v1/users");
    const ids = all.body.data.items.map((u) => u._id);
    expect(ids).toContain(findMe._id);
    expect(ids).not.toContain(me._id);
    expect(ids).not.toContain(disabled._id);
    expect(ids).not.toContain(gone._id);
    for (const u of all.body.data.items) {
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("email");
    }

    expect(
      (await a.get(`/api/v1/users?q=${findMe.username.slice(0, 5)}`)).body.data.items.map(
        (u) => u._id
      )
    ).toEqual([findMe._id]);
    expect((await a.get("/api/v1/users?q=me%20please")).body.data.items.map((u) => u._id)).toEqual([
      findMe._id,
    ]);
    expect((await a.get("/api/v1/users?q=.*")).body.data.items).toHaveLength(0);
  });

  it("exposes check-username publicly with normalisation", async () => {
    const { username } = await signup(agent());
    expect(
      (await agent().get(`/api/v1/users/check-username?u=${username.toUpperCase()}`)).body.data
        .available
    ).toBe(false);
    expect(
      (await agent().get("/api/v1/users/check-username?u=definitely_free_name")).body.data.available
    ).toBe(true);
    expect((await agent().get("/api/v1/users/check-username?u=no%20spaces")).status).toBe(400);
  });
});
