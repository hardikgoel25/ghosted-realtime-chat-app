import { features } from "../config/features.js";
import { logger } from "../config/logger.js";
import * as push from "./push.service.js";
import { idOf, otherParticipants, participantOf } from "./conversation.service.js";

const PREVIEW_MAX = 90;

function previewText(message) {
  const text = (message.text ?? "").replace(/\s+/g, " ").trim();
  const kinds = new Set((message.attachments ?? []).map((a) => a.kind ?? "image"));
  const icon = kinds.has("audio")
    ? "🎤 "
    : kinds.has("file")
      ? "📎 "
      : kinds.has("image")
        ? "📷 "
        : "";
  if (text) return icon + (text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text);
  if (kinds.has("audio")) return "🎤 Voice message";
  if (kinds.has("file")) return "📎 File";
  if (kinds.has("image")) return "📷 Photo";
  return "New message";
}

const userOf = (participant) =>
  participant?.userId && typeof participant.userId === "object" ? participant.userId : null;

/**
 * Web Push for a new message: goes to members who are offline right now, have not muted the
 * chat, and have at least one subscribed device. Online members already got it over the socket.
 */
export async function notifyNewMessage(conversation, message, { onlineIds = [] } = {}) {
  if (!features.push || message.type === "system") return;
  const sender = userOf(participantOf(conversation, message.senderId));
  const senderName = sender?.fullname ?? "Someone";
  const isGroup = conversation.type === "group";
  const now = Date.now();
  const preview = previewText(message);
  const conversationId = String(conversation._id);

  const recipients = otherParticipants(conversation, message.senderId).filter((p) => {
    if (onlineIds.includes(idOf(p.userId))) return false;
    if (p.mutedUntil && new Date(p.mutedUntil).getTime() > now) return false;
    return true;
  });
  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (p) => {
      const user = userOf(p);
      const showPreview = user?.notificationPrefs?.preview !== false;
      const payload = {
        title: isGroup ? (conversation.group?.name ?? "Group") : senderName,
        body: showPreview
          ? isGroup
            ? `${senderName.split(" ")[0]}: ${preview}`
            : preview
          : "New message",
        tag: conversationId,
        url: `/c/${conversationId}`,
        icon: sender?.avatar?.url?.startsWith("https://") ? sender.avatar.url : undefined,
      };
      try {
        await push.sendToUsers([idOf(p.userId)], payload);
      } catch (err) {
        logger.warn({ err, userId: idOf(p.userId) }, "Push notification failed");
      }
    })
  );
}
