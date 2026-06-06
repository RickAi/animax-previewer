const CACHE_NAME = 'animax-previewer-local-resources-v1';
const LOCAL_RESOURCE_MARKER = '/__local_resources__/';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ANIMAX_CLAIM_CLIENTS') {
    event.waitUntil(self.clients.claim());
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.includes(LOCAL_RESOURCE_MARKER)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return new Response('AnimaX local resource not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
  );
});
