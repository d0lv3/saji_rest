// sw.js — Minimal Service Worker for PWA install
const CACHE_NAME = 'saji-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Network-first strategy — always try network, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, clone);
          });
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
