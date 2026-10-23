import { api } from "./api";
import { getRegistration } from "./pwa";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The browser's current push subscription for this origin, if any. */
export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await getRegistration();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Subscribes this device and registers it with the API. Returns "granted", "denied" or "unsupported". */
export async function enablePush(vapidPublicKey) {
  if (!pushSupported() || !vapidPublicKey) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await getRegistration();
  if (!registration) return "unsupported";
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  await api.post("/push/subscriptions", subscription.toJSON());
  return "granted";
}

let synced = false;
/** After (re)login, re-registers an existing browser subscription so the server knows this device. */
export async function syncPushSubscription() {
  if (synced) return;
  synced = true;
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await api.post("/push/subscriptions", subscription.toJSON(), { silent: true });
  } catch {
    // Push may be disabled on the server; the settings toggle reflects that
  }
}

/** Removes this device's subscription on both sides. */
export async function disablePush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await api.delete("/push/subscriptions", {
      data: { endpoint: subscription.endpoint },
      silent: true,
    });
  } catch {
    // The server prunes dead endpoints on its own
  }
  await subscription.unsubscribe().catch(() => {});
}
