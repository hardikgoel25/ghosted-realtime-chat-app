import { ERROR_CODES, LIMITS, SOCKET_EVENTS, USER_STATUS } from "@ghosted/shared";
import { assertFeature } from "../config/features.js";
import { logger } from "../config/logger.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import * as blockService from "./block.service.js";
import * as media from "./media.service.js";
import { postSystemMessage } from "./message.service.js";
import {
  PARTICIPANT_POPULATE,
  activeParticipants,
  broadcastConversation,
  idOf,
  loadForMember,
  participantOf,
  viewFor,
} from "./conversation.service.js";
import { conversationRoom, emitToUser, leaveRoomForUser } from "../sockets/emit.js";

function assertGroup(conversation) {
  if (conversation.type !== "group") throw ApiError.badRequest("This is not a group chat");
}

async function loadGroup(me, conversationId) {
  assertFeature("groups");
  const conversation = await loadForMember(me._id, conversationId);
  assertGroup(conversation);
  return conversation;
}

async function loadGroupAsAdmin(me, conversationId) {
  const conversation = await loadGroup(me, conversationId);
  if (participantOf(conversation, me._id)?.role !== "admin") {
    throw ApiError.forbidden("Only group admins can do that");
  }
  return conversation;
}

/** Validates that every id is an active user the actor may add (no blocks either way). */
async function assertAddable(me, ids) {
  const users = await User.find({ _id: { $in: ids }, status: USER_STATUS.ACTIVE })
    .select("_id")
    .lean();
  if (users.length !== ids.length)
    throw ApiError.notFound("Some of those people are not available");
  const blocks = await blockService.blockSets(me._id);
  if (ids.some((id) => blocks.byMe.has(id) || blocks.byThem.has(id))) {
    throw ApiError.forbidden(
      "Some of those people can't be added to a group with you",
      ERROR_CODES.BLOCKED
    );
  }
}

function notifyRemoved(userId, conversationId, reason) {
  emitToUser(userId, SOCKET_EVENTS.CONVERSATION_REMOVED, {
    conversationId: String(conversationId),
    reason,
  });
  leaveRoomForUser(userId, conversationRoom(conversationId));
}

/** Oldest remaining member becomes admin when the last admin goes. */
function ensureAnAdmin(conversation) {
  const active = activeParticipants(conversation);
  if (active.length === 0 || active.some((p) => p.role === "admin")) return null;
  const oldest = [...active].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];
  oldest.role = "admin";
  return idOf(oldest.userId);
}

async function deleteGroup(conversation) {
  const messages = await Message.find({
    conversationId: conversation._id,
    "attachments.0": { $exists: true },
  })
    .select("attachments.publicId attachments.resourceType")
    .lean();
  await Message.deleteMany({ conversationId: conversation._id });
  await Conversation.deleteOne({ _id: conversation._id });
  void media.destroyAssets([
    { publicId: conversation.group?.avatar?.publicId, resourceType: "image" },
    ...messages.flatMap((m) => m.attachments),
  ]);
  logger.info({ conversationId: String(conversation._id) }, "Empty group deleted");
}

export async function createGroup(me, { name, description = "", memberIds }) {
  assertFeature("groups");
  const ids = [...new Set(memberIds.map(String))].filter((id) => id !== idOf(me._id));
  if (ids.length === 0) throw ApiError.badRequest("Add at least one other person");
  if (ids.length + 1 > LIMITS.GROUP_MEMBERS_MAX) {
    throw ApiError.badRequest(`Groups can have at most ${LIMITS.GROUP_MEMBERS_MAX} members`);
  }
  await assertAddable(me, ids);

  const now = new Date();
  const doc = await Conversation.create({
    type: "group",
    createdBy: me._id,
    group: { name, description },
    participants: [
      { userId: me._id, role: "admin", joinedAt: now, lastReadAt: now, lastDeliveredAt: now },
      ...ids.map((id) => ({ userId: id, joinedAt: now })),
    ],
    lastMessageAt: now,
  });
  const conversation = await doc.populate(PARTICIPANT_POPULATE);
  const updated = await postSystemMessage(conversation, me._id, {
    kind: "group_created",
    targetIds: ids,
    text: name,
  });
  logger.info({ conversationId: String(updated._id), members: ids.length + 1 }, "Group created");
  return viewFor(updated, me);
}

export async function updateGroup(me, conversationId, { name, description }) {
  let conversation = await loadGroupAsAdmin(me, conversationId);
  const events = [];
  if (name !== undefined && name !== conversation.group.name) {
    conversation.group.name = name;
    events.push({ kind: "group_renamed", text: name });
  }
  if (description !== undefined && description !== (conversation.group.description ?? "")) {
    conversation.group.description = description;
    events.push({ kind: "group_description" });
  }
  if (events.length === 0) return viewFor(conversation, me);
  await conversation.save();
  for (const event of events) conversation = await postSystemMessage(conversation, me._id, event);
  return viewFor(conversation, me);
}

export async function updateGroupAvatar(me, conversationId, file) {
  const conversation = await loadGroupAsAdmin(me, conversationId);
  const uploaded = await media.uploadImage(file.buffer, {
    folder: "groups",
    maxDimension: LIMITS.AVATAR_DIMENSION,
    square: true,
  });
  const previous = conversation.group.avatar?.publicId;
  conversation.group.avatar = { url: uploaded.url, publicId: uploaded.publicId };
  await conversation.save();
  if (previous) void media.destroyImage(previous);
  const updated = await postSystemMessage(conversation, me._id, { kind: "group_avatar" });
  return viewFor(updated, me);
}

