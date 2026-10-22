# 💬 Ghosted — Realtime Chat App

A full-stack realtime chat application built with React, Express, MongoDB and Socket.IO.
Version 2 is a ground-up hardening and expansion of the original app; see
[`REVAMP_PROMPT.md`](./REVAMP_PROMPT.md) for the full roadmap and [`CHANGELOG.md`](./CHANGELOG.md)
for what each phase delivered.

👉 [GitHub Repo](https://github.com/hardikgoel25/ghosted-realtime-chat-app)

---

## ✨ Features (current)

- Realtime 1-1 messaging over authenticated Socket.IO connections
- Multi-device presence (online while any tab is open), last-seen with a privacy toggle
- Typing indicators, unread counters, receive/send sounds, tab-title badge
- Cursor-paginated message history, image messages (validated, re-encoded, EXIF-stripped)
- Username/password auth with short-lived access tokens + rotating refresh sessions
- Device/session management (list, revoke one, sign out everywhere), password change
- Profile editing (name, username with live availability check, bio, gender, avatar)
- Account disable / re-enable / permanent delete (with media cleanup)
- Brute-force protection, account lockout, rate limits, CSRF origin checks, security headers
- 32 DaisyUI themes

## 🛠️ Tech stack

| Layer    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| Frontend | React 19, Vite, Zustand, React Router, Tailwind CSS + DaisyUI, lucide     |
| Backend  | Node 20+, Express 5, Mongoose 8, Socket.IO 4, Zod, pino, helmet, multer   |
| Shared   | `@ghosted/shared` — Zod schemas and constants used by both sides          |
| Media    | Cloudinary (uploads are validated with `file-type` and re-encoded by `sharp`) |
| Tests    | Vitest, Supertest, mongodb-memory-server, socket.io-client                |

## 📁 Repository layout

```
.
├── backend/          Express API + Socket.IO server
│   ├── src/config/      env (Zod-validated), db, logger, cloudinary
│   ├── src/models/      User, Session, Message
│   ├── src/middleware/  auth, validate, rateLimit, origin (CSRF), upload, error
│   ├── src/services/    auth, token, user, message, media, presence
│   ├── src/controllers/ thin HTTP handlers
│   ├── src/routes/v1/   /api/v1/*
│   ├── src/sockets/     handshake auth, presence, typing, emit helpers
│   ├── src/migrations/  idempotent data migrations (run on every start)
│   └── tests/           integration tests
├── frontend/         Vite + React client
├── shared/           Zod schemas + constants shared by both packages
└── docs/             API and socket event reference
```

## ⚙️ Prerequisites

- Node.js 20.19+ (see `.nvmrc`)
- MongoDB (local, Docker, or Atlas)
- A Cloudinary account if you want image uploads (optional — uploads answer 503 without it)

## 🚀 Getting started

```bash
git clone https://github.com/hardikgoel25/ghosted-realtime-chat-app.git
cd ghosted-realtime-chat-app
npm install                      # installs all workspaces

cp backend/.env.example backend/.env
# edit backend/.env: MONGODB_URI, JWT_SECRET (>= 32 chars), Cloudinary keys (optional)

npm run dev                      # API on :5001, web on :5173 (API proxied, same-origin cookies)
```

Optional: `npm run seed` creates three demo users (`alice`, `bob`, `casey`, password printed by
the script).

## 📜 Scripts (run from the repo root)

| Script                 | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Backend (`node --watch`) + frontend (Vite) together         |
| `npm run build`        | Installs deps and builds the frontend into `frontend/dist`  |
| `npm start`            | Runs pending migrations, then starts the API (serves `dist` in production) |
| `npm test`             | Backend integration tests (spins up an in-memory MongoDB)   |
| `npm run lint`         | ESLint across all packages                                  |
| `npm run format`       | Prettier                                                    |
| `npm run migrate`      | Runs migrations (`-- --dry-run` to preview)                 |
| `npm run seed`         | Creates demo users (refuses in production without `--force`)|

## 🔐 Environment variables (`backend/.env`)

| Variable                 | Required | Default                 | Notes                                                  |
| ------------------------ | -------- | ----------------------- | ------------------------------------------------------ |
| `MONGODB_URI`            | yes      | —                       | Connection string                                      |
| `JWT_SECRET`             | yes      | —                       | ≥ 32 random characters; signs access tokens            |
| `NODE_ENV`               | no       | `development`           | `production` enables secure cookies, HSTS, static serving |
| `PORT`                   | no       | `5001`                  |                                                        |
| `CLIENT_ORIGINS`         | no       | `http://localhost:5173` | Comma-separated origins allowed for CORS / CSRF check  |
| `TRUST_PROXY`            | no       | `1` in prod, else `0`   | Proxy hops to trust (Render needs 1)                   |
| `ACCESS_TOKEN_TTL`       | no       | `15m`                   | Access token lifetime                                  |
| `REFRESH_TOKEN_TTL_DAYS` | no       | `30`                    | Session lifetime (sliding)                             |
| `LOG_LEVEL`              | no       | `debug` / `info`        | pino level                                             |
| `CLOUDINARY_CLOUD_NAME`  | no       | —                       | All three Cloudinary vars enable uploads               |
| `CLOUDINARY_API_KEY`     | no       | —                       |                                                        |
| `CLOUDINARY_API_SECRET`  | no       | —                       |                                                        |

The frontend needs no env in development. Set `VITE_API_URL` only if the API lives on another
host (see `frontend/.env.example`).

## 🧪 Testing

```bash
npm test
```

The suite covers auth (signup validation, uniform errors, lockout, refresh rotation and reuse
detection, logout, sessions, password change, disable/enable/delete), validation and the error
envelope, authorization, CSRF origin checks, security headers, rate limiting, uploads (magic-byte
checks, size limits, mock Cloudinary), the Socket.IO handshake (cookie auth, forged ids ignored,
multi-device presence, message delivery, typing) and the data migration. Tests download a MongoDB
binary on first run; set `MONGODB_TEST_URI` to use an existing server instead.

## ☁️ Deployment (Render)

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment:** `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, Cloudinary keys,
  `TRUST_PROXY=1`, and `CLIENT_ORIGINS=https://<your-app>.onrender.com`.

In production the API serves the built frontend from `frontend/dist`, so cookies are first-party
and no CORS configuration is needed. Migrations run automatically on start and are idempotent.

## 📚 More docs

- [`docs/API.md`](./docs/API.md) — REST endpoints and payloads
- [`docs/SOCKET_EVENTS.md`](./docs/SOCKET_EVENTS.md) — realtime contract
- [`SECURITY.md`](./SECURITY.md) — threat model and how to report issues
- [`REVAMP_PROMPT.md`](./REVAMP_PROMPT.md) — full roadmap (Phases 0–3)
