import { z } from "zod";
import { GENDERS, LIMITS, USERNAME_REGEX } from "../constants.js";

export const usernameSchema = z
  .string()
  .trim()
  .min(1, "Username is required")
  .transform((s) => s.normalize("NFKC").toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        USERNAME_REGEX,
        `Username must be ${LIMITS.USERNAME_MIN}–${LIMITS.USERNAME_MAX} characters using lowercase letters, numbers, dots or underscores`
      )
  );

export const fullnameSchema = z
  .string()
  .trim()
  .min(LIMITS.FULLNAME_MIN, `Full name must be at least ${LIMITS.FULLNAME_MIN} characters`)
  .max(LIMITS.FULLNAME_MAX, `Full name must be at most ${LIMITS.FULLNAME_MAX} characters`)
  .regex(
    /^[\p{L}\p{M}' .-]+$/u,
    "Full name may only contain letters, spaces, apostrophes, dots or hyphens"
  );

export const newPasswordSchema = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX, `Password must be at most ${LIMITS.PASSWORD_MAX} characters`);

// For verifying an existing password: only bound the length, never reveal rules
export const existingPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(LIMITS.PASSWORD_MAX, "Password is too long");

export const genderSchema = z.enum(GENDERS, { message: "Please select a gender" });

export const signupSchema = z.strictObject({
  fullname: fullnameSchema,
  username: usernameSchema,
  password: newPasswordSchema,
  gender: genderSchema,
});

export const loginSchema = z.strictObject({
  username: usernameSchema,
  password: existingPasswordSchema,
});

export const enableAccountSchema = loginSchema;

export const passwordConfirmSchema = z.strictObject({
  password: existingPasswordSchema,
});

export const changePasswordSchema = z.strictObject({
  currentPassword: existingPasswordSchema,
  newPassword: newPasswordSchema,
});
