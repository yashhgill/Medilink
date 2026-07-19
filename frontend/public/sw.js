// Self-destructing service worker.
// Earlier versions cached the app shell, which caused stale-bundle bugs across
// origins/devices. Any client that updates to this version cleans itself up.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.navigate(c.url)); // reload with fresh network fetch
  })());
});
