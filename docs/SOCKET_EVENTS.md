# Ghosted realtime contract (Socket.IO)

Namespace: `/` (default). Event names live in `@ghosted/shared` as `SOCKET_EVENTS`.

## Handshake

The server authenticates the connection from the `access` cookie sent with the handshake —
nothing in the query string or `auth` payload is trusted. In the browser this means
`io(url, { withCredentials: true })` (or no URL at all when the client is served by the API /
Vite proxy).

Rejected handshakes raise `connect_error` on the client with `err.message` set to:

| Message            | Meaning                                       | Client action                              |
| ------------------ | --------------------------------------------- | ------------------------------------------ |
| `UNAUTHORIZED`     | No/invalid cookie, revoked session            | Call `POST /api/v1/auth/refresh`, reconnect |
| `TOKEN_EXPIRED`    | Access token expired                          | Same as above                              |
| `ACCOUNT_DISABLED` | Account disabled                              | Show the enable flow                       |

Each socket joins the room `user:<userId>`; everything addressed to a user goes to that room, so
all of their devices receive it.

## Server → client

| Event               | Payload                                                      | Notes                                                           |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `presence:snapshot` | `{ userIds: string[] }`                                      | Sent once right after connecting                                |
| `presence:update`   | `{ userId, online: boolean, lastSeenAt: string \| null }`    | Diffs only; `lastSeenAt` is `null` when the user hides it       |
| `message:new`       | `Message`                                                    | Sent to the receiver and to the sender's other devices          |
| `typing`            | `{ from: userId, isTyping: boolean }`                        |                                                                 |
| `user:updated`      | `{ user: PublicUser }`                                       | Name/username/avatar changes                                    |
| `user:disabled`     | `{ userId }`                                                 | Remove from lists, close the open chat                          |
| `user:deleted`      | `{ userId }`                                                 |                                                                 |
| `session:revoked`   | `{ reason: "password_change" \| "logout_all" \| "revoked_by_user" }` | Emitted right before the server disconnects that socket |

## Client → server

All client events are validated with the shared Zod schemas and acknowledged with
`{ ok: true }` or `{ ok: false, error: "VALIDATION_ERROR" }`.

| Event          | Payload           | Notes                                                                 |
| -------------- | ----------------- | --------------------------------------------------------------------- |
| `typing:start` | `{ to: userId }`  | Relayed at most once every 2 s per recipient (`{ ok, throttled }`)    |
| `typing:stop`  | `{ to: userId }`  |                                                                       |

## Limits and presence rules

- A socket may send at most 40 events per 10 seconds; extra events are dropped (no ack).
- A user is **online** while at least one of their sockets is connected.
- `lastSeenAt` is persisted about 10 seconds after the last socket disconnects.
- Disabling an account, deleting it, changing the password (other devices) or revoking a
  session disconnects the affected sockets from the server side.
