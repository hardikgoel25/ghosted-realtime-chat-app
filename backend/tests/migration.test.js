import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { up } from "../src/migrations/001-users.js";
import { runMigrations } from "../src/migrations/run.js";
import User from "../src/models/user.model.js";
import { PASSWORD, agent } from "./helpers.js";

function legacyUser(overrides = {}) {
  return {
    fullname: "Legacy Person",
    username: `legacy_${Math.random().toString(36).slice(2, 8)}`,
    password: bcrypt.hashSync(PASSWORD, 4),
    gender: "male",
    profilePic: "https://avatar.iran.liara.run/username?username=Legacy%20Person",
    isDisabled: false,
    bio: "",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    __v: 0,
    ...overrides,
  };
}

describe("migration 001-users", () => {
  it("converts legacy documents, keeps uploaded avatars, and is idempotent", async () => {
    const users = mongoose.connection.db.collection("users");
    const disabled = legacyUser({ isDisabled: true });
    const uploaded = legacyUser({
      profilePic: "https://res.cloudinary.com/demo/image/upload/v1/pic.png",
    });
    await users.insertMany([disabled, uploaded]);

    const summary = await up(mongoose.connection.db, {});
    expect(summary.usersUpdated).toBe(2);

    const d = await users.findOne({ username: disabled.username });
    expect(d.password).toBeUndefined();
    expect(d.passwordHash).toBe(disabled.password);
    expect(d.isDisabled).toBeUndefined();
    expect(d.status).toBe("disabled");
    expect(d.profilePic).toBeUndefined();
    expect(d.avatar.url).toMatch(/^data:image\/svg\+xml/);
    expect(d.privacy).toEqual({ showLastSeen: true, readReceipts: true });
    expect(d.notificationPrefs).toEqual({ sound: true, desktop: false, preview: true });
    expect(d.failedLoginCount).toBe(0);

    const u = await users.findOne({ username: uploaded.username });
    expect(u.status).toBe("active");
    expect(u.avatar).toEqual({ url: uploaded.profilePic, publicId: null });

    const again = await up(mongoose.connection.db, {});
    expect(again.usersUpdated).toBe(0);
  });

  it("lets a migrated user log in with their old password", async () => {
    const users = mongoose.connection.db.collection("users");
    const legacy = legacyUser();
    await users.insertOne(legacy);
    await up(mongoose.connection.db, {});

    const viaModel = await User.findOne({ username: legacy.username }).select("+passwordHash");
    expect(viaModel.passwordHash).toBe(legacy.password);

    const res = await agent()
      .post("/api/v1/auth/login")
      .send({ username: legacy.username, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar.url).toMatch(/^data:image\/svg\+xml/);
  });

  it("dry runs change nothing and the runner records applied migrations", async () => {
    const users = mongoose.connection.db.collection("users");
    await users.insertOne(legacyUser());

    const dry = await up(mongoose.connection.db, { dryRun: true });
    expect(dry.usersUpdated).toBe(1);
    expect((await users.findOne({})).password).toBeDefined();

    const first = await runMigrations();
    expect(first.map((r) => r.id)).toEqual(["001-users"]);
    expect((await users.findOne({})).passwordHash).toBeDefined();

    const second = await runMigrations();
    expect(second).toEqual([]);
  });
});
