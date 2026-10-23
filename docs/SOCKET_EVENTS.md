# Ghosted realtime contract (Socket.IO)

Namespace: `/` (default). Event names live in `@ghosted/shared` as `SOCKET_EVENTS`.

## Handshake

The server authenticates the connection from the `access` cookie sent with the handshake —
nothing in the query string or `auth` payload is trusted. In the browser this means
`io(url, { withCredentials: true })` (or no URL at all when the client is served by the API /
Vite proxy).

Rejected handshakes raise `connect_error` on the client with `err.message` set to:

| Message            | Meaning                            | Client action                               |
| ------------------ | ---------------------------------- | ------------------------------------------- |
| `UNAUTHORIZED`     | No/invalid cookie, revoked session | Call `POST /api/v1/auth/refresh`, reconnect |
| `TOKEN_EXPIRED`    | Access token expired               | Same as above                               |
| `ACCOUNT_DISABLED` | Account disabled                   | Show the enable flow                        |

Each socket joins the room `user:<userId>`; everything addressed to a user goes to that room, so
all of their devices receive it. With `REDIS_URL` set the server uses the Redis adapter, so rooms
and broadcasts span every API instance.

## Server → client

| Event                  | Payload                                                                   | Notes                                                                                     |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `presence:snapshot`    | `{ userIds: string[] }`                                                   | Sent once right after connecting                                                          |
| `presence:update`      | `{ userId, online: boolean, lastSeenAt: string \| null }`                 | Diffs only; `lastSeenAt` is `null` when the user hides it                                 |
| `message:new`          | `{ conversationId, message }`                                             | Sent to every current participant, including the sender's other devices. `message.type === "system"` for group events |
| `message:updated`      | `{ conversationId, message }`                                             | After an edit, and when a link preview has been fetched                                   |
| `message:deleted`      | `{ conversationId, messageId, scope: "me" \| "everyone", message? }`      | `me` goes only to the deleting user's devices; `everyone` carries the placeholder message |
| `message:reaction`     | `{ conversationId, messageId, reactions: [{ emoji, userIds }] }`          | Full reaction list after any change                                                       |
| `conversation:updated` | `{ conversation }`                                                        | The recipient's own view (unread, flags, cursors, membership). Follows sends, reads, edits, flag changes and group changes; also how a newly added member first learns of a group |
| `conversation:removed` | `{ conversationId, reason: "left" \| "removed" \| "deleted" }`            | You are no longer part of this conversation: drop it locally and leave the chat if open    |
| `message:status`       | `{ conversationId, userId, status: "delivered" \| "seen", at }`           | "Everything up to `at` is now delivered/seen by `userId`" — update that participant's cursor |
| `typing`               | `{ conversationId, userId, isTyping }`                                    | Not relayed between users who block each other; in groups each member types independently |
| `user:updated`         | `{ user: PublicUser }`                                                    | Name/username/avatar changes                                                              |
| `user:disabled`        | `{ userId }`                                                              | Drop direct conversations with them, close the open chat                                  |
| `user:deleted`         | `{ userId, conversationIds }`                                             | Same; their direct conversations were deleted server-side (groups get a `member_left` notice instead) |
| `session:revoked`      | `{ reason: "password_change" \| "logout_all" \| "revoked_by_user" }`      | Emitted right before the server disconnects that socket                                   |

## Client → server

All client events are validated with the shared Zod schemas and acknowledged with
`{ ok: true }` or `{ ok: false, error: "VALIDATION_ERROR" | "NOT_FOUND" }`.

| Event                | Payload                                      | Notes                                                                                 |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `conversation:open`  | `{ conversationId }`                         | Joins `conv:<id>`; current membership is checked                                      |
| `conversation:close` | `{ conversationId }`                         |                                                                                       |
| `typing:start`       | `{ conversationId }`                         | Relayed to the other current members at most once every 2 s (`{ ok, throttled }`)     |
| `typing:stop`        | `{ conversationId }`                         |                                                                                       |
| `sync`               | `{ conversations: [{ id, since? }] }` (≤ 20) | Ack: `{ ok, conversations: [{ id, messages: Message[] }] }` with up to 100 messages newer than `since` per conversation; also marks them delivered |

## Delivery and read semantics

- Sending a message sets the sender's own read/delivered cursors and, for recipients who are
  online at that moment, their delivered cursor — the sender sees "delivered" immediately via
  `conversation:updated`.
- Recipients who were offline get "delivered" when they next fetch their conversation list or
  `sync`; the sender is told through `message:status`. Offline recipients with a subscribed
  device also get a Web Push notification (when `VAPID_*` is configured).
- `POST /conversations/:id/read` moves the reader's cursor and emits `message:status` with
  `status: "seen"` to the others, unless the reader has read receipts turned off.
- System messages (group events) update `lastMessage` but never unread counters.

## Limits and presence rules

- A socket may send at most 60 events per 10 seconds; extra events are dropped (no ack).
- A user is **online** while at least one of their sockets is connected to any instance.
- `lastSeenAt` is persisted about 10 seconds after the last socket disconnects.
- Disabling an account, deleting it, changing or resetting the password (other devices) or
  revoking a session disconnects the affected sockets from the server side.
- Membership used for typing relays is cached per socket for 30 s, so a removed member may
  receive typing signals for up to half a minute (nothing else leaks: messages are addressed
  from the database).
- Blocking is enforced on direct sends, typing relays and search; the global presence broadcast
  is not filtered, so clients hide the online dot for blocked relations using the `blocked`
  flags that REST responses carry.
