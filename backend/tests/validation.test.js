import { describe, expect, it } from "vitest";
import { agent, openDirect, sendText, signup } from "./helpers.js";

describe("validation and error envelope", () => {
  it("returns a JSON 404 envelope for unknown routes", async () => {
    const res = await agent().get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: expect.stringContaining("not found") },
    });
  });

  it("answers 400 for malformed JSON", async () => {
    const res = await agent()
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Malformed JSON/);
  });

  it("validates route ids instead of throwing CastErrors", async () => {
    const a = agent();
    await signup(a);
    const res = await a.get("/api/v1/conversations/not-an-object-id/messages");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((await a.post("/api/v1/conversations/direct").send({ userId: "nope" })).status).toBe(
      400
    );
  });

  it("bounds pagination parameters", async () => {
    const a = agent();
    await signup(a);
    const { user: other } = await signup(agent());
    const conv = await openDirect(a, other._id);
    expect((await a.get(`/api/v1/conversations/${conv._id}/messages?limit=500`)).status).toBe(400);
    expect((await a.get(`/api/v1/conversations/${conv._id}/messages?cursor=zzz`)).status).toBe(400);
    expect((await a.get("/api/v1/conversations?limit=0")).status).toBe(400);
    expect((await a.get("/api/v1/conversations?filter=weird")).status).toBe(400);
  });

  it("rejects empty, oversized and self-addressed messages and unknown fields", async () => {
    const a = agent();
    const { user: me } = await signup(a);
    const { user: other } = await signup(agent());
    const conv = await openDirect(a, other._id);

    expect((await a.post(`/api/v1/conversations/${conv._id}/messages`).send({})).status).toBe(400);
    expect((await sendText(a, conv._id, "   ")).status).toBe(400);
    expect((await sendText(a, conv._id, "x".repeat(4001))).status).toBe(400);
    expect((await a.post("/api/v1/conversations/direct").send({ userId: me._id })).status).toBe(
      400
    );
    expect(
      (await sendText(a, conv._id, "hi", { image: "data:image/png;base64,AAAA" })).status
    ).toBe(400);
    expect((await sendText(a, conv._id, "hi", { clientId: "nope" })).status).toBe(400);
  });

  it("rejects the old base64 profilePic field and unknown keys on profile updates", async () => {
    const a = agent();
    await signup(a);
    const res = await a
      .patch("/api/v1/users/me")
      .send({ profilePic: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(400);
    const empty = await a.patch("/api/v1/users/me").send({});
    expect(empty.status).toBe(400);
  });

  it("updates profile fields with normalisation and uniqueness checks", async () => {
    const a = agent();
    const { user } = await signup(a);
    const { username: taken } = await signup(agent());

    const conflict = await a.patch("/api/v1/users/me").send({ username: taken });
    expect(conflict.status).toBe(409);

    const newName = `renamed_${Date.now().toString(36)}`;
    const res = await a
      .patch("/api/v1/users/me")
      .send({ username: newName.toUpperCase(), fullname: "  Mary McDonald ", bio: "hi" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe(newName);
    expect(res.body.data.user.fullname).toBe("Mary McDonald");
    expect(res.body.data.user.bio).toBe("hi");
    expect(res.body.data.user._id).toBe(user._id);

    const self = await a.get(`/api/v1/users/${newName}`);
    expect(self.status).toBe(200);
    expect(self.body.data.user.username).toBe(newName);
    expect(self.body.data.user).toHaveProperty("privacy");

    // Someone else's profile never exposes private fields
    const other = await a.get(`/api/v1/users/${taken}`);
    expect(other.status).toBe(200);
    expect(other.body.data.user).not.toHaveProperty("email");
    expect(other.body.data.user).not.toHaveProperty("privacy");
    expect(other.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("limits the JSON body size", async () => {
    const a = agent();
    await signup(a);
    const res = await a.patch("/api/v1/users/me").send({ bio: "x".repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
