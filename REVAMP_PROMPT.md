# Ghosted — Full Revamp & Expansion Prompt

## 1. Role and goal

You are a senior full-stack engineer taking over **Ghosted**, a MERN + Socket.IO realtime chat app
(repo: https://github.com/hardikgoel25/ghosted-realtime-chat-app, checked out in this directory).
Rebuild it into a production-grade, modern, secure chat application while keeping its identity:
username-based auth, realtime 1:1 chat, image sharing, profile management, account
disable / enable / delete, and theming.

Work inside this repository. Read every existing file before changing it. Reuse what is sound,
replace what is not, and leave no dead code, unused assets, or stale comments behind.
Deliver in the phases listed in section 12 and stop at the end of each phase with a report.

## 2. Decisions already made (change only if explicitly told otherwise)

- **Language:** JavaScript (ESM) on both ends, with Zod for runtime validation and JSDoc for types.
  If the instruction `TYPESCRIPT=yes` is given, convert both packages to strict TypeScript instead.
- **Stack stays:** Node 20+, Express 5, Mongoose 8, Socket.IO 4, React 19, Vite 6, Zustand 5,
  React Router 7, lucide-react, Cloudinary. Upgrade Tailwind 3 → 4 and DaisyUI 4 → 5.
- **Monorepo:** npm workspaces with `backend/`, `frontend/`, and a new `shared/` package holding
  Zod schemas, constants (limits, socket event names), and pure helpers used by both sides.
  Remove the circular `"chat-app": "file:.."` dependency from both packages.
- **Auth:** stays cookie-based JWT but becomes short-lived access token + rotating refresh token
  stored hashed in a `Session` collection, with per-session revocation and a sessions page.
- **Realtime:** presence stays in-memory but is structured so `@socket.io/redis-adapter` can be
  dropped in later. Do not add Redis now.
- **Email is optional:** build `email` field, verification, and password reset, but enable the
  flows only when SMTP env vars are present. The app must work fully without email.
- **Existing data survives:** write an idempotent migration script for existing users and messages
  (section 5) and run it as part of deployment.
- **Deployment target stays Render** (backend serves the built frontend in production).
  Keep `npm run build` / `npm start` at the root working.

## 3. Known defects in the current code — fix every one of these

### Security
1. **Socket impersonation.** `socket.js` trusts `handshake.query.userId`. Anyone can connect as any
   user and receive that user's messages. Authenticate sockets from the JWT cookie in `io.use()`.
2. **Password hash leaks.** `signup`, `login`, `updateProfile`, `enableAccount`, and `disableAccount`
   return the full user document including the bcrypt `password` hash.
3. **No rate limiting.** Login, signup, and enable-account are brute-forceable; message and upload
   endpoints are spammable.
4. **No input validation.** `signup` calls `username.toLowerCase()` and `fullname.trim()` before
   null checks (500 instead of 400). `login` passes `req.body.username` straight into `findOne`
   (NoSQL operator injection, e.g. `{"$gt": ""}`). Route `:id` params are not validated as
   ObjectIds (CastError → 500). `sendMessage` accepts empty messages and unbounded text.
5. **Unvalidated uploads.** `cloudinary.uploader.upload(image)` accepts any string, including
   remote URLs that Cloudinary will fetch. No MIME, size, or magic-byte checks.
6. **Hardcoded origins.** CORS and Socket.IO origins are `http://localhost:5173` in code.
7. **No security headers, no error handler.** No helmet; Express's default error page leaks stack
   traces; there is no 404 handler.
8. **Cookie clearing is wrong.** `logout` clears the cookie without the `secure` / `sameSite`
   options it was set with, so some browsers keep it.
9. **Account enumeration.** `enableAccount` answers "Account is already enabled" vs
   "Invalid credentials".
10. **Weak password rules.** No max length (bcrypt truncates at 72 bytes and long inputs burn CPU),
    no username format rules (spaces, `@`, unicode all accepted).
11. **Third-party avatar.** Default avatars come from `avatar.iran.liara.run` with the user's name
    in the URL. Generate initials avatars locally instead.
12. **Token before persistence.** `signup` sets the auth cookie before `newUser.save()` succeeds.

### Correctness and robustness
13. The signup form offers gender `other`, but the schema enum only allows
    `male | female | prefer not to say`, so that choice fails with a 500.
14. `userSocketMap` holds one socket per user. A second tab overwrites the first, and closing
    either tab marks the user offline.
15. Messages from anyone other than the selected user are silently dropped on the client: no
    unread count, no notification. `receive.wav` is shipped but never played.
    `unsubscribeFromMessages` removes every `newMessage` listener.
16. `getMessages` returns the entire history, unsorted and unpaginated. `getUsers` returns every
    user in the database with no search.
17. The axios interceptor toasts every error and the stores toast again, so users see two toasts.
18. `Profile` calls `checkAuth()` on mount, which can open a second socket while the first is
    still connecting (`connectSocket` only guards on `connected`).
19. `MessageInput` constructs a new `Audio` on every render; `ChatContainer` attaches the same ref
    to every message.
20. `titleCase()` mangles names ("McDonald" → "Mcdonald"). `login` does not lowercase the
    username although `signup` does. `cachedLoginEmail` is a typo for `cachedLoginUsername`.
21. The DB connects after the server starts listening. No graceful shutdown, no health endpoint,
    no indexes on `Message`.
22. Account delete runs two writes without a transaction and never tells the other participant,
    whose open chat goes stale. Disable does not disconnect the user's sockets.
23. On mobile the 5rem sidebar is squeezed beside the chat instead of navigating between views.
24. No tests, no `.env.example`, no CI, no formatter, no pre-commit hooks.

## 4. Target architecture

```
backend/src/
  config/        env.js (Zod-validated, fail fast), db.js, cloudinary.js, logger.js (pino), cors.js
  models/        User, Session, Conversation, Message, Block, (Device for push, P2)
  middleware/    auth.js, validate.js (zod), rateLimit.js, upload.js (multer), error.js, origin.js
  services/      auth, token, user, conversation, message, media, presence, notification
  controllers/   thin: parse → service → respond
  routes/v1/     auth, users, conversations, messages, media, sessions, health
  sockets/       index.js, middleware/auth.js, handlers/{presence,messages,typing,conversations}.js, emit.js
  utils/         ApiError.js, asyncHandler.js, ids.js, avatar.js (initials SVG), sanitize.js
  migrations/    001-conversations.js, run.js
  app.js (express app only), server.js (http + io + listen + shutdown)
frontend/src/
  app/           router.jsx, providers.jsx, ErrorBoundary.jsx, routes lazily loaded
  features/      auth/, conversations/, chat/, contacts/, profile/, settings/, notifications/
                 (each: components/, hooks/, api.js, store.js where needed)
  components/ui/ Button, Input, Textarea, Avatar, Badge, Modal, Dropdown, Tooltip, Skeleton, EmptyState
  hooks/         useSocket, useOnlineStatus, useInfiniteMessages, useDebounce, useMediaQuery, useHotkeys
  lib/           api.js (axios + refresh + retry), socket.js, format.js (date-fns), upload.js, linkify.js
  stores/        auth, conversations, chat, presence, ui, settings
  styles/        tailwind.css, themes.css (DaisyUI 5 custom themes)
shared/
  schemas/       auth.js, user.js, message.js, conversation.js (Zod)
  constants.js   LIMITS, SOCKET_EVENTS, THEMES, GENDERS
```

Principles: controllers never touch Mongoose directly; services never touch `req`/`res`;
socket handlers call the same services as HTTP; every outbound payload goes through a
serializer that whitelists fields (never rely on `select("-password")` as the only guard).

## 5. Data model

**User:** `fullname` (2–40), `username` (unique, `^[a-z0-9_.]{3,25}$`, NFKC-normalized),
`email` (optional, unique sparse, verified flag), `passwordHash`, `bio` (≤160), `gender`
(`male | female | other | prefer not to say`), `avatar {url, publicId}`, `status`
(`active | disabled | deleted`), `lastSeenAt`, `privacy {showLastSeen, readReceipts}`,
`notificationPrefs {sound, desktop, preview}`, `failedLoginCount`, `lockedUntil`,
`passwordChangedAt`, timestamps. Schema `toJSON` transform strips `passwordHash`,
`failedLoginCount`, `lockedUntil`, and `email` unless it is the user's own record.

**Session:** `userId`, `refreshTokenHash`, `family`, `userAgent`, `ip`, `lastUsedAt`,
`expiresAt`, `revokedAt`. TTL index on `expiresAt`.

**Conversation:** `type` (`direct | group`), `participants[{userId, role, joinedAt, lastReadAt,
lastDeliveredAt, muted, archived, pinned}]`, `directKey` (sorted pair of user ids, unique
sparse) so a direct chat is created once, `group {name, avatar, createdBy}`, `lastMessage`
snapshot `{id, senderId, type, text, createdAt}`, `unread` map `{userId: count}`, timestamps.
Indexes: `participants.userId + updatedAt`, `directKey`.

**Message:** `conversationId`, `senderId`, `clientId` (uuid from client, unique with senderId for
idempotent retries), `type` (`text | image | file | audio | system`), `text` (≤4000),
`attachments[{url, publicId, mime, size, width, height, durationMs, name}]`, `replyTo`
(message id + snapshot), `reactions[{emoji, userIds}]`, `editedAt`, `deletedAt`,
`deletedFor[userIds]`, timestamps. Indexes: `conversationId + createdAt`, `senderId + clientId`.

**Block:** `blockerId`, `blockedId`, unique pair.

**Migration (`migrations/001-conversations.js`):** for every distinct sender/receiver pair in the
old `messages` collection, create a direct conversation, set `conversationId` on each message,
set `type` to `text` or `image`, move `image` into `attachments`, compute `lastMessage`, set every
existing user's `status` from `isDisabled`, rename `password` → `passwordHash`, and generate
`avatar` entries. Idempotent and resumable; logs counts; supports a dry-run flag.

## 6. API contract (`/api/v1`)

Response envelope: success `{ ok: true, data }`; error `{ ok: false, error: { code, message,
details? } }`. Codes: 400 validation, 401 unauthenticated, 403 forbidden/blocked/disabled,
404, 409 conflict (username taken), 413 payload too large, 415 unsupported media, 429 rate
limited, 500 generic (no internals). Every list endpoint is cursor-paginated:
`?cursor=<id|timestamp>&limit=<n≤50>` → `{ items, nextCursor }`.

```
POST   /auth/signup                 POST /auth/login             POST /auth/logout
POST   /auth/refresh                POST /auth/logout-all
GET    /auth/me                     PATCH /auth/password
POST   /auth/enable                 POST /auth/disable           DELETE /auth/account
POST   /auth/forgot-password        POST /auth/reset-password    POST /auth/verify-email   (email-gated)
GET    /auth/sessions               DELETE /auth/sessions/:id

GET    /users/search?q=             GET /users/:username         GET /users/check-username?u=
PATCH  /users/me                    PUT /users/me/avatar (multipart)   DELETE /users/me/avatar
PATCH  /users/me/privacy            PATCH /users/me/notifications
POST   /users/:id/block             DELETE /users/:id/block      GET /users/me/blocked

GET    /conversations               POST /conversations/direct {userId}   POST /conversations/group
GET    /conversations/:id           PATCH /conversations/:id (mute/archive/pin)
POST   /conversations/:id/read      DELETE /conversations/:id (leave or delete-for-me)
POST   /conversations/:id/members   DELETE /conversations/:id/members/:userId   (group, P2)

GET    /conversations/:id/messages?cursor=&limit=     GET /conversations/:id/messages/search?q=
POST   /conversations/:id/messages  (json: text/replyTo/clientId  |  multipart: files + fields)
PATCH  /messages/:id                DELETE /messages/:id?scope=me|everyone
PUT    /messages/:id/reactions/:emoji   DELETE /messages/:id/reactions/:emoji

GET    /health   (db state, uptime, version)   GET /health/ready
```

## 7. Realtime contract (Socket.IO, namespace `/`)

- **Handshake:** cookie-authenticated. Reject with `UNAUTHORIZED` if the access token is invalid
  or the user is disabled/deleted. The client refreshes the token and reconnects on that error.
- **Rooms:** `user:<id>` for everything addressed to a user; `conv:<id>` joined when a
  conversation is opened, left when closed.
- **Server → client:** `presence:snapshot` (on connect), `presence:update {userId, online,
  lastSeenAt}` (diffs only), `message:new`, `message:updated`, `message:deleted`,
  `message:reaction`, `message:status {conversationId, messageIds, status, by}`,
  `typing {conversationId, userId, isTyping}`, `conversation:updated`, `conversation:new`,
  `user:updated` (avatar/name change), `user:disabled`, `user:deleted`, `session:revoked`
  (forces logout of that device).
- **Client → server:** `typing:start` / `typing:stop` (server throttles to one event per 2 s per
  conversation), `message:delivered {messageIds}`, `conversation:open` / `conversation:close`,
  `sync {conversations: [{id, since}]}` → server replies with missed messages per conversation.
- Every client event is validated with the shared Zod schemas and acknowledged with
  `{ ok, error? }`. Unknown events are ignored and logged at debug level.
- Multi-device presence: `Map<userId, Set<socketId>>`; a user is online while the set is
  non-empty; `lastSeenAt` is written on the last disconnect (debounced 10 s).

## 8. Feature requirements

### P0 — must ship
- Authenticated sockets, multi-device presence, "last seen" with a privacy toggle.
- Conversation list sorted by last activity with last-message preview, relative time, unread
  badge, muted / pinned / archived states, tabs All / Unread / Archived, server-side debounced
  user search, and a "New chat" modal.
- URL-driven navigation: `/` list, `/c/:conversationId` chat, `/u/:username` profile,
  `/settings/:section`. Deep links survive the login redirect.
- Cursor-paginated message history with upward infinite scroll that preserves scroll position.
- Optimistic send with pending → sent → delivered → seen ticks; failed state with retry;
  idempotent via `clientId`; dedupe by `_id` in the store.
- Typing indicator, read receipts (honouring the privacy toggle), delivery receipts.
- Notifications for messages in other conversations: toast with sender and preview, receive
  sound (`receive.wav`), unread count in the document title, optional browser Notification
  (permission requested from Settings, never on page load).
- Reply/quote, edit (own messages, within 15 min, shows "edited"), delete for me / for
  everyone (placeholder bubble), copy text, emoji reactions with a picker.
- Images: multipart upload, client-side resize to ≤2048 px before upload, paste and
  drag-and-drop into the composer, multi-image grid, lightbox with keyboard navigation.
- Day separators, grouping of consecutive messages from the same sender within 5 minutes,
  safe link detection (`rel="noopener noreferrer"`, external icon), long-message "show more".
- Block / unblock: blocked users cannot message or see presence; both sides' UI reflects it.
- Profile: edit fullname, username (live availability check), bio, gender, avatar with
  client-side crop; change password (revokes other sessions); view other users' profiles.
- Mobile-first responsive layout (section 9) and full keyboard accessibility.
- Draft per conversation persisted locally and restored when reopening.

### P1 — should ship
- File attachments (pdf, docx, zip, txt, ≤20 MB) rendered as chips with size and download.
- Voice messages recorded in-browser (MediaRecorder → webm/opus) with a compact player showing
  duration and playback speed.
- Search within a conversation (server-side text index) with result jumping.
- Sessions page: list devices with user agent, IP, last active; revoke one or all.
- Settings rewrite: Profile, Appearance, Notifications, Privacy, Sessions, Danger zone.
- Email (when SMTP is configured): verification, password reset with single-use expiring tokens.
- Archive, mute (with duration), pin conversations; mark as read/unread.
- Message info sheet (sent / delivered / seen timestamps).
- Command palette (Ctrl/⌘+K): jump to conversation, start chat, open settings, switch theme.

### P2 — stretch
- Group chats: create, name, avatar, add/remove members, admin role, system messages,
  per-member read cursors, "seen by" avatars.
- PWA: manifest, offline shell, installable, Web Push notifications with VAPID keys.
- Link previews fetched server-side with SSRF protection (resolve DNS, reject private ranges,
  5 s timeout, 1 MB cap, http(s) only), cached per URL.
- TOTP two-factor auth with recovery codes.
- Redis adapter and presence in Redis behind a feature flag.
- Message forwarding, starred messages, scheduled messages, GIF search (Tenor/Giphy, keyed).

## 9. UI / UX specification

**Design language.** Dark-first, modern, calm. Primary violet (`#7C3AED` family), neutral
slate surfaces with subtle 1 px borders and soft shadows, 12 px radius on cards and 20 px on
bubbles, 8 pt spacing scale, Inter via `@fontsource-variable/inter` (self-hosted, no Google
Fonts request). Motion via `framer-motion`, 150–250 ms, respects `prefers-reduced-motion`.

**Themes.** Two custom DaisyUI 5 themes, `ghosted-dark` (default) and `ghosted-light`, plus a
curated set (`dracula`, `night`, `nord`, `cupcake`, `synthwave`, `coffee`) and a "System"
option that follows `prefers-color-scheme`. The theme is applied to `<html data-theme>` once,
not to a wrapper div, and never flashes on load (an inline script reads localStorage before
first paint).

**Layout.**
- ≥1280 px: three panes — conversation list (320 px), chat, optional details drawer (320 px:
  profile, shared media, search, mute/block).
- 768–1279 px: two panes, details as an overlay drawer.
- <768 px: single pane, route-driven; list ↔ chat with a back button and slide transition;
  composer stays above the keyboard; safe-area insets respected.
- Sticky chat header with avatar, name, status line ("online", "last seen 5 m ago",
  "typing…"), actions (search in chat, info, more). No fixed-height `calc(100vh-8rem)` hacks;
  use a flex column with `min-h-0` and `100dvh`.

**Message list.** Bubbles with tails, own messages on the right. Hover (desktop) / long-press
(mobile) action bar: react, reply, copy, edit, delete, info. Reaction pills under the bubble
with counts and tooltips naming who reacted. Reply quote block above the text that scrolls to
the original on click. Status ticks: clock (pending), single check (sent), double (delivered),
filled double (seen). "Edited" label. Deleted placeholder in italics. Images in a 1–4 grid
with blur-up placeholders; files as chips; audio as a compact player. Date pills stick while
scrolling. "New messages" divider and a floating "jump to latest" button with a count.

**Composer.** Auto-growing textarea (1–6 rows), Enter sends, Shift+Enter inserts a newline,
emoji picker button, attach button, record-voice button (P1), reply/edit preview bar with
cancel, attachment preview strip with remove buttons, character counter appearing past 3,600,
disabled with a reason when blocked or offline, draft autosave.

**Sidebar.** Search field with clear button, tabs, items with avatar + presence dot, name,
preview ("You: …", "📷 Photo", "🎤 Voice message"), time, unread badge, mute and pin icons,
right-click / long-press context menu. Skeletons while loading; empty states with one short
line and a call to action, not a bare "No users".

**Auth pages.** Split layout kept but redesigned: brand panel with an animated ghost mark,
password strength meter (`@zxcvbn-ts/core`), inline field validation from the shared schemas,
show-password toggle, "disabled account" banner with the enable flow inline instead of a
separate page.

**Accessibility.** Every icon button has an `aria-label`; visible focus rings; roving tabindex
in lists; modals trap focus and close on Escape; a live region announces new messages; colour
contrast AA on all themes; touch targets ≥44 px; `aria-live="polite"` for the typing indicator.

**Toasts.** One system (`sonner`) and one source of truth: the API client maps errors to toasts
once; stores never toast API errors themselves.

## 10. Security and robustness requirements

**Backend hardening**
- `helmet` with a CSP that allows self, the Cloudinary image host, `data:` and `blob:` for
  previews, `ws:`/`wss:` for sockets; HSTS in production; `app.set("trust proxy", 1)`.
- CORS allowlist from a `CLIENT_ORIGINS` env var (comma-separated), credentials on, same list
  for Socket.IO. Origin/Referer check middleware on all state-changing requests as CSRF
  defence, with cookies `SameSite=Lax`, `HttpOnly`, `Secure` in production, and the refresh
  cookie path-scoped to `/api/v1/auth/refresh`.
- Rate limits (`express-rate-limit`): global 300 / 15 min per IP; auth routes 10 / 15 min per
  IP; per-account lockout after 5 failed logins with exponential backoff (15 min → 1 h);
  messages 30 / min per user; uploads 20 / h per user; username check 30 / min. Socket
  events: typing 1 / 2 s, send 30 / min; excess is dropped with an ack error.
- Validation on every route and socket event with the shared Zod schemas; reject unknown
  keys; validate ObjectId params; trim and length-cap all strings; NFKC-normalise and
  lowercase usernames.
- Uploads: `multer` memory storage → `file-type` magic-byte check → `sharp` re-encode (strip
  EXIF, cap 2048 px, webp/jpeg) → `cloudinary.uploader.upload_stream` with `resource_type`,
  `folder: ghosted/<env>/<kind>`, `allowed_formats`, `unique_filename`. Store `publicId`;
  delete assets when a message, avatar, or account is deleted. Limits: images 5 MB, files
  20 MB, audio 10 MB, avatar 2 MB. Never accept base64 bodies or remote URLs.
- Passwords: 8–72 chars, bcrypt cost 12, reject a top-10k common-passwords list, run bcrypt
  against a dummy hash when the user does not exist to equalise timing.
- Tokens: access JWT 15 min (`sub`, `sid`, `iat`); refresh 30 days, random 256-bit, stored as
  SHA-256; rotation on every refresh; reuse of a rotated token revokes the whole family;
  password change and account disable revoke all sessions and emit `session:revoked`.
- Uniform "Invalid credentials" for login and enable; forgot-password always responds 200.
- Authorization lives in services: only participants read/write a conversation; nobody can
  message self, blocked, disabled, or deleted users; edit and delete-for-everyone apply only
  to own messages.
- Logging with `pino` + `pino-http`, request ids, redaction of cookies, auth headers, and
  passwords; security events (login failure, lockout, token reuse, revocation) at `warn`.
- Global error handler returning the envelope and never a stack; 404 handler; env validated at
  boot; DB connected before `listen`; graceful shutdown on SIGTERM (close io, http, mongoose);
  `/health` and `/health/ready`.
- `npm audit --audit-level=high` clean; dependencies pinned with lockfiles; no secrets in git.

**Frontend hardening and resilience**
- Never `dangerouslySetInnerHTML`; linkify through a vetted library; only render `<img>` whose
  host is the configured Cloudinary cloud or a local `blob:` preview.
- API client: credentials on, a single in-flight refresh with queued retries on 401, then
  logout; retries with backoff only for idempotent GETs and network errors.
- Socket client: auto-reconnect with backoff, `sync` on reconnect for every open conversation,
  rejoin rooms, offline banner from `navigator.onLine` + socket state, an outgoing queue
  while offline that flushes in order.
- Store hygiene: one socket instance, listeners registered once in a provider, cleanup on
  logout, `AbortController` cancels in-flight fetches when switching conversations, message
  list virtualised (`react-virtuoso`) once a conversation holds more than 200 messages.
- Route-level `ErrorBoundary` with a retry button; lazy-loaded routes; code-split emoji
  picker and lightbox.
- Dates via `date-fns` in the viewer's timezone and locale.

## 11. Tooling, testing, documentation

- Root `package.json`: workspaces, scripts `dev` (concurrently backend + frontend), `build`,
  `start`, `lint`, `format`, `test`, `test:e2e`, `migrate`, `seed`.
- ESLint flat config + Prettier shared across packages; Husky + lint-staged pre-commit; `.nvmrc`.
- `.env.example` in `backend/` and `frontend/` with every variable documented.
- Backend tests (Vitest + Supertest + `mongodb-memory-server`): auth lifecycle including refresh
  rotation and reuse detection, validation errors for every route, rate limiting, lockout,
  authorization (non-participant 403, blocked 403), upload rejection of non-images, socket
  auth rejection and message delivery via `socket.io-client`, migration on a fixture dataset.
- Frontend tests (Vitest + React Testing Library): stores, composer behaviour, message list
  rendering (grouping, status, deleted, reply), auth form validation.
- E2E (Playwright, one smoke spec): two browser contexts sign up, start a chat, exchange a
  message, and see typing and seen status.
- GitHub Actions: lint → test → build → audit on push and PR.
- Docker: multi-stage `Dockerfile` and `docker-compose.yml` with MongoDB for local dev.
- Seed script creating demo users and conversations.
- Docs: rewritten `README.md` (features, architecture diagram, setup, env vars, scripts,
  deployment), `docs/API.md`, `docs/SOCKET_EVENTS.md`, `SECURITY.md` (threat model and
  reporting), `CHANGELOG.md`.

## 12. Delivery plan and acceptance criteria

Work phase by phase. At the end of each phase: lint, tests, and build are green; commit with
conventional messages (one commit per logical step); update docs; then write a report with
what changed, how to verify it manually, and known gaps. Do not start the next phase until
told to continue.

**Phase 0 — Foundation and hardening.** Workspaces and `shared/`, env validation, logger,
error and 404 handlers, helmet / CORS / origin check, rate limiting, Zod validation
everywhere, auth rewrite (sessions, refresh rotation, lockout, uniform errors, cookie
options), socket auth and multi-device presence, upload pipeline, serializers, indexes,
health, graceful shutdown, migration script, test scaffolding with the security tests above,
CI. **Accept when:** all 24 defects in section 3 are closed and each security item has a
failing-then-passing test.

**Phase 1 — Chat core and new shell.** Conversations model and endpoints, pagination,
optimistic send, statuses, typing, unread and notifications, reconnect sync, search, new
layout (desktop three-pane, mobile routes), themes, new auth pages, composer, sidebar,
message list with grouping and day separators. **Accept when:** the Playwright smoke test
passes and the app works on a 375 px viewport without horizontal scroll.

**Phase 2 — Rich messaging and account.** Reply, edit, delete, reactions, image grid and
lightbox, files, voice, block, profiles, settings rewrite, sessions, password change,
email flows (gated), command palette. **Accept when:** every P0 and P1 item in section 8 is
demonstrable and documented.

**Phase 3 — Stretch.** Groups, PWA/push, link previews, 2FA, Redis flag. Each behind a
feature flag and individually shippable.

## 13. Rules for the implementer

- Keep the Render deployment working at every phase; never require a paid service.
- Preserve existing accounts and messages through the migration; test it on a copy first.
- Do not downgrade any dependency; prefer well-maintained libraries over hand-rolled crypto,
  sanitisation, or rate limiting.
- No `console.log` in shipped code; use the logger.
- Keep bundle size reasonable: lazy-load routes and heavy widgets; inspect the Vite build
  output before finishing Phase 1.
- When a requirement here conflicts with something you discover in the code, state the
  conflict in your report and choose the safer option.
- Ask before any destructive operation against a non-local database.
