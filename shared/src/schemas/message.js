import { z } from "zod";
import { LIMITS } from "../constants.js";
import { cursorSchema, limitSchema, objectIdSchema } from "./common.js";

export const messageTextSchema = z
  .string()
  .trim()
  .max(LIMITS.MESSAGE_TEXT_MAX, `Message must be at most ${LIMITS.MESSAGE_TEXT_MAX} characters`);

export const sendMessageSchema = z.strictObject({
  text: messageTextSchema.default(""),
  clientId: z.uuid("Invalid clientId").optional(),
  replyTo: objectIdSchema.optional(),
  // Set by the client for voice notes; the recorder knows the duration, the server does not
  audioDurationMs: z.coerce.number().int().min(0).max(LIMITS.AUDIO_MAX_DURATION_MS).optional(),
});

export const editMessageSchema = z.strictObject({
  text: messageTextSchema.min(1, "Message cannot be empty"),
});

export const deleteMessageQuerySchema = z.object({
  scope: z.enum(["me", "everyone"]).default("me"),
});

export const listMessagesQuerySchema = z.object({
  cursor: cursorSchema, // older than this id
  after: cursorSchema, // newer than this id
  around: objectIdSchema.optional(), // a window centred on this id (search result jumping)
  limit: limitSchema,
});

export const messageSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Enter something to search for")
    .max(LIMITS.MESSAGE_SEARCH_MAX, "Search is too long"),
  cursor: cursorSchema,
  limit: limitSchema,
});

export const emojiSchema = z
  .string()
  .min(1)
  .max(LIMITS.REACTION_EMOJI_MAX_LENGTH)
  .regex(
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|‍|️)+$/u,
    "Invalid emoji"
  );

export const messageParamSchema = z.object({
  conversationId: objectIdSchema,
  messageId: objectIdSchema,
});

export const reactionParamSchema = z.object({
  conversationId: objectIdSchema,
  messageId: objectIdSchema,
  emoji: emojiSchema,
});
