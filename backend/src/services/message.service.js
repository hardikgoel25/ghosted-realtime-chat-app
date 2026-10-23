import { ERROR_CODES, LIMITS, SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { escapeRegex } from "../utils/regex.js";
import { serializeMessage } from "../utils/serializers.js";
import * as media from "./media.service.js";
import * as presence from "./presence.service.js";
import * as blocks from "./block.service.js";
import { extractFirstUrl, schedulePreview } from "./linkPreview.service.js";
import { notifyNewMessage } from "./notification.service.js";
import {
  activeParticipants,
  broadcastConversation,
  idOf,
  loadForMember,
  otherParticipants,
  participantOf,
} from "./conversation.service.js";
import { emitToUser } from "../sockets/emit.js";

const isGroup = (conversation) => conversation.type === "group";

function assertCounterpartsAvailable(conversation, me) {
  for (const p of otherParticipants(conversation, me._id)) {
    const user = p.userId && typeof p.userId === "object" ? p.userId : null;
    if (!user || user.status === USER_STATUS.DELETED) throw ApiError.notFound("User not found");
    if (user.status === USER_STATUS.DISABLED) {
      throw ApiError.forbidden("This user is currently unavailable");
    }
  }
}

export function emitToParticipants(conversation, event, payload) {
  for (const p of activeParticipants(conversation)) emitToUser(idOf(p.userId), event, payload);
}

function visibleFilter(conversation, me) {
  const mine = participantOf(conversation, me._id);
  const filter = { conversationId: conversation._id, deletedFor: { $ne: me._id } };
  if (mine?.clearedAt) filter.createdAt = { $gt: mine.clearedAt };
  return filter;
}

async function loadMessage(conversation, me, messageId) {
  const message = await Message.findOne({ ...visibleFilter(conversation, me), _id: messageId });
  if (!message) throw ApiError.notFound("Message not found");
  return message;
}

function typeOf(attachments) {
  if (attachments.length === 0) return "text";
  const kinds = new Set(attachments.map((a) => a.kind));
  return kinds.size === 1 ? [...kinds][0] : "file";
}

async function onlineAmong(ids) {
  const online = [];
  for (const id of ids) if (await presence.isOnline(id)) online.push(id);
  return online;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

export async function listMessages(me, conversationId, { cursor, after, around, limit }) {
  const conversation = await loadForMember(me._id, conversationId);
  const base = visibleFilter(conversation, me);

  if (around) {
    const anchor = await Message.findOne({ ...base, _id: around }).lean();
    if (!anchor) throw ApiError.notFound("Message not found");
    const half = Math.max(1, Math.floor(limit / 2));
    const [before, afterDocs] = await Promise.all([
      Message.find({ ...base, _id: { $lt: around } })
        .sort({ _id: -1 })
        .limit(half + 1)
        .lean(),
      Message.find({ ...base, _id: { $gt: around } })
        .sort({ _id: 1 })
        .limit(half + 1)
        .lean(),
    ]);
    const items = [...before.slice(0, half).reverse(), anchor, ...afterDocs.slice(0, half)];
    return {
      items: items.map(serializeMessage),
      nextCursor: before.length > half ? String(items[0]._id) : null,
      newerCursor: afterDocs.length > half ? String(items[items.length - 1]._id) : null,
    };
  }

  if (after) {
    const docs = await Message.find({ ...base, _id: { $gt: after } })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean();
    const hasMore = docs.length > limit;
    const page = docs.slice(0, limit);
    return {
      items: page.map(serializeMessage),
      nextCursor: null,
      newerCursor: hasMore ? String(page[page.length - 1]._id) : null,
    };
  }

  const filter = { ...base };
  if (cursor) filter._id = { $lt: cursor };
  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit).reverse(); // oldest first for rendering
  return {
    items: page.map(serializeMessage),
    nextCursor: hasMore ? String(page[0]._id) : null,
    newerCursor: null,
  };
}

export async function searchMessages(me, conversationId, { q, cursor, limit }) {
  const conversation = await loadForMember(me._id, conversationId);
  const filter = {
    ...visibleFilter(conversation, me),
    deletedAt: null,
    type: { $ne: "system" },
    text: { $regex: escapeRegex(q), $options: "i" },
  };
  if (cursor) filter._id = { $lt: cursor };
  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  return {
    items: page.map(serializeMessage),
    nextCursor: hasMore ? String(page[page.length - 1]._id) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------

async function buildAttachments(files, { audioDurationMs }) {
  const out = [];
  for (const f of files.images ?? []) {
    if (f.size > LIMITS.IMAGE_MAX_BYTES) throw ApiError.payloadTooLarge("Image is too large");
    const up = await media.uploadImage(f.buffer, { folder: "messages" });
    out.push({
      kind: "image",
      url: up.url,
      publicId: up.publicId,
      resourceType: "image",
      mime: "image/webp",
      size: up.bytes,
      width: up.width,
      height: up.height,
      name: media.safeFilename(f.originalname, "image.webp"),
    });
  }
  for (const f of files.files ?? []) {
    const up = await media.uploadFile(f.buffer, {
      folder: "files",
      name: f.originalname,
      declaredMime: f.mimetype,
    });
    out.push({ kind: "file", ...up });
  }
  for (const f of files.audio ?? []) {
    const up = await media.uploadAudio(f.buffer, { folder: "audio", declaredMime: f.mimetype });
    out.push({ kind: "audio", ...up, durationMs: audioDurationMs ?? null, name: null });
  }
  return out;
}

/**
 * Records a new message on the conversation: last-message snapshot, cursors for the sender and
 * for recipients who are online right now, unread counters (not for system messages), and
 * un-archiving for everyone who is still a member.
 */
async function applySendToConversation(
  conversation,
  message,
  { senderId, onlineIds, countUnread = true }
) {
  const createdAt = message.createdAt;
  const others = otherParticipants(conversation, senderId).map((p) => idOf(p.userId));
  const $inc = countUnread ? Object.fromEntries(others.map((id) => [`unread.${id}`, 1])) : {};
  const online = others.filter((id) => onlineIds.includes(id));

  return Conversation.findOneAndUpdate(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: {
          _id: message._id,
          senderId: message.senderId,
          type: message.type,
          text: message.text,
          hasAttachments: message.attachments.length > 0,
          system: message.system ?? null,
          deletedAt: null,
          createdAt,
        },
        lastMessageAt: createdAt,
        // A new message brings an archived chat back for every current member
        "participants.$[all].archived": false,
      },
      $max: {
        "participants.$[sender].lastReadAt": createdAt,
        "participants.$[sender].lastDeliveredAt": createdAt,
        "participants.$[online].lastDeliveredAt": createdAt,
      },
      ...(Object.keys($inc).length ? { $inc } : {}),
    },
    {
      new: true,
      arrayFilters: [
        { "all.leftAt": null },
        { "sender.userId": senderId },
        { "online.userId": { $in: online } },
      ],
    }
  ).populate("participants.userId");
}

export async function sendMessage(me, conversationId, body, files = {}) {
  const { text = "", clientId, replyTo, audioDurationMs } = body;
  const conversation = await loadForMember(me._id, conversationId);
  if (!isGroup(conversation)) {
    assertCounterpartsAvailable(conversation, me);
    await blocks.assertNotBlocked(
      me._id,
      otherParticipants(conversation, me._id).map((p) => idOf(p.userId))
    );
  }

  const hasFiles = ["images", "files", "audio"].some((k) => (files[k] ?? []).length > 0);
  if (!text && !hasFiles) throw ApiError.badRequest("Message must contain text or an attachment");

  if (clientId) {
    const existing = await Message.findOne({ senderId: me._id, clientId }).lean();
    if (existing) return { message: serializeMessage(existing), duplicate: true };
  }

  let replySnapshot = null;
  if (replyTo) {
    const original = await Message.findOne({
      conversationId: conversation._id,
      _id: replyTo,
      deletedAt: null,
      type: { $ne: "system" },
    }).lean();
    if (!original) throw ApiError.badRequest("The message you are replying to is not available");
    replySnapshot = {
      messageId: original._id,
      senderId: original.senderId,
      type: original.type,
      text: (original.text ?? "").slice(0, LIMITS.REPLY_SNIPPET_MAX),
      hasAttachments: (original.attachments ?? []).length > 0,
    };
  }

  const attachments = await buildAttachments(files, { audioDurationMs });

  let doc;
  try {
    doc = await Message.create({
      conversationId: conversation._id,
      senderId: me._id,
      clientId: clientId ?? null,
      type: typeOf(attachments),
      text,
      attachments,
      replyTo: replySnapshot,
    });
  } catch (err) {
    if (err?.code === 11000 && clientId) {
      const existing = await Message.findOne({ senderId: me._id, clientId }).lean();
      if (existing) {
        void media.destroyAssets(attachments);
        return { message: serializeMessage(existing), duplicate: true };
      }
    }
    throw err;
  }

  const onlineIds = await onlineAmong(
    otherParticipants(conversation, me._id).map((p) => idOf(p.userId))
  );
  const updated = await applySendToConversation(conversation, doc, {
    senderId: me._id,
    onlineIds,
  });

  const payload = serializeMessage(doc);
  emitToParticipants(updated, SOCKET_EVENTS.MESSAGE_NEW, {
    conversationId: String(updated._id),
    message: payload,
  });
  broadcastConversation(updated);

  void notifyNewMessage(updated, doc, { onlineIds }).catch(() => {});

  schedulePreview(doc, (fresh) =>
    emitToParticipants(updated, SOCKET_EVENTS.MESSAGE_UPDATED, {
      conversationId: String(updated._id),
      message: serializeMessage(fresh),
    })
  );

  return { message: payload, duplicate: false, conversation: updated, onlineIds };
}

/**
 * Group events ("Alice added Bob") are stored as `system` messages: they appear in the timeline
 * and refresh the sidebar preview, but never count as unread.
 */
export async function postSystemMessage(
  conversation,
  actorId,
  { kind, targetIds = [], text = "" }
) {
  const doc = await Message.create({
    conversationId: conversation._id,
    senderId: actorId,
    type: "system",
    text: "",
    system: { kind, targetIds, text },
  });
  const updated = await applySendToConversation(conversation, doc, {
    senderId: actorId,
    onlineIds: [],
    countUnread: false,
  });
  emitToParticipants(updated, SOCKET_EVENTS.MESSAGE_NEW, {
    conversationId: String(updated._id),
    message: serializeMessage(doc),
  });
  broadcastConversation(updated);
  return updated;
}

// ---------------------------------------------------------------------------------------------
// Editing, deleting, reacting
// ---------------------------------------------------------------------------------------------

async function refreshLastMessageIfNeeded(conversation, message) {
  if (!conversation.lastMessage || idOf(conversation.lastMessage._id) !== idOf(message._id)) return;
  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    {
      $set: {
        "lastMessage.text": message.deletedAt ? "" : message.text,
        "lastMessage.hasAttachments": message.deletedAt ? false : message.attachments.length > 0,
        "lastMessage.deletedAt": message.deletedAt ?? null,
      },
    },
    { new: true }
  ).populate("participants.userId");
  broadcastConversation(updated);
}

