import { io } from "socket.io-client";
import { refreshSession } from "./api";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || undefined;

let socket = null;

export function getSocket() {
  return socket;
}

/**
 * Creates (or reuses) the single socket for this tab. Authentication happens through the
 * HttpOnly access cookie on the handshake; nothing identifying is sent in the query string.
 */
export function connectSocket({ onAuthFailure } = {}) {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    withCredentials: true,
    autoConnect: false,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on("connect_error", async (err) => {
    if (err.message !== "UNAUTHORIZED" && err.message !== "TOKEN_EXPIRED") return;
    try {
      // A fresh access cookie lets the automatic reconnection attempt succeed
      await refreshSession();
    } catch {
      socket?.disconnect();
      onAuthFailure?.();
    }
  });

  socket.connect();
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
