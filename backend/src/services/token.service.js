import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { ERROR_CODES } from "@ghosted/shared";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import Session from "../models/session.model.js";
import { ApiError } from "../utils/ApiError.js";

const ISSUER = "ghosted";
const PREVIOUS_HASHES_KEPT = 5;

export function refreshTtlMs() {
  return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: String(sessionId) }, env.JWT_SECRET, {
    subject: String(userId),
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: ISSUER,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ["HS256"] });
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      throw ApiError.unauthorized("Access token expired", ERROR_CODES.TOKEN_EXPIRED);
    }
    throw ApiError.unauthorized("Invalid access token");
  }
}

/** Signature-checked decode that ignores expiry; used only to find the session on logout. */
export function decodeSessionId(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: ISSUER,
      algorithms: ["HS256"],
      ignoreExpiration: true,
    });
    return payload?.sid ?? null;
  } catch {
    return null;
  }
}

export function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession({ userId, userAgent = "", ip = "" }) {
  const refreshToken = generateRefreshToken();
  const session = await Session.create({
    userId,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: String(userAgent).slice(0, 256),
    ip: String(ip).slice(0, 64),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + refreshTtlMs()),
  });
  const accessToken = signAccessToken({ userId, sessionId: session._id });
  return { session, accessToken, refreshToken };
}

async function rotate(session, { userAgent, ip }) {
  const newToken = generateRefreshToken();
  session.previousTokenHashes = [
    ...session.previousTokenHashes.slice(-(PREVIOUS_HASHES_KEPT - 1)),
    session.refreshTokenHash,
  ];
  session.refreshTokenHash = hashToken(newToken);
  session.rotatedAt = new Date();
  session.lastUsedAt = new Date();
  if (userAgent) session.userAgent = String(userAgent).slice(0, 256);
  if (ip) session.ip = String(ip).slice(0, 64);
  session.expiresAt = new Date(Date.now() + refreshTtlMs()); // sliding expiry
  await session.save();
  return {
    session,
    accessToken: signAccessToken({ userId: session.userId, sessionId: session._id }),
    refreshToken: newToken,
  };
}

/**
 * Exchanges a refresh token for a new access + refresh pair. A token that was already rotated
 * is treated as stolen and revokes the whole session, except inside a short leeway window that
 * absorbs two tabs refreshing at the same moment.
 */
export async function rotateSession(refreshToken, meta = {}) {
  const hash = hashToken(refreshToken);
  const session = await Session.findOne({ refreshTokenHash: hash });

  if (!session) {
    const stale = await Session.findOne({ previousTokenHashes: hash });
    if (stale) {
      const withinLeeway =
        stale.rotatedAt && Date.now() - stale.rotatedAt.getTime() <= env.REFRESH_REUSE_LEEWAY_MS;
      if (withinLeeway && !stale.revokedAt && stale.expiresAt > new Date()) {
        return rotate(stale, meta);
      }
      if (!stale.revokedAt) {
        stale.revokedAt = new Date();
        stale.revokedReason = "token_reuse";
        await stale.save();
        logger.warn(
          { userId: String(stale.userId), sessionId: String(stale._id) },
          "Refresh token reuse detected; session revoked"
        );
      }
    }
    throw ApiError.unauthorized("Invalid refresh token");
  }

  if (session.revokedAt || session.expiresAt <= new Date()) {
    throw ApiError.unauthorized("Session expired");
  }

  return rotate(session, meta);
}

export async function revokeSession(sessionId, reason = "logout") {
  await Session.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

export async function revokeAllSessions(userId, reason, { exceptSessionId } = {}) {
  const filter = { userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  await Session.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

export async function listActiveSessions(userId) {
  return Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .lean();
}