export async function editMessage(me, conversationId, messageId, { text }) {
  const conversation = await loadForMember(me._id, conversationId);
  const message = await loadMessage(conversation, me, messageId);
  if (idOf(message.senderId) !== idOf(me._id) || message.type === "system") {
    throw ApiError.forbidden("You can only edit your own messages");
  }
  if (message.deletedAt) throw ApiError.badRequest("This message was deleted");
  if (Date.now() - message.createdAt.getTime() > LIMITS.MESSAGE_EDIT_WINDOW_MS) {
    throw ApiError.forbidden(
      "Messages can only be edited within 15 minutes of sending",
      ERROR_CODES.EDIT_WINDOW_EXPIRED
    );
  }
  if (message.text === text) return serializeMessage(message);

  const linkChanged = extractFirstUrl(message.text) !== extractFirstUrl(text);
  message.text = text;
  message.editedAt = new Date();
  if (linkChanged) message.linkPreview = null;
  await message.save();

  const payload = serializeMessage(message);
  const notify = (fresh) =>
    emitToParticipants(conversation, SOCKET_EVENTS.MESSAGE_UPDATED, {
      conversationId: String(conversation._id),
      message: serializeMessage(fresh),
    });
  notify(message);
  if (linkChanged) schedulePreview(message, notify);
  await refreshLastMessageIfNeeded(conversation, message);
  return payload;
}

