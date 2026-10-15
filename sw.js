/* SW + FCM background notifications */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyCo99zGbGOJSw1p-rdy3bk9PSxzsINWkxQ",
  authDomain: "eltafawoq-8b700.firebaseapp.com",
  projectId: "eltafawoq-8b700",
  storageBucket: "eltafawoq-8b700.firebasestorage.app",
  messagingSenderId: "892405720236",
  appId: "1:892405720236:web:734c19429b8ee8e292eb09"
});
try{
  firebase.messaging().onBackgroundMessage((payload)=>{
    const title=(payload.notification&&payload.notification.title)||"التفوق";
    const body=(payload.notification&&payload.notification.body)||(payload.data&&payload.data.body)||"إشعار";
    self.registration.showNotification(title,{
      body, icon:"./icons/eKXVc.png",
      tag:(payload.data&&payload.data.callId)||"eltafawoq",
      data:payload.data||{}, requireInteraction:true,
      vibrate:[300,100,300]
    });
  });
}catch(e){}
self.addEventListener("notificationclick",(e)=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then((list)=>{
    for(const c of list){if("focus" in c)return c.focus()}
    if(clients.openWindow)return clients.openWindow("./");
  }));
});

/* Service Worker — تحديث تلقائي عند فتح التطبيق */
const CACHE = "eltafawoq-v7";
const ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // network-first-html — مش نعرض index قديم من الكاش
  if (e.request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  if (url.hostname.includes("firestore") || url.hostname.includes("firebase") || url.hostname.includes("googleapis")) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && res.ok && e.request.method === "GET") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
