import { create } from "zustand";
import { api } from "../lib/api";
import { loadDrafts, saveDrafts } from "../lib/drafts";

const PAGE_SIZE = 50;
const TYPING_CLEAR_MS = 4000;

const emptyList = () => ({ ids: [], nextCursor: null, loaded: false });

const initialState = () => ({
  byId: {},
  lists: { all: emptyList(), archived: emptyList() },
  loading: {},
  /** conversationId -> { userId: true } */
  typing: {},
});

const typingTimers = new Map();

const uniq = (ids) => [...new Set(ids)];

const maxDate = (a, b) => {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
};

/** Puts a conversation in the right list(s) according to its archived flag. */
function placeInLists(lists, conversation) {
  const id = conversation._id;
  const archived = Boolean(conversation.me?.archived);
  return {
    all: {
      ...lists.all,
      ids: archived ? lists.all.ids.filter((x) => x !== id) : uniq([id, ...lists.all.ids]),
    },
    archived: {
      ...lists.archived,
      ids: archived
        ? uniq([id, ...lists.archived.ids])
        : lists.archived.ids.filter((x) => x !== id),
    },
  };
}

export const useConversationStore = create((set, get) => ({
  ...initialState(),
  drafts: loadDrafts(),

  reset: () => {
    for (const t of typingTimers.values()) clearTimeout(t);
    typingTimers.clear();
    set({ ...initialState() });
  },

  fetchList: async (filter = "all", { more = false } = {}) => {
    const key = filter === "archived" ? "archived" : "all";
    const current = get().lists[key];
    if (get().loading[key]) return;
    if (more && !current.nextCursor) return;
    set((s) => ({ loading: { ...s.loading, [key]: true } }));
    try {
      const params = { filter: key, limit: PAGE_SIZE };
      if (more) params.cursor = current.nextCursor;
      const { items, nextCursor } = await api.get("/conversations", { params, silent: true });
      set((s) => {
        const byId = { ...s.byId };
        for (const c of items) byId[c._id] = c;
        const ids = more
          ? uniq([...s.lists[key].ids, ...items.map((c) => c._id)])
          : items.map((c) => c._id);
        return { byId, lists: { ...s.lists, [key]: { ids, nextCursor, loaded: true } } };
      });
    } catch {
      // Surfaced on next interaction; the socket keeps the list fresh once connected
    } finally {
      set((s) => ({ loading: { ...s.loading, [key]: false } }));
    }
  },

  /** Socket updates carry no block state, so the last known value is kept. */
  upsert: (conversation) =>
    set((s) => {
      const existing = s.byId[conversation._id];
      const merged = {
        ...conversation,
        blocked: conversation.blocked ?? existing?.blocked ?? null,
      };
      return {
        byId: { ...s.byId, [conversation._id]: merged },
        lists: placeInLists(s.lists, merged),
      };
    }),

  remove: (id) =>
    set((s) => {
      const byId = { ...s.byId };
      delete byId[id];
      return {
        byId,
        lists: {
          all: { ...s.lists.all, ids: s.lists.all.ids.filter((x) => x !== id) },
          archived: { ...s.lists.archived, ids: s.lists.archived.ids.filter((x) => x !== id) },
        },
      };
    }),

  /** Returns the conversation, fetching it when it is not cached (deep links, reloads). */
  ensure: async (id) => {
    const cached = get().byId[id];
    if (cached && cached.blocked !== null && cached.blocked !== undefined) return cached;
    try {
      const { conversation } = await api.get(`/conversations/${id}`, { silent: true });
      get().upsert(conversation);
      return conversation;
    } catch {
      return cached ?? null;
    }
  },

  openDirect: async (userId) => {
    const { conversation } = await api.post("/conversations/direct", { userId });
    get().upsert(conversation);
    return conversation;
  },

  markRead: async (id) => {
    const c = get().byId[id];
    if (!c) return;
    const alreadyRead =
      c.me.unread === 0 &&
      (!c.lastMessage ||
        (c.me.lastReadAt && new Date(c.me.lastReadAt) >= new Date(c.lastMessage.createdAt)));
    if (alreadyRead) return;
    const optimistic = { ...c, me: { ...c.me, unread: 0, lastReadAt: new Date().toISOString() } };
    set((s) => ({ byId: { ...s.byId, [id]: optimistic } }));
    try {
      const { conversation } = await api.post(`/conversations/${id}/read`, null, { silent: true });
      get().upsert(conversation);
    } catch {
      // The next incoming update will reconcile
    }
  },

  setFlags: async (id, flags) => {
    try {
      const { conversation } = await api.patch(`/conversations/${id}`, flags);
      get().upsert(conversation);
      return true;
    } catch {
      return false;
    }
  },

  markUnread: (id) => get().setFlags(id, { unread: true }),

  clearChat: async (id) => {
    try {
      await api.delete(`/conversations/${id}`);
      get().remove(id);
      return true;
    } catch {
      return false;
    }
  },

  /** Optimistic preview update when the user sends, before the server echoes it back. */
  bumpLastMessage: (id, message) =>
    set((s) => {
      const c = s.byId[id];
      if (!c) return {};
      const updated = {
        ...c,
        lastMessage: {
          _id: message._id,
          senderId: message.senderId,
          type: message.type,
          text: message.text,
          hasAttachments: (message.attachments?.length ?? 0) > 0,
          deletedAt: null,
          createdAt: message.createdAt,
        },
        lastMessageAt: message.createdAt,
        me: { ...c.me, archived: false },
      };
      return { byId: { ...s.byId, [id]: updated }, lists: placeInLists(s.lists, updated) };
    }),

  applyStatus: ({ conversationId, userId, status, at }) =>
    set((s) => {
      const c = s.byId[conversationId];
      if (!c) return {};
      const participants = c.participants.map((p) =>
        p.userId !== userId
          ? p
          : {
              ...p,
              lastDeliveredAt: maxDate(p.lastDeliveredAt, at),
              lastReadAt: status === "seen" ? maxDate(p.lastReadAt, at) : p.lastReadAt,
            }
      );
      return { byId: { ...s.byId, [conversationId]: { ...c, participants } } };
    }),

  setTyping: (conversationId, userId, isTyping) => {
    const key = `${conversationId}:${userId}`;
    const existing = typingTimers.get(key);
    if (existing) clearTimeout(existing);
    if (isTyping) {
      typingTimers.set(
        key,
        setTimeout(() => get().setTyping(conversationId, userId, false), TYPING_CLEAR_MS)
      );
    } else {
      typingTimers.delete(key);
    }
    set((s) => {
      const current = { ...(s.typing[conversationId] ?? {}) };
      if (isTyping) current[userId] = true;
      else delete current[userId];
      return { typing: { ...s.typing, [conversationId]: current } };
    });
  },

  setDraft: (id, text) =>
    set((s) => {
      const drafts = { ...s.drafts };
      if (text && text.trim()) drafts[id] = text;
      else delete drafts[id];
      saveDrafts(drafts);
      return { drafts };
    }),

  updateUser: (user) =>
    set((s) => {
      let changed = false;
      const byId = {};
      for (const [id, c] of Object.entries(s.byId)) {
        if (c.participants.some((p) => p.userId === user._id)) {
          changed = true;
          byId[id] = {
            ...c,
            participants: c.participants.map((p) =>
              p.userId === user._id ? { ...p, user: { ...p.user, ...user } } : p
            ),
          };
        } else {
          byId[id] = c;
        }
      }
      return changed ? { byId } : {};
    }),

  setBlockedByMe: (userId, value) =>
    set((s) => {
      const byId = {};
      for (const [id, c] of Object.entries(s.byId)) {
        byId[id] =
          c.type === "direct" && c.participants.some((p) => p.userId === userId)
            ? { ...c, blocked: { byThem: false, ...(c.blocked ?? {}), byMe: value } }
            : c;
      }
      return { byId };
    }),

  setBlockedByThem: (conversationId, value) =>
    set((s) => {
      const c = s.byId[conversationId];
      if (!c) return {};
      return {
        byId: {
          ...s.byId,
          [conversationId]: { ...c, blocked: { byMe: false, ...(c.blocked ?? {}), byThem: value } },
        },
      };
    }),

  /** Drops direct conversations with a user who disabled or deleted their account. */
  removeUser: (userId) => {
    const removed = Object.values(get().byId)
      .filter((c) => c.type === "direct" && c.participants.some((p) => p.userId === userId))
      .map((c) => c._id);
    for (const id of removed) get().remove(id);
    return removed;
  },

  totalUnread: () =>
    get().lists.all.ids.reduce((sum, id) => sum + (get().byId[id]?.me?.unread ?? 0), 0),
}));
