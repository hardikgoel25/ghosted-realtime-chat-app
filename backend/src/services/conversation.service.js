import mongoose from "mongoose";
import { SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import Conversation, { directKeyFor } from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeConversation } from "../utils/serializers.js";
import { emitToUser } from "../sockets/emit.js";

const MUTE_FOREVER = new Date("9999-12-31T00:00:00.000Z");
const PARTICIPANT_POPULATE = "participants.userId";

export const idOf = (value) => String(value?._id ?? value);

function encodeCursor(conversation) {
  return `${new Date(conversation.lastMessageAt).getTime()}_${conversation._id}`;
}

function decodeCursor(cursor) {
  const [ms, id] = cursor.split("_");
  return { lastMessageAt: new Date(Number(ms)), id };
}

/** Loads a conversation the user belongs to, with participants populated; 404 otherwise. */
export async function loadForMember(userId, conversationId) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    "participants.userId": userId,
  }).populate(PARTICIPANT_POPULATE);
  if (!conv) throw ApiError.notFound("Conversation not found");
  return conv;
}

export function otherParticipants(conversation, userId) {
  const me = idOf(userId);
  return conversation.participants.filter((p) => idOf(p.userId) !== me);
}

/** Pushes this participant's personalised view of the conversation to all their devices. */
export function broadcastConversation(conversation, participantIds = null) {
  for (const p of conversation.participants) {
    const uid = idOf(p.userId);
    if (participantIds && !participantIds.includes(uid)) continue;
    const viewer = p.userId && typeof p.userId === "object" ? p.userId : uid;
    emitToUser(uid, SOCKET_EVENTS.CONVERSATION_UPDATED, {
      conversation: serializeConversation(conversation, viewer),
    });
  }
}

export async function findOrCreateDirect(me, otherId) {
  if (idOf(otherId) === idOf(me._id)) throw ApiError.badRequest("You cannot message yourself");
  const other = await User.findById(otherId).select("status").lean();
  if (!other || other.status === USER_STATUS.DELETED) throw ApiError.notFound("User not found");
  if (other.status === USER_STATUS.DISABLED) {
    throw ApiError.forbidden("This user is currently unavailable");
  }

  const directKey = directKeyFor(me._id, otherId);
  let conversation = await Conversation.findOne({ directKey }).populate(PARTICIPANT_POPULATE);
  let created = false;
  if (!conversation) {
    try {
      const doc = await Conversation.create({
        type: "direct",
        directKey,
        createdBy: me._id,
        participants: [{ userId: me._id }, { userId: otherId }],
        lastMessageAt: new Date(),
      });
      conversation = await doc.populate(PARTICIPANT_POPULATE);
      created = true;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      conversation = await Conversation.findOne({ directKey }).populate(PARTICIPANT_POPULATE);
    }
  }
  return { conversation, created };
}

export async function listConversations(me, { filter = "all", cursor, limit }) {
  const meId = me._id;
  const participantMatch = { userId: meId, archived: filter === "archived" };
  const query = {
    participants: { $elemMatch: participantMatch },
    // Empty conversations are private to whoever started them until the first message
    $or: [{ lastMessage: { $ne: null } }, { createdBy: meId }],
  };
  if (filter === "unread") query[`unread.${meId}`] = { $gt: 0 };
  if (cursor) {
    const { lastMessageAt, id } = decodeCursor(cursor);
    query.$and = [
      {
        $or: [
          { lastMessageAt: { $lt: lastMessageAt } },
          { lastMessageAt, _id: { $lt: new mongoose.Types.ObjectId(id) } },
        ],
      },
    ];
  }

  const docs = await Conversation.find(query)
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate(PARTICIPANT_POPULATE);
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);

  // Everything the user can now see counts as delivered to them
  void markDelivered(
    me,
    page.map((c) => c._id)
  ).catch(() => {});

  return {
    items: page.map((c) => serializeConversation(c, me)),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getConversation(me, conversationId) {
  const conversation = await loadForMember(me._id, conversationId);
  return serializeConversation(conversation, me);
}

export async function updateFlags(me, conversationId, flags) {
  const $set = {};
  if (flags.muted !== undefined) {
    $set["participants.$.mutedUntil"] =
      flags.muted === true
        ? MUTE_FOREVER
        : flags.muted === false
          ? null
          : new Date(Date.now() + flags.muted * 60_000);
  }
  if (flags.archived !== undefined) $set["participants.$.archived"] = flags.archived;
  if (flags.pinned !== undefined) $set["participants.$.pinned"] = flags.pinned;

  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, "participants.userId": me._id },
    { $set },
    { new: true }
  ).populate(PARTICIPANT_POPULATE);
  if (!conversation) throw ApiError.notFound("Conversation not found");
  broadcastConversation(conversation, [idOf(me._id)]);
  return serializeConversation(conversation, me);
}

