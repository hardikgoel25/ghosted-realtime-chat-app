import { Router } from "express";
import {
  LIMITS,
  listMessagesQuerySchema,
  sendMessageSchema,
  userIdParamSchema,
} from "@ghosted/shared";
import * as messages from "../../controllers/message.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { messageLimiter, uploadLimiterIfMultipart } from "../../middleware/rateLimit.js";
import { imageUpload } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/:userId",
  validate({ params: userIdParamSchema, query: listMessagesQuerySchema }),
  messages.listMessages
);

router.post(
  "/:userId",
  messageLimiter,
  uploadLimiterIfMultipart,
  imageUpload("image", LIMITS.IMAGE_MAX_BYTES),
  validate({ params: userIdParamSchema, body: sendMessageSchema }),
  messages.sendMessage
);

export default router;
