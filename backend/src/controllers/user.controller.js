import * as userService from "../services/user.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ok } from "../utils/response.js";
import { serializeUser } from "../utils/serializers.js";

export async function listUsers(req, res) {
  const page = await userService.listUsers(req.user._id, req.validated.query);
  ok(res, page);
}

export async function checkUsername(req, res) {
  const available = await userService.isUsernameAvailable(
    req.validated.query.u,
    req.user?._id ?? null
  );
  ok(res, { username: req.validated.query.u, available });
}

export async function getByUsername(req, res) {
  const user = await userService.getByUsername(req.validated.params.username);
  const self = String(user._id) === String(req.user._id);
  ok(res, { user: serializeUser(user, { self }) });
}

export async function updateMe(req, res) {
  const user = await userService.updateProfile(req.user, req.validated.body);
  ok(res, { user: serializeUser(user, { self: true }) });
}

export async function updateAvatar(req, res) {
  if (!req.file) throw ApiError.badRequest("No image file was uploaded (field name: avatar)");
  const user = await userService.updateAvatar(req.user, req.file);
  ok(res, { user: serializeUser(user, { self: true }) });
}

export async function deleteAvatar(req, res) {
  const user = await userService.deleteAvatar(req.user);
  ok(res, { user: serializeUser(user, { self: true }) });
}

export async function updatePrivacy(req, res) {
  const user = await userService.updatePrivacy(req.user, req.validated.body);
  ok(res, { user: serializeUser(user, { self: true }) });
}

export async function updateNotificationPrefs(req, res) {
  const user = await userService.updateNotificationPrefs(req.user, req.validated.body);
  ok(res, { user: serializeUser(user, { self: true }) });
}
