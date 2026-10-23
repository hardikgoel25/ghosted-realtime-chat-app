import * as authService from "../services/auth.service.js";
import * as tokens from "../services/token.service.js";
import * as twoFactor from "../services/twoFactor.service.js";
import * as push from "../services/push.service.js";
import User from "../models/user.model.js";
import { disconnectSessionSockets } from "../sockets/emit.js";
import { SOCKET_EVENTS } from "@ghosted/shared";
import { ApiError } from "../utils/ApiError.js";
import { ok } from "../utils/response.js";
import { serializeSession, serializeUser } from "../utils/serializers.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../utils/cookies.js";

const meta = (req) => ({ userAgent: req.get("user-agent") ?? "", ip: req.ip ?? "" });

function sendAuthenticated(res, status, result) {
  // Two-factor accounts get a challenge instead of cookies; the code step finishes the sign-in
  if (result.twoFactorRequired) {
    return ok(res, { twoFactorRequired: true, challenge: result.challenge }, status);
  }
  const { user, accessToken, refreshToken } = result;
  setAuthCookies(res, { accessToken, refreshToken, maxAgeMs: tokens.refreshTtlMs() });
  return ok(res, { user: serializeUser(user, { self: true }) }, status);
}

const selfView = async (userId) => serializeUser(await User.findById(userId), { self: true });

export async function signup(req, res) {
  const result = await authService.signup(req.validated.body, meta(req));
  sendAuthenticated(res, 201, result);
}

export async function login(req, res) {
  const result = await authService.login(req.validated.body, meta(req));
  sendAuthenticated(res, 200, result);
}

export async function refresh(req, res) {
  try {
    const result = await authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
    sendAuthenticated(res, 200, result);
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req, res) {
  const token = req.cookies?.[ACCESS_COOKIE];
  const sessionId = token ? tokens.decodeSessionId(token) : null;
  await authService.logout({ sessionId });
  clearAuthCookies(res);
  ok(res, { message: "Logged out" });
}

export async function logoutAll(req, res) {
  await authService.logoutAll(req.user._id);
  clearAuthCookies(res);
  ok(res, { message: "Logged out everywhere" });
}

export function me(req, res) {
  ok(res, { user: serializeUser(req.user, { self: true }) });
}

export async function changePassword(req, res) {
  await authService.changePassword(req.user, req.validated.body, { sessionId: req.sessionId });
  ok(res, { message: "Password changed. Other devices have been signed out." });
}

export async function enable(req, res) {
  const result = await authService.enableAccount(req.validated.body, meta(req));
  sendAuthenticated(res, 200, result);
}

export async function disable(req, res) {
  await authService.disableAccount(req.user, req.validated.body);
  clearAuthCookies(res);
  ok(res, { message: "Account disabled" });
}

export async function deleteAccount(req, res) {
  await authService.deleteAccount(req.user, req.validated.body);
  clearAuthCookies(res);
  ok(res, { message: "Account deleted" });
}

export async function listSessions(req, res) {
  const sessions = await tokens.listActiveSessions(req.user._id);
  ok(res, { items: sessions.map((s) => serializeSession(s, req.sessionId)) });
}

export async function revokeSession(req, res) {
  const { id } = req.validated.params;
  const sessions = await tokens.listActiveSessions(req.user._id);
  if (!sessions.some((s) => String(s._id) === id)) throw ApiError.notFound("Session not found");
  await tokens.revokeSession(id, "revoked_by_user");
  await push.removeForSessions([id]);
  await disconnectSessionSockets(id, {
    event: SOCKET_EVENTS.SESSION_REVOKED,
    payload: { reason: "revoked_by_user" },
  });
  if (id === req.sessionId) clearAuthCookies(res);
  ok(res, { message: "Session revoked" });
}

// ---- two-factor authentication ----

export async function verifyTwoFactor(req, res) {
  const { challenge, code } = req.validated.body;
  const result = await authService.completeTwoFactor(challenge, code, meta(req));
  sendAuthenticated(res, 200, result);
}

export async function twoFactorSetup(req, res) {
  ok(res, await twoFactor.startSetup(req.user, req.validated.body.password));
}

export async function twoFactorEnable(req, res) {
  const recoveryCodes = await twoFactor.enable(req.user, req.validated.body.code);
  ok(res, { recoveryCodes, user: await selfView(req.user._id) });
}

export async function twoFactorDisable(req, res) {
  const { password, code } = req.validated.body;
  await twoFactor.disable(req.user, password, code);
  ok(res, { user: await selfView(req.user._id) });
}

export async function twoFactorRecoveryCodes(req, res) {
  const recoveryCodes = await twoFactor.regenerateRecoveryCodes(
    req.user,
    req.validated.body.password
  );
  ok(res, { recoveryCodes });
}

// ---- email flows ----

export async function resendVerification(req, res) {
  await authService.sendVerification(req.user);
  ok(res, { message: "Verification email sent" });
}

export async function verifyEmail(req, res) {
  const user = await authService.verifyEmail(req.validated.body.token);
  ok(res, { message: "Email verified", email: user.email });
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.validated.body.identifier);
  ok(res, { message: "If that account has a verified email, a reset link is on its way." });
}

export async function resetPassword(req, res) {
  const { token, password } = req.validated.body;
  await authService.resetPassword(token, password);
  clearAuthCookies(res);
  ok(res, { message: "Password updated. You can sign in with it now." });
}
