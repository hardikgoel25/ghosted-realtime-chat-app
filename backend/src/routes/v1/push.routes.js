import { Router } from "express";
import { pushSubscriptionSchema, pushUnsubscribeSchema } from "@ghosted/shared";
import { requireFeature } from "../../config/features.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import * as push from "../../services/push.service.js";
import { ok } from "../../utils/response.js";

const router = Router();

router.use(requireAuth);

/** Registers this browser's PushSubscription (idempotent per endpoint). */
router.post(
  "/subscriptions",
  requireFeature("push"),
  validate({ body: pushSubscriptionSchema }),
  async (req, res) => {
    await push.subscribe(req.user, req.sessionId, req.validated.body, req.get("user-agent"));
    ok(res, { subscribed: true, devices: await push.countForUser(req.user._id) }, 201);
  }
);

router.delete("/subscriptions", validate({ body: pushUnsubscribeSchema }), async (req, res) => {
  await push.unsubscribe(req.user, req.validated.body.endpoint);
  ok(res, { subscribed: false, devices: await push.countForUser(req.user._id) });
});

export default router;
