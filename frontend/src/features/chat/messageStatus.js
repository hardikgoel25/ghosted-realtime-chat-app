import { MESSAGE_STATUS } from "@ghosted/shared";
import { minutesBetween, sameDay } from "../../lib/format";

const GROUP_WINDOW_MINUTES = 5;

/**
 * Delivery state of one of *my* messages, derived from the other participants' cursors.
 * Returns null for messages from other people.
 */
export function messageStatus(message, conversation, meId) {
  if (message.pending) return MESSAGE_STATUS.PENDING;
  if (message.failed) return MESSAGE_STATUS.FAILED;
  if (message.senderId !== meId || !conversation) return null;
  const t = new Date(message.createdAt).getTime();
  const others = conversation.participants.filter((p) => p.userId !== meId);
  if (others.length === 0) return MESSAGE_STATUS.SENT;
  const after = (value) => Boolean(value) && new Date(value).getTime() >= t;
  if (others.every((p) => after(p.lastReadAt))) return MESSAGE_STATUS.SEEN;
  if (others.some((p) => after(p.lastDeliveredAt))) return MESSAGE_STATUS.DELIVERED;
  return MESSAGE_STATUS.SENT;
}

/**
 * Adds layout hints to each message: day separators, grouping of consecutive messages from
 * the same sender within a few minutes, and the "new messages" divider position.
 */
export function annotateMessages(messages, { meId, firstUnreadAfter = null } = {}) {
  const marker = firstUnreadAfter ? new Date(firstUnreadAfter).getTime() : null;
  let dividerPlaced = false;
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const showDay = !prev || !sameDay(prev.createdAt, message.createdAt);
    const groupStart =
      !prev ||
      showDay ||
      prev.senderId !== message.senderId ||
      minutesBetween(prev.createdAt, message.createdAt) >= GROUP_WINDOW_MINUTES;
    const groupEnd =
      !next ||
      !sameDay(next.createdAt, message.createdAt) ||
      next.senderId !== message.senderId ||
      minutesBetween(next.createdAt, message.createdAt) >= GROUP_WINDOW_MINUTES;
    let firstUnread = false;
    if (
      marker !== null &&
      !dividerPlaced &&
      message.senderId !== meId &&
      new Date(message.createdAt).getTime() > marker
    ) {
      firstUnread = true;
      dividerPlaced = true;
    }
    return { message, showDay, groupStart, groupEnd, firstUnread };
  });
}
