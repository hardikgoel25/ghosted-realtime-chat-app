import mongoose from "mongoose";

export const id = "002-conversations";
export const description =
  "Group legacy sender/receiver messages into direct conversations and move images into attachments";

const STALE_MESSAGE_INDEXES = ["senderId_1_receiverId_1__id_-1", "receiverId_1_senderId_1__id_-1"];

function snapshotOf(message) {
  return {
    _id: message._id,
    senderId: message.senderId,
    type: message.image ? "image" : "text",
    text: message.text ?? "",
    hasAttachments: Boolean(message.image),
    createdAt: message.createdAt ?? new Date(),
  };
}

/** Idempotent: only messages without a conversationId are touched. */
export async function up(db, { dryRun = false, logger } = {}) {
  const messages = db.collection("messages");
  const conversations = db.collection("conversations");
  const byKey = new Map();
  let migrated = 0;
  let created = 0;

  const cursor = messages.find({ conversationId: { $exists: false } }).sort({ _id: 1 });
  for await (const m of cursor) {
    if (!m.senderId || !m.receiverId) continue;
    const key = [String(m.senderId), String(m.receiverId)].sort().join(":");

    let conv = byKey.get(key);
    if (!conv) {
      conv = await conversations.findOne({ directKey: key });
      if (!conv) {
        const now = new Date();
        const createdAt = m.createdAt ?? now;
        conv = {
          _id: new mongoose.Types.ObjectId(),
          type: "direct",
          directKey: key,
          createdBy: m.senderId,
          participants: key.split(":").map((uid) => ({
            userId: new mongoose.Types.ObjectId(uid),
            role: "member",
            joinedAt: createdAt,
            // Nobody can recover historical read state, so treat everything as read
            lastReadAt: now,
            lastDeliveredAt: now,
            mutedUntil: null,
            archived: false,
            pinned: false,
            clearedAt: null,
          })),
          group: { name: null, avatar: { url: null, publicId: null } },
          lastMessage: null,
          lastMessageAt: createdAt,
          unread: {},
          createdAt,
          updatedAt: now,
          __v: 0,
        };
        if (!dryRun) await conversations.insertOne(conv);
        created += 1;
        logger?.debug({ directKey: key }, "Created conversation");
      }
      conv.__latest = conv.lastMessage ? { ...conv.lastMessage, image: null } : null;
      byKey.set(key, conv);
    }

    const $set = {
      conversationId: conv._id,
      type: m.image ? "image" : "text",
      attachments: m.image
        ? [
            {
              url: m.image,
              publicId: m.imagePublicId ?? null,
              mime: null,
              size: null,
              width: null,
              height: null,
              name: null,
            },
          ]
        : [],
      replyTo: null,
      editedAt: null,
      deletedAt: null,
      deletedFor: [],
    };
    if (m.text === undefined) $set.text = "";
    if (m.clientId === undefined) $set.clientId = null;
    if (!dryRun) {
      await messages.updateOne(
        { _id: m._id },
        { $set, $unset: { receiverId: "", image: "", imagePublicId: "" } }
      );
    }
    migrated += 1;

    const createdAt = m.createdAt ?? new Date(0);
    if (!conv.__latest || createdAt >= new Date(conv.__latest.createdAt)) conv.__latest = m;
  }

  for (const conv of byKey.values()) {
    const latest = conv.__latest;
    if (!latest || latest === conv.lastMessage) continue;
    if (!dryRun) {
      await conversations.updateOne(
        { _id: conv._id },
        {
          $set: {
            lastMessage: snapshotOf(latest),
            lastMessageAt: latest.createdAt ?? new Date(),
          },
        }
      );
    }
  }

  if (!dryRun) {
    for (const name of STALE_MESSAGE_INDEXES) {
      try {
        await messages.dropIndex(name);
      } catch {
        // index did not exist
      }
    }
  }

  return { messagesMigrated: migrated, conversationsCreated: created };
}
