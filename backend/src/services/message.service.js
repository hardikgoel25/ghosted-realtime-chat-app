import { SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeMessage } from "../utils/serializers.js";
import * as media from "./media.service.js";
import { emitToUser } from "../sockets/emit.js";

async function requireCounterpart(me, otherId) {
  if (String(otherId) === String(me._id)) {
    throw ApiError.badRequest("You cannot message yourself");
  }
  const other = await User.findById(otherId).select("status").lean();
  if (!other || other.status === USER_STATUS.DELETED) throw ApiError.notFound("User not found");
  if (other.status === USER_STATUS.DISABLED) {
    throw ApiError.forbidden("This user is currently unavailable");
  }
  return other;
}

export async function listMessages(me, otherId, { cursor, limit }) {
  await requireCounterpart(me, otherId);
  const filter = {
    $or: [
      { senderId: me._id, receiverId: otherId },
      { senderId: otherId, receiverId: me._id },
    ],
  };
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

export async function sendMessage(sender, receiverId, { text = "", clientId }, file) {
  await requireCounterpart(sender, receiverId);
  if (!text && !file) throw ApiError.badRequest("Message must contain text or an image");

  if (clientId) {
    const existing = await Message.findOne({ senderId: sender._id, clientId }).lean();
    if (existing) return { message: serializeMessage(existing), duplicate: true };
  }

  let image = null;
  let imagePublicId = null;
  if (file) {
    const uploaded = await media.uploadImage(file.buffer, { folder: "messages" });
    image = uploaded.url;
    imagePublicId = uploaded.publicId;
  }

  let doc;
  try {
    doc = await Message.create({
      senderId: sender._id,
      receiverId,
      text,
      image,
      imagePublicId,
      clientId: clientId ?? null,
    });
  } catch (err) {
    if (err?.code === 11000 && clientId) {
      const existing = await Message.findOne({ senderId: sender._id, clientId }).lean();
      if (existing) {
        if (imagePublicId) void media.destroyImage(imagePublicId);
        return { message: serializeMessage(existing), duplicate: true };
      }
    }
    throw err;
  }

  const payload = serializeMessage(doc);
  emitToUser(receiverId, SOCKET_EVENTS.MESSAGE_NEW, payload);
  // The sender's other devices receive it too; the originating tab dedupes by _id
  emitToUser(sender._id, SOCKET_EVENTS.MESSAGE_NEW, payload);
  return { message: payload, duplicate: false };
}
