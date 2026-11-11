/* بصيرة - Service Worker
 * وظيفتين: (1) يخلي التطبيق يشتغل أوفلاين  (2) يستقبل التحديثات الجديدة.
 * التحديث بيتحمّل في الخلفية، ومبيتفعّلش إلا لما التطبيق يطلب (في وقت آمن). */
importScripts('version.js');

const VERSION = self.BASEERA_VERSION;
const CACHE = 'baseera-' + VERSION;
const CORE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'version.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  // cache:'reload' يضمن إننا بنجيب الملفات الجديدة من السيرفر مش من كاش المتصفح
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
  // مفيش skipWaiting هنا: التطبيق هو اللي يقرر امتى يفعّل التحديث
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('baseera-') && k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (req.mode === 'navigate') {
          const fallback = await cache.match('index.html');
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
