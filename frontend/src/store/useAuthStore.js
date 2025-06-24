import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:5001" : "/";

export const useAuthStore = create((set, get) => ({
    authUser: null,
    isSigningUp: false,
    isLoggingIn: false,
    isUpdatingProfile: false,
    isCheckingAuth: true,
    isEnablingAccount: false,
    isDisablingAccount: false,
    isDeletingAccount: false,
    showEnableAccountPrompt: false,
    cachedLoginUsername: null,
    onlineUsers: [],
    socket: null,

    checkAuth: async () => {
        try {
            const res = await axiosInstance.get("/auth/check");
            set({ authUser: res.data });
            get().connectSocket();
        } catch (error) {
            console.log("Error in checkAuth:", error);
            set({ authUser: null });
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    signup: async (data) => {
        set({ isSigningUp: true });
        try {
            const res = await axiosInstance.post("/auth/signup", data);
            set({ authUser: res.data.user });
            toast.success("Account created successfully");
            get().connectSocket();
        } catch (error) {
            toast.error(error.response.data.message);
        } finally {
            set({ isSigningUp: false });
        }
    },

    login: async (data) => {
        set({ isLoggingIn: true, showEnableAccountPrompt: false, cachedLoginEmail: null });
        try {
            const res = await axiosInstance.post("/auth/login", data);
            set({ authUser: res.data.user });
            toast.success("Logged in successfully");
            get().connectSocket();
        } catch (error) {
            const msg = error.response?.data?.message;
            if (msg === "Your account has been disabled. Please contact support or enable your account to proceed.") {
                set({ showEnableAccountPrompt: true, cachedLoginUsername: data.username });
            }
            toast.error(msg || "Login failed");
        } finally {
            set({ isLoggingIn: false });
        }
    },

    enableAccount: async (data) => {
        set({ isEnablingAccount: true });
        try {
            const res = await axiosInstance.put("/auth/enable-account", data);
            toast.success("Account enabled! You can now log in.");
            set({ showEnableAccountPrompt: false });
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to enable account");
        } finally {
            set({ isEnablingAccount: false });
        }
    },

    disableAccount: async (password) => {
        set({ isDisablingAccount: true });
        try {
            await axiosInstance.put("/auth/disable-account", { password });
            set({ authUser: null });
            toast.success("Account disabled successfully");
            get().disconnectSocket();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to disable account");
        } finally {
            set({ isDisablingAccount: false });
        }
    },

    deleteAccount: async (password) => {
        set({ isDeletingAccount: true });
        try {
            await axiosInstance.delete("/auth/delete-profile", {
                data: { password },
            });
            set({ authUser: null });
            toast.success("Account deleted successfully");
            get().disconnectSocket();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to delete account");
        } finally {
            set({ isDeletingAccount: false });
        }
    },

    logout: async () => {
        set({ authUser: null }); // Clear authUser first
        try {
            await axiosInstance.post("/auth/logout");
            toast.success("Logged out successfully");
            get().disconnectSocket();
        } catch (error) {
            toast.error(error.response?.data?.message);
        }
    },
    
    updateProfile: async (data) => {
        set({ isUpdatingProfile: true });
        try {
            const res = await axiosInstance.put("/auth/update-profile", data);
            set({ authUser: res.data });
            toast.success("Profile updated successfully");
        } catch (error) {
            console.log("error in update profile:", error);
            toast.error(error.response.data.message);
        } finally {
            set({ isUpdatingProfile: false });
        }
    },

    connectSocket: () => {
        const { authUser } = get();
        if (!authUser || get().socket?.connected) return;

        const socket = io(BASE_URL, {
            query: { userId: authUser._id },
        });
        socket.connect();

        set({ socket });

        socket.on("getOnlineUsers", (userIds) => {
            set({ onlineUsers: userIds });
        });
    },

    disconnectSocket: () => {
        if (get().socket?.connected) get().socket.disconnect();
    },
}));
