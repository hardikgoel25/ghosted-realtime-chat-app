# Changelog

All notable changes to Ghosted are documented here. The project follows the phased plan in
`REVAMP_PROMPT.md`.

## [2.3.0-phase3] — 2026-10-23 — Groups, PWA, link previews, 2FA, Redis

Each feature has its own flag and ships independently (`FEATURE_GROUPS`,
`FEATURE_LINK_PREVIEWS`, `FEATURE_TWO_FACTOR`, `VAPID_*` for push, `REDIS_URL` for Redis).
`GET /api/v1/config` tells the client which are on.

### Added
- **Group chats.** Create a group from the "New group" tab, add people, name and describe it,
  set a photo. Admins manage members and roles; the last admin to leave hands over to the
  longest-standing member and the last member out deletes the group. Group events are
  system messages ("Alice added Bob") that never count as unread. Former members keep their
  name in history; new members see only what follows their joining. Sender names and
  colours in bubbles, "seen by" avatars under your latest message, typing names, member
  count in the header, a group info drawer, and the `conversation:removed` socket event.
  Admins may delete anyone's message for everyone. Blocks do not break groups.
- **PWA.** Installable (manifest, icons, Install card in Settings › Notifications), an
  app shell that opens offline, cached chat images, and a "new version" prompt instead of
  swapping code under an open session. The service worker also drives notifications.
- **Web Push.** With a VAPID key pair configured, members who are offline (on every
  device) get a push for new messages, respecting mutes and the "show preview" setting.
  Subscriptions are per device, tied to the session, and removed on sign-out.
- **Link previews.** The first link in a message gets a title/description/site card,
  fetched server-side with SSRF protection (no private addresses, pinned connection,
  re-validated redirects, 5 s / 1 MB limits) and cached per URL. Images are delivered
  through Cloudinary's fetch URL, so the CSP image allowlist is unchanged.
- **Two-factor authentication (TOTP).** Turn it on from Settings › Account with any
  authenticator app; ten single-use recovery codes; sign-in and account re-enabling become a
  two-step flow with a single-use challenge. Secrets are stored encrypted.
- **Redis flag.** `REDIS_URL` switches Socket.IO to the Redis adapter and presence to a
  shared, heartbeat-based implementation so several API instances can run at once.
- Tests for groups (REST and realtime), link previews (guards and end-to-end against a local
  fixture server), 2FA, push, and the Redis presence logic (against an in-memory fake);
  Playwright scenario for creating, chatting in and leaving a group.

### Changed
- `DELETE /conversations/:id` on a group leaves it. Message search skips system messages.
- Date helpers take the reference time from the caller, so their tests do not depend on the
  wall clock.
- Service worker and manifest are served with `no-cache`; hashed assets stay immutable.
- All packages report version 2.3.0 (the health endpoint previously said 2.0.0).

## [2.2.0-phase2] — 2026-10-22 — Rich messaging and account

### Added
- **Message actions.** Reply with a quoted snapshot (click the quote to jump to the original),
  edit your own messages for 15 minutes (shows "edited"), delete for me, delete for everyone
  (placeholder stays, assets are removed), copy text, message info with delivered/seen times,
  emoji reactions with a quick bar and a full picker, hover toolbar on desktop and long-press
  menu on phones.
- **Attachments beyond photos.** Documents (PDF, Office, ZIP, text/CSV/Markdown/JSON, up to
  20 MB) as download chips and voice messages recorded in the browser (MediaRecorder, up to
  10 minutes) with an inline player and playback speed. All uploads are verified by their bytes,
  not their names.
- **Blocking.** Block/unblock from the chat header, details drawer, profile page or Privacy
  settings. Blocked pairs cannot message, find each other in search or see each other's
  presence; existing history stays readable.
- **Search inside a conversation** with highlighted results and jump-to-context; the message
  list can page in both directions from a search hit.
- **Mark as unread**, from the chat menu or the sidebar context menu.
- **Email verification and password reset**, active only when `SMTP_URL` is set: add/verify an
  email in Profile settings, "Forgot password?" on the login page, single-use expiring tokens,
  reset signs out every device. The server advertises what is enabled on `GET /api/v1/config`.
- **Command palette** (Ctrl/⌘ K): jump to chats, settings, themes, start a chat or log out.
- Emoji picker in the composer, drag-and-drop for documents, automatic retry of messages that
  failed for lack of connectivity.
- Backend tests for message actions, blocking, email flows and document/voice uploads;
  Playwright scenario covering reply, reaction, edit and delete.

### Changed
- `/conversations/:id/messages` accepts `after` and `around` cursors and returns
  `newerCursor`; message attachments carry `kind`; `lastMessage` carries `deletedAt`.
- Account deletion also removes blocks and email tokens.
- Migration `003-attachments` tags pre-existing attachments.

## [2.1.0-phase1] — 2026-10-22 — Chat core and new shell

### Added
- **Conversations model.** Direct chats are first-class documents with per-participant read and
  delivery cursors, unread counters, mute (with duration), pin, archive and "delete for me".
  New `/api/v1/conversations` endpoints replace `/api/v1/messages/:userId`; migration
  `002-conversations` groups existing messages into conversations and moves images into
  `attachments`.
