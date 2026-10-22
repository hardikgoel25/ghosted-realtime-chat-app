import { create } from "zustand";
import toast from "react-hot-toast";
import { SOCKET_EVENTS } from "@ghosted/shared";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { playReceiveSound, playSendSound } from "../lib/sounds";
import { messagePreview, newClientId } from "../lib/utils";
import { useAuthStore } from "./useAuthStore";

const PAGE_SIZE = 30;
const TYPING_CLEAR_MS = 4000;

const initialState = {
  users: [],
  usersQuery: "",
  isUsersLoading: false,
  selectedUser: null,
  messages: [],
  nextCursor: null,
  isMessagesLoading: false,
  isLoadingMore: false,
  isSending: false,
  /** userId -> number of unread messages while that chat was not open */
  unread: {},
  /** userId -> true while they are typing to us */
  typing: {},
  /** userId -> ISO date of their last presence (from presence:update) */
  lastSeen: {},
};

const typingTimers = new Map();

function dedupe(messages) {
  const seen = new Set();
  return messages.filter((m) => (seen.has(m._id) ? false : (seen.add(m._id), true)));
}

export const useChatStore = create((set, get) => ({
  ...initialState,

  reset: () => {
    for (const t of typingTimers.values()) clearTimeout(t);
    typingTimers.clear();
    set({ ...initialState, unread: {}, typing: {}, lastSeen: {} });
  },

  getUsers: async (q = "") => {
    set({ isUsersLoading: true, usersQuery: q });
    try {
      const { items } = await api.get("/users", { params: { q, limit: 50 } });
      if (get().usersQuery !== q) return; // a newer search superseded this one
      set({ users: items });
    } catch {
      // The API client already surfaced the error
    } finally {
      if (get().usersQuery === q) set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true, messages: [], nextCursor: null });
    try {
      const { items, nextCursor } = await api.get(`/messages/${userId}`, {
        params: { limit: PAGE_SIZE },
      });
      if (get().selectedUser?._id !== userId) return; // user switched chats meanwhile
      set({ messages: items, nextCursor });
    } catch {
      // surfaced by the API client
    } finally {
      if (get().selectedUser?._id === userId) set({ isMessagesLoading: false });
    }
  },

  loadOlderMessages: async () => {
    const { selectedUser, nextCursor, isLoadingMore } = get();
    if (!selectedUser || !nextCursor || isLoadingMore) return 0;
    set({ isLoadingMore: true });
    try {
      const { items, nextCursor: next } = await api.get(`/messages/${selectedUser._id}`, {
        params: { cursor: nextCursor, limit: PAGE_SIZE },
      });
      if (get().selectedUser?._id !== selectedUser._id) return 0;
      set((s) => ({ messages: dedupe([...items, ...s.messages]), nextCursor: next }));
      return items.length;
    } catch {
      return 0;
    } finally {
      set({ isLoadingMore: false });
    }
  },

  sendMessage: async ({ text, file }) => {
    const { selectedUser } = get();
    if (!selectedUser) return false;
    const clientId = newClientId();
    let body;
    if (file) {
      body = new FormData();
      if (text) body.append("text", text);
      body.append("clientId", clientId);
      body.append("image", file);
    } else {
      body = { text, clientId };
    }
    set({ isSending: true });
    try {
      const { message } = await api.post(`/messages/${selectedUser._id}`, body);
      get().appendMessage(message);
      playSendSound();
      get().emitTyping(false);
      return true;
    } catch {
      return false;
    } finally {
      set({ isSending: false });
    }
  },

  appendMessage: (message) =>
    set((s) =>
      s.messages.some((m) => m._id === message._id) ? {} : { messages: [...s.messages, message] }
    ),

  handleIncomingMessage: (message) => {
    const me = useAuthStore.getState().authUser?._id;
    if (!me) return;
    const { selectedUser, users } = get();
    const fromMe = message.senderId === me;
    const otherId = fromMe ? message.receiverId : message.senderId;

    if (selectedUser?._id === otherId) {
      get().appendMessage(message);
      if (!fromMe) {
        playReceiveSound();
        get().setTyping(otherId, false);
      }
      return;
    }

    if (fromMe) return; // sent from another device into a chat that is not open here

    set((s) => ({ unread: { ...s.unread, [otherId]: (s.unread[otherId] ?? 0) + 1 } }));
    playReceiveSound();
    const sender = users.find((u) => u._id === message.senderId);
    const preview = messagePreview(message);
    toast(`${sender?.fullname ?? "New message"}${preview ? `: ${preview}` : ""}`, {
      icon: "💬",
      id: `msg-${message._id}`,
    });
  },

  setSelectedUser: (user) =>
    set((s) => ({
      selectedUser: user,
      typing: {},
      messages: user && user._id === s.selectedUser?._id ? s.messages : [],
      nextCursor: user && user._id === s.selectedUser?._id ? s.nextCursor : null,
      unread: user ? { ...s.unread, [user._id]: 0 } : s.unread,
    })),

  setTyping: (userId, isTyping) => {
    const existing = typingTimers.get(userId);
    if (existing) clearTimeout(existing);
    if (isTyping) {
      typingTimers.set(
        userId,
        setTimeout(() => get().setTyping(userId, false), TYPING_CLEAR_MS)
      );
    } else {
      typingTimers.delete(userId);
    }
    set((s) => ({ typing: { ...s.typing, [userId]: isTyping } }));
  },

  /** Tells the selected user whether we are typing; throttling happens server-side too. */
  emitTyping: (isTyping) => {
    const { selectedUser } = get();
    const socket = getSocket();
    if (!selectedUser || !socket?.connected) return;
    socket.emit(isTyping ? SOCKET_EVENTS.TYPING_START : SOCKET_EVENTS.TYPING_STOP, {
      to: selectedUser._id,
    });
  },

  setLastSeen: (userId, lastSeenAt) =>
    set((s) => ({ lastSeen: { ...s.lastSeen, [userId]: lastSeenAt ?? null } })),

  upsertUser: (user) =>
    set((s) => {
      const exists = s.users.some((u) => u._id === user._id);
      const users = exists
        ? s.users.map((u) => (u._id === user._id ? { ...u, ...user } : u))
        : [...s.users, user];
      const selectedUser =
        s.selectedUser?._id === user._id ? { ...s.selectedUser, ...user } : s.selectedUser;
      return { users, selectedUser };
    }),

  removeUser: (userId, reason) => {
    const { selectedUser } = get();
    set((s) => {
      const unread = { ...s.unread };
      delete unread[userId];
      return { users: s.users.filter((u) => u._id !== userId), unread };
    });
    if (selectedUser?._id === userId) {
      set({ selectedUser: null, messages: [], nextCursor: null });
      toast(reason, { icon: "👻" });
    }
  },
}));
