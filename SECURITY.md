# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Email the maintainer (see the GitHub
profile of the repository owner) with a description and reproduction steps. You will get an
acknowledgement within a few days.

## Threat model and controls

| Threat                                   | Control                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Credential stuffing / brute force        | bcrypt (cost 12), zxcvbn strength check, per-IP auth rate limit, per-account lockout with backoff, uniform error messages, dummy-hash comparison for unknown users |
| Session theft / replay                   | 15-minute access JWT + rotating refresh token stored as SHA-256, replay of a rotated token revokes the session, HttpOnly cookies, `Secure` in production, refresh cookie path-scoped |
| CSRF                                     | `SameSite=Lax` cookies, Origin/Referer/`Sec-Fetch-Site` check on every state-changing request, CORS allowlist |
| Socket impersonation                     | Handshake authenticated from the access cookie; query parameters are ignored; revoked sessions are refused |
| Injection (NoSQL / mass assignment)      | Every body, query and param validated with strict Zod schemas (unknown keys rejected, operators impossible) |
| Malicious uploads                        | Multipart only, size limits, MIME filter, magic-byte verification with `file-type`, re-encoding with `sharp` (strips metadata, caps dimensions), Cloudinary `allowed_formats`, no remote URLs or base64 bodies |
| XSS                                      | React escaping, no `dangerouslySetInnerHTML`, strict CSP (`default-src 'self'`, images only from self/data/blob/Cloudinary), helmet headers |
| Information leakage                      | Field-whitelisting serializers (password hashes, lockout counters, emails of other users never leave the API), generic 500 responses, pino redaction of cookies/passwords |
| Account enumeration                      | Identical responses for unknown user vs wrong password on login and enable                        |
| Denial of service                        | 100 kB JSON limit, per-route rate limits, socket event budget, bounded pagination, bcrypt input capped at 72 bytes |
| Misconfiguration                         | Environment validated at boot (fail fast), secrets never committed, `.env.example` documents every variable |

## Operational notes

- Run behind TLS; set `NODE_ENV=production` and `TRUST_PROXY=1` behind a reverse proxy.
- Rotate `JWT_SECRET` to invalidate every access token at once; refresh sessions are stored in
  MongoDB and can be revoked per user from the sessions API.
- `npm audit --audit-level=high` runs in CI.
