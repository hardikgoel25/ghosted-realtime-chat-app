import { SOCKET_EVENTS, conversationTypingSchema } from "@ghosted/shared";
import { participantIdsOf } from "../../services/conversation.service.js";
import { blockSets } from "../../services/block.service.js";
import { emitToUser } from "../emit.js";

const TYPING_THROTTLE_MS = 2000;
// Membership and block lists are cached per socket for a short while so typing never costs a
// query per keystroke; group membership changes take effect within this window.
const CACHE_TTL_MS = 30_000;

function cacheOf(socket) {
  socket.data.participantsByConversation ??= new Map();
  return socket.data.participantsByConversation;
}

export function rememberParticipants(socket, conversationId, ids) {
  cacheOf(socket).set(conversationId, { ids, at: Date.now() });
}

async function participantsFor(socket, conversationId) {
  const entry = cacheOf(socket).get(conversationId);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return entry.ids;
  const ids = await participantIdsOf(conversationId, socket.data.userId);
  if (ids) rememberParticipants(socket, conversationId, ids);
  return ids;
}

async function blocksFor(socket) {
  const cached = socket.data.blocks;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.sets;
  const sets = await blockSets(socket.data.userId);
  socket.data.blocks = { sets, at: Date.now() };
  return sets;
}

export function registerTypingHandlers(socket) {
  const lastSent = new Map(); // conversationId -> timestamp of the last typing:start relayed
  const { userId } = socket.data;

  const relay = async (conversationId, participants, isTyping) => {
    const blocks = await blocksFor(socket);
    for (const id of participants) {
      if (id === userId) continue;
      // Blocked pairs get no presence signals in either direction
      if (blocks.byMe.has(id) || blocks.byThem.has(id)) continue;
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
