import { LIMITS, SOCKET_EVENTS, conversationRoomSchema, syncSchema } from "@ghosted/shared";
import { participantIdsOf, syncConversations } from "../../services/conversation.service.js";
import { serializeMessage } from "../../utils/serializers.js";
import { conversationRoom } from "../emit.js";
import { rememberParticipants } from "./typing.js";

export { conversationRoom };

export function registerConversationHandlers(socket) {
  const { user, userId } = socket.data;

  socket.on(SOCKET_EVENTS.CONVERSATION_OPEN, async (payload, ack) => {
    const parsed = conversationRoomSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    const { conversationId } = parsed.data;
    const participants = await participantIdsOf(conversationId, userId);
    if (!participants) return ack?.({ ok: false, error: "NOT_FOUND" });
    rememberParticipants(socket, conversationId, participants);
    socket.join(conversationRoom(conversationId));
    ack?.({ ok: true });
  });

  socket.on(SOCKET_EVENTS.CONVERSATION_CLOSE, (payload, ack) => {
    const parsed = conversationRoomSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    socket.leave(conversationRoom(parsed.data.conversationId));
    ack?.({ ok: true });
  });

  // Reconnect catch-up: "give me everything newer than X in these conversations"
  socket.on(SOCKET_EVENTS.SYNC, async (payload, ack) => {
    const parsed = syncSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    const result = await syncConversations(user, parsed.data.conversations, {
      messagesMax: LIMITS.SYNC_MESSAGES_MAX,
    });
    ack?.({
      ok: true,
      conversations: result.map((c) => ({ id: c.id, messages: c.messages.map(serializeMessage) })),
    });
  });
}
