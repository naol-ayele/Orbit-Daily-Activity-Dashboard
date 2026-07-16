const CACHE = 'orbit-v1';
const URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/js/app.js',
  '/js/store.js',
  '/js/supabase-client.js',
  '/js/config.js',
  '/icon-192.svg',
  '/icon-512.svg',
  'https://esm.sh/@supabase/supabase-js@2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
