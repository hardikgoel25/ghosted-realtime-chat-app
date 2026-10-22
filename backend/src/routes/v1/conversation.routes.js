import { Router } from "express";
import {
  conversationFlagsSchema,
  conversationIdParamSchema,
  createDirectConversationSchema,
  deleteMessageQuerySchema,
  editMessageSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  messageParamSchema,
  messageSearchQuerySchema,
  reactionParamSchema,
  sendMessageSchema,
} from "@ghosted/shared";
import * as conversations from "../../controllers/conversation.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { messageLimiter, uploadLimiterIfMultipart } from "../../middleware/rateLimit.js";
import { messageUpload } from "../../middleware/upload.js";
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
router.get(
  "/:conversationId/messages/search",
  validate({ params: conversationIdParamSchema, query: messageSearchQuerySchema }),
  conversations.searchMessages
);
router.post(
  "/:conversationId/messages",
  messageLimiter,
  uploadLimiterIfMultipart,
  messageUpload(),
  validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
  conversations.sendMessage
);
router.patch(
  "/:conversationId/messages/:messageId",
  validate({ params: messageParamSchema, body: editMessageSchema }),
  conversations.editMessage
);
router.delete(
  "/:conversationId/messages/:messageId",
  validate({ params: messageParamSchema, query: deleteMessageQuerySchema }),
  conversations.deleteMessage
);
router.put(
  "/:conversationId/messages/:messageId/reactions/:emoji",
  validate({ params: reactionParamSchema }),
  conversations.addReaction
);
router.delete(
  "/:conversationId/messages/:messageId/reactions/:emoji",
  validate({ params: reactionParamSchema }),
  conversations.removeReaction
);

export default router;