export async function deleteMessage(me, conversationId, messageId, scope) {
  const conversation = await loadForMember(me._id, conversationId);
  const message = await loadMessage(conversation, me, messageId);

  if (scope === "me") {
    await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: me._id } });
    emitToUser(idOf(me._id), SOCKET_EVENTS.MESSAGE_DELETED, {
      conversationId: String(conversation._id),
      messageId: String(message._id),
      scope: "me",
    });
    return { scope: "me" };
  }

  const mine = idOf(message.senderId) === idOf(me._id);
  const admin = isGroup(conversation) && participantOf(conversation, me._id)?.role === "admin";
  if (message.type === "system" || (!mine && !admin)) {
    throw ApiError.forbidden(
      admin
        ? "System messages cannot be deleted"
        : "You can only delete your own messages for everyone"
    );
  }
  if (!message.deletedAt) {
    const assets = message.attachments.map((a) => ({
      publicId: a.publicId,
      resourceType: a.resourceType,
    }));
    message.deletedAt = new Date();
    message.text = "";
    message.attachments = [];
    message.reactions = [];
    message.replyTo = null;
    message.linkPreview = null;
    await message.save();
    void media.destroyAssets(assets);
  }
  emitToParticipants(conversation, SOCKET_EVENTS.MESSAGE_DELETED, {
    conversationId: String(conversation._id),
    messageId: String(message._id),
    scope: "everyone",
    message: serializeMessage(message),
  });
  await refreshLastMessageIfNeeded(conversation, message);
  return { scope: "everyone", message: serializeMessage(message) };
}