/** Marks everything in the conversation as read by `me`, telling the other side if allowed. */
export async function markRead(me, conversationId) {
  const now = new Date();
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, "participants.userId": me._id },
    {
      $max: { "participants.$.lastReadAt": now, "participants.$.lastDeliveredAt": now },
      $set: { [`unread.${me._id}`]: 0 },
    },
    { new: true }
  ).populate(PARTICIPANT_POPULATE);
  if (!conversation) throw ApiError.notFound("Conversation not found");

  if (me.privacy?.readReceipts !== false) {
    for (const p of otherParticipants(conversation, me._id)) {
      emitToUser(idOf(p.userId), SOCKET_EVENTS.MESSAGE_STATUS, {
        conversationId: String(conversation._id),
        userId: idOf(me._id),
        status: "seen",
        at: now,
      });
    }
  }
  broadcastConversation(conversation, [idOf(me._id)]);
  return serializeConversation(conversation, me);
}

/**
 * Advances the delivery cursor of `user` on conversations with messages they have not been
 * handed yet, and tells the senders. Called when the user fetches their list or syncs.
 */
export async function markDelivered(user, conversationIds = null) {
  const meId = user._id;
  const filter = { "participants.userId": meId, lastMessage: { $ne: null } };
  if (conversationIds) filter._id = { $in: conversationIds };
  const candidates = await Conversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .select("participants lastMessage lastMessageAt")
    .lean();

  const pending = candidates.filter((c) => {
    if (idOf(c.lastMessage.senderId) === idOf(meId)) return false;
    const mine = c.participants.find((p) => idOf(p.userId) === idOf(meId));
    return !mine?.lastDeliveredAt || mine.lastDeliveredAt < c.lastMessageAt;
  });
  if (pending.length === 0) return 0;

  const now = new Date();
  await Conversation.updateMany(
    { _id: { $in: pending.map((c) => c._id) }, "participants.userId": meId },
    { $max: { "participants.$.lastDeliveredAt": now } }
  );
  for (const c of pending) {
    for (const p of c.participants) {
      if (idOf(p.userId) === idOf(meId)) continue;
      emitToUser(idOf(p.userId), SOCKET_EVENTS.MESSAGE_STATUS, {
        conversationId: String(c._id),
        userId: idOf(meId),
        status: "delivered",
        at: now,
      });
    }
  }
  return pending.length;
}

/** "Delete for me": hides existing messages from this participant and archives the chat. */
export async function clearForMe(me, conversationId) {
  const now = new Date();
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, "participants.userId": me._id },
    {
      $set: {
        "participants.$.clearedAt": now,
        "participants.$.archived": true,
        [`unread.${me._id}`]: 0,
      },
      $max: { "participants.$.lastReadAt": now, "participants.$.lastDeliveredAt": now },
    },
    { new: true }
  ).populate(PARTICIPANT_POPULATE);
  if (!conversation) throw ApiError.notFound("Conversation not found");
  broadcastConversation(conversation, [idOf(me._id)]);
  return serializeConversation(conversation, me);
}

/** Messages newer than `since` in conversations the user belongs to (reconnect catch-up). */
export async function syncConversations(user, entries, { messagesMax }) {
  const ids = entries.map((e) => e.id);
  const owned = await Conversation.find({ _id: { $in: ids }, "participants.userId": user._id })
    .select("_id participants")
    .lean();
  const ownedIds = new Set(owned.map((c) => String(c._id)));
  const result = [];
  for (const entry of entries) {
    if (!ownedIds.has(entry.id)) continue;
    const conv = owned.find((c) => String(c._id) === entry.id);
    const mine = conv.participants.find((p) => idOf(p.userId) === idOf(user._id));
    const filter = { conversationId: entry.id };
    const bounds = [];
    if (entry.since) bounds.push(new Date(entry.since));
    if (mine?.clearedAt) bounds.push(mine.clearedAt);
    if (bounds.length) filter.createdAt = { $gt: new Date(Math.max(...bounds)) };
    const messages = await Message.find(filter).sort({ _id: 1 }).limit(messagesMax).lean();
    result.push({ id: entry.id, messages });
  }
  void markDelivered(user, [...ownedIds]).catch(() => {});
  return result;
}

export async function participantIdsOf(conversationId, userId) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    "participants.userId": userId,
  })
    .select("participants.userId")
    .lean();
  if (!conv) return null;
  return conv.participants.map((p) => idOf(p.userId));
}
