export const LIMITS = Object.freeze({
  FULLNAME_MIN: 2,
  FULLNAME_MAX: 40,
  USERNAME_MIN: 3,
  USERNAME_MAX: 25,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72, // bcrypt input limit
  BIO_MAX: 160,
  EMAIL_MAX: 254,
  MESSAGE_TEXT_MAX: 4000,
  MESSAGE_IMAGES_MAX: 4,
  MESSAGE_FILES_MAX: 4,
  MESSAGE_SEARCH_MAX: 100,
  REPLY_SNIPPET_MAX: 200,
  REACTIONS_PER_MESSAGE: 12,
  REACTION_EMOJI_MAX_LENGTH: 16,
  SEARCH_QUERY_MAX: 50,
  PAGE_SIZE_DEFAULT: 30,
  PAGE_SIZE_MAX: 50,
  IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  FILE_MAX_BYTES: 20 * 1024 * 1024,
  AUDIO_MAX_BYTES: 10 * 1024 * 1024,
  AUDIO_MAX_DURATION_MS: 10 * 60 * 1000,
  AVATAR_MAX_BYTES: 2 * 1024 * 1024,
  IMAGE_MAX_DIMENSION: 2048,
  AVATAR_DIMENSION: 512,
  MESSAGE_EDIT_WINDOW_MS: 15 * 60 * 1000,
  SYNC_CONVERSATIONS_MAX: 20,
  SYNC_MESSAGES_MAX: 100,
  MUTE_MINUTES_MAX: 60 * 24 * 365,
  GROUP_NAME_MIN: 1,
  GROUP_NAME_MAX: 60,
  GROUP_DESCRIPTION_MAX: 200,
  GROUP_MEMBERS_MAX: 100,
  GROUP_ADD_BATCH_MAX: 50,
  LINK_PREVIEW_TIMEOUT_MS: 5000,
  LINK_PREVIEW_MAX_BYTES: 1024 * 1024,
  LINK_PREVIEW_TITLE_MAX: 120,
  LINK_PREVIEW_DESCRIPTION_MAX: 240,
  TOTP_DIGITS: 6,
  TOTP_RECOVERY_CODES: 10,
  PUSH_ENDPOINT_MAX: 2048,
});

export const USERNAME_REGEX = /^[a-z0-9_.]{3,25}$/;

export const GENDERS = Object.freeze(["male", "female", "other", "prefer not to say"]);

export const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  DISABLED: "disabled",
  DELETED: "deleted",
});

export const ALLOWED_IMAGE_MIME = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Document-style attachments. Anything executable or renderable as HTML is deliberately absent. */
export const ALLOWED_FILE_MIME = Object.freeze([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
]);

export const ALLOWED_AUDIO_MIME = Object.freeze([
  "audio/webm",
  "video/webm", // what magic-byte detection reports for WebM/Opus voice notes
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
]);

export const CONVERSATION_TYPES = Object.freeze(["direct", "group"]);
export const CONVERSATION_FILTERS = Object.freeze(["all", "unread", "archived"]);
export const MESSAGE_TYPES = Object.freeze(["text", "image", "file", "audio", "system"]);
export const ATTACHMENT_KINDS = Object.freeze(["image", "file", "audio"]);
export const PARTICIPANT_ROLES = Object.freeze(["member", "admin"]);

/** Events recorded in a group as `type: "system"` messages. */
export const SYSTEM_MESSAGE_KINDS = Object.freeze([
  "group_created",
  "group_renamed",
  "group_description",
  "group_avatar",
  "member_added",
  "member_removed",
  "member_left",
  "admin_granted",
  "admin_revoked",
]);

export const QUICK_REACTIONS = Object.freeze(["👍", "❤️", "😂", "😮", "😢", "🙏"]);

/** Client-side delivery state of an outgoing message. */
export const MESSAGE_STATUS = Object.freeze({
  PENDING: "pending",
  FAILED: "failed",
  SENT: "sent",
  DELIVERED: "delivered",
  SEEN: "seen",
});

export const SOCKET_EVENTS = Object.freeze({
  // server -> client
  PRESENCE_SNAPSHOT: "presence:snapshot",
  PRESENCE_UPDATE: "presence:update",
  MESSAGE_NEW: "message:new",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  MESSAGE_REACTION: "message:reaction",
  MESSAGE_STATUS: "message:status",
  CONVERSATION_UPDATED: "conversation:updated",
  CONVERSATION_REMOVED: "conversation:removed",
  TYPING: "typing",
  USER_UPDATED: "user:updated",
  USER_DISABLED: "user:disabled",
  USER_DELETED: "user:deleted",
  SESSION_REVOKED: "session:revoked",
  // client -> server
  CONVERSATION_OPEN: "conversation:open",
  CONVERSATION_CLOSE: "conversation:close",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  SYNC: "sync",
});

export const ERROR_CODES = Object.freeze({
  VALIDATION: "VALIDATION_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  BLOCKED: "BLOCKED",
  EDIT_WINDOW_EXPIRED: "EDIT_WINDOW_EXPIRED",
  CSRF: "CSRF_ORIGIN_MISMATCH",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA: "UNSUPPORTED_MEDIA_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  MEDIA_UNAVAILABLE: "MEDIA_UNAVAILABLE",
  EMAIL_UNAVAILABLE: "EMAIL_UNAVAILABLE",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  TWO_FACTOR_REQUIRED: "TWO_FACTOR_REQUIRED",
  TWO_FACTOR_INVALID: "TWO_FACTOR_INVALID",
  PUSH_UNAVAILABLE: "PUSH_UNAVAILABLE",
  INTERNAL: "INTERNAL_ERROR",
});

export const SYSTEM_THEME = "system";
export const DEFAULT_THEME = "ghosted-dark";

/** Curated theme list: two custom Ghosted themes plus a few DaisyUI built-ins. */
export const THEMES = Object.freeze([
  { id: "ghosted-dark", label: "Ghosted Dark", scheme: "dark" },
  { id: "ghosted-light", label: "Ghosted Light", scheme: "light" },
  { id: "dracula", label: "Dracula", scheme: "dark" },
  { id: "night", label: "Night", scheme: "dark" },
  { id: "nord", label: "Nord", scheme: "light" },
  { id: "coffee", label: "Coffee", scheme: "dark" },
  { id: "synthwave", label: "Synthwave", scheme: "dark" },
  { id: "cupcake", label: "Cupcake", scheme: "light" },
]);
