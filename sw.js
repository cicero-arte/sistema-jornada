const CACHE = 'jornada-v1';
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      '/sistema-jornada/',
      '/sistema-jornada/index.html',
      '/sistema-jornada/manifest.json',
      '/sistema-jornada/icon-192.png',
      '/sistema-jornada/icon-512.png'
    ]))
  );
});
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
