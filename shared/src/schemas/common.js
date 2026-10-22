import { z } from "zod";
import { LIMITS } from "../constants.js";

export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export const objectIdSchema = z.string().regex(OBJECT_ID_REGEX, "Invalid id");

export const idParamSchema = z.object({ id: objectIdSchema });

export const userIdParamSchema = z.object({ userId: objectIdSchema });

export const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(LIMITS.PAGE_SIZE_MAX)
  .default(LIMITS.PAGE_SIZE_DEFAULT);

export const cursorSchema = z.string().regex(OBJECT_ID_REGEX, "Invalid cursor").optional();
