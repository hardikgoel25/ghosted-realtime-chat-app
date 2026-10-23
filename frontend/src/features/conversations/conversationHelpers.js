import { messagePreview } from "../../lib/utils";

export function otherParticipant(conversation, meId) {
  if (!conversation) return null;
  return conversation.participants.find((p) => p.userId !== meId && !p.leftAt) ?? null;
}

/** Current members of a group (former members stay in `participants` with `leftAt`). */
export function activeMembers(conversation) {
  return (conversation?.participants ?? []).filter((p) => !p.leftAt);
}

export function participantUser(conversation, userId) {
  return conversation?.participants.find((p) => p.userId === userId)?.user ?? null;
}

export function isGroup(conversation) {
  return conversation?.type === "group";
}

export function isGroupAdmin(conversation, meId) {
  return (
    isGroup(conversation) &&
    conversation.participants.some((p) => p.userId === meId && !p.leftAt && p.role === "admin")
  );
}

export function conversationTitle(conversation, meId) {
  if (!conversation) return "";
  if (isGroup(conversation)) return conversation.group?.name ?? "Group";
  return otherParticipant(conversation, meId)?.user?.fullname ?? "Unknown user";
}

export function conversationAvatarUser(conversation, meId) {
  if (!conversation) return null;
  if (isGroup(conversation)) {
    return {
      fullname: conversation.group?.name ?? "Group",
      avatar: conversation.group?.avatar,
      group: true,
    };
  }
  return otherParticipant(conversation, meId)?.user ?? null;
}

/** First name of a participant, "You" for the viewer, with fallbacks for departed accounts. */
export function memberName(conversation, userId, meId, { first = true } = {}) {
  if (userId === meId) return "You";
  const user = participantUser(conversation, userId);
  if (!user) return "A former member";
  return first ? user.fullname.split(" ")[0] : user.fullname;
}

function listNames(names) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Human sentence for a `system` message ("Alice added Bob and Casey"). */
export function systemMessageText(message, conversation, meId) {
  const system = message?.system;
  if (!system) return "";
  const actor = memberName(conversation, message.senderId, meId);
  const targets = listNames(
    (system.targetIds ?? []).map((id) => memberName(conversation, id, meId))
  );
  const verb = (you, other) => (message.senderId === meId ? you : other);
  switch (system.kind) {
    case "group_created":
      return `${actor} ${verb("created", "created")} the group${system.text ? ` “${system.text}”` : ""}`;
    case "group_renamed":
      return `${actor} ${verb("renamed", "renamed")} the group to “${system.text}”`;
    case "group_description":
      return `${actor} ${verb("changed", "changed")} the group description`;
    case "group_avatar":
      return `${actor} ${verb("changed", "changed")} the group photo`;
    case "member_added":
      return `${actor} ${verb("added", "added")} ${targets}`;
    case "member_removed":
      return `${actor} ${verb("removed", "removed")} ${targets}`;
    case "member_left":
      return `${actor} left`;
    case "admin_granted":
      return `${actor} made ${targets} an admin`;
    case "admin_revoked":
      return `${actor} removed ${targets} as admin`;
    default:
      return "";
  }
}

export function previewFor(conversation, meId) {
  const last = conversation?.lastMessage;
  if (!last) return "No messages yet";
  if (last.type === "system") return systemMessageText(last, conversation, meId);
  const prefix =
    last.senderId === meId
      ? "You: "
      : isGroup(conversation)
        ? `${memberName(conversation, last.senderId, meId)}: `
        : "";
  return prefix + messagePreview(last);
}

export function sortConversations(list) {
  return [...list].sort((a, b) => {
    if (Boolean(a.me?.pinned) !== Boolean(b.me?.pinned)) return a.me?.pinned ? -1 : 1;
    return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
  });
}

export function matchesQuery(conversation, meId, query) {
  const q = query.toLowerCase();
  if (conversationTitle(conversation, meId).toLowerCase().includes(q)) return true;
  return activeMembers(conversation).some(
    (p) =>
      p.userId !== meId &&
      (p.user?.username?.toLowerCase().includes(q) ||
        (isGroup(conversation) && p.user?.fullname?.toLowerCase().includes(q)))
  );
}

/** People (other than me) who have read a message of mine, for "seen by" avatars in groups. */
export function readersOf(message, conversation, meId) {
  if (!message || !conversation) return [];
  const t = new Date(message.createdAt).getTime();
  return activeMembers(conversation).filter(
    (p) => p.userId !== meId && p.lastReadAt && new Date(p.lastReadAt).getTime() >= t
  );
}
