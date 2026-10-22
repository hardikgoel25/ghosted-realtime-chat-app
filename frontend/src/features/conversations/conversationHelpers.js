import { messagePreview } from "../../lib/utils";

export function otherParticipant(conversation, meId) {
  if (!conversation) return null;
  return conversation.participants.find((p) => p.userId !== meId) ?? null;
}

export function conversationTitle(conversation, meId) {
  if (!conversation) return "";
  if (conversation.type === "group") return conversation.group?.name ?? "Group";
  return otherParticipant(conversation, meId)?.user?.fullname ?? "Unknown user";
}

export function conversationAvatarUser(conversation, meId) {
  if (!conversation) return null;
  if (conversation.type === "group") {
    return { fullname: conversation.group?.name ?? "Group", avatar: conversation.group?.avatar };
  }
  return otherParticipant(conversation, meId)?.user ?? null;
}

export function previewFor(conversation, meId) {
  const last = conversation?.lastMessage;
  if (!last) return "No messages yet";
  const prefix = last.senderId === meId ? "You: " : "";
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
  const username = otherParticipant(conversation, meId)?.user?.username ?? "";
  return username.toLowerCase().includes(q);
}
