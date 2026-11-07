/* التفوق SW — v178 — كاش أوفلاين دائم منفصل + فصل واجهة الطالب عن الأدمن */
/* v115-fix: PETS كان ناقص تعريفه من إصدارات → ReferenceError وقت الـ install → الـ SW مش بيتسجل خالص.
   هرّوا دلوقتي (موديلات الرفاق 3D) — Promise.allSettled بيتجاهل أي ملف مش موجود بأمان */
/* v131-fix: importScripts كان من غير try/catch — لو gstatic مش متاح (أول تحميل أوفلاين) الـ SW كله كان بيفشل
   ومش بيتسجل خالص (لا أوفلاين ولا إشعارات). بقي محمي — التسجيل بيكمل حتى لو مكتبات الإشعارات محملتش */
/* v167: مزامنة CACHE مع BUILD، حماية أقوى، تنظيف كاش أدق، وتقليل race أثناء التحديث */
/* v170: أيقونات الإشعارات متطابقة مع manifest (QG30M) — كانت icon-192 القديمة (404 في الإشعارات) */

const PETS = ["./pets/fox.glb","./pets/corgi.glb","./pets/hare.glb","./pets/sheep.glb","./pets/boar.glb"];
const CACHE = "eltafawoq-v178";
/* لا يُحذف هذا الكاش عند التحديث أو «مسح كاش الملفات»؛ تحديثه يتم بإضافة الملفات الجديدة فقط. */
const OFFLINE_CACHE = "eltafawoq-offline-v1";
const BUILD = "20261107-v178";

let __fcmReady = false;
try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
  __fcmReady = true;
} catch (e) {
  /* مكتبات الإشعارات محملتش — الـ SW يفضل شغال بدون إشعارات خلفية */
}

try {
  if (!__fcmReady || typeof firebase === "undefined") throw new Error("fcm-lib-missing");
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
    const title = (payload.notification && payload.notification.title)
      || data.title
      || (isCall ? "📞 مكالمة واردة" : "التفوق");
    const body = (payload.notification && payload.notification.body)
      || data.body
      || (isCall ? ((data.fromName || "شخص") + " بيرن عليك") : "إشعار");
    const opts = {
      body,
      icon: "./icons/QG30M.png",
      badge: "./icons/QG30M.png",
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
          /* focus ممكن يفشل في بعض المتصفحات — منسيبوش يكسر باقي التنبيه */
          try { c.focus(); } catch (_) {}
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
    Promise.all([caches.open(CACHE), caches.open(OFFLINE_CACHE)]).then(([c, offline]) =>
      /* الملفات الأساسية تُحفظ في الكاش العادي والدائم؛ كل ملف مستقل حتى لا يفشل التثبيت كله. */
      Promise.allSettled(
        ["./index.html", "./manifest.json", "./sw.js"].concat(typeof PETS !== "undefined" ? PETS : []).map((u) =>
          Promise.all([c.add(u).catch(() => {}), offline.add(u).catch(() => {})])
        )
      )
    ).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(async (keys) => {
      const offline = await caches.open(OFFLINE_CACHE);
      const legacy = keys.filter((k) => /^eltafawoq-v\d+/.test(k));
      /* ترحيل الملفات التي نزلها المستخدم في الإصدارات السابقة قبل تنظيفها. */
      await Promise.allSettled(legacy.map(async (name) => {
        const old = await caches.open(name);
        const reqs = await old.keys();
        await Promise.allSettled(reqs.map(async (req) => {
          if (await offline.match(req)) return;
          const res = await old.match(req);
          if (res) await offline.put(req, res);
        }));
      }));
      await Promise.all(
        legacy.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
    })
    .then(() => self.clients.claim())
    .then(() => {
      /* إشعار الصفحات إن التحديث اتفعّل */
      return self.clients.matchAll({ type: "window" }).then((list) => {
        list.forEach((c) => {
          try { c.postMessage({ type: "SW_ACTIVATED", cache: CACHE, build: BUILD }); } catch (_) {}
        });
      });
    })
  );
});

self.addEventListener("message", (e) => {
  const d = e.data || {};
  /* الصفحة بتبعت كل الملفات اللي استخدمتها → تُحفظ في مخزن أوفلاين دائم مستقل عن إصدارات الكود. */
  if (d.type === "WARM" && Array.isArray(d.urls)) {
    /* الطالب يدفّي ملفات المنصة المشتركة فقط؛ لا يتم تنزيل أي مجموعة أدمن أو بيانات طالب آخر. */
    const scoped = d.scope ? (OFFLINE_CACHE + "-" + String(d.scope).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80)) : OFFLINE_CACHE;
    e.waitUntil(
      caches.open(scoped).then((c) =>
        Promise.allSettled(
          d.urls.slice(0, 300).map((u) =>
            c.match(u).then((hit) => hit || c.add(u).catch(() => null))
          )
        )
      )
    );
  }
  if (d.type === "CLEAR_CACHE") {
    e.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => /^eltafawoq-v[0-9]+$/.test(k)).map((k) => caches.delete(k)))
      )
    );
  }
  /* تفعيل التحديث بس لما المستخدم يوافق */
  if (d.type === "SKIP_WAITING") {
    try { e.waitUntil(self.skipWaiting()); } catch (_) {
      try { self.skipWaiting(); } catch (_) {}
    }
  }
});

