# Ghosted REST API (v1)

Base path: `/api/v1`. All requests and responses are JSON unless noted. Authentication is
cookie-based: the `access` cookie (HttpOnly, SameSite=Lax) carries a 15-minute JWT, the `refresh`
cookie (scoped to `/api/v1/auth/refresh`) carries the session's refresh token.

## Envelope

```jsonc
// success
{ "ok": true, "data": { ... } }

// error
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [ { "path": "username", "message": "..." } ] } }
```

| Status | Code                     | When                                                   |
| ------ | ------------------------ | ------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`       | Body/query/params failed the shared Zod schema         |
| 400    | `BAD_REQUEST`            | Business rule (empty message, messaging yourself…)     |
| 401    | `UNAUTHORIZED`           | Missing/invalid cookie, invalid credentials            |
| 401    | `TOKEN_EXPIRED`          | Access token expired — call `/auth/refresh`            |
| 403    | `ACCOUNT_DISABLED`       | Login refused because the account is disabled          |
| 403    | `FORBIDDEN`              | Counterpart unavailable (disabled), editing someone else's message, etc. |
| 403    | `BLOCKED`                | One of you has blocked the other                       |
| 403    | `EDIT_WINDOW_EXPIRED`    | Edits are allowed for 15 minutes after sending         |
| 403    | `CSRF_ORIGIN_MISMATCH`   | State-changing request from a foreign origin           |
| 404    | `NOT_FOUND`              | Also used for conversations you are not part of        |
| 409    | `CONFLICT`               | Username taken                                         |
| 413    | `PAYLOAD_TOO_LARGE`      | JSON > 100 kB or file above its limit                  |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | File bytes are not a JPEG/PNG/WebP/GIF                 |
| 429    | `RATE_LIMITED`           | Too many requests                                      |
| 429    | `ACCOUNT_LOCKED`         | 5+ failed logins; message says when to retry           |
| 503    | `MEDIA_UNAVAILABLE`      | Cloudinary is not configured                           |
| 503    | `EMAIL_UNAVAILABLE`      | SMTP is not configured (email features off)            |

Pagination: list endpoints accept `cursor` and `limit` (1–50) and return `{ items, nextCursor }`
(`nextCursor` is `null` on the last page). Message cursors are message ids; conversation cursors
are opaque strings produced by the previous page.

Every response carries an `x-request-id` header for log correlation.

## Objects

**User** (public)

```json
{ "_id": "…", "fullname": "Alice Rivera", "username": "alice", "bio": "", "gender": "female",
  "avatar": { "url": "https://res.cloudinary.com/…" }, "status": "active",
  "lastSeenAt": "2026-10-22T10:00:00.000Z", "createdAt": "…" }
```

The authenticated user's own record (`self`) additionally has `avatar.publicId`, `email`,
`emailVerified`, `privacy { showLastSeen, readReceipts }`, `notificationPrefs { sound, desktop,
preview }` and `updatedAt`. `lastSeenAt` is `null` for users who hide it.

**Conversation** (as seen by the requesting participant)

```jsonc
{
  "_id": "…", "type": "direct", "createdBy": "…", "group": null,
  "participants": [
    { "userId": "…", "role": "member", "joinedAt": "…", "lastReadAt": "…|null", "lastDeliveredAt": "…|null", "user": { /* User */ } }
  ],
  "blocked": { "byMe": false, "byThem": false },  // only on REST responses
  "me": { "lastReadAt": "…", "lastDeliveredAt": "…", "mutedUntil": "…|null", "muted": false,
          "archived": false, "pinned": false, "clearedAt": null, "unread": 2 },
  "lastMessage": { "_id": "…", "senderId": "…", "type": "text", "text": "…", "hasAttachments": false, "createdAt": "…" },
  "lastMessageAt": "…", "createdAt": "…", "updatedAt": "…"
}
```

A participant's `lastReadAt` is only exposed when both they and the viewer have read receipts
enabled. Delivery and read state of your own messages is derived client-side: a message is
*seen* when every other participant's `lastReadAt` ≥ its `createdAt`, *delivered* when any
`lastDeliveredAt` ≥ `createdAt`, otherwise *sent*.

**Message**

```jsonc
{ "_id": "…", "conversationId": "…", "senderId": "…", "clientId": "uuid-or-null", "type": "text|image|file|audio|system",
  "text": "hello",
  "attachments": [ { "kind": "image|file|audio", "url": "…", "mime": "…", "size": 12345, "width": 800, "height": 600, "durationMs": null, "name": "pic.webp" } ],
  "replyTo": { "messageId": "…", "senderId": "…", "type": "text", "text": "quoted snippet", "hasAttachments": false } /* or null */,
  "reactions": [ { "emoji": "👍", "userIds": ["…"] } ],
  "editedAt": null, "deletedAt": null, "createdAt": "…", "updatedAt": "…" }
