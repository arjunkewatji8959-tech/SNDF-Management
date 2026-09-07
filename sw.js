/* SNDF Management Web Push Service Worker */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: 'SNDF Alert', body: event.data ? event.data.text() : 'New notification' }; }
  const title = data.title || 'SNDF Point Update Due';
  const options = {
    body: data.body || 'Your Point Update is due.',
    icon: '/assets-logo.png',
    badge: '/assets-logo.png',
    tag: data.tag || 'sndf-alert',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/guard.html#point-update', type: data.type || 'general' },
    actions: data.type === 'point-update-due' ? [{ action: 'update', title: '📷 Update Now' }, { action: 'close', title: 'Dismiss' }] : []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  const target = event.notification.data?.url || '/guard.html#point-update';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(new URL(target, self.location.origin).href);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(new URL(target, self.location.origin).href);
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
