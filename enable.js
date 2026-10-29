/* enable.js — AI / calls / إيقاف وضع الصيانة العالق */
(function () {
  function isMainAdmin() {
    try {
      return !!(window.S && S.isAdmin);
    } catch (e) {
      return false;
    }
  }

  async function ensureFirebase() {
    if (window.__enableFb) return window.__enableFb;
    var appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    var fsMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    var authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    var firebaseConfig = {
      apiKey: "AIzaSyCo99zGbGOJSw1p-rdy3bk9PSxzsINWkxQ",
      authDomain: "eltafawoq-8b700.firebaseapp.com",
      projectId: "eltafawoq-8b700",
      messagingSenderId: "892405720236",
      appId: "1:892405720236:web:734c19429b8ee8e292eb09"
    };
    var app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(firebaseConfig);
    var db = fsMod.getFirestore(app);
    var auth = authMod.getAuth(app);
    window.__enableFb = {
      db: db,
      auth: auth,
      doc: fsMod.doc,
      setDoc: fsMod.setDoc,
      getDoc: fsMod.getDoc
    };
    return window.__enableFb;
  }

  async function turnMaintenanceOff() {
    var fb = await ensureFirebase();
    await fb.setDoc(
      fb.doc(fb.db, "config", "site"),
      { maintenance: false, message: "" },
      { merge: true }
    );
    try {
      if (window.S && S.site) {
        S.site.maintenance = false;
        S.site.message = "";
      }
    } catch (e) {}
    try {
      if (typeof window.render === "function") window.render(true);
      else if (window.S) {
        // إجبار إعادة عرض بسيطة
        var ev = new Event("visibilitychange");
        document.dispatchEvent(ev);
      }
    } catch (e) {}
    return true;
  }

  async function enableCoreFeatures() {
    var fb = await ensureFirebase();
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
    var fb = await ensureFirebase();
    var payload = {};
    if (aiProxy != null) payload.aiProxy = String(aiProxy).trim();
    if (aiUrl != null) payload.aiUrl = String(aiUrl).trim();
    if (aiKey != null) payload.aiKey = String(aiKey).trim();
    await fb.setDoc(fb.doc(fb.db, "config", "site"), payload, { merge: true });
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

  function maintOn() {
    try {
      return !!(window.S && S.site && S.site.maintenance);
    } catch (e) {
      return false;
    }
  }

  function openEnablePanel() {
    if (!isMainAdmin()) {
      alert("للأدمن فقط");
      return;
    }
    var ov = document.createElement("div");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:14px";
    var mOn = maintOn();
    ov.innerHTML =
      "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:440px;width:100%;padding:18px;text-align:right;max-height:92vh;overflow:auto\">" +
      "<h3 style=\"margin:0 0 8px\">إعدادات التشغيل</h3>" +
      "<div style=\"background:" +
      (mOn ? "#fef2f2" : "#f0fdf4") +
      ";border-radius:12px;padding:10px;margin-bottom:12px;font-size:13px\">" +
      "<b>وضع الصيانة: " +
      (mOn ? "🔴 شغال" : "🟢 متوقف") +
      "</b><br><small>لو شغال من غير ما تفعّله، غالبًا قيمة في Firebase أو خطأ قراءة config/site.</small></div>" +
      "<button type=\"button\" id=\"enMaintOff\" style=\"width:100%;padding:14px;border:0;border-radius:12px;background:#dc2626;color:#fff;font-weight:800;cursor:pointer;margin-bottom:10px;font-size:15px\">إيقاف وضع الصيانة فورًا</button>" +
      "<button type=\"button\" id=\"enFeats\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer;margin-bottom:10px\">تفعيل المكالمات + AI في Firebase</button>" +
      "<label style=\"font-weight:600;display:block;margin-bottom:4px\">aiProxy</label>" +
      "<input id=\"enProxy\" placeholder=\"https://...\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:8px;direction:ltr\">" +
      "<label style=\"font-weight:600;display:block;margin-bottom:4px\">aiUrl (أدمن)</label>" +
      "<input id=\"enUrl\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:8px;direction:ltr\">" +
      "<label style=\"font-weight:600;display:block;margin-bottom:4px\">aiKey (أدمن)</label>" +
      "<input id=\"enKey\" type=\"password\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;margin-bottom:10px;direction:ltr\">" +
      "<button type=\"button\" id=\"enAi\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#4F46E5;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">حفظ إعدادات AI</button>" +
      "<button type=\"button\" id=\"enNotif\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">طلب إذن الإشعارات</button>" +
      "<div id=\"enOut\" style=\"font-size:13px;min-height:24px;margin-bottom:8px\"></div>" +
      "<button type=\"button\" id=\"enClose\" style=\"width:100%;padding:10px;border:1px solid #ccc;border-radius:12px;background:transparent;cursor:pointer\">إغلاق</button></div>";

    document.body.appendChild(ov);
    var out = ov.querySelector("#enOut");
    ov.querySelector("#enClose").onclick = function () {
      ov.remove();
    };

    try {
      if (window.S && S.site) {
        ov.querySelector("#enProxy").value = S.site.aiProxy || "";
        ov.querySelector("#enUrl").value = S.site.aiUrl || "";
      }
    } catch (e) {}

    ov.querySelector("#enMaintOff").onclick = async function () {
      out.textContent = "جاري إيقاف الصيانة…";
      try {
        await turnMaintenanceOff();
        out.textContent = "✅ تم إيقاف وضع الصيانة في Firebase. حدّث صفحة الطالب.";
        if (window.__logActivity) window.__logActivity("إيقاف وضع الصيانة");
      } catch (e) {
        out.textContent = "❌ فشل: " + (e && e.message ? e.message : e);
      }
    };

    ov.querySelector("#enFeats").onclick = async function () {
      out.textContent = "جاري التفعيل…";
      try {
        await enableCoreFeatures();
        out.textContent = "✅ تم تفعيل calls/ai/chat/games";
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
        out.textContent = "✅ تم حفظ إعدادات AI";
      } catch (e) {
        out.textContent = "❌ فشل: " + (e && e.message ? e.message : e);
      }
    };

    ov.querySelector("#enNotif").onclick = async function () {
      var r = await requestNotifs();
      out.textContent = r.ok ? "✅ الإشعارات مسموحة" : "⚠ " + r.msg;
    };
  }

  // زر أحمر ظاهر لو الصيانة شغالة
  function ensureMaintBtn() {
    if (!isMainAdmin()) {
      var x = document.getElementById("maintOffBtn");
      if (x) x.remove();
      return;
    }
    var on = maintOn();
    var b = document.getElementById("maintOffBtn");
    if (!on) {
      if (b) b.remove();
      return;
    }
    if (b) return;
    b = document.createElement("button");
    b.id = "maintOffBtn";
    b.type = "button";
    b.textContent = "إيقاف الصيانة";
    b.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:90;padding:10px 14px;border-radius:99px;border:0;background:#dc2626;color:#fff;font-size:13px;font-weight:800;box-shadow:0 6px 18px rgba(220,38,38,.4);cursor:pointer";
    b.onclick = async function () {
      b.textContent = "…";
      try {
        await turnMaintenanceOff();
        b.textContent = "تم ✓";
        setTimeout(function () {
          if (b.parentNode) b.remove();
        }, 1200);
        alert("تم إيقاف وضع الصيانة");
      } catch (e) {
        b.textContent = "فشل";
        alert("فشل الإيقاف: " + (e && e.message ? e.message : e));
      }
    };
    document.body.appendChild(b);
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
    b.type = "button";
    b.textContent = "AI / مكالمات";
    b.style.cssText =
      "position:fixed;bottom:192px;right:14px;z-index:80;padding:10px 12px;border-radius:99px;border:0;background:#059669;color:#fff;font-size:12px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:pointer";
    b.onclick = openEnablePanel;
    document.body.appendChild(b);
  }

  // محاولة إيقاف تلقائي مرة واحدة بعد دخول الأدمن لو الصيانة شغالة
  var autoTried = false;
  function maybeAutoOff() {
    if (autoTried || !isMainAdmin() || !maintOn()) return;
    autoTried = true;
    turnMaintenanceOff()
      .then(function () {
        console.info("[enable] maintenance forced OFF");
      })
      .catch(function (e) {
        console.warn("[enable] maintenance auto-off failed", e);
        autoTried = false;
      });
  }

  setInterval(function () {
    ensureBtn();
    ensureMaintBtn();
    maybeAutoOff();
  }, 2000);

  setTimeout(function () {
    ensureBtn();
    ensureMaintBtn();
    maybeAutoOff();
  }, 1500);

  window.__openEnablePanel = openEnablePanel;
  window.__turnMaintenanceOff = turnMaintenanceOff;
})();
