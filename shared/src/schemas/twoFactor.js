import { z } from "zod";
import { LIMITS } from "../constants.js";
import { existingPasswordSchema } from "./auth.js";

const TOTP_RE = new RegExp(`^[0-9]{${LIMITS.TOTP_DIGITS}}$`);

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(TOTP_RE, `Enter the ${LIMITS.TOTP_DIGITS}-digit code from your app`);

/** A TOTP code or a recovery code (10 characters, hyphen optional). */
export const twoFactorCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, "").toLowerCase())
  .pipe(z.string().regex(/^([0-9]{6}|[a-z0-9]{10})$/, "Enter a 6-digit code or a recovery code"));

export const twoFactorSetupSchema = z.strictObject({
  password: existingPasswordSchema,
});

export const twoFactorEnableSchema = z.strictObject({
  code: totpCodeSchema,
});

export const twoFactorDisableSchema = z.strictObject({
  password: existingPasswordSchema,
  code: twoFactorCodeSchema,
});

export const twoFactorRecoveryCodesSchema = twoFactorSetupSchema;

export const twoFactorVerifySchema = z.strictObject({
  challenge: z.string().min(20).max(4096),
  code: twoFactorCodeSchema,
});
