export const LIMITS = Object.freeze({
  FULLNAME_MIN: 2,
  FULLNAME_MAX: 40,
  USERNAME_MIN: 3,
  USERNAME_MAX: 25,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72, // bcrypt input limit
  BIO_MAX: 160,
  MESSAGE_TEXT_MAX: 4000,
  SEARCH_QUERY_MAX: 50,
  PAGE_SIZE_DEFAULT: 30,
  PAGE_SIZE_MAX: 50,
  IMAGE_MAX_BYTES: 5 * 1024 * 1024,
  AVATAR_MAX_BYTES: 2 * 1024 * 1024,
  IMAGE_MAX_DIMENSION: 2048,
  AVATAR_DIMENSION: 512,
  MESSAGE_EDIT_WINDOW_MS: 15 * 60 * 1000,
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

export const SOCKET_EVENTS = Object.freeze({
  // server -> client
  PRESENCE_SNAPSHOT: "presence:snapshot",
  PRESENCE_UPDATE: "presence:update",
  MESSAGE_NEW: "message:new",
  TYPING: "typing",
  USER_UPDATED: "user:updated",
  USER_DISABLED: "user:disabled",
  USER_DELETED: "user:deleted",
  SESSION_REVOKED: "session:revoked",
  // client -> server
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
});

export const ERROR_CODES = Object.freeze({
  VALIDATION: "VALIDATION_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  CSRF: "CSRF_ORIGIN_MISMATCH",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA: "UNSUPPORTED_MEDIA_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  MEDIA_UNAVAILABLE: "MEDIA_UNAVAILABLE",
  INTERNAL: "INTERNAL_ERROR",
});

export const THEMES = Object.freeze([
  "light",
  "dark",
  "cupcake",
  "bumblebee",
  "emerald",
  "corporate",
  "synthwave",
  "retro",
  "cyberpunk",
  "valentine",
  "halloween",
  "garden",
  "forest",
  "aqua",
  "lofi",
  "pastel",
  "fantasy",
  "wireframe",
  "black",
  "luxury",
  "dracula",
  "cmyk",
  "autumn",
  "business",
  "acid",
  "lemonade",
  "night",
  "coffee",
  "winter",
  "dim",
  "nord",
  "sunset",
]);
