import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { generateSecret, generateURI, verify } from "otplib";
import { ERROR_CODES, LIMITS } from "@ghosted/shared";
import { env } from "../config/env.js";
import { assertFeature } from "../config/features.js";
import { logger } from "../config/logger.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * TOTP two-factor authentication (RFC 6238, compatible with every authenticator app).
 * - The shared secret is stored encrypted (AES-256-GCM) under a key derived from JWT_SECRET,
 *   so a database leak alone does not expose it.
 * - Recovery codes are stored hashed and consumed on use.
 * - Login becomes two steps: password → short-lived signed challenge → code.
 */

export const SECRET_FIELDS = "+twoFactor.secret +twoFactor.pendingSecret +twoFactor.recoveryCodes";
const CHALLENGE_TTL = "5m";
const CHALLENGE_PURPOSE = "2fa";
const EPOCH_TOLERANCE_S = 30; // accept the previous/next 30 s step for clock drift
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i

const KEY = Buffer.from(crypto.hkdfSync("sha256", env.JWT_SECRET, "", "ghosted-totp-v1", 32));

/** Challenge ids already used for a successful sign-in (the tokens live 5 minutes). */
const usedChallenges = new Map();
function rememberUsed(jti, expMs) {
  const now = Date.now();
  for (const [id, exp] of usedChallenges) if (exp < now) usedChallenges.delete(id);
  usedChallenges.set(jti, expMs);
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(stored) {
  const buf = Buffer.from(stored, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");

export function generateRecoveryCodes(count = LIMITS.TOTP_RECOVERY_CODES) {
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
    return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
  });
}

const normalise = (code) => String(code).replace(/[\s-]/g, "").toLowerCase();

async function loadWithSecrets(userId) {
  const user = await User.findById(userId).select(SECRET_FIELDS);
  if (!user) throw ApiError.unauthorized();
  return user;
}

async function assertPassword(userId, password) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.badRequest("Incorrect password");
  }
}

async function totpValid(secret, code) {
  const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_S });
  return Boolean(result?.valid);
}

/** Checks a TOTP or recovery code against the user's secrets; recovery codes are single-use. */
export async function verifyAnyCode(user, rawCode) {
  const code = normalise(rawCode);
  if (!user.twoFactor?.enabled || !user.twoFactor.secret) return false;
  if (/^\d{6}$/.test(code)) {
    return totpValid(decryptSecret(user.twoFactor.secret), code);
  }
  const hash = hashCode(code);
  if (!(user.twoFactor.recoveryCodes ?? []).includes(hash)) return false;
  await User.updateOne({ _id: user._id }, { $pull: { "twoFactor.recoveryCodes": hash } });
  logger.info({ userId: String(user._id) }, "Recovery code used for 2FA");
  return true;
}

// ---- challenges (between the password step and the code step) ----

export function issueChallenge(user, intent = "login") {
  return jwt.sign({ purpose: CHALLENGE_PURPOSE, intent }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: CHALLENGE_TTL,
    issuer: "ghosted",
    jwtid: crypto.randomUUID(),
    algorithm: "HS256",
  });
}

export function readChallenge(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { issuer: "ghosted", algorithms: ["HS256"] });
  } catch {
    throw ApiError.unauthorized("Your sign-in attempt expired. Please start again.");
  }
  if (payload.purpose !== CHALLENGE_PURPOSE || usedChallenges.has(payload.jti)) {
    throw ApiError.unauthorized("Your sign-in attempt expired. Please start again.");
  }
  return { userId: payload.sub, intent: payload.intent, jti: payload.jti, exp: payload.exp };
}

export function consumeChallenge({ jti, exp }) {
  rememberUsed(jti, exp * 1000);
}

// ---- settings ----

export async function startSetup(me, password) {
  assertFeature("twoFactor");
  await assertPassword(me._id, password);
  const secret = generateSecret();
  await User.updateOne(
    { _id: me._id },
    { $set: { "twoFactor.pendingSecret": encryptSecret(secret) } }
  );
  const otpauthUrl = generateURI({ issuer: env.TOTP_ISSUER, label: me.username, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
  return { secret, otpauthUrl, qrDataUrl };
}

export async function enable(me, code) {
  assertFeature("twoFactor");
  const user = await loadWithSecrets(me._id);
  if (user.twoFactor?.enabled) throw ApiError.badRequest("Two-factor authentication is already on");
  if (!user.twoFactor?.pendingSecret) throw ApiError.badRequest("Start the setup first");
  const secret = decryptSecret(user.twoFactor.pendingSecret);
  if (!(await totpValid(secret, normalise(code)))) {
    throw ApiError.badRequest(
      "That code is not right. Check the time on your phone and try again.",
      undefined,
      ERROR_CODES.TWO_FACTOR_INVALID
    );
  }
  const codes = generateRecoveryCodes();
  await User.updateOne(
    { _id: me._id },
    {
      $set: {
        "twoFactor.enabled": true,
        "twoFactor.enabledAt": new Date(),
        "twoFactor.secret": user.twoFactor.pendingSecret,
        "twoFactor.pendingSecret": null,
        "twoFactor.recoveryCodes": codes.map((c) => hashCode(normalise(c))),
      },
    }
  );
  logger.info({ userId: String(me._id) }, "Two-factor authentication enabled");
  return codes;
}

export async function disable(me, password, code) {
  await assertPassword(me._id, password);
  const user = await loadWithSecrets(me._id);
  if (!user.twoFactor?.enabled) throw ApiError.badRequest("Two-factor authentication is not on");
  if (!(await verifyAnyCode(user, code))) {
    throw ApiError.badRequest("That code is not right", undefined, ERROR_CODES.TWO_FACTOR_INVALID);
  }
  await User.updateOne(
    { _id: me._id },
    {
      $set: {
        "twoFactor.enabled": false,
        "twoFactor.enabledAt": null,
        "twoFactor.secret": null,
        "twoFactor.pendingSecret": null,
        "twoFactor.recoveryCodes": [],
      },
    }
  );
  logger.info({ userId: String(me._id) }, "Two-factor authentication disabled");
}

export async function regenerateRecoveryCodes(me, password) {
  assertFeature("twoFactor");
  await assertPassword(me._id, password);
  const user = await loadWithSecrets(me._id);
  if (!user.twoFactor?.enabled) throw ApiError.badRequest("Two-factor authentication is not on");
  const codes = generateRecoveryCodes();
  await User.updateOne(
    { _id: me._id },
    { $set: { "twoFactor.recoveryCodes": codes.map((c) => hashCode(normalise(c))) } }
  );
  return codes;
}

/** Test helper: the current time-based code for a secret. */
export async function currentCode(secret) {
  const { generate } = await import("otplib");
  return generate({ secret });
}
