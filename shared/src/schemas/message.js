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
});

export const listMessagesQuerySchema = z.object({
  cursor: cursorSchema,
  limit: limitSchema,
});

export const typingEventSchema = z.strictObject({
  to: objectIdSchema,
});
