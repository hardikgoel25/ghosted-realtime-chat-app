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

export function showNotification({ title, body, tag, onClick }) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag, icon: "/logo.svg", silent: true });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; ignore
  }
}
