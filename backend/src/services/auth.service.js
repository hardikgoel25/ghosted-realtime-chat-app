import bcrypt from "bcryptjs";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import { ERROR_CODES, SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import { logger } from "../config/logger.js";
import { sessionOptions, withTransaction } from "../config/db.js";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import { ApiError } from "../utils/ApiError.js";
import { initialsAvatar } from "../utils/avatar.js";
import * as tokens from "./token.service.js";
import * as media from "./media.service.js";
import { broadcast, disconnectUserSockets } from "../sockets/emit.js";

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_BASE_MS = 15 * 60 * 1000;
const LOCK_MAX_MS = 60 * 60 * 1000;
const MIN_PASSWORD_SCORE = 2;

// Compared against when the username does not exist, so a miss costs the same time as a hit
const DUMMY_HASH = bcrypt.hashSync("ghosted-timing-equalizer", BCRYPT_ROUNDS);

zxcvbnOptions.setOptions({
  dictionary: { ...zxcvbnCommon.dictionary },
  graphs: zxcvbnCommon.adjacencyGraphs,
});

export function assertPasswordStrength(password, userInputs = []) {
  const result = zxcvbn(password, userInputs.filter(Boolean));
  if (result.score < MIN_PASSWORD_SCORE) {
    const hint = result.feedback.warning || result.feedback.suggestions?.[0];
    throw ApiError.validation("Password is too weak", [
      {
        path: "password",
        message: hint
          ? `This password is too easy to guess: ${hint}`
          : "This password is too common or too easy to guess",
      },
    ]);
  }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function registerFailedLogin(user) {
  const count = (user.failedLoginCount ?? 0) + 1;
  const update = { failedLoginCount: count };
  if (count >= MAX_FAILED_LOGINS) {
    const lockMs = Math.min(LOCK_BASE_MS * 2 ** (count - MAX_FAILED_LOGINS), LOCK_MAX_MS);
    update.lockedUntil = new Date(Date.now() + lockMs);
    logger.warn({ userId: String(user._id), count, lockMs }, "Account locked after failed logins");
  }
  await User.updateOne({ _id: user._id }, { $set: update });
}

/**
 * Verifies a username/password pair with uniform errors (no account enumeration), constant-time
 * behaviour for unknown users, and progressive lockout after repeated failures.
 */
export async function verifyCredentials(username, password) {
  const user = await User.findOne({ username }).select("+passwordHash");
  if (!user || user.status === USER_STATUS.DELETED) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized("Invalid credentials");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw ApiError.tooMany(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      ERROR_CODES.ACCOUNT_LOCKED
    );
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    await registerFailedLogin(user);
    throw ApiError.unauthorized("Invalid credentials");
  }

  if (user.failedLoginCount || user.lockedUntil) {
    await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockedUntil: null } });
  }
  return user;
}

export async function signup({ fullname, username, password, gender }, meta) {
  if (await User.exists({ username })) {
    throw ApiError.conflict("Username is already taken");
  }
  assertPasswordStrength(password, [username, fullname]);
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    fullname,
    username,
    passwordHash,
    gender,
    avatar: { url: initialsAvatar(fullname, username), publicId: null },
  });
  const session = await tokens.createSession({ userId: user._id, ...meta });
  return { user, ...session };
}

export async function login({ username, password }, meta) {
  const user = await verifyCredentials(username, password);
  if (user.status === USER_STATUS.DISABLED) {
    throw ApiError.forbidden(
      "Your account is disabled. Enable it to continue.",
      ERROR_CODES.ACCOUNT_DISABLED
    );
  }
  const session = await tokens.createSession({ userId: user._id, ...meta });
  return { user, ...session };
}

export async function refresh(refreshToken, meta) {
  if (!refreshToken) throw ApiError.unauthorized("No refresh token");
  const rotated = await tokens.rotateSession(refreshToken, meta);
  const user = await User.findById(rotated.session.userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    await tokens.revokeSession(rotated.session._id, "account_inactive");
    throw ApiError.unauthorized("Session is no longer valid");
  }
  return { user, ...rotated };
}

