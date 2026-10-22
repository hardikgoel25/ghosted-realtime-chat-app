import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { up as upUsers } from "../src/migrations/001-users.js";
import { up as upConversations } from "../src/migrations/002-conversations.js";
import { runMigrations } from "../src/migrations/run.js";
import User from "../src/models/user.model.js";
import { PASSWORD, agent } from "./helpers.js";

function legacyUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
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

function legacyMessage(senderId, receiverId, text, at, extra = {}) {
  return {
    senderId,
    receiverId,
    text,
    createdAt: at,
    updatedAt: at,
    __v: 0,
    ...extra,
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

    const summary = await upUsers(mongoose.connection.db, {});
    expect(summary.usersUpdated).toBe(2);

    const d = await users.findOne({ username: disabled.username });
    expect(d.password).toBeUndefined();
    expect(d.passwordHash).toBe(disabled.password);
    expect(d.isDisabled).toBeUndefined();
    expect(d.status).toBe("disabled");
    expect(d.profilePic).toBeUndefined();
    expect(d.avatar.url).toMatch(/^data:image\/svg\+xml/);
    expect(d.privacy).toEqual({ showLastSeen: true, readReceipts: true });
    expect(d.failedLoginCount).toBe(0);

    const u = await users.findOne({ username: uploaded.username });
    expect(u.status).toBe("active");
    expect(u.avatar).toEqual({ url: uploaded.profilePic, publicId: null });

    expect((await upUsers(mongoose.connection.db, {})).usersUpdated).toBe(0);
  });

  it("lets a migrated user log in with their old password", async () => {
    const users = mongoose.connection.db.collection("users");
    const legacy = legacyUser();
    await users.insertOne(legacy);
    await upUsers(mongoose.connection.db, {});

    const viaModel = await User.findOne({ username: legacy.username }).select("+passwordHash");
    expect(viaModel.passwordHash).toBe(legacy.password);

    const res = await agent()
      .post("/api/v1/auth/login")
      .send({ username: legacy.username, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar.url).toMatch(/^data:image\/svg\+xml/);
  });
});

describe("migration 002-conversations", () => {
  it("groups legacy messages into direct conversations with a last-message snapshot, idempotently", async () => {
    const db = mongoose.connection.db;
    const alice = legacyUser();
    const bob = legacyUser();
    const carol = legacyUser();
    await db.collection("users").insertMany([alice, bob, carol]);
    await db.collection("messages").insertMany([
      legacyMessage(alice._id, bob._id, "first", new Date("2025-02-01T10:00:00Z")),
      legacyMessage(bob._id, alice._id, "", new Date("2025-02-01T10:05:00Z"), {
        image: "https://res.cloudinary.com/demo/image/upload/v1/photo.png",
      }),
      legacyMessage(alice._id, bob._id, "latest", new Date("2025-02-02T09:00:00Z")),
      legacyMessage(carol._id, alice._id, "hi from carol", new Date("2025-02-03T09:00:00Z")),
    ]);

    const summary = await upConversations(db, {});
    expect(summary).toEqual({ messagesMigrated: 4, conversationsCreated: 2 });

    const convs = await db.collection("conversations").find({}).toArray();
    expect(convs).toHaveLength(2);
    const ab = convs.find(
      (c) => c.directKey === [String(alice._id), String(bob._id)].sort().join(":")
    );
    expect(ab.type).toBe("direct");
    expect(ab.participants.map((p) => String(p.userId)).sort()).toEqual(
      [String(alice._id), String(bob._id)].sort()
    );
    expect(ab.lastMessage.text).toBe("latest");
    expect(ab.lastMessageAt).toEqual(new Date("2025-02-02T09:00:00Z"));
    expect(ab.participants.every((p) => p.lastReadAt instanceof Date)).toBe(true);

    const migrated = await db.collection("messages").find({}).sort({ createdAt: 1 }).toArray();
    expect(migrated.every((m) => m.conversationId && m.receiverId === undefined)).toBe(true);
    expect(migrated[1].type).toBe("image");
    expect(migrated[1].attachments[0].url).toMatch(/photo\.png$/);
    expect(migrated[1].image).toBeUndefined();
    expect(migrated[0].conversationId).toEqual(ab._id);

    expect(await upConversations(db, {})).toEqual({ messagesMigrated: 0, conversationsCreated: 0 });
  });

  it("makes migrated conversations usable through the API", async () => {
    const db = mongoose.connection.db;
    const alice = legacyUser();
    const bob = legacyUser();
    await db.collection("users").insertMany([alice, bob]);
    await db
      .collection("messages")
      .insertMany([
        legacyMessage(alice._id, bob._id, "old hello", new Date("2025-03-01T10:00:00Z")),
      ]);
    await runMigrations();

    const a = agent();
    expect(
      (await a.post("/api/v1/auth/login").send({ username: alice.username, password: PASSWORD }))
        .status
    ).toBe(200);
    const list = await a.get("/api/v1/conversations");
    expect(list.body.data.items).toHaveLength(1);
    const conv = list.body.data.items[0];
    expect(conv.lastMessage.text).toBe("old hello");
    expect(conv.participants.find((p) => p.userId === String(bob._id)).user.username).toBe(
      bob.username
    );

    const messages = await a.get(`/api/v1/conversations/${conv._id}/messages`);
    expect(messages.body.data.items.map((m) => m.text)).toEqual(["old hello"]);
    const sent = await a
      .post(`/api/v1/conversations/${conv._id}/messages`)
      .send({ text: "new hello" });
    expect(sent.status).toBe(201);
  });

  it("dry runs change nothing and the runner records applied migrations", async () => {
    const users = mongoose.connection.db.collection("users");
    await users.insertOne(legacyUser());

    const dry = await upUsers(mongoose.connection.db, { dryRun: true });
    expect(dry.usersUpdated).toBe(1);
    expect((await users.findOne({})).password).toBeDefined();

    const first = await runMigrations();
    expect(first.map((r) => r.id)).toEqual(["001-users", "002-conversations", "003-attachments"]);
    expect((await users.findOne({})).passwordHash).toBeDefined();

    expect(await runMigrations()).toEqual([]);
  });
});
