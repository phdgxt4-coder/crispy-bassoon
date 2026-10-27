/* التفوق SW — v89 — scoped cache cleanup; no forced page reload */
const CACHE = "eltafawoq-v89";
const BUILD = "20261027-v89";
const PETS = [];

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

try {
  firebase.initializeApp({
    apiKey: "AIzaSyCo99zGbGOJSw1p-rdy3bk9PSxzsINWkxQ",
    authDomain: "eltafawoq-8b700.firebaseapp.com",
    projectId: "eltafawoq-8b700",
    storageBucket: "eltafawoq-8b700.firebasestorage.app",
    messagingSenderId: "892405720236",
    appId: "1:892405720236:web:734c19429b8ee8e292eb09"
  });
  firebase.messaging().onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const isCall = data.type === "call" || data.callId;
    const title = (payload.notification && payload.notification.title)
      || data.title
      || (isCall ? "📞 مكالمة واردة" : "التفوق");
    const body = (payload.notification && payload.notification.body)
      || data.body
      || (isCall ? ((data.fromName || "شخص") + " بيرن عليك") : "إشعار");
    const opts = {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: isCall ? ("call-" + (data.callId || "incoming")) : ((data.tag) || "eltafawoq"),
      data: data,
      requireInteraction: !!isCall,
      renotify: !!isCall,
      vibrate: isCall ? [400, 120, 400, 120, 400] : [200, 80, 200],
      actions: isCall
        ? [{ action: "answer", title: "رد" }, { action: "reject", title: "رفض" }]
        : []
    };
    self.registration.showNotification(title, opts);
  });
} catch (e) {}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const data = (e.notification && e.notification.data) || {};
  const isCall = data.type === "call" || data.callId;
  const action = e.action || "";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url && "focus" in c) {
          c.focus();
          try {
            c.postMessage({
              type: isCall ? "INCOMING_CALL" : "NOTIFICATION_CLICK",
              action,
              callId: data.callId || null,
              fromName: data.fromName || "",
              data
            });
          } catch (_) {}
          return;
        }
      }
      let url = "./";
      if (isCall && data.callId) url = "./?call=" + encodeURIComponent(data.callId);
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      /* كل ملف لوحده: لو ملف واحد مش موجود (404) بقية الملفات تتخزّن عادي — addAll كان بيفشل كله */
      Promise.allSettled(["./index.html","./manifest.json","./memory-game.html","./draw-guess.html","./words-crush.html","./runner.html","./space.html","./doodle.html","./fishing.html","./push.html"].concat(PETS).map((u) => c.add(u)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("eltafawoq-v") && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "CLEAR_CACHE") {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("eltafawoq-v")).map((k) => caches.delete(k)))));
  }
});

function isHtmlResponse(res) {
  if (!res || !res.ok) return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("text/html");
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") { e.respondWith(fetch(e.request)); return; }
  const url = new URL(e.request.url);

  /* cache local GLB pets */
  if (url.origin === self.location.origin && url.pathname.endsWith(".glb")) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
          if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
          return res;
        }).catch(() => hit))
      )
    );
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.indexOf("/npm/three@") === 0) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
          if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
          return res;
        }))
      )
    );
    return;
  }

  if (url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
          if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
          return res;
        }))
      )
    );
    return;
  }

  if (
    url.hostname.includes("ipify") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("cloudfunctions")
  ) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  const isNav =
    e.request.mode === "navigate" ||
    (e.request.destination === "document") ||
    (url.origin === self.location.origin &&
      (url.pathname.endsWith(".html") || url.pathname.endsWith("/") ||
        /\/crispy-bassoon\/?$/.test(url.pathname)));

  if (isNav && url.origin === self.location.origin) {
    const keyUrl = new URL(e.request.url);
    keyUrl.search = "";
    keyUrl.hash = "";
    const cacheKey = new Request(keyUrl.href, { method: "GET" });
    const indexKey = new URL("./index.html", self.registration.scope).href;
    const isAppRoot = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html") ||
      /\/crispy-bassoon\/?$/.test(url.pathname);
    const updatePromise = fetch(e.request, { cache: "no-store" }).then((res) => {
      if (res.ok && isHtmlResponse(res)) {
        caches.open(CACHE).then((cache) => cache.put(cacheKey, res.clone())).catch(() => {});
      }
      return res;
    });
    e.waitUntil(updatePromise.then(() => {}).catch(() => {}));
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      try {
        return await updatePromise;
      } catch (_) {
        const rootFallback = isAppRoot ? await cache.match(indexKey) : null;
        return rootFallback || new Response("<!doctype html><meta charset=utf-8><title>غير متصل</title><h1>الصفحة غير متاحة دون اتصال</h1><p>اتصل بالإنترنت وحاول مرة أخرى.</p>", {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(fetch(e.request));
});
