/* التفوق SW — v93-mod18 */
const CACHE = "eltafawoq-v93-mod18";
const BUILD = "20261029-v93-mod18";

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
  firebase.messaging().onBackgroundMessage(function (payload) {
    var data = payload.data || {};
    var isCall = data.type === "call" || data.callId;
    var title =
      (payload.notification && payload.notification.title) ||
      data.title ||
      (isCall ? "📞 مكالمة واردة" : "التفوق");
    var body =
      (payload.notification && payload.notification.body) ||
      data.body ||
      (isCall ? (data.fromName || "شخص") + " بيرن عليك" : "إشعار");
    self.registration.showNotification(title, {
      body: body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: isCall ? "call-" + (data.callId || "incoming") : data.tag || "eltafawoq",
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
    });
  });
} catch (e) {}

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(["./", "./index.html", "./manifest.json"]).catch(function () {});
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf("eltafawoq-") === 0 && k !== CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) {
          c.put(e.request, copy).catch(function () {});
        });
        return r;
      })
      .catch(function () {
        return caches.match(e.request).then(function (m) {
          return m || caches.match("./index.html");
        });
      })
  );
});
