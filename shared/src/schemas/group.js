import { z } from "zod";
import { LIMITS, PARTICIPANT_ROLES } from "../constants.js";
import { objectIdSchema } from "./common.js";

export const groupNameSchema = z
  .string()
  .trim()
  .min(LIMITS.GROUP_NAME_MIN, "Give the group a name")
  .max(LIMITS.GROUP_NAME_MAX, `Group names are at most ${LIMITS.GROUP_NAME_MAX} characters`);

export const groupDescriptionSchema = z
  .string()
  .trim()
  .max(
    LIMITS.GROUP_DESCRIPTION_MAX,
    `Descriptions are at most ${LIMITS.GROUP_DESCRIPTION_MAX} characters`
  );

const memberIdsSchema = (max) =>
  z
    .array(objectIdSchema)
    .min(1, "Pick at least one person")
    .max(max, `You can add up to ${max} people at once`)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate members" });

export const createGroupSchema = z.strictObject({
  name: groupNameSchema,
  description: groupDescriptionSchema.optional(),
  memberIds: memberIdsSchema(LIMITS.GROUP_MEMBERS_MAX - 1),
});

export const updateGroupSchema = z
  .strictObject({
    name: groupNameSchema.optional(),
    description: groupDescriptionSchema.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });

export const addMembersSchema = z.strictObject({
  userIds: memberIdsSchema(LIMITS.GROUP_ADD_BATCH_MAX),
});

export const memberParamSchema = z.object({
  conversationId: objectIdSchema,
  userId: objectIdSchema,
});

export const memberRoleSchema = z.strictObject({
  role: z.enum(PARTICIPANT_ROLES),
});
