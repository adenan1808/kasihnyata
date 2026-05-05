const CACHE_NAME = 'pos-umkm-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/backup.js',
  '/js/customers.js',
  '/js/db.js',
  '/js/expenses.js',
  '/js/license.js',
  '/js/payment-midtrans.js',
  '/js/payment-qris.js',
  '/js/pos.js',
  '/js/products.js',
  '/js/reports.js',
  '/js/settings.js',
  '/js/transactions.js',
  '/js/utils.js',
  '/js/wa-notification.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Hanya intercept GET requests
  if (event.request.method !== 'GET') return;

  // Abaikan request dari luar origin, contoh font / unpkg (bisa ditambah cache jika mau offline murni)
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    })
  );
});
