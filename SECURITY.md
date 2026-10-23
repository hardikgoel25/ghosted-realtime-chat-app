# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Email the maintainer (see the GitHub
profile of the repository owner) with a description and reproduction steps. You will get an
acknowledgement within a few days.

## Threat model and controls

| Threat                                   | Control                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Credential stuffing / brute force        | bcrypt (cost 12), zxcvbn strength check, per-IP auth rate limit, per-account lockout with backoff (wrong passwords and wrong 2FA codes alike), uniform error messages, dummy-hash comparison for unknown users |
| Password compromise                      | Optional TOTP two-factor authentication: the password step returns a signed single-use challenge (5 min) instead of cookies; the code step needs a 6-digit app code or a single-use recovery code. TOTP secrets are stored AES-256-GCM encrypted under a key derived (HKDF) from `JWT_SECRET`; recovery codes are stored as SHA-256 hashes |
| Session theft / replay                   | 15-minute access JWT + rotating refresh token stored as SHA-256, replay of a rotated token revokes the session, HttpOnly cookies, `Secure` in production, refresh cookie path-scoped; push subscriptions are tied to the session and removed with it |
| CSRF                                     | `SameSite=Lax` cookies, Origin/Referer/`Sec-Fetch-Site` check on every state-changing request, CORS allowlist |
| Socket impersonation                     | Handshake authenticated from the access cookie; query parameters are ignored; revoked sessions are refused |
| Injection (NoSQL / mass assignment)      | Every body, query and param validated with strict Zod schemas (unknown keys rejected, operators impossible) |
| Malicious uploads                        | Multipart only, size limits, MIME filter, magic-byte verification with `file-type`, re-encoding with `sharp` (strips metadata, caps dimensions), Cloudinary `allowed_formats`, no remote URLs or base64 bodies |
| Server-side request forgery (link previews) | Only `http(s)` on the default ports, no credentials in the URL, hostnames resolved and every address checked against private/loopback/link-local/multicast/reserved ranges (IPv4, IPv6 and v4-mapped), the validated address pinned for the TCP connection (no DNS rebinding), redirects re-validated (max 3), 5 s timeout, 1 MB cap, HTML only, bounded concurrency, results cached. Preview images are never loaded from the third-party host: they go through Cloudinary's signed fetch delivery or are dropped |
| XSS                                      | React escaping, no `dangerouslySetInnerHTML`, strict CSP (`default-src 'self'`, images/media only from self/data/blob/Cloudinary), helmet headers; link preview text is plain text, never markup |
| Information leakage                      | Field-whitelisting serializers (password hashes, lockout counters, TOTP secrets, recovery codes and emails of other users never leave the API), generic 500 responses, pino redaction of cookies/passwords |
| Account enumeration                      | Identical responses for unknown user vs wrong password on login and enable                        |
| Group abuse                              | Only admins change name/photo/membership/roles; blocked relations cannot be added; new members only see what follows their joining; a removed member's sockets leave the room and the client is told to drop the chat; typing-relay membership is cached for at most 30 s |
| Push notification abuse                  | Subscriptions require a logged-in session and an `https` endpoint; payloads are built server-side from data the recipient may already see; previews are omitted when the recipient turned them off; dead endpoints are pruned |
| Denial of service                        | 100 kB JSON limit, per-route rate limits, socket event budget, bounded pagination, bcrypt input capped at 72 bytes, link preview fetches bounded in time, size and concurrency |
| Misconfiguration                         | Environment validated at boot (fail fast), secrets never committed, `.env.example` documents every variable, feature flags default to safe values |

## Operational notes

- Run behind TLS; set `NODE_ENV=production` and `TRUST_PROXY=1` behind a reverse proxy.
- Rotate `JWT_SECRET` to invalidate every access token at once; refresh sessions are stored in
  MongoDB and can be revoked per user from the sessions API. Note that TOTP secrets are
  encrypted under a key derived from `JWT_SECRET`, so rotating it also requires users to set up
  two-factor authentication again (they are told at sign-in).
- Web Push needs a VAPID key pair (`npx web-push generate-vapid-keys`); keep the private key
  with the other secrets.
- `LINK_PREVIEW_ALLOW_PRIVATE` is ignored in production; it only exists so tests and local
  development can preview pages on `localhost`.
- `npm audit --audit-level=high` runs in CI.