async function emitReactions(conversation, messageId) {
  const fresh = await Message.findById(messageId).lean();
  const payload = {
    conversationId: String(conversation._id),
    messageId: String(messageId),
    reactions: serializeMessage(fresh).reactions,
  };
  emitToParticipants(conversation, SOCKET_EVENTS.MESSAGE_REACTION, payload);
  return payload;
}

export async function addReaction(me, conversationId, messageId, emoji) {
  const conversation = await loadForMember(me._id, conversationId);
  const message = await loadMessage(conversation, me, messageId);
  if (message.deletedAt) throw ApiError.badRequest("This message was deleted");
  if (message.type === "system") throw ApiError.badRequest("You can't react to this message");

  const joined = await Message.updateOne(
    { _id: message._id, "reactions.emoji": emoji },
    { $addToSet: { "reactions.$.userIds": me._id } }
  );
  if (joined.matchedCount === 0) {
    if (message.reactions.length >= LIMITS.REACTIONS_PER_MESSAGE) {
      throw ApiError.badRequest("This message already has the maximum number of reactions");
    }
    await Message.updateOne(
      { _id: message._id, "reactions.emoji": { $ne: emoji } },
      { $push: { reactions: { emoji, userIds: [me._id] } } }
    );
  }
  return emitReactions(conversation, message._id);
}

export async function removeReaction(me, conversationId, messageId, emoji) {
  const conversation = await loadForMember(me._id, conversationId);
  const message = await loadMessage(conversation, me, messageId);
  await Message.updateOne(
    { _id: message._id, "reactions.emoji": emoji },
    { $pull: { "reactions.$.userIds": me._id } }
  );
  await Message.updateOne(
    { _id: message._id },
    { $pull: { reactions: { userIds: { $size: 0 } } } }
  );
  return emitReactions(conversation, message._id);
}
