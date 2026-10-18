/* التفوق SW — v56 — شبكة أولاً + كاش آمن + Offline صريح */
const CACHE = "eltafawoq-v56";
const BUILD = "20261018-v56";

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
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./index.html", "./manifest.json"]).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "CLEAR_CACHE") {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
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
      (url.pathname.endsWith(".html") ||
        url.pathname.endsWith("/") ||
        /\/crispy-bassoon\/?$/.test(url.pathname)));

  if (isNav) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 6000);
          const res = await fetch(e.request, { cache: "no-cache", signal: ctl.signal });
          clearTimeout(t);
          if (isHtmlResponse(res)) cache.put("./index.html", res.clone()).catch(() => {});
          return res;
        } catch (_) {
          const cached = await cache.match("./index.html");
          return cached || new Response("<h1>التفوق</h1><p>مفيش نت — افتح تاني</p>", {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }
      })()
    );
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
