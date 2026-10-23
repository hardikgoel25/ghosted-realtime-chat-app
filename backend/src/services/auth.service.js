import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import { ERROR_CODES, SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { sessionOptions, withTransaction } from "../config/db.js";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import Block from "../models/block.model.js";
import EmailToken from "../models/emailToken.model.js";
import { ApiError } from "../utils/ApiError.js";
import { initialsAvatar } from "../utils/avatar.js";
import * as tokens from "./token.service.js";
import * as media from "./media.service.js";
import * as mail from "./mail.service.js";
import { leaveAllGroups } from "./group.service.js";
import * as twoFactor from "./twoFactor.service.js";
import { features } from "../config/features.js";
import { broadcast, disconnectUserSockets } from "../sockets/emit.js";

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_BASE_MS = 15 * 60 * 1000;
const LOCK_MAX_MS = 60 * 60 * 1000;
const MIN_PASSWORD_SCORE = 2;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

const needsSecondFactor = (user) => features.twoFactor && Boolean(user.twoFactor?.enabled);

export async function login({ username, password }, meta) {
  const user = await verifyCredentials(username, password);
  if (user.status === USER_STATUS.DISABLED) {
    throw ApiError.forbidden(
      "Your account is disabled. Enable it to continue.",
      ERROR_CODES.ACCOUNT_DISABLED
    );
  }
  if (needsSecondFactor(user)) {
    return { user, twoFactorRequired: true, challenge: twoFactor.issueChallenge(user, "login") };
  }
  const session = await tokens.createSession({ userId: user._id, ...meta });
  return { user, ...session };
}

/**
 * Second step of a two-factor sign-in: the challenge proves the password was already checked,
 * the code proves possession of the authenticator (or a recovery code). Failures count towards
 * the same lockout as wrong passwords.
 */
export async function completeTwoFactor(challengeToken, code, meta) {
  const challenge = twoFactor.readChallenge(challengeToken);
  const user = await User.findById(challenge.userId).select(twoFactor.SECRET_FIELDS);
  if (!user || user.status === USER_STATUS.DELETED) throw ApiError.unauthorized();
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw ApiError.tooMany(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      ERROR_CODES.ACCOUNT_LOCKED
    );
  }
  if (!(await twoFactor.verifyAnyCode(user, code))) {
    await registerFailedLogin(user);
    throw ApiError.unauthorized("That code is not right", ERROR_CODES.TWO_FACTOR_INVALID);
  }
  twoFactor.consumeChallenge(challenge);
  const $set = { failedLoginCount: 0, lockedUntil: null };
  if (user.status === USER_STATUS.DISABLED) {
    if (challenge.intent !== "enable") {
      throw ApiError.forbidden(
        "Your account is disabled. Enable it to continue.",
        ERROR_CODES.ACCOUNT_DISABLED
      );
    }
    $set.status = USER_STATUS.ACTIVE;
    user.status = USER_STATUS.ACTIVE;
    logger.info({ userId: String(user._id) }, "Account re-enabled");
  }
  await User.updateOne({ _id: user._id }, { $set });
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
  if (needsSecondFactor(user)) {
    return { user, twoFactorRequired: true, challenge: twoFactor.issueChallenge(user, "enable") };
  }
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

  // Direct conversations die with the account; groups get a "left" notice first
  await leaveAllGroups(userId);
  const conversationIds = await Conversation.distinct("_id", {
    type: "direct",
    "participants.userId": userId,
  });
  const messages = await Message.find({
    $or: [{ conversationId: { $in: conversationIds } }, { senderId: userId }],
    "attachments.0": { $exists: true },
  })
    .select("attachments.publicId attachments.resourceType")
    .lean();
  const assets = messages.flatMap((m) => m.attachments);

  await withTransaction(async (session) => {
    const opts = sessionOptions(session);
    // Group "left" notices are system messages authored by this user; they must survive
    await Message.deleteMany(
      {
        $or: [
          { conversationId: { $in: conversationIds } },
          { senderId: userId, type: { $ne: "system" } },
        ],
      },
      opts
    );
    await Conversation.deleteMany({ _id: { $in: conversationIds } }, opts);
    await Block.deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] }, opts);
    await EmailToken.deleteMany({ userId }, opts);
    await Session.deleteMany({ userId }, opts);
    await User.deleteOne({ _id: userId }, opts);
  });

  await disconnectUserSockets(userId);
  broadcast(SOCKET_EVENTS.USER_DELETED, {
    userId: String(userId),
    conversationIds: conversationIds.map(String),
  });
  logger.info(
    { userId: String(userId), conversations: conversationIds.length, assets: assets.length },
    "Account deleted"
  );

  // Best-effort media cleanup after the data is gone; failures only leave orphaned assets
  void media.destroyAssets([{ publicId: doc.avatar?.publicId, resourceType: "image" }, ...assets]);
}

