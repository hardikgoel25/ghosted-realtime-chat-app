import { create } from "zustand";
import { toast } from "sonner";
import { ERROR_CODES } from "@ghosted/shared";
import { api, onSessionLost } from "../lib/api";
import { disconnectSocket } from "../lib/socket";
import { useConversationStore } from "./useConversationStore";
import { useMessageStore } from "./useMessageStore";
import { useUIStore } from "./useUIStore";

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
  /** Pending second step of a two-factor sign-in: { challenge, intent: "login" | "enable" } */
  twoFactorChallenge: null,
  onlineUsers: [],
  /** userId -> ISO date from presence updates (null when the user hides it) */
  lastSeen: {},
  /** Server capability flags (email, media, features) from GET /config */
  config: null,
  /** Users I have blocked */
  blocked: [],

  loadConfig: async () => {
    try {
      const config = await api.get("/config", { silent: true });
      set({ config });
    } catch {
      set({ config: { emailEnabled: false, mediaEnabled: true, features: {} } });
    }
  },

  checkAuth: async () => {
    try {
      const { user } = await api.get("/auth/me", { silent: true });
      set({ authUser: user });
      get().fetchBlocked();
    } catch {
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const { user } = await api.post("/auth/signup", data, { silent: true });
      set({ authUser: user, disabledUsername: null });
      toast.success(`Welcome to Ghosted, ${user.fullname.split(" ")[0]}!`);
      return { ok: true };
    } catch (err) {
      if (!err.details) toast.error(err.message);
      return { ok: false, error: err };
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true, disabledUsername: null, twoFactorChallenge: null });
    try {
      const result = await api.post("/auth/login", data, { silent: true });
      if (result.twoFactorRequired) {
        set({ twoFactorChallenge: { challenge: result.challenge, intent: "login" } });
        return { ok: false, twoFactorRequired: true };
      }
      set({ authUser: result.user });
      get().fetchBlocked();
      return { ok: true };
    } catch (err) {
      if (err.code === ERROR_CODES.ACCOUNT_DISABLED) set({ disabledUsername: data.username });
      else toast.error(err.message);
      return { ok: false, error: err };
    } finally {
      set({ isLoggingIn: false });
    }
  },

  /** Second step of a two-factor sign-in (TOTP or recovery code). */
  verifyTwoFactor: async (code) => {
    const pending = get().twoFactorChallenge;
    if (!pending) return { ok: false };
    set({ isLoggingIn: true });
    try {
      const { user } = await api.post(
        "/auth/2fa/verify",
        { challenge: pending.challenge, code },
        { silent: true }
      );
      set({ authUser: user, twoFactorChallenge: null, disabledUsername: null });
      get().fetchBlocked();
      if (pending.intent === "enable") toast.success("Welcome back! Your account is active again.");
      return { ok: true };
    } catch (err) {
      // An expired challenge sends the user back to the password step
      if (err.status === 401 && err.code !== ERROR_CODES.TWO_FACTOR_INVALID) {
        set({ twoFactorChallenge: null });
      }
      toast.error(err.message);
      return { ok: false, error: err };
    } finally {
      set({ isLoggingIn: false });
    }
  },
  cancelTwoFactor: () => set({ twoFactorChallenge: null }),

  enableAccount: async (data) => {
    set({ isEnablingAccount: true, twoFactorChallenge: null });
    try {
      const result = await api.post("/auth/enable", data);
      if (result.twoFactorRequired) {
        set({ twoFactorChallenge: { challenge: result.challenge, intent: "enable" } });
        return false;
      }
      set({ authUser: result.user, disabledUsername: null });
      toast.success("Welcome back! Your account is active again.");
      get().fetchBlocked();
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

  logoutAll: async () => {
    try {
      await api.post("/auth/logout-all");
      get().clearSession();
      toast.success("Signed out everywhere");
      return true;
    } catch {
      return false;
    }
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

  updatePrivacy: async (data) => {
    try {
      const { user } = await api.patch("/users/me/privacy", data);
      set({ authUser: user });
      return true;
    } catch {
      return false;
    }
  },

  updateNotificationPrefs: async (data) => {
    try {
      const { user } = await api.patch("/users/me/notifications", data);
      set({ authUser: user });
      return true;
    } catch {
      return false;
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

  fetchSessions: async () => {
    try {
      const { items } = await api.get("/auth/sessions");
      return items;
    } catch {
      return [];
    }
  },

  revokeSession: async (id) => {
    try {
      await api.delete(`/auth/sessions/${id}`);
      return true;
    } catch {
      return false;
    }
  },

  // ---- two-factor authentication (settings) ----
  twoFactorSetup: async (password) => {
    try {
      return await api.post("/auth/2fa/setup", { password });
    } catch {
      return null;
    }
  },
  twoFactorEnable: async (code) => {
    try {
      const { user, recoveryCodes } = await api.post("/auth/2fa/enable", { code });
      set({ authUser: user });
      return recoveryCodes;
    } catch {
      return null;
    }
  },
  twoFactorDisable: async (password, code) => {
    try {
      const { user } = await api.post("/auth/2fa/disable", { password, code });
      set({ authUser: user });
      toast.success("Two-factor authentication turned off");
      return true;
    } catch {
      return false;
    }
  },
  twoFactorRecoveryCodes: async (password) => {
    try {
      const { recoveryCodes } = await api.post("/auth/2fa/recovery-codes", { password });
      return recoveryCodes;
    } catch {
      return null;
    }
  },

  // ---- email ----
  updateEmail: async (email) => {
    try {
      const { user } = await api.patch("/users/me/email", { email });
      set({ authUser: user });
      toast.success(
        get().config?.emailEnabled ? "Check your inbox for a verification link." : "Email saved."
      );
      return true;
    } catch {
      return false;
    }
  },
  removeEmail: async () => {
    try {
      const { user } = await api.delete("/users/me/email");
      set({ authUser: user });
      return true;
    } catch {
      return false;
    }
  },
  resendVerification: async () => {
    try {
      await api.post("/auth/resend-verification");
      toast.success("Verification email sent.");
      return true;
    } catch {
      return false;
    }
  },
  verifyEmail: async (token) => {
    try {
      const result = await api.post("/auth/verify-email", { token }, { silent: true });
      set((s) => (s.authUser ? { authUser: { ...s.authUser, emailVerified: true } } : {}));
      return { ok: true, email: result.email };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },
  forgotPassword: async (identifier) => {
    try {
      await api.post("/auth/forgot-password", { identifier });
      return true;
    } catch {
      return false;
    }
  },
  resetPassword: async (token, password) => {
    try {
      await api.post("/auth/reset-password", { token, password }, { silent: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err };
    }
  },

  // ---- blocking ----
  fetchBlocked: async () => {
    try {
      const { blocked } = await api.get("/users/me/blocked", { silent: true });
      set({ blocked });
    } catch {
      // keep whatever we had
    }
  },
  isBlockedByMe: (userId) => get().blocked.some((u) => u._id === userId),
  block: async (userId) => {
    try {
      const { blocked } = await api.post(`/users/${userId}/block`);
      set({ blocked });
      useConversationStore.getState().setBlockedByMe(userId, true);
      toast.success("User blocked");
      return true;
    } catch {
      return false;
    }
  },
  unblock: async (userId) => {
    try {
      const { blocked } = await api.delete(`/users/${userId}/block`);
      set({ blocked });
      useConversationStore.getState().setBlockedByMe(userId, false);
      toast.success("User unblocked");
      return true;
    } catch {
      return false;
    }
  },

  // ---- presence ----
  setOnlineUsers: (userIds) => set({ onlineUsers: userIds }),
  setPresence: (userId, online, lastSeenAt) =>
    set((s) => ({
      onlineUsers: online
        ? s.onlineUsers.includes(userId)
          ? s.onlineUsers
          : [...s.onlineUsers, userId]
        : s.onlineUsers.filter((id) => id !== userId),
      lastSeen: online ? s.lastSeen : { ...s.lastSeen, [userId]: lastSeenAt ?? null },
    })),
  isOnline: (userId) => get().onlineUsers.includes(userId),

  mergeSelf: (user) =>
    set((s) =>
      s.authUser
        ? { authUser: { ...s.authUser, ...user, avatar: { ...s.authUser.avatar, ...user.avatar } } }
        : {}
    ),

  handleSessionLost: () => {
    if (!get().authUser) return;
    get().clearSession();
    toast.error("Your session has expired. Please sign in again.");
  },

  clearSession: () => {
    disconnectSocket();
    set({
      authUser: null,
      onlineUsers: [],
      lastSeen: {},
      disabledUsername: null,
      twoFactorChallenge: null,
      blocked: [],
    });
    useConversationStore.getState().reset();
    useMessageStore.getState().reset();
    useUIStore.getState().setActiveConversation(null);
  },
}));

onSessionLost(() => useAuthStore.getState().handleSessionLost());
