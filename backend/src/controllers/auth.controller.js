import * as authService from "../services/auth.service.js";
import * as tokens from "../services/token.service.js";
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

function sendAuthenticated(res, status, { user, accessToken, refreshToken }) {
  setAuthCookies(res, { accessToken, refreshToken, maxAgeMs: tokens.refreshTtlMs() });
  return ok(res, { user: serializeUser(user, { self: true }) }, status);
}

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
  await disconnectSessionSockets(id, {
    event: SOCKET_EVENTS.SESSION_REVOKED,
    payload: { reason: "revoked_by_user" },
  });
  if (id === req.sessionId) clearAuthCookies(res);
  ok(res, { message: "Session revoked" });
}
