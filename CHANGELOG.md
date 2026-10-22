# Changelog

All notable changes to Ghosted are documented here. The project follows the phased plan in
`REVAMP_PROMPT.md`.

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