export async function logout({ sessionId }) {
  if (sessionId) await tokens.revokeSession(sessionId, "logout");
}

export async function logoutAll(userId) {
  await tokens.revokeAllSessions(userId, "logout_all");
  await disconnectUserSockets(userId, {
    event: SOCKET_EVENTS.SESSION_REVOKED,
    payload: { reason: "logout_all" },
  });
}

export async function changePassword(user, { currentPassword, newPassword }, { sessionId }) {
  const withHash = await User.findById(user._id).select("+passwordHash");
  if (!withHash) throw ApiError.unauthorized();
  const matches = await bcrypt.compare(currentPassword, withHash.passwordHash);
  if (!matches) throw ApiError.badRequest("Current password is incorrect");
  assertPasswordStrength(newPassword, [withHash.username, withHash.fullname]);
  withHash.passwordHash = await hashPassword(newPassword);
  withHash.passwordChangedAt = new Date();
  await withHash.save();
  await tokens.revokeAllSessions(user._id, "password_change", { exceptSessionId: sessionId });
  await disconnectUserSockets(user._id, {
    exceptSessionId: sessionId,
    event: SOCKET_EVENTS.SESSION_REVOKED,
    payload: { reason: "password_change" },
  });
}

async function assertPassword(user, password) {
  const withHash = await User.findById(user._id).select("+passwordHash");
  if (!withHash) throw ApiError.unauthorized();
  const matches = await bcrypt.compare(password, withHash.passwordHash);
  if (!matches) throw ApiError.badRequest("Incorrect password");
  return withHash;
}

export async function enableAccount({ username, password }, meta) {
  const user = await verifyCredentials(username, password);
  if (user.status === USER_STATUS.DISABLED) {
    user.status = USER_STATUS.ACTIVE;
    await user.save();
    logger.info({ userId: String(user._id) }, "Account re-enabled");
  }
  const session = await tokens.createSession({ userId: user._id, ...meta });
  return { user, ...session };
}

export async function disableAccount(user, { password }) {
  const doc = await assertPassword(user, password);
  doc.status = USER_STATUS.DISABLED;
  await doc.save();
  await tokens.revokeAllSessions(doc._id, "account_disabled");
  await disconnectUserSockets(doc._id);
  broadcast(SOCKET_EVENTS.USER_DISABLED, { userId: String(doc._id) });
  logger.info({ userId: String(doc._id) }, "Account disabled");
}

export async function deleteAccount(user, { password }) {
  const doc = await assertPassword(user, password);
  const userId = doc._id;

  // Direct conversations die with the account; group memberships are left for Phase 3
  const conversationIds = await Conversation.distinct("_id", {
    type: "direct",
    "participants.userId": userId,
  });
  const imageIds = await Message.distinct("attachments.publicId", {
    $or: [{ conversationId: { $in: conversationIds } }, { senderId: userId }],
    "attachments.publicId": { $ne: null },
  });

  await withTransaction(async (session) => {
    const opts = sessionOptions(session);
    await Message.deleteMany(
      { $or: [{ conversationId: { $in: conversationIds } }, { senderId: userId }] },
      opts
    );
    await Conversation.deleteMany({ _id: { $in: conversationIds } }, opts);
    await Session.deleteMany({ userId }, opts);
    await User.deleteOne({ _id: userId }, opts);
  });

  await disconnectUserSockets(userId);
  broadcast(SOCKET_EVENTS.USER_DELETED, {
    userId: String(userId),
    conversationIds: conversationIds.map(String),
  });
  logger.info(
    { userId: String(userId), conversations: conversationIds.length, images: imageIds.length },
    "Account deleted"
  );

  // Best-effort media cleanup after the data is gone; failures only leave orphaned assets
  void media.destroyImages([doc.avatar?.publicId, ...imageIds]);
}
