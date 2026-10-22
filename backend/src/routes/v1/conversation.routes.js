import { Router } from "express";
import {
  LIMITS,
  conversationFlagsSchema,
  conversationIdParamSchema,
  createDirectConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageSchema,
} from "@ghosted/shared";
import * as conversations from "../../controllers/conversation.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { messageLimiter, uploadLimiterIfMultipart } from "../../middleware/rateLimit.js";
import { imagesUpload } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get("/", validate({ query: listConversationsQuerySchema }), conversations.list);
router.post(
  "/direct",
  validate({ body: createDirectConversationSchema }),
  conversations.createDirect
);

router.get("/:conversationId", validate({ params: conversationIdParamSchema }), conversations.get);
router.patch(
  "/:conversationId",
  validate({ params: conversationIdParamSchema, body: conversationFlagsSchema }),
  conversations.updateFlags
);
router.post(
  "/:conversationId/read",
  validate({ params: conversationIdParamSchema }),
  conversations.markRead
);
router.delete(
  "/:conversationId",
  validate({ params: conversationIdParamSchema }),
  conversations.clear
);

router.get(
  "/:conversationId/messages",
  validate({ params: conversationIdParamSchema, query: listMessagesQuerySchema }),
  conversations.listMessages
);
router.post(
  "/:conversationId/messages",
  messageLimiter,
  uploadLimiterIfMultipart,
  imagesUpload("images", LIMITS.IMAGE_MAX_BYTES, LIMITS.MESSAGE_IMAGES_MAX),
  validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
  conversations.sendMessage
);

export default router;
