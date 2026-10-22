import { create } from "zustand";
import toast from "react-hot-toast";
import { ERROR_CODES, SOCKET_EVENTS } from "@ghosted/shared";
import { api, onSessionLost } from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { useChatStore } from "./useChatStore";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isEnablingAccount: false,
  isDisablingAccount: false,
  isDeletingAccount: false,
  /** Username whose login was refused because the account is disabled */
  disabledUsername: null,
  onlineUsers: [],

  checkAuth: async () => {
    try {
      const { user } = await api.get("/auth/me", { silent: true });
      set({ authUser: user });
      get().onAuthenticated();
    } catch {
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const { user } = await api.post("/auth/signup", data);
      set({ authUser: user, disabledUsername: null });
      toast.success("Account created. Welcome to Ghosted!");
      get().onAuthenticated();
      return true;
    } catch {
      return false;
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true, disabledUsername: null });
    try {
      const { user } = await api.post("/auth/login", data, { silent: true });
      set({ authUser: user });
      toast.success("Logged in");
      get().onAuthenticated();
      return true;
    } catch (err) {
      if (err.code === ERROR_CODES.ACCOUNT_DISABLED) {
        set({ disabledUsername: data.username });
      } else {
        toast.error(err.message);
      }
      return false;
    } finally {
      set({ isLoggingIn: false });
    }
  },

  enableAccount: async (data) => {
    set({ isEnablingAccount: true });
    try {
      const { user } = await api.post("/auth/enable", data);
      set({ authUser: user, disabledUsername: null });
      toast.success("Welcome back! Your account is active again.");
      get().onAuthenticated();
      return true;
    } catch {
      return false;
    } finally {
      set({ isEnablingAccount: false });
    }
  },

  disableAccount: async (password) => {
    set({ isDisablingAccount: true });
    try {
      await api.post("/auth/disable", { password });
      get().clearSession();
      toast.success("Account disabled. Log in again whenever you want to re-enable it.");
      return true;
    } catch {
      return false;
    } finally {
      set({ isDisablingAccount: false });
    }
  },

  deleteAccount: async (password) => {
    set({ isDeletingAccount: true });
    try {
      await api.delete("/auth/account", { data: { password } });
      get().clearSession();
      toast.success("Account deleted");
      return true;
    } catch {
      return false;
    } finally {
      set({ isDeletingAccount: false });
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout", null, { silent: true });
    } catch {
      // The server clears cookies on a best-effort basis; local state is cleared regardless
    }
    get().clearSession();
    toast.success("Logged out");
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const { user } = await api.patch("/users/me", data);
      set({ authUser: user });
      toast.success("Profile updated");
      return true;
    } catch {
      return false;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  uploadAvatar: async (file) => {
    set({ isUpdatingProfile: true });
    try {
      const form = new FormData();
      form.append("avatar", file);
      const { user } = await api.put("/users/me/avatar", form);
      set({ authUser: user });
      toast.success("Photo updated");
      return true;
    } catch {
      return false;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  removeAvatar: async () => {
    set({ isUpdatingProfile: true });
    try {
      const { user } = await api.delete("/users/me/avatar");
      set({ authUser: user });
      toast.success("Photo removed");
      return true;
    } catch {
      return false;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  changePassword: async (data) => {
    try {
      await api.patch("/auth/password", data);
      toast.success("Password changed. Other devices were signed out.");
      return true;
    } catch {
      return false;
    }
  },

  onAuthenticated: () => {
    const socket = connectSocket({ onAuthFailure: () => get().handleSessionLost() });
    bindSocketEvents(socket, set, get);
  },

  handleSessionLost: () => {
    if (!get().authUser) return;
    get().clearSession();
    toast.error("Your session has expired. Please sign in again.");
  },

  clearSession: () => {
    disconnectSocket();
    set({ authUser: null, onlineUsers: [] });
    useChatStore.getState().reset();
  },
}));

function bindSocketEvents(socket, set, get) {
  if (socket.__ghostedBound) return;
  socket.__ghostedBound = true;
  const chat = () => useChatStore.getState();

  socket.on(SOCKET_EVENTS.PRESENCE_SNAPSHOT, ({ userIds }) => set({ onlineUsers: userIds }));

  socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, ({ userId, online, lastSeenAt }) => {
    set((s) => ({
      onlineUsers: online
        ? s.onlineUsers.includes(userId)
          ? s.onlineUsers
          : [...s.onlineUsers, userId]
        : s.onlineUsers.filter((id) => id !== userId),
    }));
    chat().setLastSeen(userId, lastSeenAt);
  });

  socket.on(SOCKET_EVENTS.MESSAGE_NEW, (message) => chat().handleIncomingMessage(message));

  socket.on(SOCKET_EVENTS.TYPING, ({ from, isTyping }) => chat().setTyping(from, isTyping));

  socket.on(SOCKET_EVENTS.USER_UPDATED, ({ user }) => {
    const me = get().authUser;
    if (me && user._id === me._id) {
      set({ authUser: { ...me, ...user, avatar: { ...me.avatar, ...user.avatar } } });
    } else {
      chat().upsertUser(user);
    }
  });

  socket.on(SOCKET_EVENTS.USER_DISABLED, ({ userId }) =>
    chat().removeUser(userId, "This user has disabled their account")
  );
  socket.on(SOCKET_EVENTS.USER_DELETED, ({ userId }) =>
    chat().removeUser(userId, "This user has deleted their account")
  );

  socket.on(SOCKET_EVENTS.SESSION_REVOKED, ({ reason }) => {
    get().clearSession();
    toast.error(
      reason === "password_change"
        ? "Your password was changed on another device. Please sign in again."
        : "This session was signed out from another device."
    );
  });
}

onSessionLost(() => useAuthStore.getState().handleSessionLost());
