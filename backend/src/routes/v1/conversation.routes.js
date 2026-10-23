import { Router } from "express";
import {
  LIMITS,
  addMembersSchema,
  conversationFlagsSchema,
  conversationIdParamSchema,
  createDirectConversationSchema,
  createGroupSchema,
  deleteMessageQuerySchema,
  editMessageSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  memberParamSchema,
  memberRoleSchema,
  messageParamSchema,
  messageSearchQuerySchema,
  reactionParamSchema,
  sendMessageSchema,
  updateGroupSchema,
} from "@ghosted/shared";
import * as conversations from "../../controllers/conversation.controller.js";
import { requireFeature } from "../../config/features.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  messageLimiter,
  uploadLimiter,
  uploadLimiterIfMultipart,
} from "../../middleware/rateLimit.js";
import { imageUpload, messageUpload } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get("/", validate({ query: listConversationsQuerySchema }), conversations.list);
router.post(
  "/direct",
  validate({ body: createDirectConversationSchema }),
  conversations.createDirect
);
router.post(
  "/group",
  requireFeature("groups"),
  validate({ body: createGroupSchema }),
  conversations.createGroup
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

// ---- group management (admins) ----

// Mounted under /:conversationId, so the feature gate is per route (messages stay reachable)
const groups = Router({ mergeParams: true });
const gate = requireFeature("groups");
groups.patch(
  "/group",
  gate,
  validate({ params: conversationIdParamSchema, body: updateGroupSchema }),
  conversations.updateGroup
);
groups.put(
  "/group/avatar",
  gate,
  uploadLimiter,
  imageUpload("avatar", LIMITS.AVATAR_MAX_BYTES),
  validate({ params: conversationIdParamSchema }),
  conversations.updateGroupAvatar
);
groups.delete(
  "/group/avatar",
  gate,
  validate({ params: conversationIdParamSchema }),
  conversations.removeGroupAvatar
);
groups.post(
  "/members",
  gate,
  validate({ params: conversationIdParamSchema, body: addMembersSchema }),
  conversations.addMembers
);
groups.delete(
  "/members/:userId",
  gate,
  validate({ params: memberParamSchema }),
  conversations.removeMember
);
groups.patch(
  "/members/:userId",
  gate,
  validate({ params: memberParamSchema, body: memberRoleSchema }),
  conversations.setMemberRole
);
router.use("/:conversationId", groups);

// ---- messages ----

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
