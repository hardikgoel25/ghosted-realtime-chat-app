import { Router } from "express";
import {
  changePasswordSchema,
  enableAccountSchema,
  forgotPasswordSchema,
  idParamSchema,
  loginSchema,
  passwordConfirmSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from "@ghosted/shared";
import * as auth from "../../controllers/auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { authLimiter, emailLimiter } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

router.post("/signup", authLimiter, validate({ body: signupSchema }), auth.signup);
router.post("/login", authLimiter, validate({ body: loginSchema }), auth.login);
router.post("/enable", authLimiter, validate({ body: enableAccountSchema }), auth.enable);
router.post("/refresh", auth.refresh);
router.post("/logout", auth.logout);

router.post(
  "/forgot-password",
  emailLimiter,
  validate({ body: forgotPasswordSchema }),
  auth.forgotPassword
);
router.post(
  "/reset-password",
  authLimiter,
  validate({ body: resetPasswordSchema }),
  auth.resetPassword
);
router.post("/verify-email", authLimiter, validate({ body: verifyEmailSchema }), auth.verifyEmail);

router.get("/me", requireAuth, auth.me);
router.post("/logout-all", requireAuth, auth.logoutAll);
router.patch(
  "/password",
  requireAuth,
  validate({ body: changePasswordSchema }),
  auth.changePassword
);
router.post("/disable", requireAuth, validate({ body: passwordConfirmSchema }), auth.disable);
router.delete(
  "/account",
  requireAuth,
  validate({ body: passwordConfirmSchema }),
  auth.deleteAccount
);
router.get("/sessions", requireAuth, auth.listSessions);
router.delete(
  "/sessions/:id",
  requireAuth,
  validate({ params: idParamSchema }),
  auth.revokeSession
);
router.post("/resend-verification", requireAuth, emailLimiter, auth.resendVerification);

export default router;
