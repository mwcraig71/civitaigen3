/* CiviVerse service worker — web push notifications */

self.addEventListener('push', (event) => {
  let data = { title: 'CiviVerse', body: 'You have a new notification.', url: '/generate' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    /* malformed payload — show defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || 'civiverse',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url || '/generate' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/generate';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
