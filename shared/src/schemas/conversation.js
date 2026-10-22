import { z } from "zod";
import { CONVERSATION_FILTERS, LIMITS } from "../constants.js";
import { limitSchema, objectIdSchema } from "./common.js";

export const conversationIdParamSchema = z.object({ conversationId: objectIdSchema });

export const createDirectConversationSchema = z.strictObject({
  userId: objectIdSchema,
});

export const listConversationsQuerySchema = z.object({
  filter: z.enum(CONVERSATION_FILTERS).default("all"),
  // "<lastMessageAt ms>_<id>" produced by the previous page
  cursor: z
    .string()
    .regex(/^\d{1,16}_[a-f\d]{24}$/i, "Invalid cursor")
    .optional(),
  limit: limitSchema,
});

export const conversationFlagsSchema = z
  .strictObject({
    // true = mute forever, false = unmute, number = minutes
    muted: z.union([z.boolean(), z.number().int().min(1).max(LIMITS.MUTE_MINUTES_MAX)]).optional(),
    archived: z.boolean().optional(),
    pinned: z.boolean().optional(),
    // true = "mark as unread" (opening the chat marks it read again)
    unread: z.literal(true).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });

// ---- socket payloads ----

export const conversationRoomSchema = z.strictObject({
  conversationId: objectIdSchema,
});

export const conversationTypingSchema = conversationRoomSchema;

export const syncSchema = z.strictObject({
  conversations: z
    .array(
      z.strictObject({
        id: objectIdSchema,
        since: z.iso.datetime({ offset: true }).optional(),
      })
    )
    .max(LIMITS.SYNC_CONVERSATIONS_MAX),
});
