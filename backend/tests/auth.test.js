import { describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { ORIGIN, PASSWORD, agent, app, parseSetCookies, signup, uniqueUser } from "./helpers.js";

const BCRYPT_HASH = /\$2[aby]\$\d{2}\$/;

describe("auth: signup", () => {
  it("creates the account, sets hardened cookies and never returns password material", async () => {
    const a = agent();
    const data = uniqueUser({ username: `Mixed_Case_${Date.now().toString(36)}` });
    const res = await a.post("/api/v1/auth/signup").send(data);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    const { user } = res.body.data;
    expect(user.username).toBe(data.username.toLowerCase());
    expect(user.fullname).toBe(data.fullname);
    expect(user.status).toBe("active");
    expect(user.avatar.url).toMatch(/^data:image\/svg\+xml/);
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toMatch(BCRYPT_HASH);

    const cookies = parseSetCookies(res);
    expect(cookies.access.attrs.httponly).toBe(true);
    expect(cookies.access.attrs.samesite).toBe("Lax");
    expect(cookies.access.attrs.path).toBe("/");
    expect(cookies.refresh.attrs.httponly).toBe(true);
    expect(cookies.refresh.attrs.path).toBe("/api/v1/auth/refresh");
  });

  it("answers 400 with field details for missing or malformed input instead of crashing", async () => {
    const res = await agent().post("/api/v1/auth/signup").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["fullname", "username", "password", "gender"]));

    const bad = await agent()
      .post("/api/v1/auth/signup")
      .send(uniqueUser({ username: "John Doe!" }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe("username");
  });

  it("rejects weak, short and overlong passwords", async () => {
    const weak = await agent()
      .post("/api/v1/auth/signup")
      .send(uniqueUser({ password: "password123" }));
    expect(weak.status).toBe(400);
    expect(weak.body.error.details[0].path).toBe("password");

    const short = await agent()
      .post("/api/v1/auth/signup")
      .send(uniqueUser({ password: "Ab1!x" }));
    expect(short.status).toBe(400);

    const long = await agent()
      .post("/api/v1/auth/signup")
      .send(uniqueUser({ password: "x".repeat(73) }));
    expect(long.status).toBe(400);
  });

  it("accepts every gender option offered by the form", async () => {
    for (const gender of ["male", "female", "other", "prefer not to say"]) {
      const res = await agent().post("/api/v1/auth/signup").send(uniqueUser({ gender }));
      expect(res.status, gender).toBe(201);
    }
  });

  it("returns 409 when the username is taken", async () => {
    const a = agent();
    const { username } = await signup(a);
    const dup = await agent().post("/api/v1/auth/signup").send(uniqueUser({ username }));
    expect(dup.status).toBe(409);
  });

  it("rejects unknown fields (no mass assignment)", async () => {
    const res = await agent()
      .post("/api/v1/auth/signup")
      .send({ ...uniqueUser(), status: "disabled", isAdmin: true });
    expect(res.status).toBe(400);
  });
});

describe("auth: login and lockout", () => {
  it("logs in and gives the same answer for an unknown user and a wrong password", async () => {
    const { username } = await signup(agent());

    const ok = await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(ok.body)).not.toMatch(BCRYPT_HASH);

    const wrong = await agent()
      .post("/api/v1/auth/login")
      .send({ username, password: "nope-nope-nope" });
    const unknown = await agent()
      .post("/api/v1/auth/login")
      .send({ username: "ghost_nobody", password: "nope-nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("rejects NoSQL operator injection in the login body", async () => {
    const res = await agent()
      .post("/api/v1/auth/login")
      .send({ username: { $gt: "" }, password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("locks the account after five failed attempts, even for the right password", async () => {
    const { username } = await signup(agent());
    for (let i = 0; i < 5; i++) {
      const res = await agent()
        .post("/api/v1/auth/login")
        .send({ username, password: "wrong-password-1" });
      expect(res.status).toBe(401);
    }
    const locked = await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
  });
});

describe("auth: sessions, refresh and logout", () => {
  it("requires a valid cookie for /me", async () => {
    expect((await agent().get("/api/v1/auth/me")).status).toBe(401);
    const forged = await request(app()).get("/api/v1/auth/me").set("Cookie", "access=not.a.jwt");
    expect(forged.status).toBe(401);

    const a = agent();
    const { user } = await signup(a);
    const me = await a.get("/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user._id).toBe(user._id);
  });

  it("rotates the refresh token and revokes the session when a rotated token is replayed", async () => {
    const a = agent();
    const { res: signupRes } = await signup(a);
    const firstRefresh = parseSetCookies(signupRes).refresh.value;

    const rotated = await a.post("/api/v1/auth/refresh");
    expect(rotated.status).toBe(200);
    const secondRefresh = parseSetCookies(rotated).refresh.value;
    expect(secondRefresh).not.toBe(firstRefresh);
    expect((await a.get("/api/v1/auth/me")).status).toBe(200);

    // Replay of the already-rotated token: treated as theft, whole session revoked
    const replay = await request(app())
      .post("/api/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `refresh=${firstRefresh}`);
    expect(replay.status).toBe(401);
    expect((await a.get("/api/v1/auth/me")).status).toBe(401);
    expect((await a.post("/api/v1/auth/refresh")).status).toBe(401);
  });

  it("refuses to refresh without a refresh cookie", async () => {
    const res = await agent().post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("logout clears cookies with matching attributes and invalidates the session server-side", async () => {
    const a = agent();
    const { res: signupRes } = await signup(a);
    const access = parseSetCookies(signupRes).access.value;

    const res = await a.post("/api/v1/auth/logout");
    expect(res.status).toBe(200);
    const cleared = parseSetCookies(res);
    expect(cleared.access.value).toBe("");
    expect(cleared.access.attrs.path).toBe("/");
    expect(cleared.refresh.value).toBe("");
    expect(cleared.refresh.attrs.path).toBe("/api/v1/auth/refresh");

    // Even a client that kept the old access token is locked out
    const reuse = await request(app()).get("/api/v1/auth/me").set("Cookie", `access=${access}`);
    expect(reuse.status).toBe(401);
  });

  it("lists sessions and lets the user revoke another device", async () => {
    const phone = agent();
    const { username } = await signup(phone);
    const laptop = agent();
    expect(
      (await laptop.post("/api/v1/auth/login").send({ username, password: PASSWORD })).status
    ).toBe(200);

    const list = await laptop.get("/api/v1/auth/sessions");
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(2);
    const other = list.body.data.items.find((s) => !s.current);
    expect(other).toBeDefined();

    const revoke = await laptop.delete(`/api/v1/auth/sessions/${other._id}`);
    expect(revoke.status).toBe(200);
    expect((await phone.get("/api/v1/auth/me")).status).toBe(401);
    expect((await laptop.get("/api/v1/auth/me")).status).toBe(200);
  });

  it("changing the password signs out every other device", async () => {
    const a = agent();
    const { username } = await signup(a);
    const b = agent();
    await b.post("/api/v1/auth/login").send({ username, password: PASSWORD });

    const wrong = await a
      .patch("/api/v1/auth/password")
      .send({ currentPassword: "not-it-at-all", newPassword: "another-strong-passphrase-99" });
    expect(wrong.status).toBe(400);

    const res = await a
      .patch("/api/v1/auth/password")
      .send({ currentPassword: PASSWORD, newPassword: "another-strong-passphrase-99" });
    expect(res.status).toBe(200);
    expect((await a.get("/api/v1/auth/me")).status).toBe(200);
    expect((await b.get("/api/v1/auth/me")).status).toBe(401);

    const login = await agent()
      .post("/api/v1/auth/login")
      .send({ username, password: "another-strong-passphrase-99" });
    expect(login.status).toBe(200);
  });
});

describe("auth: disable, enable, delete", () => {
  it("disables with the password, blocks login with ACCOUNT_DISABLED, and re-enables by password", async () => {
    const a = agent();
    const { username } = await signup(a);

    expect((await a.post("/api/v1/auth/disable").send({ password: "wrong-wrong-1" })).status).toBe(
      400
    );
    const disabled = await a.post("/api/v1/auth/disable").send({ password: PASSWORD });
    expect(disabled.status).toBe(200);
    expect((await a.get("/api/v1/auth/me")).status).toBe(401);

    const login = await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_DISABLED");

    const badEnable = await agent()
      .post("/api/v1/auth/enable")
      .send({ username, password: "wrong-wrong-1" });
    expect(badEnable.status).toBe(401);
    const unknownEnable = await agent()
      .post("/api/v1/auth/enable")
      .send({ username: "nobody_here", password: "wrong-wrong-1" });
    expect(unknownEnable.body.error.message).toBe(badEnable.body.error.message);

    const enabler = agent();
    const enabled = await enabler
      .post("/api/v1/auth/enable")
      .send({ username, password: PASSWORD });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.user.status).toBe("active");
    expect((await enabler.get("/api/v1/auth/me")).status).toBe(200);
  });

  it("deletes the account only with the correct password and removes its data", async () => {
    const a = agent();
    const { user, username } = await signup(a);
    const b = agent();
    const { user: other } = await signup(b);
    await a.post(`/api/v1/messages/${other._id}`).send({ text: "hello" });

    expect(
      (await a.delete("/api/v1/auth/account").send({ password: "wrong-wrong-1" })).status
    ).toBe(400);
    const res = await a.delete("/api/v1/auth/account").send({ password: PASSWORD });
    expect(res.status).toBe(200);

    expect((await a.get("/api/v1/auth/me")).status).toBe(401);
    expect(await mongoose.connection.db.collection("users").countDocuments({ username })).toBe(0);
    expect(
      await mongoose.connection.db
        .collection("messages")
        .countDocuments({ senderId: new mongoose.Types.ObjectId(user._id) })
    ).toBe(0);
    expect(
      (await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD })).status
    ).toBe(401);
  });
});
