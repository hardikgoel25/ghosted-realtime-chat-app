import { ERROR_CODES } from "@ghosted/shared";
import { env } from "./env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Phase 3 features are individually switchable so each can ship (or be rolled back) on its
 * own. Flags are read once at boot; `GET /api/v1/config` tells the client which are on.
 */
export const features = Object.freeze({
  groups: env.FEATURE_GROUPS,
  linkPreviews: env.FEATURE_LINK_PREVIEWS,
  twoFactor: env.FEATURE_TWO_FACTOR,
  push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  redis: Boolean(env.REDIS_URL),
});

const LABELS = {
  groups: "Group chats are",
  linkPreviews: "Link previews are",
  twoFactor: "Two-factor authentication is",
  push: "Push notifications are",
  redis: "Redis is",
};

export function assertFeature(name) {
  if (!features[name]) {
    throw new ApiError(
      503,
      ERROR_CODES.FEATURE_DISABLED,
      `${LABELS[name] ?? "This feature is"} not enabled on this server`
    );
  }
}

/** Express middleware form of `assertFeature`. */
export function requireFeature(name) {
  return (_req, _res, next) => {
    try {
      assertFeature(name);
      next();
    } catch (err) {
      next(err);
    }
  };
}
