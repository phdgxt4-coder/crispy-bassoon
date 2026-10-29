/* enable.js — تشغيل المكالمات والـ AI عبر إعدادات Firebase */
(function () {
  function isMainAdmin() {
    try {
      return !!(window.S && S.isAdmin);
    } catch (e) {
      return false;
    }
  }

  function getDbHelpers() {
    // app.js modules may expose these on window in some builds; otherwise use firebase from dynamic import
    return {
      hasInline: typeof window.setDoc === "function"
    };
  }

  async function ensureFirebase() {
    if (window.__enableFb) return window.__enableFb;
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, doc, setDoc, getDoc, updateDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const firebaseConfig = {
      apiKey: "AIzaSyCo99zGbGOJSw1p-rdy3bk9PSxzsINWkxQ",
      authDomain: "eltafawoq-8b700.firebaseapp.com",
      projectId: "eltafawoq-8b700",
      messagingSenderId: "892405720236",
      appId: "1:892405720236:web:734c19429b8ee8e292eb09"
    };
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    window.__enableFb = { db, auth, doc, setDoc, getDoc, updateDoc };
    return window.__enableFb;
  }

  async function enableCoreFeatures() {
    const fb = await ensureFirebase();
    // تشغيل الميزات: false فقط هو اللي بيقفل — نحذف القفل أو نخلي true
    await fb.setDoc(
      fb.doc(fb.db, "config", "features"),
      {
        calls: true,
        ai: true,
        chat: true,
        games: true,
        books: true,
        exams: true,
        life: true,
        asms: true
      },
      { merge: true }
    );
    // حدّث الذاكرة المحلية فوراً
    try {
      if (window.S) {
        S.features = Object.assign({}, S.features || {}, {
          calls: true,
          ai: true,
          chat: true,
          games: true,
          books: true,
          exams: true,
          life: true,
          asms: true
        });
      }
    } catch (e) {}
    return true;
  }

  async function saveAiConfig(aiProxy, aiUrl, aiKey) {
    const fb = await ensureFirebase();
    const payload = {};
    if (aiProxy != null) payload.aiProxy = String(aiProxy).trim();
    if (aiUrl != null) payload.aiUrl = String(aiUrl).trim();
    if (aiKey != null) payload.aiKey = String(aiKey).trim();
    await fb.setDoc(fb.doc(fb.db, "config", "site"), payload, { merge: true });
    // أيضاً config/ai للأدمن
    await fb.setDoc(
      fb.doc(fb.db, "config", "ai"),
      {
        aiUrl: payload.aiUrl || "",
        aiKey: payload.aiKey || "",
        proxyUrl: payload.aiProxy || ""
      },
      { merge: true }
    );
    try {
      if (window.S && S.site) {
        if (payload.aiProxy) S.site.aiProxy = payload.aiProxy;
        if (payload.aiUrl) S.site.aiUrl = payload.aiUrl;
        if (payload.aiKey) S.site.aiKey = payload.aiKey;
      }
    } catch (e) {}
    return true;
  }

  async function requestNotifs() {
    try {
      if (!("Notification" in window)) return { ok: false, msg: "المتصفح لا يدعم الإشعارات" };
      var p = Notification.permission;
      if (p !== "granted") p = await Notification.requestPermission();
      return { ok: p === "granted", msg: p };
    } catch (e) {
      return { ok: false, msg: String(e) };
    }
  }

  function statusLine() {
    var calls = true;
    var aiOk = false;
    try {
      if (window.S && S.features && S.features.calls === false) calls = false;
    } catch (e) {}
    try {
      aiOk = !!(window.S && S.site && (S.site.aiProxy || S.site.aiUrl));
    } catch (e) {}
    return {
      calls: calls,
      ai: aiOk,
      notif: typeof Notification !== "undefined" ? Notification.permission : "n/a"
    };
  }

  function openEnablePanel() {
    if (!isMainAdmin()) {
      alert("للأدمن فقط");
      return;
    }
    var st = statusLine();
    var ov = document.createElement("div");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:14px";
    ov.innerHTML =
      "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:440px;width:100%;padding:18px;text-align:right;max-height:92vh;overflow:auto\">" +
      "<h3 style=\"margin:0 0 8px\">تشغيل AI والمكالمات</h3>" +
      "<p style=\"font-size:13px;opacity:.8;margin:0 0 12px\">المنصة بتقفل المكالمات لو <code>config/features.calls = false</code>. والـ AI محتاج رابط وسيط (aiProxy) للطلبة.</p>" +
      "<div style=\"background:#f8fafc;border-radius:12px;padding:10px;margin-bottom:12px;font-size:13px\">" +
      "<div>المكالمات: <b>" +
      (st.calls ? "✅ مسموحة" : "❌ متوقفة") +
      "</b></div>" +
      "<div>AI مضبوط: <b>" +
      (st.ai ? "✅" : "❌ ناقص إعداد") +
      "</b></div>" +
      "<div>الإشعارات: <b>" +
      st.notif +
      "</b></div></div>" +
      "<button id=\"enFeats\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer;margin-bottom:10px\">1) تفعيل المكالمات + AI في Firebase</button>" +
      "<label style=\"font-weight:600;display:block;margin-bottom:4px\">aiProxy (موصى به للطلبة)</label>" +
      "<input id=\"enProxy\" placeholder=\"https://your-cloud-function/...\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:8px;direction:ltr\">" +
      "<label style=\"font-weight:600;display:block;margin-bottom:4px\">aiUrl (للأدمن فقط)</label>" +
      "<input id=\"enUrl\" placeholder=\"https://api.openai.com/...\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:8px;direction:ltr\">" +
      "<label style=\"font-weight:600;display:block;margin-bottom:4px\">aiKey (للأدمن فقط — لا تشاركه)</label>" +
      "<input id=\"enKey\" type=\"password\" placeholder=\"sk-...\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:10px;direction:ltr\">" +
      "<button id=\"enAi\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#4F46E5;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">2) حفظ إعدادات AI</button>" +
      "<button id=\"enNotif\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">3) طلب إذن الإشعارات</button>" +
      "<div id=\"enOut\" style=\"font-size:13px;min-height:24px;margin-bottom:8px\"></div>" +
      "<button id=\"enClose\" style=\"width:100%;padding:10px;border:1px solid #ccc;border-radius:12px;background:transparent;cursor:pointer\">إغلاق</button></div>";

    document.body.appendChild(ov);
    var out = ov.querySelector("#enOut");
    ov.querySelector("#enClose").onclick = function () {
      ov.remove();
    };

    // prefill
    try {
      if (window.S && S.site) {
        ov.querySelector("#enProxy").value = S.site.aiProxy || "";
        ov.querySelector("#enUrl").value = S.site.aiUrl || "";
      }
    } catch (e) {}

    ov.querySelector("#enFeats").onclick = async function () {
      out.textContent = "جاري التفعيل…";
      try {
        await enableCoreFeatures();
        out.textContent = "✅ تم تفعيل calls/ai/chat/games في config/features";
        if (window.__logActivity) window.__logActivity("تفعيل المكالمات والـ AI");
      } catch (e) {
        out.textContent = "❌ فشل: " + (e && e.message ? e.message : e);
      }
    };

    ov.querySelector("#enAi").onclick = async function () {
      out.textContent = "جاري الحفظ…";
      try {
        await saveAiConfig(
          ov.querySelector("#enProxy").value,
          ov.querySelector("#enUrl").value,
          ov.querySelector("#enKey").value
        );
        out.textContent = "✅ تم حفظ إعدادات AI في config/site و config/ai";
      } catch (e) {
        out.textContent = "❌ فشل: " + (e && e.message ? e.message : e);
      }
    };

    ov.querySelector("#enNotif").onclick = async function () {
      var r = await requestNotifs();
      out.textContent = r.ok ? "✅ الإشعارات مسموحة" : "⚠ " + r.msg;
    };
  }

  function ensureBtn() {
    if (!isMainAdmin()) {
      var o = document.getElementById("enableBtn");
      if (o) o.remove();
      return;
    }
    if (document.getElementById("enableBtn")) return;
    var b = document.createElement("button");
    b.id = "enableBtn";
    b.textContent = "AI / مكالمات";
    b.style.cssText =
      "position:fixed;bottom:192px;right:14px;z-index:80;padding:10px 12px;border-radius:99px;border:0;background:#059669;color:#fff;font-size:12px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:pointer";
    b.onclick = openEnablePanel;
    document.body.appendChild(b);
  }

  setInterval(ensureBtn, 2000);
  setTimeout(ensureBtn, 1500);

  window.__openEnablePanel = openEnablePanel;
})();
