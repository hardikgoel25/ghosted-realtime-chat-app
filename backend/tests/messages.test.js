import { describe, expect, it } from "vitest";
import { agent, signup } from "./helpers.js";

describe("messages", () => {
  it("sends and lists messages in chronological order with cursor pagination", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);

    for (let i = 1; i <= 35; i++) {
      const from = i % 2 ? a : b;
      const to = i % 2 ? bob : alice;
      const res = await from.post(`/api/v1/messages/${to._id}`).send({ text: `msg ${i}` });
      expect(res.status).toBe(201);
      expect(res.body.data.message.text).toBe(`msg ${i}`);
    }

    const page1 = await a.get(`/api/v1/messages/${bob._id}?limit=30`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(30);
    expect(page1.body.data.items[0].text).toBe("msg 6");
    expect(page1.body.data.items.at(-1).text).toBe("msg 35");
    expect(page1.body.data.nextCursor).toBeTruthy();

    const page2 = await a.get(
      `/api/v1/messages/${bob._id}?limit=30&cursor=${page1.body.data.nextCursor}`
    );
    expect(page2.body.data.items.map((m) => m.text)).toEqual([
      "msg 1",
      "msg 2",
      "msg 3",
      "msg 4",
      "msg 5",
    ]);
    expect(page2.body.data.nextCursor).toBeNull();

    // Bob sees the same conversation
    const bobView = await b.get(`/api/v1/messages/${alice._id}?limit=5`);
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
    const clientId = "4b1e5a0e-9c8f-4d2a-9b7e-1f2a3c4d5e6f";

    const first = await a.post(`/api/v1/messages/${bob._id}`).send({ text: "once", clientId });
    const retry = await a.post(`/api/v1/messages/${bob._id}`).send({ text: "once", clientId });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.message._id).toBe(first.body.data.message._id);

    const list = await a.get(`/api/v1/messages/${bob._id}`);
    expect(list.body.data.items).toHaveLength(1);
  });

  it("lists other active users with search and excludes self, disabled and deleted accounts", async () => {
    const a = agent();
    const { user: me } = await signup(a, { fullname: "Zed Searcher" });
    const { user: findMe } = await signup(agent(), {
      fullname: "Find Me Please",
      username: `findme_${Date.now().toString(36)}`,
    });
    const d = agent();
    const { user: disabled } = await signup(d);
    await d.post("/api/v1/auth/disable").send({ password: "correct-horse-battery-staple-42" });
    const g = agent();
    const { user: gone } = await signup(g);
    await g.delete("/api/v1/auth/account").send({ password: "correct-horse-battery-staple-42" });

    const all = await a.get("/api/v1/users");
    expect(all.status).toBe(200);
    const ids = all.body.data.items.map((u) => u._id);
    expect(ids).toContain(findMe._id);
    expect(ids).not.toContain(me._id);
    expect(ids).not.toContain(disabled._id);
    expect(ids).not.toContain(gone._id);
    for (const u of all.body.data.items) {
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("email");
    }

    const byUsername = await a.get(`/api/v1/users?q=${findMe.username.slice(0, 5)}`);
    expect(byUsername.body.data.items.map((u) => u._id)).toEqual([findMe._id]);
    const byName = await a.get("/api/v1/users?q=me%20please");
    expect(byName.body.data.items.map((u) => u._id)).toEqual([findMe._id]);
    const regexSafe = await a.get("/api/v1/users?q=.*");
    expect(regexSafe.status).toBe(200);
    expect(regexSafe.body.data.items).toHaveLength(0);
  });

  it("paginates the user list", async () => {
    const a = agent();
    await signup(a);
    for (let i = 0; i < 3; i++) await signup(agent());
    const page1 = await a.get("/api/v1/users?limit=2");
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.nextCursor).toBeTruthy();
    const page2 = await a.get(`/api/v1/users?limit=2&cursor=${page1.body.data.nextCursor}`);
    expect(page2.body.data.items).toHaveLength(1);
    expect(page2.body.data.nextCursor).toBeNull();
  });

  it("exposes check-username publicly with normalisation", async () => {
    const { username } = await signup(agent());
    const taken = await agent().get(`/api/v1/users/check-username?u=${username.toUpperCase()}`);
    expect(taken.status).toBe(200);
    expect(taken.body.data.available).toBe(false);
    const free = await agent().get("/api/v1/users/check-username?u=definitely_free_name");
    expect(free.body.data.available).toBe(true);
    const invalid = await agent().get("/api/v1/users/check-username?u=no%20spaces");
    expect(invalid.status).toBe(400);
  });
});
