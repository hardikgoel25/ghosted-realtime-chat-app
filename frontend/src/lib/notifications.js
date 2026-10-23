import { getRegistration } from "./pwa";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Shows a system notification for a message that arrived while the tab is in the background.
 * Prefers the service worker (required on Android, and it survives tab discards); falls back to
 * the plain Notification constructor on browsers without one.
 */
export async function showNotification({ title, body, tag, onClick, url }) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const registration = await getRegistration();
  if (registration?.showNotification) {
    try {
      await registration.showNotification(title, {
        body,
        tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        silent: true,
        data: { url: url ?? "/" },
      });
      return;
    } catch {
      // fall through to the in-page API
    }
  }
  try {
    const n = new Notification(title, { body, tag, icon: "/icons/icon-192.png", silent: true });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; ignore
  }
}
