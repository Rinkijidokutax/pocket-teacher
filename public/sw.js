// Service worker: installability + push for reminders.
// NOTE: no runtime `fetch` caching. A network-first handler intercepted Next.js prefetches
// and turned cancelled/aborted prefetch requests into page-visible "TypeError: Failed to
// fetch" errors — for marginal offline value (an AI tutor needs the network anyway). Removed.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // Purge any runtime cache left by the old network-first SW.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  )
);

self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? "Pocket Teacher", {
      body: data.body ?? "Time for today's lesson 📚",
      icon: "/icon-192.png",
      data: { url: data.url ?? "/home" },
    })
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data?.url ?? "/home"));
});