```

A message deleted for everyone keeps its id and timestamps but has `deletedAt` set, an empty
`text`, and no attachments, reply or reactions. Messages deleted "for me" are simply absent
from that user's listings.

**Session**

```json
{ "_id": "…", "userAgent": "…", "ip": "…", "createdAt": "…", "lastUsedAt": "…", "expiresAt": "…", "current": true }
```

## Auth

| Method | Path                 | Auth | Body / notes                                                         |
| ------ | -------------------- | ---- | -------------------------------------------------------------------- |
| POST   | `/auth/signup`       | –    | `{ fullname, username, password, gender }` → 201 `{ user }` + cookies |
| POST   | `/auth/login`        | –    | `{ username, password }` → `{ user }` + cookies                      |
| POST   | `/auth/enable`       | –    | `{ username, password }` re-enables a disabled account and logs in   |
| POST   | `/auth/refresh`      | 🍪   | Rotates the refresh token; replays revoke the session                |
| POST   | `/auth/logout`       | 🍪   | Revokes the current session and clears cookies                       |
| POST   | `/auth/logout-all`   | ✔    | Revokes every session of the user                                    |
| GET    | `/auth/me`           | ✔    | `{ user }` (self)                                                    |
| PATCH  | `/auth/password`     | ✔    | `{ currentPassword, newPassword }` — signs out other devices         |
| POST   | `/auth/disable`      | ✔    | `{ password }`                                                       |
| DELETE | `/auth/account`      | ✔    | `{ password }` — deletes user, direct conversations, messages, media |
| GET    | `/auth/sessions`     | ✔    | `{ items: Session[] }`                                               |
| DELETE | `/auth/sessions/:id` | ✔    | Revokes one session (and disconnects its sockets)                    |
| POST   | `/auth/resend-verification` | ✔ | Re-sends the verification link (5 per 15 min)                       |
| POST   | `/auth/verify-email`  | –    | `{ token }` from the link; single use, 24 h                          |
| POST   | `/auth/forgot-password` | –  | `{ identifier }` (username or email); always 200, emails only verified addresses |
| POST   | `/auth/reset-password`  | –  | `{ token, password }`; single use, 1 h; signs out every session       |

Rules: usernames are NFKC-normalised, lowercased and must match `^[a-z0-9_.]{3,25}$`; full names
are 2–40 letters/spaces/`'`/`.`/`-`; passwords are 8–72 characters and must score ≥ 2 on zxcvbn;
`gender` is one of `male | female | other | prefer not to say`. Login and enable always answer
`Invalid credentials` for unknown users and wrong passwords.

## Users

| Method | Path                       | Auth | Notes                                                             |
| ------ | -------------------------- | ---- | ----------------------------------------------------------------- |
| GET    | `/users/check-username?u=` | –    | `{ username, available }` (rate limited)                          |
| GET    | `/users?q=&cursor=&limit=` | ✔    | Other active users; `q` matches username prefix or name substring |
| GET    | `/users/search?q=`         | ✔    | Alias of the above                                                |
| GET    | `/users/:username`         | ✔    | `{ user }`                                                        |
| PATCH  | `/users/me`                | ✔    | Any of `{ fullname, username, bio, gender }`                      |
| PUT    | `/users/me/avatar`         | ✔    | multipart, field `avatar`, ≤ 2 MB image                           |
| DELETE | `/users/me/avatar`         | ✔    | Back to a generated initials avatar                               |
| PATCH  | `/users/me/privacy`        | ✔    | `{ showLastSeen?, readReceipts? }`                                |
| PATCH  | `/users/me/notifications`  | ✔    | `{ sound?, desktop?, preview? }`                                  |
| PATCH  | `/users/me/email`          | ✔    | `{ email }` — stores it unverified and emails a verification link when SMTP is configured |
| DELETE | `/users/me/email`          | ✔    | Removes the address                                              |
| GET    | `/users/me/blocked`        | ✔    | `{ blocked: User[] }`                                            |
| POST   | `/users/:userId/block`     | ✔    | Blocks; returns the updated `blocked` list                        |
| DELETE | `/users/:userId/block`     | ✔    | Unblocks                                                         |

