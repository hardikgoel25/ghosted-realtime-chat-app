import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { agent, openDirect, sendText, signup } from "./helpers.js";

const url = (conv, messageId = "") =>
  `/api/v1/conversations/${conv._id}/messages${messageId ? `/${messageId}` : ""}`;

async function pair() {
  const a = agent();
  const { user: alice } = await signup(a);
  const b = agent();
  const { user: bob } = await signup(b);
  const conv = await openDirect(a, bob._id);
  return { a, b, alice, bob, conv };
}

describe("replies", () => {
  it("stores a snapshot of the quoted message", async () => {
    const { a, b, conv, bob } = await pair();
    const original = (await sendText(b, conv._id, "original text")).body.data.message;
    const reply = await sendText(a, conv._id, "my reply", { replyTo: original._id });
    expect(reply.status).toBe(201);
    expect(reply.body.data.message.replyTo).toEqual({
      messageId: original._id,
      senderId: bob._id,
      type: "text",
      text: "original text",
      hasAttachments: false,
    });

    const other = await openDirect(a, (await signup(agent())).user._id);
    const foreign = await sendText(a, other._id, "nope", { replyTo: original._id });
    expect(foreign.status).toBe(400);
  });
});

describe("editing", () => {
  it("lets the author edit within the window and updates the preview", async () => {
    const { a, b, conv } = await pair();
    const msg = (await sendText(a, conv._id, "typo here")).body.data.message;

    const edited = await a.patch(url(conv, msg._id)).send({ text: "fixed here" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.message.text).toBe("fixed here");
    expect(edited.body.data.message.editedAt).toBeTruthy();

    const list = await b.get("/api/v1/conversations");
    expect(list.body.data.items[0].lastMessage.text).toBe("fixed here");
    const history = await b.get(url(conv));
    expect(history.body.data.items.at(-1).text).toBe("fixed here");

    expect((await b.patch(url(conv, msg._id)).send({ text: "not mine" })).status).toBe(403);
    expect((await a.patch(url(conv, msg._id)).send({ text: "   " })).status).toBe(400);
  });

  it("refuses edits after 15 minutes", async () => {
    const { a, conv } = await pair();
    const msg = (await sendText(a, conv._id, "old")).body.data.message;
    await mongoose.connection.db
      .collection("messages")
      .updateOne(
        { _id: new mongoose.Types.ObjectId(msg._id) },
        { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
      );
    const res = await a.patch(url(conv, msg._id)).send({ text: "too late" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EDIT_WINDOW_EXPIRED");
  });
});

describe("deleting", () => {
  it("delete for me hides the message from one side only", async () => {
    const { a, b, conv } = await pair();
    const msg = (await sendText(b, conv._id, "secret")).body.data.message;
    const res = await a.delete(`${url(conv, msg._id)}?scope=me`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe("me");
    expect((await a.get(url(conv))).body.data.items).toHaveLength(0);
    expect((await b.get(url(conv))).body.data.items).toHaveLength(1);
  });

  it("delete for everyone leaves a placeholder for both and only works on own messages", async () => {
    const { a, b, conv } = await pair();
    const msg = (await sendText(a, conv._id, "regret")).body.data.message;
    await a.put(`${url(conv, msg._id)}/reactions/${encodeURIComponent("👍")}`);

    expect((await b.delete(`${url(conv, msg._id)}?scope=everyone`)).status).toBe(403);

    const res = await a.delete(`${url(conv, msg._id)}?scope=everyone`);
    expect(res.status).toBe(200);
    expect(res.body.data.message.deletedAt).toBeTruthy();
    expect(res.body.data.message.text).toBe("");
    expect(res.body.data.message.reactions).toEqual([]);

    for (const who of [a, b]) {
      const items = (await who.get(url(conv))).body.data.items;
      expect(items).toHaveLength(1);
      expect(items[0].deletedAt).toBeTruthy();
      expect(items[0].text).toBe("");
    }
    const list = await b.get("/api/v1/conversations");
    expect(list.body.data.items[0].lastMessage.deletedAt).toBeTruthy();
    expect(list.body.data.items[0].lastMessage.text).toBe("");

    expect((await a.patch(url(conv, msg._id)).send({ text: "undo?" })).status).toBe(400);
    expect(
      (await a.put(`${url(conv, msg._id)}/reactions/${encodeURIComponent("👍")}`)).status
    ).toBe(400);
  });
});

describe("reactions", () => {
  it("adds, merges, removes and bounds reactions", async () => {
    const { a, b, conv, alice, bob } = await pair();
    const msg = (await sendText(a, conv._id, "react to me")).body.data.message;
    const react = (who, emoji) =>
      who.put(`${url(conv, msg._id)}/reactions/${encodeURIComponent(emoji)}`);
    const unreact = (who, emoji) =>
      who.delete(`${url(conv, msg._id)}/reactions/${encodeURIComponent(emoji)}`);

    expect((await react(a, "👍")).body.data.reactions).toEqual([
      { emoji: "👍", userIds: [alice._id] },
    ]);
    await react(a, "👍");
    const both = await react(b, "👍");
    expect(both.body.data.reactions).toEqual([{ emoji: "👍", userIds: [alice._id, bob._id] }]);
    await react(b, "❤️");
    expect((await b.get(url(conv))).body.data.items[0].reactions).toHaveLength(2);

    const removed = await unreact(a, "👍");
    expect(removed.body.data.reactions).toEqual([
      { emoji: "👍", userIds: [bob._id] },
      { emoji: "❤️", userIds: [bob._id] },
    ]);
    await unreact(b, "👍");
    expect((await b.get(url(conv))).body.data.items[0].reactions).toEqual([
      { emoji: "❤️", userIds: [bob._id] },
    ]);

    expect((await react(a, "abc")).status).toBe(400);
    expect((await react(a, "<script>")).status).toBe(400);

    const emojis = ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😎", "😍"];
    for (const e of emojis.slice(0, 11)) expect((await react(a, e)).status).toBe(200); // 11 + ❤️ = 12
    expect((await react(a, emojis[11])).status).toBe(400);
  });
});

describe("search and windows", () => {
  it("searches text case-insensitively, skips deleted messages and jumps to context", async () => {
    const { a, conv } = await pair();
    const ids = [];
    for (let i = 1; i <= 12; i++) {
      const res = await sendText(a, conv._id, i % 4 === 0 ? `Needle number ${i}` : `hay ${i}`);
      ids.push(res.body.data.message._id);
    }
    await a.delete(`${url(conv, ids[11])}?scope=everyone`); // "Needle number 12"

    const found = await a.get(`${url(conv)}/search?q=needle`);
    expect(found.status).toBe(200);
    expect(found.body.data.items.map((m) => m.text)).toEqual([
      "Needle number 8",
      "Needle number 4",
    ]);
    expect((await a.get(`${url(conv)}/search?q=`)).status).toBe(400);

    const around = await a.get(`${url(conv)}?around=${ids[7]}&limit=4`);
    expect(around.status).toBe(200);
    expect(around.body.data.items.map((m) => m.text)).toEqual([
      "hay 6",
      "hay 7",
      "Needle number 8",
      "hay 9",
      "hay 10",
    ]);
    expect(around.body.data.nextCursor).toBe(ids[5]);
    expect(around.body.data.newerCursor).toBe(ids[9]);

    const newer = await a.get(`${url(conv)}?after=${around.body.data.newerCursor}&limit=10`);
    expect(newer.body.data.items.map((m) => m.text)).toEqual(["hay 11", ""]);
    expect(newer.body.data.newerCursor).toBeNull();

    expect((await a.get(`${url(conv)}?around=64b000000000000000000000`)).status).toBe(404);
  });
});

describe("mark as unread", () => {
  it("flags a conversation unread until it is opened again", async () => {
    const { a, b, conv } = await pair();
    await sendText(b, conv._id, "hello");
    await a.post(`/api/v1/conversations/${conv._id}/read`);
    expect(
      (await a.get(`/api/v1/conversations/${conv._id}`)).body.data.conversation.me.unread
    ).toBe(0);

    const flagged = await a.patch(`/api/v1/conversations/${conv._id}`).send({ unread: true });
    expect(flagged.status).toBe(200);
    expect(flagged.body.data.conversation.me.unread).toBe(1);
    expect(
      (await a.get("/api/v1/conversations?filter=unread")).body.data.items.map((c) => c._id)
    ).toEqual([conv._id]);

    const read = await a.post(`/api/v1/conversations/${conv._id}/read`);
    expect(read.body.data.conversation.me.unread).toBe(0);
    expect(
      (await a.patch(`/api/v1/conversations/${conv._id}`).send({ unread: false })).status
    ).toBe(400);
  });
});
