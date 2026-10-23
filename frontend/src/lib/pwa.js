import { toast } from "sonner";
import { registerSW } from "virtual:pwa-register";

let registrationPromise = null;
let updateSW = null;

/**
 * Registers the service worker (production builds only; Vite serves the dev build without one).
 * A new version waits until the user agrees to reload, so an open chat is never swapped mid-use.
 */
export function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  if (registrationPromise) return;
  registrationPromise = new Promise((resolve) => {
    updateSW = registerSW({
      immediate: true,
      onRegisteredSW: (_url, registration) => resolve(registration ?? null),
      onRegisterError: () => resolve(null),
      onNeedRefresh: () => {
        toast("A new version of Ghosted is ready", {
          id: "sw-update",
          duration: Infinity,
          action: { label: "Reload", onClick: () => updateSW?.(true) },
        });
      },
    });
  });
}

/** The active registration, or null when service workers are unavailable (dev, old browsers). */
export async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  if (registrationPromise) {
    const reg = await registrationPromise;
    if (reg) return reg;
  }
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/** Lets the service worker's notification clicks drive the router. */
export function onServiceWorkerNavigate(handler) {
  if (!("serviceWorker" in navigator)) return () => {};
  const listener = (event) => {
    if (event.data?.type === "NAVIGATE" && typeof event.data.url === "string") {
      try {
        const url = new URL(event.data.url, window.location.origin);
        if (url.origin === window.location.origin) handler(url.pathname + url.search);
      } catch {
        // ignore malformed urls
      }
    }
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}

// ---- install prompt ----

let deferredInstall = null;
const installListeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event;
    for (const fn of installListeners) fn(true);
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    for (const fn of installListeners) fn(false);
  });
}

export function canInstall() {
  return Boolean(deferredInstall);
}

export function onInstallAvailable(fn) {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredInstall) return false;
  const event = deferredInstall;
  deferredInstall = null;
  for (const fn of installListeners) fn(false);
  event.prompt();
  const choice = await event.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}
