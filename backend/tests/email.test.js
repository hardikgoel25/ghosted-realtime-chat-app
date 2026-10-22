import { beforeEach, describe, expect, it } from "vitest";
import { sentMails } from "../src/services/mail.service.js";
import { PASSWORD, agent, signup } from "./helpers.js";

const tokenFrom = (mail) => mail.text.match(/token=([a-f0-9]{64})/)[1];

beforeEach(() => {
  sentMails.length = 0;
});

describe("email verification", () => {
  it("is reported as enabled, sends a verification link, and verifies once", async () => {
    expect((await agent().get("/api/v1/config")).body.data.emailEnabled).toBe(true);

    const a = agent();
    const { user } = await signup(a);
    const res = await a.patch("/api/v1/users/me/email").send({ email: "  Alice@Example.COM " });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("alice@example.com");
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].to[0].address).toBe("alice@example.com");
    expect(sentMails[0].subject).toMatch(/verify/i);
    expect(sentMails[0].text).toContain(user.fullname.split(" ")[0]);
    const token = tokenFrom(sentMails[0]);

    const verified = await agent().post("/api/v1/auth/verify-email").send({ token });
    expect(verified.status).toBe(200);
    expect((await a.get("/api/v1/auth/me")).body.data.user.emailVerified).toBe(true);

    expect((await agent().post("/api/v1/auth/verify-email").send({ token })).status).toBe(400);
    expect(
      (
        await agent()
          .post("/api/v1/auth/verify-email")
          .send({ token: "f".repeat(64) })
      ).status
    ).toBe(400);
    expect((await agent().post("/api/v1/auth/verify-email").send({ token: "short" })).status).toBe(
      400
    );
    expect((await a.post("/api/v1/auth/resend-verification")).status).toBe(400);
  });

  it("rejects addresses in use, validates format, and can be removed", async () => {
    const a = agent();
    await signup(a);
    await a.patch("/api/v1/users/me/email").send({ email: "taken@example.com" });
    const b = agent();
    await signup(b);
    expect(
      (await b.patch("/api/v1/users/me/email").send({ email: "taken@example.com" })).status
    ).toBe(409);
    expect((await b.patch("/api/v1/users/me/email").send({ email: "not-an-email" })).status).toBe(
      400
    );

    const removed = await a.delete("/api/v1/users/me/email");
    expect(removed.body.data.user.email).toBeNull();
    expect(
      (await b.patch("/api/v1/users/me/email").send({ email: "taken@example.com" })).status
    ).toBe(200);
  });
});

describe("password reset", () => {
  async function verifiedUser(email) {
    const a = agent();
    const { username } = await signup(a);
    await a.patch("/api/v1/users/me/email").send({ email });
    await agent()
      .post("/api/v1/auth/verify-email")
      .send({ token: tokenFrom(sentMails.at(-1)) });
    sentMails.length = 0;
    return { a, username };
  }

  it("only emails verified addresses and never reveals whether an account exists", async () => {
    const a = agent();
    const { username } = await signup(a);
    await a.patch("/api/v1/users/me/email").send({ email: "unverified@example.com" });
    sentMails.length = 0;

    for (const identifier of [
      username,
      "unverified@example.com",
      "nobody_at_all",
      "ghost@example.com",
    ]) {
      const res = await agent().post("/api/v1/auth/forgot-password").send({ identifier });
      expect(res.status).toBe(200);
    }
    expect(sentMails).toHaveLength(0);
  });

  it("resets the password with a single-use token and signs out every session", async () => {
    const { a, username } = await verifiedUser("reset-me@example.com");
    const other = agent();
    await other.post("/api/v1/auth/login").send({ username, password: PASSWORD });

    const res = await agent()
      .post("/api/v1/auth/forgot-password")
      .send({ identifier: "Reset-Me@example.com" });
    expect(res.status).toBe(200);
    expect(sentMails).toHaveLength(1);
    expect(sentMails[0].subject).toMatch(/reset/i);
    const token = tokenFrom(sentMails[0]);

    const weak = await agent()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "password123" });
    expect(weak.status).toBe(400);

    const done = await agent()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "brand-new-passphrase-2026" });
    expect(done.status).toBe(200);

    expect((await a.get("/api/v1/auth/me")).status).toBe(401);
    expect((await other.get("/api/v1/auth/me")).status).toBe(401);
    expect(
      (await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD })).status
    ).toBe(401);
    expect(
      (
        await agent()
          .post("/api/v1/auth/login")
          .send({ username, password: "brand-new-passphrase-2026" })
      ).status
    ).toBe(200);

    const reuse = await agent()
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "another-fine-passphrase-77" });
    expect(reuse.status).toBe(400);
  });
});
