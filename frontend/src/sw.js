import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

/**
 * Service worker (v2): precaches the app shell (so the UI opens offline), caches chat images from
 * Cloudinary for a week, never caches the API or the socket, and shows Web Push notifications.
 * Activation waits for the page to ask (SKIP_WAITING) so a running session is not swapped
 * under the user's feet.
 */

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

// Every in-app navigation gets index.html from the precache (SPA fallback), except the API
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/socket\.io\//],
  })
);

registerRoute(
  ({ url }) => url.hostname === "res.cloudinary.com",
  new CacheFirst({
    cacheName: "ghosted-media",
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  })
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// ---- Web Push ----

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Ghosted", body: event.data?.text() ?? "New message" };
  }
  const title = data.title || "Ghosted";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "ghosted",
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    (async () => {
      // A focused tab already shows the message in place; skip the system notification
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.focused && w.visibilityState === "visible")) return;
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "NAVIGATE", url });
        return;
      }
      await clients.openWindow(url);
    })()
  );
});
