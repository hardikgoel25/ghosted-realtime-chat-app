/**
 * Every payload that leaves the API goes through one of these whitelists.
 * Nothing here ever copies a password hash, lockout counters or token material.
 */

function plain(doc) {
  return doc && typeof doc.toObject === "function" ? doc.toObject() : doc;
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
    senderId: String(m.senderId),
    receiverId: String(m.receiverId),
    text: m.text ?? "",
    image: m.image ?? null,
    clientId: m.clientId ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
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
