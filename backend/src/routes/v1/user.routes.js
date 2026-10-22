import { Router } from "express";
import {
  LIMITS,
  notificationPrefsSchema,
  privacySchema,
  updateEmailSchema,
  updateProfileSchema,
  userIdParamSchema,
  usernameParamSchema,
  usernameQuerySchema,
  userSearchQuerySchema,
} from "@ghosted/shared";
import * as users from "../../controllers/user.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { emailLimiter, uploadLimiter, usernameCheckLimiter } from "../../middleware/rateLimit.js";
import { imageUpload } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

// Public (used by the signup form); rate limited to slow down enumeration
router.get(
  "/check-username",
  usernameCheckLimiter,
  validate({ query: usernameQuerySchema }),
  users.checkUsername
);

router.use(requireAuth);

router.get("/", validate({ query: userSearchQuerySchema }), users.listUsers);
router.get("/search", validate({ query: userSearchQuerySchema }), users.listUsers);

router.patch("/me", validate({ body: updateProfileSchema }), users.updateMe);
router.put(
  "/me/avatar",
  uploadLimiter,
  imageUpload("avatar", LIMITS.AVATAR_MAX_BYTES),
  users.updateAvatar
);
router.delete("/me/avatar", users.deleteAvatar);
router.patch("/me/privacy", validate({ body: privacySchema }), users.updatePrivacy);
router.patch(
  "/me/notifications",
  validate({ body: notificationPrefsSchema }),
  users.updateNotificationPrefs
);
router.patch("/me/email", emailLimiter, validate({ body: updateEmailSchema }), users.updateEmail);
router.delete("/me/email", users.removeEmail);
router.get("/me/blocked", users.listBlocked);

router.post("/:userId/block", validate({ params: userIdParamSchema }), users.block);
router.delete("/:userId/block", validate({ params: userIdParamSchema }), users.unblock);

router.get("/:username", validate({ params: usernameParamSchema }), users.getByUsername);

export default router;
