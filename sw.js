// Ervin Central's service worker — notifications only. There's deliberately no fetch handler: every
// request goes to the network exactly as before, so the version.json auto-update and ↻ keep working.
//
// The database sends a push when a kid asks for a parent's OK (supabase/ervin_central.sql →
// notify_request); this shows it, and tapping it opens Parent management.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() || {}; } catch { d = { body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ervin Central', {
    body: d.body || '',
    tag: d.tag,
    icon: 'assets/app-icon-192.png',
    badge: 'assets/app-icon-96.png',
    data: { url: d.url || './#/admin' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#/admin', self.registration.scope).href;
  e.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = open[0];
    if (win) {
      await win.focus();
      win.postMessage({ go: url }); // the page moves itself (navigate() isn't everywhere)
      return;
    }
    await self.clients.openWindow(url);
  })());
});
