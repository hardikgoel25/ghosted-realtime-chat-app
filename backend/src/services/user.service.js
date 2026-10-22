import { LIMITS, SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { initialsAvatar, isGeneratedAvatar } from "../utils/avatar.js";
import { escapeRegex } from "../utils/regex.js";
import { serializeUser } from "../utils/serializers.js";
import * as media from "./media.service.js";
import { broadcast } from "../sockets/emit.js";

function announceProfileChange(user) {
  broadcast(SOCKET_EVENTS.USER_UPDATED, { user: serializeUser(user) });
}

export async function listUsers(currentUserId, { q = "", cursor, limit }) {
  const filter = { _id: { $ne: currentUserId }, status: USER_STATUS.ACTIVE };
  if (q) {
    const safe = escapeRegex(q);
    filter.$or = [
      { username: { $regex: `^${safe}` } },
      { fullname: { $regex: safe, $options: "i" } },
    ];
  }
  if (cursor) filter._id = { ...filter._id, $gt: cursor };

  const docs = await User.find(filter)
    .sort({ _id: 1 })
    .limit(limit + 1)
    .lean();
  const hasMore = docs.length > limit;
  const items = docs.slice(0, limit);
  return {
    items: items.map((u) => serializeUser(u)),
    nextCursor: hasMore ? String(items[items.length - 1]._id) : null,
  };
}

export async function getByUsername(username) {
  const user = await User.findOne({ username, status: USER_STATUS.ACTIVE }).lean();
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function isUsernameAvailable(username, currentUserId) {
  const existing = await User.findOne({ username }).select("_id").lean();
  if (!existing) return true;
  return Boolean(currentUserId) && String(existing._id) === String(currentUserId);
}

export async function updateProfile(user, data) {
  if (data.username && data.username !== user.username) {
    if (!(await isUsernameAvailable(data.username, user._id))) {
      throw ApiError.conflict("Username is already taken");
    }
  }
  const fullnameChanged = data.fullname && data.fullname !== user.fullname;
  Object.assign(user, data);
  if (fullnameChanged && isGeneratedAvatar(user.avatar?.url)) {
    user.avatar = { url: initialsAvatar(user.fullname, user.username), publicId: null };
  }
  await user.save();
  announceProfileChange(user);
  return user;
}

export async function updateAvatar(user, file) {
  const uploaded = await media.uploadImage(file.buffer, {
    folder: "avatars",
    maxDimension: LIMITS.AVATAR_DIMENSION,
    square: true,
  });
  const previous = user.avatar?.publicId;
  user.avatar = { url: uploaded.url, publicId: uploaded.publicId };
  await user.save();
  if (previous) void media.destroyImage(previous);
  announceProfileChange(user);
  return user;
}

export async function deleteAvatar(user) {
  const previous = user.avatar?.publicId;
  user.avatar = { url: initialsAvatar(user.fullname, user.username), publicId: null };
  await user.save();
  if (previous) void media.destroyImage(previous);
  announceProfileChange(user);
  return user;
}

export async function updatePrivacy(user, data) {
  for (const [key, value] of Object.entries(data)) user.set(`privacy.${key}`, value);
  await user.save();
  return user;
}

export async function updateNotificationPrefs(user, data) {
  for (const [key, value] of Object.entries(data)) user.set(`notificationPrefs.${key}`, value);
  await user.save();
  return user;
}
