import { SOCKET_EVENTS, conversationTypingSchema } from "@ghosted/shared";
import { participantIdsOf } from "../../services/conversation.service.js";
import { isBlockedEither } from "../../services/block.service.js";
import { emitToUser } from "../emit.js";

const TYPING_THROTTLE_MS = 2000;

/** Participants of conversations this socket has touched, so typing does not hit the DB. */
export function conversationCache(socket) {
  socket.data.participantsByConversation ??= new Map();
  return socket.data.participantsByConversation;
}

async function participantsFor(socket, conversationId) {
  const cache = conversationCache(socket);
  if (cache.has(conversationId)) return cache.get(conversationId);
  const ids = await participantIdsOf(conversationId, socket.data.userId);
  if (ids) cache.set(conversationId, ids);
  return ids;
}

export function registerTypingHandlers(socket) {
  const lastSent = new Map(); // conversationId -> timestamp of the last typing:start relayed
  const { userId } = socket.data;

  const relay = async (conversationId, participants, isTyping) => {
    for (const id of participants) {
      if (id === userId) continue;
      // Blocked pairs get no presence signals in either direction
      if (await isBlockedEither(userId, id)) continue;
      emitToUser(id, SOCKET_EVENTS.TYPING, { conversationId, userId, isTyping });
    }
  };

  socket.on(SOCKET_EVENTS.TYPING_START, async (payload, ack) => {
    const parsed = conversationTypingSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    const { conversationId } = parsed.data;
    const now = Date.now();
    if (now - (lastSent.get(conversationId) ?? 0) < TYPING_THROTTLE_MS) {
      return ack?.({ ok: true, throttled: true });
    }
    const participants = await participantsFor(socket, conversationId);
    if (!participants) return ack?.({ ok: false, error: "NOT_FOUND" });
    lastSent.set(conversationId, now);
    relay(conversationId, participants, true);
    ack?.({ ok: true });
  });

  socket.on(SOCKET_EVENTS.TYPING_STOP, async (payload, ack) => {
    const parsed = conversationTypingSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    const { conversationId } = parsed.data;
    const participants = await participantsFor(socket, conversationId);
    if (!participants) return ack?.({ ok: false, error: "NOT_FOUND" });
    lastSent.delete(conversationId);
    relay(conversationId, participants, false);
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => lastSent.clear());
}
