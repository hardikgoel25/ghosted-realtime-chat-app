import { describe, expect, it } from "vitest";
import { currentCode } from "../src/services/twoFactor.service.js";
import { PASSWORD, agent, parseSetCookies, signup } from "./helpers.js";

async function enableTwoFactor(a) {
  const setup = await a.post("/api/v1/auth/2fa/setup").send({ password: PASSWORD });
  expect(setup.status).toBe(200);
  const { secret, otpauthUrl, qrDataUrl } = setup.body.data;
  expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\/Ghosted:/);
  expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
  const enabled = await a.post("/api/v1/auth/2fa/enable").send({ code: await currentCode(secret) });
  expect(enabled.status).toBe(200);
  expect(enabled.body.data.user.twoFactorEnabled).toBe(true);
  expect(enabled.body.data.recoveryCodes).toHaveLength(10);
  return { secret, recoveryCodes: enabled.body.data.recoveryCodes };
}

describe("two-factor authentication", () => {
  it("is advertised, needs the password to start and the right code to finish", async () => {
    expect((await agent().get("/api/v1/config")).body.data.features.twoFactor).toBe(true);

    const a = agent();
    const { user } = await signup(a);
    expect(user.twoFactorEnabled).toBe(false);
    expect((await a.post("/api/v1/auth/2fa/setup").send({ password: "wrong-one" })).status).toBe(
      400
    );
    expect((await a.post("/api/v1/auth/2fa/enable").send({ code: "123456" })).status).toBe(400);

    const setup = await a.post("/api/v1/auth/2fa/setup").send({ password: PASSWORD });
    expect(setup.status).toBe(200);
    const bad = await a.post("/api/v1/auth/2fa/enable").send({ code: "000000" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("TWO_FACTOR_INVALID");
    expect((await a.get("/api/v1/auth/me")).body.data.user.twoFactorEnabled).toBe(false);

    const { secret } = await enableTwoFactor(a);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect((await a.get("/api/v1/auth/me")).body.data.user.twoFactorEnabled).toBe(true);
    // Already on
    expect((await a.post("/api/v1/auth/2fa/setup").send({ password: PASSWORD })).status).toBe(200);
    expect(
      (await a.post("/api/v1/auth/2fa/enable").send({ code: await currentCode(secret) })).status
    ).toBe(400);
  });

  it("turns login into two steps with a single-use challenge", async () => {
    const a = agent();
    const { username } = await signup(a);
    const { secret } = await enableTwoFactor(a);

    const b = agent();
    const first = await b.post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ twoFactorRequired: true });
    expect(first.body.data.user).toBeUndefined();
    expect(parseSetCookies(first)).toEqual({});
    expect((await b.get("/api/v1/auth/me")).status).toBe(401);
    const { challenge } = first.body.data;

    const wrong = await b.post("/api/v1/auth/2fa/verify").send({ challenge, code: "000000" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("TWO_FACTOR_INVALID");
    expect(
      (
        await b
          .post("/api/v1/auth/2fa/verify")
          .send({ challenge: "not-a-real-token-at-all", code: "000000" })
      ).status
    ).toBe(401);

    const done = await b
      .post("/api/v1/auth/2fa/verify")
      .send({ challenge, code: await currentCode(secret) });
    expect(done.status).toBe(200);
    expect(done.body.data.user.username).toBe(username);
    expect(parseSetCookies(done).access).toBeTruthy();
    expect((await b.get("/api/v1/auth/me")).status).toBe(200);

    // A used challenge cannot sign in again
    const replay = await agent()
      .post("/api/v1/auth/2fa/verify")
      .send({ challenge, code: await currentCode(secret) });
    expect(replay.status).toBe(401);
  });

  it("accepts each recovery code once, and lets the user disable or rotate codes", async () => {
    const a = agent();
    const { username } = await signup(a);
    const { secret, recoveryCodes } = await enableTwoFactor(a);

    const start = async () =>
      (await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD })).body.data
        .challenge;

    const c = agent();
    const viaRecovery = await c
      .post("/api/v1/auth/2fa/verify")
      .send({ challenge: await start(), code: recoveryCodes[0].toUpperCase() });
    expect(viaRecovery.status).toBe(200);
    const again = await agent()
      .post("/api/v1/auth/2fa/verify")
      .send({ challenge: await start(), code: recoveryCodes[0] });
    expect(again.status).toBe(401);

    const rotated = await a.post("/api/v1/auth/2fa/recovery-codes").send({ password: PASSWORD });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.recoveryCodes).toHaveLength(10);
    expect(
      (
        await agent()
          .post("/api/v1/auth/2fa/verify")
          .send({ challenge: await start(), code: recoveryCodes[1] })
      ).status
    ).toBe(401);
    expect(
      (
        await agent()
          .post("/api/v1/auth/2fa/verify")
          .send({ challenge: await start(), code: rotated.body.data.recoveryCodes[0] })
      ).status
    ).toBe(200);

    expect(
      (await a.post("/api/v1/auth/2fa/disable").send({ password: "nope", code: "000000" })).status
    ).toBe(400);
    expect(
      (await a.post("/api/v1/auth/2fa/disable").send({ password: PASSWORD, code: "000000" })).status
    ).toBe(400);
    const off = await a
      .post("/api/v1/auth/2fa/disable")
      .send({ password: PASSWORD, code: await currentCode(secret) });
    expect(off.status).toBe(200);
    expect(off.body.data.user.twoFactorEnabled).toBe(false);
    const plain = await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect(plain.body.data.user.username).toBe(username);
  });

  it("protects re-enabling a disabled account as well", async () => {
    const a = agent();
    const { username } = await signup(a);
    const { secret } = await enableTwoFactor(a);
    await a.post("/api/v1/auth/disable").send({ password: PASSWORD });

    const login = await agent().post("/api/v1/auth/login").send({ username, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_DISABLED");

    const b = agent();
    const enable = await b.post("/api/v1/auth/enable").send({ username, password: PASSWORD });
    expect(enable.body.data.twoFactorRequired).toBe(true);
    expect((await b.get("/api/v1/auth/me")).status).toBe(401);
    const done = await b
      .post("/api/v1/auth/2fa/verify")
      .send({ challenge: enable.body.data.challenge, code: await currentCode(secret) });
    expect(done.status).toBe(200);
    expect(done.body.data.user.status).toBe("active");
    expect((await b.get("/api/v1/auth/me")).status).toBe(200);
  });
});
