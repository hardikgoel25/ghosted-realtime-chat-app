import { Suspense, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuthStore } from "../stores/useAuthStore";
import { useThemeStore } from "../stores/useThemeStore";
import { useUIStore } from "../stores/useUIStore";
import { useConversationStore } from "../stores/useConversationStore";
import ErrorBoundary from "./ErrorBoundary";
import SocketBridge from "./SocketBridge";
import Spinner from "../components/ui/Spinner";
import { onServiceWorkerNavigate } from "../lib/pwa";

function useThemeEffect() {
  const resolved = useThemeStore((s) => s.resolved);
  const refresh = useThemeStore((s) => s.refresh);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    const scheme = getComputedStyle(document.documentElement).colorScheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", scheme === "light" ? "#f7f6fb" : "#14111f");
  }, [resolved]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => refresh();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [refresh]);
}

function useWindowStateEffects() {
  const setOnline = useUIStore((s) => s.setOnline);
  const setWindowFocused = useUIStore((s) => s.setWindowFocused);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const focus = () => setWindowFocused(true);
    const blur = () => setWindowFocused(false);
    const visibility = () => setWindowFocused(document.visibilityState === "visible");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [setOnline, setWindowFocused]);
}

function useTitleBadge() {
  const unread = useConversationStore((s) => s.totalUnread());
  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) Ghosted` : "Ghosted";
  }, [unread]);
}

function useServiceWorkerNavigation() {
  const navigate = useNavigate();
  useEffect(() => onServiceWorkerNavigate((path) => navigate(path)), [navigate]);
}

export default function Root() {
  useServiceWorkerNavigation();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const loadConfig = useAuthStore((s) => s.loadConfig);
  const isCheckingAuth = useAuthStore((s) => s.isCheckingAuth);
  const authUser = useAuthStore((s) => s.authUser);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  useThemeEffect();
  useWindowStateEffects();
  useTitleBadge();

  useEffect(() => {
    loadConfig();
    checkAuth();
  }, [checkAuth, loadConfig]);

  if (isCheckingAuth && !authUser) {
    return (
      <div className="h-dvh flex items-center justify-center bg-base-200">
        <Spinner size="lg" label="Loading Ghosted" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {authUser && <SocketBridge />}
      <Suspense
        fallback={
          <div className="h-dvh flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
      <Toaster
        position="top-right"
        richColors
        closeButton
        theme={
          resolvedTheme.includes("light") || resolvedTheme === "nord" || resolvedTheme === "cupcake"
            ? "light"
            : "dark"
        }
        toastOptions={{ duration: 4500 }}
      />
    </ErrorBoundary>
  );
}
