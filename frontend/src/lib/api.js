import axios from "axios";
import { toast } from "sonner";

const API_ORIGIN = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "";
const BASE_URL = `${API_ORIGIN}/api/v1`;

/** Error shape every caller can rely on: { message, code, status, details } */
export function toApiError(error) {
  const data = error.response?.data;
  if (data?.error) {
    return Object.assign(new Error(data.error.message), {
      code: data.error.code,
      status: error.response.status,
      details: data.error.details ?? null,
    });
  }
  if (error.code === "ECONNABORTED") {
    return Object.assign(new Error("The request timed out. Please try again."), {
      code: "TIMEOUT",
    });
  }
  if (!error.response) {
    return Object.assign(new Error("You appear to be offline. Check your connection."), {
      code: "NETWORK",
    });
  }
  return Object.assign(new Error(error.message || "Something went wrong"), {
    code: "UNKNOWN",
    status: error.response.status,
  });
}

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 20_000,
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

let refreshPromise = null;

/** One refresh at a time; concurrent 401s wait for the same round trip. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${BASE_URL}/auth/refresh`, null, {
        withCredentials: true,
        headers: { "X-Requested-With": "XMLHttpRequest" },
      })
      .then((res) => res.data.data)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const listeners = { onSessionLost: null };
export function onSessionLost(fn) {
  listeners.onSessionLost = fn;
}

const NO_REFRESH_PATHS = [
  "/auth/refresh",
  "/auth/login",
  "/auth/signup",
  "/auth/enable",
  "/auth/2fa/verify",
  "/auth/logout",
];

api.interceptors.response.use(
  // Unwrap the { ok, data } envelope so callers get the payload directly
  (response) => {
    const body = response.data;
    return body && typeof body === "object" && "ok" in body ? body.data : body;
  },
  async (error) => {
    const { config, response } = error;
    const isAuthRoute = NO_REFRESH_PATHS.some((p) => config?.url?.includes(p));

    if (response?.status === 401 && config && !config._retried && !isAuthRoute) {
      config._retried = true;
      try {
        await refreshSession();
        return api(config);
      } catch {
        listeners.onSessionLost?.();
      }
    }

    const apiError = toApiError(error);
    if (!config?.silent) toast.error(apiError.message);
    return Promise.reject(apiError);
  }
);
