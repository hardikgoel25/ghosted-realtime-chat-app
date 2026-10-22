import { parse as parseCookie } from "cookie";
import { ERROR_CODES } from "@ghosted/shared";
import { resolveAccessToken } from "../middleware/auth.js";
import { ACCESS_COOKIE } from "../utils/cookies.js";

function handshakeError(code) {
  const err = new Error(code);
  err.data = { code };
  return err;
}

/**
 * Socket.IO handshake middleware: the identity comes only from the signed access cookie.
 * Anything the client puts in the query string is ignored.
 */
export async function socketAuth(socket, next) {
  try {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
    const token = cookies[ACCESS_COOKIE];
    if (!token) return next(handshakeError(ERROR_CODES.UNAUTHORIZED));
    const { user, sessionId } = await resolveAccessToken(token);
    socket.data.user = user;
    socket.data.userId = String(user._id);
    socket.data.sessionId = sessionId;
    next();
  } catch (err) {
    const code =
      err?.code === ERROR_CODES.TOKEN_EXPIRED || err?.code === ERROR_CODES.ACCOUNT_DISABLED
        ? err.code
        : ERROR_CODES.UNAUTHORIZED;
    next(handshakeError(code));
  }
}
