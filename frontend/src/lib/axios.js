import axios from "axios";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/useAuthStore";

export const axiosInstance = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api",
  withCredentials: true,
});

// Global response interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const { authUser, logout } = useAuthStore.getState();

    if (error.response?.status === 401) {
      // If user is already logged out or on /login page → skip toast
      if (!authUser || window.location.pathname === "/login") {
        return Promise.reject(error);
      }

      // If session expired while logged in → show toast + force logout
      toast.error("Session expired. Please login again.");
      logout();
      return Promise.reject(error);
    }

    // Other errors → show toast
    toast.error(error.response?.data?.message || "An error occurred");
    return Promise.reject(error);
  }
);
