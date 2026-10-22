import { SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeMessage } from "../utils/serializers.js";
import * as media from "./media.service.js";
import * as presence from "./presence.service.js";
import {
  broadcastConversation,
  idOf,
  loadForMember,
  otherParticipants,
} from "./conversation.service.js";
import { emitToUser } from "../sockets/emit.js";

function assertCounterpartsAvailable(conversation, me) {
  for (const p of otherParticipants(conversation, me._id)) {
    const user = p.userId && typeof p.userId === "object" ? p.userId : null;
    if (!user || user.status === USER_STATUS.DELETED) throw ApiError.notFound("User not found");
    if (user.status === USER_STATUS.DISABLED) {
      throw ApiError.forbidden("This user is currently unavailable");
    }
  }
}

export async function listMessages(me, conversationId, { cursor, limit }) {
  const conversation = await loadForMember(me._id, conversationId);
  const mine = conversation.participants.find((p) => idOf(p.userId) === idOf(me._id));
  const filter = { conversationId: conversation._id };
  if (mine?.clearedAt) filter.createdAt = { $gt: mine.clearedAt };
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
  };
}

async function applySendToConversation(conversation, message, { senderId, onlineIds }) {
  const createdAt = message.createdAt;
  const others = otherParticipants(conversation, senderId).map((p) => idOf(p.userId));
  const $inc = Object.fromEntries(others.map((id) => [`unread.${id}`, 1]));
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
          createdAt,
        },
        lastMessageAt: createdAt,
        // A new message brings an archived chat back for everyone
        "participants.$[all].archived": false,
      },
      $max: {
        "participants.$[sender].lastReadAt": createdAt,
        "participants.$[sender].lastDeliveredAt": createdAt,
        "participants.$[online].lastDeliveredAt": createdAt,
      },
      ...(others.length ? { $inc } : {}),
    },
    {
      new: true,
      arrayFilters: [
        { "all.userId": { $exists: true } },
        { "sender.userId": senderId },
        { "online.userId": { $in: online } },
      ],
    }
  ).populate("participants.userId");
}

export async function sendMessage(me, conversationId, { text = "", clientId }, files = []) {
  const conversation = await loadForMember(me._id, conversationId);
  assertCounterpartsAvailable(conversation, me);
  if (!text && files.length === 0) {
    throw ApiError.badRequest("Message must contain text or an image");
  }

  if (clientId) {
    const existing = await Message.findOne({ senderId: me._id, clientId }).lean();
    if (existing) return { message: serializeMessage(existing), duplicate: true };
  }

  const attachments = [];
  for (const file of files) {
    const uploaded = await media.uploadImage(file.buffer, { folder: "messages" });
    attachments.push({
      url: uploaded.url,
      publicId: uploaded.publicId,
      mime: "image/webp",
      size: uploaded.bytes,
      width: uploaded.width,
      height: uploaded.height,
      name: file.originalname?.slice(0, 120) ?? null,
    });
  }

  let doc;
  try {
    doc = await Message.create({
      conversationId: conversation._id,
      senderId: me._id,
      clientId: clientId ?? null,
      type: attachments.length ? "image" : "text",
      text,
      attachments,
    });
  } catch (err) {
    if (err?.code === 11000 && clientId) {
      const existing = await Message.findOne({ senderId: me._id, clientId }).lean();
      if (existing) {
        void media.destroyImages(attachments.map((a) => a.publicId));
        return { message: serializeMessage(existing), duplicate: true };
      }
    }
    throw err;
  }

  const onlineIds = otherParticipants(conversation, me._id)
    .map((p) => idOf(p.userId))
    .filter((id) => presence.isOnline(id));
  const updated = await applySendToConversation(conversation, doc, {
    senderId: me._id,
    onlineIds,
  });

  const payload = serializeMessage(doc);
  for (const p of updated.participants) {
    emitToUser(idOf(p.userId), SOCKET_EVENTS.MESSAGE_NEW, {
      conversationId: String(updated._id),
      message: payload,
    });
  }
  broadcastConversation(updated);

  return { message: payload, duplicate: false };
}
