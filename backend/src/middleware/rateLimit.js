import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { isTest } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

// Tests opt in per file by setting RATE_LIMIT_TEST=1; otherwise limits are skipped under test
export const rateLimitingEnabled = () => !isTest || process.env.RATE_LIMIT_TEST === "1";

const ipKey = (req) => ipKeyGenerator(req.ip ?? "");
const userOrIpKey = (req) => (req.user ? `u:${req.user._id}` : ipKey(req));

function make({ windowMs, limit, message, keyGenerator = ipKey, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !rateLimitingEnabled(),
    handler: (_req, _res, next) => next(ApiError.tooMany(message)),
  });
}

export const globalLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: "Too many requests. Please slow down.",
});

// Counts only failed attempts so legitimate users are not locked out by their own successes
export const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many attempts. Please try again later.",
});

export const messageLimiter = make({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: userOrIpKey,
  message: "You are sending messages too quickly.",
});

export const uploadLimiter = make({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: userOrIpKey,
  message: "Upload limit reached. Please try again later.",
});

// Outbound email is the scarce resource here, so every request counts, successful or not
export const emailLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: "Too many email requests. Please try again later.",
});

export const usernameCheckLimiter = make({
  windowMs: 60 * 1000,
  limit: 30,
  message: "Too many requests. Please slow down.",
});

/** Applies the upload limiter only to multipart requests (text messages are not uploads). */
export function uploadLimiterIfMultipart(req, res, next) {
  if (req.is("multipart/form-data")) return uploadLimiter(req, res, next);
  next();
}
