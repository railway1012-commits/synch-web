const CACHE_NAME = 'synch-v14';
const STATIC_ASSETS = [
  '/',
  '/chat.html',
  '/auth.html',
  '/forgot-password.html',
  '/settings.html',
  '/css/main.css',
  '/css/chat.css',
  '/css/auth.css',
  '/css/settings.css',
  '/js/auth.js',
  '/js/ui.js',
  '/js/chat.js',
  '/js/socket.js',
  '/js/webrtc-call.js',
  '/js/settings.js',
  '/js/custom-dropdown.js',
  '/js/google-identity.js',
  '/js/auth-flow.js',
  '/favicon.svg'
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Network-first strategy: always fetch the latest files when online, fall back to cache when offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Service Worker Message Listener for Direct Notifications
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options || {});
  } else if (event.data.type === 'CLOSE_CALL_NOTIFICATION') {
    self.registration.getNotifications({ tag: 'incoming-call' }).then((notifs) => {
      notifs.forEach((n) => n.close());
    });
  }
});

// Mobile & Desktop notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const chatId = notifData.chatId;
  const isDevicePrompt = notifData.type === 'device_prompt';
  const isIncomingCall = notifData.type === 'incoming_call';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (isDevicePrompt) {
            client.postMessage({ type: 'OPEN_DEVICE_PROMPT', promptData: notifData });
          } else if (isIncomingCall) {
            client.postMessage({ type: 'OPEN_INCOMING_CALL', callData: notifData });
          } else if (chatId) {
            client.postMessage({ type: 'OPEN_CHAT', chatId });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        let targetUrl = '/chat.html';
        if (isDevicePrompt) targetUrl += '?open_prompt=1';
        else if (chatId) targetUrl += `?chat=${chatId}`;
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
