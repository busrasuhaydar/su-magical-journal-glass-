// Su's Magical Journal · bildirim service worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let d = { title: "Su's Magical Journal", body: '', url: '/' };
  try { d = { ...d, ...event.data.json() }; } catch { /* düz metin */ }
  event.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url }, tag: d.url }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url || '/').replace(/^\//, ''), self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => w.url.startsWith(self.registration.scope));
    if (c) { c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  }));
});

// Çevrim dışıyken uygulama kabuğunu aç; veriler her zaman ağdan gelir.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(self.registration.scope)));
});
self.addEventListener('install', (e) => e.waitUntil(caches.open('shell-v1').then((c) => c.add(self.registration.scope)).catch(() => undefined)));