export async function removeGroupAvatar(me, conversationId) {
  const conversation = await loadGroupAsAdmin(me, conversationId);
  const previous = conversation.group.avatar?.publicId;
  if (!previous && !conversation.group.avatar?.url) return viewFor(conversation, me);
  conversation.group.avatar = { url: null, publicId: null };
  await conversation.save();
  if (previous) void media.destroyImage(previous);
  const updated = await postSystemMessage(conversation, me._id, { kind: "group_avatar" });
  return viewFor(updated, me);
}

export async function addMembers(me, conversationId, userIds) {
  const conversation = await loadGroupAsAdmin(me, conversationId);
  const current = new Set(activeParticipants(conversation).map((p) => idOf(p.userId)));
  const ids = [...new Set(userIds.map(String))].filter((id) => !current.has(id));
  if (ids.length === 0) return viewFor(conversation, me);
  if (current.size + ids.length > LIMITS.GROUP_MEMBERS_MAX) {
    throw ApiError.badRequest(`Groups can have at most ${LIMITS.GROUP_MEMBERS_MAX} members`);
  }
  await assertAddable(me, ids);

  const now = new Date();
  for (const id of ids) {
    const former = participantOf(conversation, id);
    if (former) {
      // Re-joining: fresh cursors, and history before this moment stays hidden
      Object.assign(former, {
        role: "member",
        joinedAt: now,
        leftAt: null,
        lastReadAt: null,
        lastDeliveredAt: null,
        archived: false,
        pinned: false,
        mutedUntil: null,
        clearedAt: now,
      });
    } else {
      // New members see the group from the moment they join, not what came before
      conversation.participants.push({ userId: id, joinedAt: now, clearedAt: now });
    }
    conversation.unread.set(id, 0);
  }
  await conversation.save();
  const populated = await Conversation.findById(conversation._id).populate(PARTICIPANT_POPULATE);
  const updated = await postSystemMessage(populated, me._id, {
    kind: "member_added",
    targetIds: ids,
  });
  return viewFor(updated, me);
}

export async function setMemberRole(me, conversationId, userId, role) {
  const conversation = await loadGroupAsAdmin(me, conversationId);
  const target = participantOf(conversation, userId);
  if (!target || target.leftAt) throw ApiError.notFound("That person is not in the group");
  if (target.role === role) return viewFor(conversation, me);
  if (role === "member") {
    const admins = activeParticipants(conversation).filter((p) => p.role === "admin");
    if (admins.length === 1) throw ApiError.badRequest("Make someone else an admin first");
  }
  target.role = role;
  await conversation.save();
  const updated = await postSystemMessage(conversation, me._id, {
    kind: role === "admin" ? "admin_granted" : "admin_revoked",
    targetIds: [String(userId)],
  });
  return viewFor(updated, me);
}

export async function removeMember(me, conversationId, userId) {
  if (idOf(userId) === idOf(me._id)) return leaveGroup(me, conversationId);
  const conversation = await loadGroupAsAdmin(me, conversationId);
  const target = participantOf(conversation, userId);
  if (!target || target.leftAt) throw ApiError.notFound("That person is not in the group");
  target.leftAt = new Date();
  target.role = "member";
  conversation.unread.set(String(userId), 0);
  await conversation.save();
  const updated = await postSystemMessage(conversation, me._id, {
    kind: "member_removed",
    targetIds: [String(userId)],
  });
  notifyRemoved(String(userId), conversation._id, "removed");
  return viewFor(updated, me);
}

/** Leaves the group; the last member out deletes it, and admin rights pass on if needed. */
export async function leaveGroup(me, conversationId) {
  const conversation = await loadGroup(me, conversationId);
  const mine = participantOf(conversation, me._id);
  mine.leftAt = new Date();
  mine.role = "member";
  conversation.unread.set(idOf(me._id), 0);

  if (activeParticipants(conversation).length === 0) {
    await deleteGroup(conversation);
    notifyRemoved(idOf(me._id), conversation._id, "left");
    return null;
  }
  ensureAnAdmin(conversation);
  await conversation.save();
  await postSystemMessage(conversation, me._id, {
    kind: "member_left",
    targetIds: [idOf(me._id)],
  });
  notifyRemoved(idOf(me._id), conversation._id, "left");
  return null;
}

/** Account deletion: drop out of every group the user is still in. */
export async function leaveAllGroups(userId) {
  const groups = await Conversation.find({
    type: "group",
    participants: { $elemMatch: { userId, leftAt: null } },
  }).populate(PARTICIPANT_POPULATE);
  for (const conversation of groups) {
    const mine = participantOf(conversation, userId);
    mine.leftAt = new Date();
    mine.role = "member";
    if (activeParticipants(conversation).length === 0) {
      await deleteGroup(conversation);
      continue;
    }
    ensureAnAdmin(conversation);
    await conversation.save();
    try {
      await postSystemMessage(conversation, userId, {
        kind: "member_left",
        targetIds: [String(userId)],
      });
    } catch (err) {
      logger.warn({ err, conversationId: String(conversation._id) }, "Leave notice failed");
      broadcastConversation(conversation);
    }
  }
  return groups.length;
}
