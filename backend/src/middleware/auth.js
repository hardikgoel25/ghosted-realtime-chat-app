import { ERROR_CODES, USER_STATUS } from "@ghosted/shared";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ACCESS_COOKIE } from "../utils/cookies.js";
import { verifyAccessToken } from "../services/token.service.js";

/**
 * Turns an access token into { user, sessionId }, checking the session has not been revoked.
 * Shared by the HTTP middleware and the Socket.IO handshake.
 */
export async function resolveAccessToken(token) {
  const payload = verifyAccessToken(token);
  const [user, session] = await Promise.all([
    User.findById(payload.sub),
    Session.findOne({ _id: payload.sid, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select("_id")
      .lean(),
  ]);
  if (!user || !session || user.status === USER_STATUS.DELETED) {
    throw ApiError.unauthorized("Session is no longer valid");
  }
  if (user.status === USER_STATUS.DISABLED) {
    throw ApiError.forbidden("Account is disabled", ERROR_CODES.ACCOUNT_DISABLED);
  }
  return { user, sessionId: String(session._id) };
}

export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(ApiError.unauthorized("Not authenticated"));
  try {
    const { user, sessionId } = await resolveAccessToken(token);
    req.user = user;
    req.sessionId = sessionId;
    next();
  } catch (err) {
    next(err);
  }
}
