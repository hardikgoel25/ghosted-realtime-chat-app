import { describe, expect, it } from "vitest";
import request from "supertest";
import { PASSWORD, agent, app, cookieHeaderFrom, openDirect, sendText, signup } from "./helpers.js";

describe("authorization", () => {
  it("requires authentication for users and conversations", async () => {
    expect((await agent().get("/api/v1/users")).status).toBe(401);
    expect((await agent().get("/api/v1/conversations")).status).toBe(401);
    expect(
      (
        await agent()
          .post("/api/v1/conversations/direct")
          .send({ userId: "64b000000000000000000000" })
      ).status
    ).toBe(401);
    expect((await sendText(agent(), "64b000000000000000000000", "x")).status).toBe(401);
  });

  it("refuses messages to disabled users and invalidates a disabled user's own session", async () => {
    const a = agent();
    await signup(a);
    const b = agent();
    const { user: bob, res: bobSignup } = await signup(b);
    const bobCookie = cookieHeaderFrom(bobSignup);
    const conv = await openDirect(a, bob._id);
    await sendText(a, conv._id, "before");

    await b.post("/api/v1/auth/disable").send({ password: PASSWORD });

    expect((await sendText(a, conv._id, "anyone there?")).status).toBe(403);
    expect((await a.get(`/api/v1/conversations/${conv._id}/messages`)).status).toBe(200);

    const stale = await request(app()).get("/api/v1/conversations").set("Cookie", bobCookie);
    expect(stale.status).toBe(401);
  });

  it("removes direct conversations of deleted users", async () => {
    const a = agent();
    await signup(a);
    const g = agent();
    const { user: gone } = await signup(g);
    const conv = await openDirect(a, gone._id);
    await sendText(a, conv._id, "hi");
    await g.delete("/api/v1/auth/account").send({ password: PASSWORD });

    expect((await a.get(`/api/v1/conversations/${conv._id}`)).status).toBe(404);
    expect((await a.post("/api/v1/conversations/direct").send({ userId: gone._id })).status).toBe(
      404
    );
    expect((await a.get(`/api/v1/users/${gone.username}`)).status).toBe(404);
    expect((await a.get("/api/v1/conversations")).body.data.items).toHaveLength(0);
  });
});

describe("CSRF origin check", () => {
  it("blocks state-changing requests from foreign origins and cross-site fetches", async () => {
    const a = agent();
    const { user: other } = await signup(agent());
    const { res: signupRes } = await signup(a);
    const cookie = cookieHeaderFrom(signupRes);
    const conv = await openDirect(a, other._id);
    const url = `/api/v1/conversations/${conv._id}/messages`;

    const foreign = await request(app())
      .post(url)
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example")
      .send({ text: "csrf" });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("CSRF_ORIGIN_MISMATCH");

    const crossSite = await request(app())
      .post(url)
      .set("Cookie", cookie)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ text: "csrf" });
    expect(crossSite.status).toBe(403);

    const refererOnly = await request(app())
      .post(url)
      .set("Cookie", cookie)
      .set("Referer", "https://evil.example/page")
      .send({ text: "csrf" });
    expect(refererOnly.status).toBe(403);

    const allowed = await request(app())
      .post(url)
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:5173")
      .send({ text: "legit" });
    expect(allowed.status).toBe(201);

    // Reads are never blocked by the origin check
    const read = await request(app())
      .get("/api/v1/auth/me")
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example");
    expect(read.status).toBe(200);
  });
});

describe("security headers", () => {
  it("sets helmet headers, a request id, and hides x-powered-by", async () => {
    const res = await agent().get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("reports health and readiness", async () => {
    const res = await agent().get("/api/v1/health");
    expect(res.body.data.db).toBe("connected");
    expect((await agent().get("/api/v1/health/ready")).status).toBe(200);
  });

  it("only sends CORS headers for allowed origins", async () => {
    const good = await request(app()).get("/api/v1/health").set("Origin", "http://localhost:5173");
    expect(good.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(good.headers["access-control-allow-credentials"]).toBe("true");
    const bad = await request(app()).get("/api/v1/health").set("Origin", "https://evil.example");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