- **Delivery states.** Sent / delivered / seen ticks derived from participant cursors,
  reciprocal read-receipt privacy, `message:status` and `conversation:updated` socket events,
  delivered-on-fetch and delivered-on-sync, `sync` catch-up after reconnects.
- **Optimistic sending** with pending state, failure + retry/discard, idempotent `clientId`,
  automatic retry queue when connectivity returns, multi-image messages (up to 4) resized in
  the browser before upload, paste and drag-and-drop.
- **New UI shell** on Tailwind 4 + DaisyUI 5: two custom Ghosted themes (dark/light) plus six
  curated themes and a System option applied before first paint; Inter self-hosted; two-pane
  desktop layout with an optional details drawer; phone layout driven by routes (`/`,
  `/c/:id`, `/u/:username`, `/settings/:section`) with deep links preserved through login.
- Sidebar with search, All / Unread / Archived tabs, previews, relative times, unread badges,
  typing state, pin/mute icons, right-click and long-press context menu; "New chat" dialog
  with user search.
- Virtualised message list with upward infinite scroll that keeps scroll position, day
  separators, grouped bubbles, "new messages" divider, jump-to-latest button, safe link
  detection, long-message collapsing, image grid and keyboard-navigable lightbox.
- Composer with auto-growing textarea, Enter to send, drafts per conversation, attachment
  previews, character counter and offline awareness; typing indicators per conversation.
- Notifications: toast with "Open" action, receive sound, optional desktop notifications,
  title badge; muted chats stay silent.
- Settings pages: Profile, Appearance, Notifications, Privacy (last seen, read receipts),
  Account (change password, device sessions with revoke / sign out everywhere, disable, delete).
- Public profile page (`/u/:username`) with a Message button.
- Playwright smoke suite (two users chatting on desktop and mobile viewports, deep-link
  redirect) with a self-contained production server + in-memory MongoDB; frontend unit tests
  for formatting, linkification and status derivation; CI runs both.

### Changed
- Account deletion now removes the user's direct conversations (and their messages) and tells
  clients which ones.
- `user:deleted` carries `conversationIds`; typing events are keyed by conversation.
- Socket event budget raised to 60 per 10 s; sonner replaces react-hot-toast.

### Removed
- Legacy `/api/v1/messages` routes, old page/components, Tailwind 3 and DaisyUI 4 config,
  `react-hot-toast`.

## [2.0.0-phase0] — 2026-10-22 — Foundation and hardening

### Added
- npm-workspaces monorepo (`shared`, `backend`, `frontend`) with a shared package of Zod schemas and constants.
- Session-based auth: 15-minute access JWT + 30-day rotating refresh token (hashed in MongoDB), replay detection, per-session revocation, sessions API, `logout-all`, password change that signs out other devices.
- Account lockout after repeated failed logins, zxcvbn password strength checks, uniform credential errors, constant-time handling of unknown users.
- Request validation on every route with strict schemas; versioned API under `/api/v1` with a uniform `{ ok, data | error }` envelope, JSON 404s and a global error handler.
- helmet security headers + CSP, CORS allowlist from `CLIENT_ORIGINS`, CSRF origin check, per-route rate limits, 100 kB body limit.
- Upload pipeline: multipart only, magic-byte validation, `sharp` re-encoding (EXIF stripped, size capped), Cloudinary `upload_stream`, asset cleanup on avatar replacement, message deletion and account deletion.
- Authenticated Socket.IO handshake from the access cookie; multi-device presence; `presence:update` diffs; typing indicators; `user:updated/disabled/deleted` and `session:revoked` events; per-socket event budget.
- Cursor pagination for messages and users, user search, idempotent sends via `clientId`.
- Unread counters, receive sound and toast for messages in other chats, tab-title badge, "last seen" with privacy flag.
- Locally generated initials avatars (no third-party avatar service).
- pino structured logging with redaction and request ids, Zod-validated environment, health/readiness endpoints, graceful shutdown.
- Idempotent migration (`001-users`) that converts existing accounts; runs on every start.
- Vitest integration suite (auth, validation, authz, CSRF, headers, rate limits, uploads, sockets, migration), GitHub Actions CI, ESLint flat config + Prettier, Husky + lint-staged, `.env.example` files, API/socket/security docs.
- `npm run dev:local`: zero-install local MongoDB (binary managed by mongodb-memory-server, data persisted in `backend/.data`) for development without Atlas; optional `DNS_SERVERS` for networks whose resolver refuses the SRV lookups behind `mongodb+srv://`.

### Changed
- Frontend talks to `/api/v1` through a client that unwraps the envelope, refreshes expired sessions once and shows each error exactly once.
- Dev server proxies `/api` and `/socket.io` so cookies stay same-origin.
- Profile page can edit full name and username; signup form checks username availability live and offers the full gender list.
- Avatars moved from `profilePic` (string) to `avatar { url, publicId }`.

### Fixed
- All 24 defects listed in `REVAMP_PROMPT.md` §3, including socket impersonation, password-hash leaks in auth responses, NoSQL operator injection, unvalidated Cloudinary uploads, hardcoded origins, double toasts, duplicate sockets, single-socket presence, and the gender enum mismatch.

### Security
- See `SECURITY.md` for the threat model.
