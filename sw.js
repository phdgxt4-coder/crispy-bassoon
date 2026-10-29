/* التفوق SW — v93-mod17 */
const CACHE = "eltafawoq-v93-mod17";
const BUILD = "20261029-v93-mod17";

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

try {
  firebase.initializeApp({
    apiKey: "AIzaSyCo99zGbGOJSw1p-rdy3bk9PSxzsINWkxQ",
    authDomain: "eltafawoq-8b700.firebaseapp.com",
    projectId: "eltafawoq-8b700",
    messagingSenderId: "892405720236",
    appId: "1:892405720236:web:734c19429b8ee8e292eb09"
  });
  firebase.messaging().onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const isCall = data.type === "call" || data.callId;
    const title = (payload.notification && payload.notification.title) || data.title || (isCall ? "📞 مكالمة واردة" : "التفوق");
    const body = (payload.notification && payload.notification.body) || data.body || (isCall ? ((data.fromName || "شخص") + " بيرن عليك") : "إشعار");
    self.registration.showNotification(title, {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: isCall ? ("call-" + (data.callId || "incoming")) : (data.tag || "eltafawoq"),
      data,
      requireInteraction: !!isCall,
      renotify: !!isCall,
      vibrate: isCall ? [400, 120, 400, 120, 400] : [200, 80, 200],
      actions: isCall ? [{ action: "answer", title: "رد" }, { action: "reject", title: "رفض" }] : []
    });
  });
} catch (e) {}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.json"]).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("eltafawoq-") && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
  );
});
