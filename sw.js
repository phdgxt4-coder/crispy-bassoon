/* التفوق SW — v12 — إشعارات مكالمات أقوى + تحديث تلقائي */
const CACHE = "eltafawoq-v25";
const BUILD = "20261016-v25";

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
        ? [
            { action: "answer", title: "رد" },
            { action: "reject", title: "رفض" }
          ]
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
      // لو في تبويب مفتوح → ركّز عليه وابعت الرسالة
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
      // مفيش تبويب → افتح المنصة
      let url = "./";
      if (isCall && data.callId) {
        url = "./?call=" + encodeURIComponent(data.callId);
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.json"]).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Firebase / Google دائماً من الشبكة
  if (
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic")
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // الصفحات: شبكة أولاً عشان التحديث يوصل فوراً
  if (
    e.request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("crispy-bassoon")
  ) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match(e.request)))
    );
    return;
  }

  // باقي الملفات: شبكة + كاش احتياطي
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok && e.request.method === "GET") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
