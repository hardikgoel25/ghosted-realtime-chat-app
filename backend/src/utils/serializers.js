/**
 * Every payload that leaves the API goes through one of these whitelists.
 * Nothing here ever copies a password hash, lockout counters or token material.
 */

function plain(doc) {
  return doc && typeof doc.toObject === "function" ? doc.toObject() : doc;
}

const idOf = (value) => String(value?._id ?? value);

/** A populated participant carries the user document under `userId`. */
function userOf(participant) {
  const u = participant?.userId;
  return u && typeof u === "object" && u.username ? u : null;
}

function unreadFor(unread, userId) {
  if (!unread) return 0;
  const value = typeof unread.get === "function" ? unread.get(userId) : unread[userId];
  return Number(value ?? 0);
}

export function serializeUser(user, { self = false } = {}) {
  const u = plain(user);
  if (!u) return null;
  const showLastSeen = self || u.privacy?.showLastSeen !== false;
  const base = {
    _id: String(u._id),
    fullname: u.fullname,
    username: u.username,
    bio: u.bio ?? "",
    gender: u.gender,
    avatar: { url: u.avatar?.url ?? "" },
    status: u.status,
    lastSeenAt: showLastSeen ? (u.lastSeenAt ?? null) : null,
    createdAt: u.createdAt,
  };
  if (self) {
    base.avatar.publicId = u.avatar?.publicId ?? null;
    base.email = u.email ?? null;
    base.emailVerified = Boolean(u.emailVerified);
    base.privacy = {
      showLastSeen: u.privacy?.showLastSeen !== false,
      readReceipts: u.privacy?.readReceipts !== false,
    };
    base.notificationPrefs = {
      sound: u.notificationPrefs?.sound !== false,
      desktop: Boolean(u.notificationPrefs?.desktop),
      preview: u.notificationPrefs?.preview !== false,
    };
    base.updatedAt = u.updatedAt;
  }
  return base;
}

export function serializeMessage(message) {
  const m = plain(message);
  if (!m) return null;
  return {
    _id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    clientId: m.clientId ?? null,
    type: m.type ?? "text",
    text: m.text ?? "",
    attachments: (m.attachments ?? []).map((a) => ({
      url: a.url,
      mime: a.mime ?? null,
      size: a.size ?? null,
      width: a.width ?? null,
      height: a.height ?? null,
      name: a.name ?? null,
    })),
    replyTo: m.replyTo ? String(m.replyTo) : null,
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * A conversation as seen by one participant. Read cursors of other participants are only
 * exposed when both sides have read receipts enabled (reciprocal, like most messengers).
 */
export function serializeConversation(conversation, viewer) {
  const c = plain(conversation);
  if (!c) return null;
  const viewerId = idOf(viewer);
  const viewerDoc = plain(viewer);
  const viewerShowsReceipts =
    (viewerDoc && typeof viewerDoc === "object" ? viewerDoc.privacy?.readReceipts : true) !== false;
  const now = Date.now();

  const participants = (c.participants ?? []).map((p) => {
    const user = userOf(p);
    const userId = idOf(p.userId);
    const isViewer = userId === viewerId;
    const showRead = isViewer || (viewerShowsReceipts && user?.privacy?.readReceipts !== false);
    return {
      userId,
      role: p.role ?? "member",
      joinedAt: p.joinedAt ?? null,
      lastReadAt: showRead ? (p.lastReadAt ?? null) : null,
      lastDeliveredAt: p.lastDeliveredAt ?? null,
      user: user ? serializeUser(user) : null,
    };
  });

  const mine = (c.participants ?? []).find((p) => idOf(p.userId) === viewerId);
  const mutedUntil = mine?.mutedUntil ?? null;

  return {
    _id: String(c._id),
    type: c.type ?? "direct",
    participants,
    createdBy: c.createdBy ? String(c.createdBy) : null,
    group:
      c.type === "group"
        ? { name: c.group?.name ?? null, avatar: { url: c.group?.avatar?.url ?? null } }
        : null,
    me: {
      lastReadAt: mine?.lastReadAt ?? null,
      lastDeliveredAt: mine?.lastDeliveredAt ?? null,
      mutedUntil,
      muted: Boolean(mutedUntil && new Date(mutedUntil).getTime() > now),
      archived: Boolean(mine?.archived),
      pinned: Boolean(mine?.pinned),
      clearedAt: mine?.clearedAt ?? null,
      unread: unreadFor(c.unread, viewerId),
    },
    lastMessage: c.lastMessage
      ? {
          _id: String(c.lastMessage._id),
          senderId: String(c.lastMessage.senderId),
          type: c.lastMessage.type ?? "text",
          text: c.lastMessage.text ?? "",
          hasAttachments: Boolean(c.lastMessage.hasAttachments),
          createdAt: c.lastMessage.createdAt,
        }
      : null,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function serializeSession(session, currentSessionId) {
  const s = plain(session);
  return {
    _id: String(s._id),
    userAgent: s.userAgent ?? "",
    ip: s.ip ?? "",
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
    current: String(s._id) === String(currentSessionId),
  };
}
