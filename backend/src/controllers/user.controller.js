import * as userService from "../services/user.service.js";
import * as blockService from "../services/block.service.js";
import * as authService from "../services/auth.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ok } from "../utils/response.js";
import { serializeUser } from "../utils/serializers.js";

export async function listUsers(req, res) {
  const { byMe, byThem } = await blockService.blockSets(req.user._id);
  const page = await userService.listUsers(req.user._id, {
    ...req.validated.query,
    excludeIds: [...byMe, ...byThem],
  });
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
  const { byMe, byThem } = await blockService.blockSets(req.user._id);
  const serialized = serializeUser(user, { self });
  const id = String(user._id);
  if (byMe.has(id) || byThem.has(id)) serialized.lastSeenAt = null;
  ok(res, {
    user: serialized,
    blocked: self ? null : { byMe: byMe.has(id), byThem: byThem.has(id) },
  });
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

export async function updateEmail(req, res) {
  const user = await authService.updateEmail(req.user, req.validated.body.email);
  ok(res, { user: serializeUser(user, { self: true }) });
}

export async function removeEmail(req, res) {
  const user = await authService.removeEmail(req.user);
  ok(res, { user: serializeUser(user, { self: true }) });
}

export async function block(req, res) {
  await blockService.blockUser(req.user, req.validated.params.userId);
  ok(res, { blocked: await blockService.listBlocked(req.user) });
}

export async function unblock(req, res) {
  await blockService.unblockUser(req.user, req.validated.params.userId);
  ok(res, { blocked: await blockService.listBlocked(req.user) });
}

export async function listBlocked(req, res) {
  ok(res, { blocked: await blockService.listBlocked(req.user) });
}