## Conversations

| Method | Path                                   | Notes                                                                                     |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/conversations?filter=&cursor=&limit=` | `filter`: `all` (default, excludes archived), `unread`, `archived`. Newest activity first. Fetching also marks everything shown as delivered to you. |
| POST   | `/conversations/direct`                | `{ userId }` → 201 when created, 200 when it already existed. Empty conversations are visible only to their creator until the first message. |
| GET    | `/conversations/:id`                   | One conversation (404 if you are not a participant)                                        |
| PATCH  | `/conversations/:id`                   | `{ muted?: boolean | minutes, archived?, pinned?, unread?: true }` — your own flags; `unread: true` marks it unread || minutes, archived?, pinned? }` — your own flags only                 |
| POST   | `/conversations/:id/read`              | Marks everything read; emits `message:status` (seen) to the others if receipts are on     |
| DELETE | `/conversations/:id`                   | "Delete for me": hides existing messages from you and archives the chat                    |
| GET    | `/conversations/:id/messages?cursor=&after=&around=&limit=` | Oldest → newest within the page. `cursor`: older than this id; `after`: newer than this id (returns `newerCursor`); `around`: a window centred on this id (returns both cursors) |
| GET    | `/conversations/:id/messages/search?q=&cursor=&limit=` | Case-insensitive substring search in text, newest first; skips deleted messages |
| POST   | `/conversations/:id/messages`          | JSON `{ text, clientId?, replyTo? }` or multipart with the same fields plus `images[]` (≤ 4, 5 MB each), `files[]` (≤ 4, 20 MB each: PDF, Office, ZIP, text/CSV/Markdown/JSON) and one `audio` part (≤ 10 MB, with `audioDurationMs`) |
| PATCH  | `/conversations/:id/messages/:messageId` | `{ text }` — own messages, within 15 minutes; sets `editedAt`                                   |
| DELETE | `/conversations/:id/messages/:messageId?scope=me|everyone` | `me` hides it for you; `everyone` (own messages) wipes content and assets, leaves a placeholder |
| PUT    | `/conversations/:id/messages/:messageId/reactions/:emoji` | Adds your reaction (max 12 distinct emojis per message); returns `{ reactions }` |
| DELETE | `/conversations/:id/messages/:messageId/reactions/:emoji` | Removes it                                                                   |

`clientId` (UUID v4) makes sends idempotent: a retry with the same id returns the existing
message with status 200 instead of creating a duplicate. A new message un-archives the
conversation for every participant and increments their unread counters.

## Config

| Method | Path      | Notes                                                                                  |
| ------ | --------- | -------------------------------------------------------------------------------------- |
| GET    | `/config` | Public capability flags: `{ emailEnabled, mediaEnabled, limits: { imageMaxBytes, fileMaxBytes, audioMaxBytes, messageImagesMax, messageFilesMax, editWindowMs } }` |

## Health

| Method | Path            | Notes                                        |
| ------ | --------------- | -------------------------------------------- |
| GET    | `/health`       | `{ status, version, uptime, db, timestamp }` |
| GET    | `/health/ready` | 200 when MongoDB is connected, else 503      |

## Rate limits

| Scope                                          | Limit                                   |
| ---------------------------------------------- | --------------------------------------- |
| All `/api` routes, per IP                      | 300 / 15 min                            |
| Signup, login, enable — failed attempts per IP | 10 / 15 min                             |
| Per-account lockout                            | 5 failures → 15 min, doubling up to 1 h |
| Messages, per user                             | 30 / min                                |
| Uploads, per user                              | 20 / hour                               |
| Username availability, per IP                  | 30 / min                                |

Responses include `RateLimit` headers (IETF draft 8).
