import { describe, expect, it } from "vitest";
import { agent, openDirect, sendText, signup } from "./helpers.js";

describe("blocking", () => {
  it("stops messages in both directions, hides presence, and is reversible", async () => {
    const a = agent();
    const { user: alice } = await signup(a);
    const b = agent();
    const { user: bob } = await signup(b);
    const conv = await openDirect(a, bob._id);
    await sendText(a, conv._id, "before block");

    expect((await a.post(`/api/v1/users/${alice._id}/block`)).status).toBe(400);
    const blocked = await a.post(`/api/v1/users/${bob._id}/block`);
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.blocked.map((u) => u._id)).toEqual([bob._id]);
    expect((await a.get("/api/v1/users/me/blocked")).body.data.blocked).toHaveLength(1);

    const fromAlice = await sendText(a, conv._id, "can I?");
    expect(fromAlice.status).toBe(403);
    expect(fromAlice.body.error.code).toBe("BLOCKED");
    const fromBob = await sendText(b, conv._id, "hello?");
    expect(fromBob.status).toBe(403);
    expect(fromBob.body.error.code).toBe("BLOCKED");

    const aliceView = (await a.get(`/api/v1/conversations/${conv._id}`)).body.data.conversation;
    expect(aliceView.blocked).toEqual({ byMe: true, byThem: false });
    expect(aliceView.participants.find((p) => p.userId === bob._id).user.lastSeenAt).toBeNull();
    const bobView = (await b.get(`/api/v1/conversations/${conv._id}`)).body.data.conversation;
    expect(bobView.blocked).toEqual({ byMe: false, byThem: true });

    // Neither can find the other to start a new chat, and the profile reports the state
    expect((await a.get("/api/v1/users")).body.data.items.map((u) => u._id)).not.toContain(bob._id);
    expect((await b.get("/api/v1/users")).body.data.items.map((u) => u._id)).not.toContain(
      alice._id
    );
    expect((await b.post("/api/v1/conversations/direct").send({ userId: alice._id })).status).toBe(
      403
    );
    const profile = await b.get(`/api/v1/users/${alice.username}`);
    expect(profile.body.data.blocked).toEqual({ byMe: false, byThem: true });

    // History stays readable
    expect(
      (await b.get(`/api/v1/conversations/${conv._id}/messages`)).body.data.items
    ).toHaveLength(1);

    const unblocked = await a.delete(`/api/v1/users/${bob._id}/block`);
    expect(unblocked.body.data.blocked).toEqual([]);
    expect((await sendText(b, conv._id, "we're back")).status).toBe(201);
    expect(
      (await a.get(`/api/v1/conversations/${conv._id}`)).body.data.conversation.blocked
    ).toEqual({
      byMe: false,
      byThem: false,
    });
  });
});
