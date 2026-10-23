import { z } from "zod";
import { LIMITS } from "../constants.js";

const endpointSchema = z
  .string()
  .max(LIMITS.PUSH_ENDPOINT_MAX, "Endpoint is too long")
  .pipe(z.url({ protocol: /^https$/, message: "Push endpoints must use https" }));

/** The JSON form of a browser PushSubscription (`subscription.toJSON()`). */
export const pushSubscriptionSchema = z.strictObject({
  endpoint: endpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(128),
  }),
});

export const pushUnsubscribeSchema = z.strictObject({
  endpoint: endpointSchema,
});
