import { z } from "zod";
import { LIMITS } from "../constants.js";
import { fullnameSchema, genderSchema, usernameSchema } from "./auth.js";
import { cursorSchema, limitSchema } from "./common.js";

export const bioSchema = z
  .string()
  .trim()
  .max(LIMITS.BIO_MAX, `Bio must be at most ${LIMITS.BIO_MAX} characters`);

export const updateProfileSchema = z
  .strictObject({
    fullname: fullnameSchema.optional(),
    username: usernameSchema.optional(),
    bio: bioSchema.optional(),
    gender: genderSchema.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });

export const userSearchQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.SEARCH_QUERY_MAX, "Search query is too long").default(""),
  cursor: cursorSchema,
  limit: limitSchema,
});

export const usernameQuerySchema = z.object({
  u: usernameSchema,
});

export const usernameParamSchema = z.object({
  username: usernameSchema,
});

export const privacySchema = z
  .strictObject({
    showLastSeen: z.boolean().optional(),
    readReceipts: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });

export const notificationPrefsSchema = z
  .strictObject({
    sound: z.boolean().optional(),
    desktop: z.boolean().optional(),
    preview: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });
