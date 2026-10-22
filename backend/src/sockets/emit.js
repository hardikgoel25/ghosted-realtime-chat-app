import { getIo } from "./io.js";

export const userRoom = (userId) => `user:${userId}`;

export function emitToUser(userId, event, payload) {
  getIo()?.to(userRoom(userId)).emit(event, payload);
}

export function broadcast(event, payload) {
  getIo()?.emit(event, payload);
}

/**
 * Disconnects every socket of a user (optionally sparing one session), sending `event` first so
 * the client can explain why it was logged out.
 */
export async function disconnectUserSockets(userId, { exceptSessionId, event, payload } = {}) {
  const io = getIo();
  if (!io) return;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  for (const socket of sockets) {
    if (exceptSessionId && socket.data.sessionId === String(exceptSessionId)) continue;
    if (event) socket.emit(event, payload);
    socket.disconnect(true);
  }
}

export async function disconnectSessionSockets(sessionId, { event, payload } = {}) {
  const io = getIo();
  if (!io) return;
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {
    if (socket.data.sessionId !== String(sessionId)) continue;
    if (event) socket.emit(event, payload);
    socket.disconnect(true);
  }
}
