import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agent, signup } from "./helpers.js";

// Limits are evaluated per request, so a file can switch them on only for the calls under test
const enableLimits = () => {
  process.env.RATE_LIMIT_TEST = "1";
};
const disableLimits = () => {
  delete process.env.RATE_LIMIT_TEST;
};

beforeAll(enableLimits);
afterAll(disableLimits);

describe("rate limiting", () => {
  it("limits failed authentication attempts per IP to 10 per window", async () => {
    const a = agent();
    for (let i = 0; i < 10; i++) {
      const res = await a
        .post("/api/v1/auth/login")
        .send({ username: `nobody_${i}`, password: "whatever-whatever-1" });
      expect(res.status, `attempt ${i + 1}`).toBe(401);
    }
    const blocked = await a
      .post("/api/v1/auth/login")
      .send({ username: "nobody_11", password: "whatever-whatever-1" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers["ratelimit-policy"] ?? blocked.headers["ratelimit"]).toBeDefined();
  });

  it("limits message sending per user to 30 per minute", async () => {
    // Account creation is not what is under test here, and the auth limiter above is still
    // counting against this IP, so create the users with limits switched off.
    disableLimits();
    const a = agent();
    await signup(a);
    const { user: other } = await signup(agent());
    enableLimits();

    for (let i = 0; i < 30; i++) {
      const res = await a.post(`/api/v1/messages/${other._id}`).send({ text: `m${i}` });
      expect(res.status, `message ${i + 1}`).toBe(201);
    }
    const blocked = await a.post(`/api/v1/messages/${other._id}`).send({ text: "one too many" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });
});
