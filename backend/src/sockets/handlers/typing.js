import { SOCKET_EVENTS, typingEventSchema } from "@ghosted/shared";
import { emitToUser } from "../emit.js";

const TYPING_THROTTLE_MS = 2000;

export function registerTypingHandlers(socket) {
  const lastSent = new Map(); // receiverId -> timestamp of the last typing:start relayed
  const { userId } = socket.data;

  socket.on(SOCKET_EVENTS.TYPING_START, (payload, ack) => {
    const parsed = typingEventSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    const { to } = parsed.data;
    const now = Date.now();
    if (now - (lastSent.get(to) ?? 0) < TYPING_THROTTLE_MS)
      return ack?.({ ok: true, throttled: true });
    lastSent.set(to, now);
    emitToUser(to, SOCKET_EVENTS.TYPING, { from: userId, isTyping: true });
    ack?.({ ok: true });
  });

  socket.on(SOCKET_EVENTS.TYPING_STOP, (payload, ack) => {
    const parsed = typingEventSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "VALIDATION_ERROR" });
    lastSent.delete(parsed.data.to);
    emitToUser(parsed.data.to, SOCKET_EVENTS.TYPING, { from: userId, isTyping: false });
    ack?.({ ok: true });
  });

  socket.on("disconnect", () => lastSent.clear());
}
