import webpush from "web-push";
import { env } from "../config/env.js";
import { features } from "../config/features.js";
import { logger } from "../config/logger.js";
import PushSubscription from "../models/pushSubscription.model.js";

const DEFAULT_TTL_S = 60 * 60;

function vapidSubject() {
  if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT;
  const email = env.EMAIL_FROM.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0];
  return `mailto:${email ?? "no-reply@ghosted.app"}`;
}

if (features.push) {
  webpush.setVapidDetails(vapidSubject(), env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export async function subscribe(user, sessionId, subscription, userAgent = "") {
  await PushSubscription.updateOne(
    { endpoint: subscription.endpoint },
    {
      $set: {
        userId: user._id,
        sessionId: sessionId ?? null,
        expirationTime: subscription.expirationTime ?? null,
        keys: subscription.keys,
        userAgent: String(userAgent).slice(0, 256),
        lastUsedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function unsubscribe(user, endpoint) {
  await PushSubscription.deleteOne({ endpoint, userId: user._id });
}

export async function removeForSessions(sessionIds) {
  if (!sessionIds?.length) return;
  await PushSubscription.deleteMany({ sessionId: { $in: sessionIds } });
}

export async function removeForUser(userId, { exceptSessionId } = {}) {
  const filter = { userId };
  if (exceptSessionId) filter.sessionId = { $ne: exceptSessionId };
  await PushSubscription.deleteMany(filter);
}

export function countForUser(userId) {
  return PushSubscription.countDocuments({ userId });
}

/**
 * Sends one payload to every device of the given users. Dead subscriptions (404/410 from the
 * push service) are deleted; other failures are logged and ignored.
 */
export async function sendToUsers(userIds, payload, { ttl = DEFAULT_TTL_S } = {}) {
  if (!features.push || userIds.length === 0) return 0;
  const subs = await PushSubscription.find({ userId: { $in: userIds } }).lean();
  if (subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, expirationTime: sub.expirationTime, keys: sub.keys },
        body,
        { TTL: ttl, urgency: "high" }
      )
    )
  );
  const dead = [];
  let sent = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent += 1;
      return;
    }
    const status = result.reason?.statusCode;
    if (status === 404 || status === 410) dead.push(subs[i].endpoint);
    else logger.warn({ status, err: result.reason?.message }, "Push delivery failed");
  });
  if (dead.length) await PushSubscription.deleteMany({ endpoint: { $in: dead } });
  return sent;
}