// ---------------------------------------------------------------------------------------------
// Email verification and password reset (only active when SMTP is configured)
// ---------------------------------------------------------------------------------------------

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

async function issueEmailToken(user, purpose, ttlMs) {
  const raw = crypto.randomBytes(32).toString("hex");
  await EmailToken.deleteMany({ userId: user._id, purpose });
  await EmailToken.create({
    userId: user._id,
    purpose,
    email: user.email,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

export async function sendVerification(user) {
  mail.assertEmailConfigured();
  if (!user.email) throw ApiError.badRequest("Add an email address first");
  if (user.emailVerified) throw ApiError.badRequest("This email address is already verified");
  const raw = await issueEmailToken(user, "verify", VERIFY_TOKEN_TTL_MS);
  await mail.sendMail({
    to: user.email,
    ...mail.verificationEmail({
      fullname: user.fullname,
      link: `${env.appUrl}/verify-email?token=${raw}`,
    }),
  });
}

export async function updateEmail(user, email) {
  if (await User.exists({ email, _id: { $ne: user._id } })) {
    throw ApiError.conflict("That email address is already in use");
  }
  if (user.email === email && user.emailVerified) return user;
  user.email = email;
  user.emailVerified = false;
  await user.save();
  if (mail.emailConfigured) {
    try {
      await sendVerification(user);
    } catch (err) {
      logger.warn({ err, userId: String(user._id) }, "Verification email failed");
    }
  }
  return user;
}

export async function removeEmail(user) {
  user.email = undefined;
  user.emailVerified = false;
  await user.save();
  await EmailToken.deleteMany({ userId: user._id });
  return user;
}

export async function verifyEmail(rawToken) {
  const doc = await EmailToken.findOne({
    tokenHash: hashToken(rawToken),
    purpose: "verify",
    expiresAt: { $gt: new Date() },
  });
  if (!doc) throw ApiError.badRequest("This verification link is invalid or has expired");
  const user = await User.findById(doc.userId);
  if (!user || user.email !== doc.email) {
    throw ApiError.badRequest("This verification link is no longer valid");
  }
  user.emailVerified = true;
  await user.save();
  await EmailToken.deleteOne({ _id: doc._id });
  return user;
}

/** Always resolves, whether or not the account exists, so addresses cannot be enumerated. */
export async function forgotPassword(identifier) {
  mail.assertEmailConfigured();
  const key = identifier.toLowerCase();
  const user = await User.findOne(key.includes("@") ? { email: key } : { username: key });
  if (!user || !user.email || !user.emailVerified || user.status !== USER_STATUS.ACTIVE) {
    logger.info("Password reset requested for an unknown or unverified account");
    return;
  }
  const raw = await issueEmailToken(user, "reset", RESET_TOKEN_TTL_MS);
  await mail.sendMail({
    to: user.email,
    ...mail.resetEmail({
      fullname: user.fullname,
      link: `${env.appUrl}/reset-password?token=${raw}`,
    }),
  });
}

export async function resetPassword(rawToken, password) {
  const doc = await EmailToken.findOne({
    tokenHash: hashToken(rawToken),
    purpose: "reset",
    expiresAt: { $gt: new Date() },
  });
  if (!doc) throw ApiError.badRequest("This reset link is invalid or has expired");
  const user = await User.findById(doc.userId).select("+passwordHash");
  if (!user) throw ApiError.badRequest("This reset link is no longer valid");
  assertPasswordStrength(password, [user.username, user.fullname]);
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  await user.save();
  await EmailToken.deleteMany({ userId: user._id, purpose: "reset" });
  await tokens.revokeAllSessions(user._id, "password_reset");
  await disconnectUserSockets(user._id, {
    event: SOCKET_EVENTS.SESSION_REVOKED,
    payload: { reason: "password_change" },
  });
  logger.info({ userId: String(user._id) }, "Password reset via email");
  return user;
}
