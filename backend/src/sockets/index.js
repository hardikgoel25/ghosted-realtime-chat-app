import { Server } from "socket.io";
import { SOCKET_EVENTS } from "@ghosted/shared";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import * as presence from "../services/presence.service.js";
import { socketAuth } from "./auth.js";
import { setIo } from "./io.js";
import { userRoom } from "./emit.js";
import { registerTypingHandlers } from "./handlers/typing.js";
import { registerConversationHandlers } from "./handlers/conversations.js";

const EVENT_BUDGET = 60; // events per window per socket
const EVENT_WINDOW_MS = 10_000;

function packetRateLimiter(socket) {
  let count = 0;
  let windowStart = Date.now();
  return (_packet, next) => {
    const now = Date.now();
    if (now - windowStart > EVENT_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    if (++count > EVENT_BUDGET) {
      logger.debug({ userId: socket.data.userId }, "Socket event dropped: rate limit");
      return; // drop silently; the ack never fires
    }
    next();
  };
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGINS, credentials: true },
    serveClient: false,
    maxHttpBufferSize: 100_000,
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });
  setIo(io);

  io.use(socketAuth);

  io.on("connection", (socket) => {
    const { user, userId } = socket.data;
    socket.join(userRoom(userId));
    socket.use(packetRateLimiter(socket));

    const becameOnline = presence.addSocket(userId, socket.id);
    socket.emit(SOCKET_EVENTS.PRESENCE_SNAPSHOT, { userIds: presence.onlineUserIds() });
    if (becameOnline) {
      socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
        userId,
        online: true,
        lastSeenAt: null,
      });
    }
    logger.debug(
      { userId, socketId: socket.id, sockets: presence.socketCount(userId) },
      "Socket connected"
    );

    registerTypingHandlers(socket);
    registerConversationHandlers(socket);

    socket.on("disconnect", (reason) => {
      const wentOffline = presence.removeSocket(userId, socket.id);
      logger.debug({ userId, socketId: socket.id, reason, wentOffline }, "Socket disconnected");
      if (!wentOffline) return;
      const at = new Date();
      presence.scheduleLastSeen(userId, at);
      io.emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
        userId,
        online: false,
        lastSeenAt: user.privacy?.showLastSeen === false ? null : at,
      });
    });
  });

  return io;
}