function isHtmlResponse(res) {
  if (!res || !res.ok) return false;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("text/html");
}

/* تحديث دوري بالخلفية (لو المتصفح بيدعم periodicSync) */
self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "eltafawoq-refresh") return;
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.keys().then((reqs) =>
        Promise.allSettled(
          reqs
            .filter((r) => new URL(r.url).pathname !== new URL("./nav-ts", self.registration.scope).pathname)
            .slice(0, 200)
            .map((r) =>
              fetch(r, { cache: "no-store" })
                .then((res) => { if (res && res.ok) return c.put(r, res); })
                .catch(() => {})
            )
        )
      )
    )
  );
});

/* فحص خلفية لصفحة HTML مرة كل 30 دقيقة — بدل كل فتح (توفير داتا) */
const NAV_TTL_MS = 30 * 60 * 1000;
async function navNeedCheck() {
  try {
    const c = await caches.open(CACHE);
    const tsRes = await c.match(new URL("./nav-ts", self.registration.scope).href);
    const ts = tsRes ? Number((await tsRes.text()) || 0) : 0;
    return !Number.isFinite(ts) || ts <= 0 || (Date.now() - ts) > NAV_TTL_MS;
  } catch (_) { return true; }
}
async function navMarkFresh() {
  try {
    const c = await caches.open(CACHE);
    await c.put(
      new URL("./nav-ts", self.registration.scope).href,
      new Response(String(Date.now()))
    );
  } catch (_) {}
}

async function offlineMatch(request) {
  try {
    const c = await caches.open(OFFLINE_CACHE);
    return await c.match(request);
  } catch (_) { return null; }
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") {
    e.respondWith(fetch(e.request));
    return;
  }
  const url = new URL(e.request.url);

  /* cache local GLB pets — v152: لو الشبكة فشلت والملف مش متخزن نرجّع 504 بدل undefined (كان بيكسر respondWith) */
  if (url.origin === self.location.origin && url.pathname.endsWith(".glb")) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request) || await offlineMatch(e.request);
        return hit || fetch(e.request).then((res) => {
          if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
          return res;
        }).catch(() => new Response("", { status: 504 }));
      })
    );
    return;
  }

  /* three.js from jsDelivr */
  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.indexOf("/npm/three@") === 0) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request) || await offlineMatch(e.request);
        return hit || fetch(e.request).then((res) => {
          if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  /* Firebase JS from gstatic */
  if (url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request) || await offlineMatch(e.request);
        return hit || fetch(e.request).then((res) => {
          if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  /* Network-only for live APIs */
  if (
    url.hostname.includes("ipify") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("cloudfunctions") ||
    url.hostname.includes("workers.dev")
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
    e.request.destination === "document" ||
    (url.origin === self.location.origin &&
      (url.pathname.endsWith(".html") ||
        url.pathname.endsWith("/") ||
        /\/crispy-bassoon\/?$/.test(url.pathname)));

  if (isNav && url.origin === self.location.origin) {
    const keyUrl = new URL(e.request.url);
    keyUrl.search = "";
    keyUrl.hash = "";
    const cacheKey = new Request(keyUrl.href, { method: "GET" });
    const indexKey = new URL("./index.html", self.registration.scope).href;
    const isAppRoot =
      url.pathname.endsWith("/") ||
      url.pathname.endsWith("/index.html") ||
      /\/crispy-bassoon\/?$/.test(url.pathname);

    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(cacheKey);
        const offline = cached || await offlineMatch(cacheKey);
        if (offline) {
          /* v167: نحدّث النسخة في الخلفية بس لو عدّي 30 دقيقة على آخر فحص */
          if (await navNeedCheck()) {
            const upd = fetch(e.request, { cache: "no-store" }).then(async (res) => {
              if (res.ok && isHtmlResponse(res)) {
                await cache.put(cacheKey, res.clone()).catch(() => {});
                await navMarkFresh();
              }
              return res;
            });
            try { e.waitUntil(upd.catch(() => {})); } catch (_) {}
          }
          return offline;
        }
        try {
          const res = await fetch(e.request, { cache: "no-store" });
          if (res.ok && isHtmlResponse(res)) {
            cache.put(cacheKey, res.clone()).catch(() => {});
            await navMarkFresh();
          }
          return res;
        } catch (_) {
          const rootFallback = isAppRoot ? (await cache.match(indexKey) || await offlineMatch(indexKey)) : null;
          return (
            rootFallback ||
            new Response(
              "<!doctype html><meta charset=utf-8><title>غير متصل</title><h1>الصفحة غير متاحة دون اتصال</h1><p>اتصل بالإنترنت وحاول مرة أخرى.</p>",
              {
                status: 503,
                headers: { "Content-Type": "text/html; charset=utf-8" }
              }
            )
          );
        }
      })()
    );
    return;
  }

  /* Same-origin assets: cache-first + background update */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request) || await offlineMatch(e.request);
          const net = fetch(e.request).then((res) => {
            if (res && res.ok) c.put(e.request, res.clone()).catch(() => {});
            return res;
          });
          if (hit) {
            e.waitUntil(net.catch(() => {}));
            return hit;
          }
          return net.catch(() => hit || new Response("", { status: 504 }));
      })
    );
    return;
  }

  e.respondWith(fetch(e.request));
});
