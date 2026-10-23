import { describe, expect, it } from "vitest";
import { STALE_MS, createRedisPresence } from "../src/services/presence/redis.js";

/** The handful of sorted-set commands the presence code uses, over plain Maps. */
function fakeRedis() {
  const sets = new Map();
  const set = (key) => {
    if (!sets.has(key)) sets.set(key, new Map());
    return sets.get(key);
  };
  const num = (v) => (v === "+inf" ? Infinity : v === "-inf" ? -Infinity : Number(v));
  return {
    async zAdd(key, { score, value }) {
      set(key).set(value, score);
    },
    async zRem(key, member) {
      set(key).delete(member);
    },
    async zCount(key, min, max) {
      return [...set(key).values()].filter((s) => s >= num(min) && s <= num(max)).length;
    },
    async zRangeByScore(key, min, max) {
      return [...set(key)]
        .filter(([, s]) => s >= num(min) && s <= num(max))
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
    },
    async zRemRangeByScore(key, min, max) {
      for (const [m, s] of set(key)) if (s >= num(min) && s <= num(max)) set(key).delete(m);
    },
  };
}

describe("redis presence", () => {
  it("shares online state between instances and reports transitions", async () => {
    const redis = fakeRedis();
    const clock = { t: 1_000_000 };
    const now = () => clock.t;
    const nodeA = createRedisPresence(redis, { now, heartbeatMs: 0 });
    const nodeB = createRedisPresence(redis, { now, heartbeatMs: 0 });

    expect(await nodeA.addSocket("alice", "a1")).toBe(true);
    expect(await nodeB.isOnline("alice")).toBe(true);
    expect(await nodeB.addSocket("alice", "b1")).toBe(false); // already online elsewhere
    expect(await nodeB.onlineUserIds()).toEqual(["alice"]);
    expect(await nodeA.socketCount("alice")).toBe(2);

    expect(await nodeA.removeSocket("alice", "a1")).toBe(false); // phone still on node B
    expect(await nodeB.removeSocket("alice", "b1")).toBe(true);
    expect(await nodeA.isOnline("alice")).toBe(false);
    expect(await nodeA.onlineUserIds()).toEqual([]);
  });

  it("ages out sockets of an instance that stopped heart-beating", async () => {
    const redis = fakeRedis();
    const clock = { t: 5_000_000 };
    const now = () => clock.t;
    const dead = createRedisPresence(redis, { now, heartbeatMs: 0 });
    const alive = createRedisPresence(redis, { now, heartbeatMs: 0 });

    await dead.addSocket("bob", "d1");
    await alive.addSocket("casey", "l1");
    clock.t += STALE_MS + 1; // nobody refreshed for a minute
    expect(await alive.isOnline("bob")).toBe(false);
    expect(await alive.isOnline("casey")).toBe(false);

    await alive.heartbeat(); // the live instance refreshes its own sockets and sweeps the rest
    expect(await alive.isOnline("casey")).toBe(true);
    expect(await alive.onlineUserIds()).toEqual(["casey"]);
    expect(await alive.isOnline("bob")).toBe(false);
    alive.close();
    dead.close();
  });
});
