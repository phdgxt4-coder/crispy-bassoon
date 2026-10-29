/* Live Hub — presence strip, daily missions, what's new. No breaking of AI/calls/FCM */
(function () {
  var BUILD = window.APP_BUILD || "v93-mod16";
  var MISSION_KEY = "elta_daily_missions_v1";
  var WHATSNEW_KEY = "elta_whatsnew_seen";

  var WHATS_NEW = {
    ver: "v93-mod16",
    items: [
      "Admin Workspace: Errors · Performance · Health · DevTools",
      "نظام أدمن فرعي بالبحث والصلاحيات",
      "Live Hub: المتصلون الآن + مهام يومية",
      "روابط التواصل + Terminal للأدمن",
      "تحسينات استقرار الكاش وService Worker"
    ]
  };

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function loadMissions() {
    try {
      var raw = JSON.parse(localStorage.getItem(MISSION_KEY) || "{}");
      if (raw.day !== todayKey()) {
        raw = {
          day: todayKey(),
          login: false,
          exam: false,
          game: false,
          chat: false,
          xp: 0
        };
      }
      return raw;
    } catch (e) {
      return { day: todayKey(), login: false, exam: false, game: false, chat: false, xp: 0 };
    }
  }

  function saveMissions(m) {
    try {
      localStorage.setItem(MISSION_KEY, JSON.stringify(m));
    } catch (e) {}
  }

  function completeMission(id, xp) {
    var m = loadMissions();
    if (m[id]) return;
    m[id] = true;
    m.xp = (m.xp || 0) + (xp || 10);
    saveMissions(m);
    try {
      if (window.__logActivity) window.__logActivity("مهمة يومية: " + id + " (+" + xp + " XP)");
    } catch (e) {}
    renderMissionStrip();
  }

  // تسجيل دخول اليوم
  setTimeout(function () {
    try {
      if (window.S && S.user) completeMission("login", 5);
    } catch (e) {}
  }, 3000);

  // اكتشاف نقرات تقريبية للمهام
  document.addEventListener(
    "click",
    function (ev) {
      try {
        var t = ev.target && ev.target.closest && ev.target.closest("button,a,[role=button]");
        if (!t) return;
        var txt = (t.textContent || "").trim();
        if (/امتحان|exam/i.test(txt)) completeMission("exam", 15);
        if (/لعبة|العب|game/i.test(txt)) completeMission("game", 10);
        if (/شات|محادثة|رسالة|chat/i.test(txt)) completeMission("chat", 10);
      } catch (e) {}
    },
    true
  );

  function presenceStats() {
    var online = 0,
      games = 0,
      study = 0,
      chat = 0;
    try {
      var p = (window.S && S.presence) || {};
      var keys = Object.keys(p);
      online = keys.length;
      for (var i = 0; i < keys.length; i++) {
        var v = p[keys[i]] || {};
        var page = String(v.page || v.tab || v.screen || "").toLowerCase();
        if (/game|لعبة|play/.test(page)) games++;
        else if (/exam|كتاب|book|study|مذاكر|درس/.test(page)) study++;
        else if (/chat|شات|msg/.test(page)) chat++;
      }
    } catch (e) {}
    return { online: online, games: games, study: study, chat: chat };
  }

  function ensurePresenceChip() {
    if (document.getElementById("livePresenceChip")) return;
    var chip = document.createElement("div");
    chip.id = "livePresenceChip";
    chip.style.cssText =
      "position:fixed;top:10px;left:10px;z-index:70;background:rgba(15,23,42,.88);color:#e2e8f0;padding:6px 10px;border-radius:99px;font-size:11px;font-weight:700;backdrop-filter:blur(8px);display:none;gap:8px;align-items:center";
    document.body.appendChild(chip);
  }

  function updatePresenceChip() {
    ensurePresenceChip();
    var chip = document.getElementById("livePresenceChip");
    if (!chip) return;
    var st = presenceStats();
    if (!st.online) {
      chip.style.display = "none";
      return;
    }
    chip.style.display = "flex";
    chip.innerHTML =
      "<span style=\"width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e\"></span>" +
      "<span>" +
      st.online +
      " Online</span>" +
      (st.games ? "<span style=\"opacity:.8\">🎮 " + st.games + "</span>" : "") +
      (st.study ? "<span style=\"opacity:.8\">📚 " + st.study + "</span>" : "") +
      (st.chat ? "<span style=\"opacity:.8\">💬 " + st.chat + "</span>" : "");
  }

  function renderMissionStrip() {
    var host = document.getElementById("dailyMissionStrip");
    if (!host) {
      host = document.createElement("div");
      host.id = "dailyMissionStrip";
      host.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;z-index:60;pointer-events:none;display:flex;justify-content:center;padding:0 10px 70px";
      document.body.appendChild(host);
    }
    // إخفاء لو مفيش مستخدم
    try {
      if (!(window.S && S.user)) {
        host.innerHTML = "";
        return;
      }
    } catch (e) {
      host.innerHTML = "";
      return;
    }
    var m = loadMissions();
    function item(done, label) {
      return (
        "<span style=\"opacity:" +
        (done ? ".45" : "1") +
        ";text-decoration:" +
        (done ? "line-through" : "none") +
        "\">" +
        (done ? "✓ " : "○ ") +
        label +
        "</span>"
      );
    }
    host.innerHTML =
      "<div style=\"pointer-events:auto;background:rgba(15,23,42,.92);color:#e2e8f0;border-radius:14px;padding:8px 12px;font-size:11px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:560px;box-shadow:0 8px 24px rgba(0,0,0,.25)\">" +
      "<b style=\"color:#38bdf8\">مهام اليوم</b>" +
      item(m.login, "دخول") +
      item(m.exam, "امتحان") +
      item(m.game, "لعبة") +
      item(m.chat, "شات") +
      "<span style=\"margin-right:auto;color:#fbbf24;font-weight:800\">" +
      (m.xp || 0) +
      " XP</span></div>";
  }

  function maybeWhatsNew() {
    try {
      if (localStorage.getItem(WHATSNEW_KEY) === WHATS_NEW.ver) return;
      if (!(window.S && S.user)) return;
      if (document.getElementById("whatsNewOv")) return;
      var ov = document.createElement("div");
      ov.id = "whatsNewOv";
      ov.style.cssText =
        "position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
      var items = "";
      for (var i = 0; i < WHATS_NEW.items.length; i++) {
        items += "<li style=\"margin:6px 0\">" + WHATS_NEW.items[i] + "</li>";
      }
      ov.innerHTML =
        "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:400px;width:100%;padding:18px;text-align:right\">" +
        "<h3 style=\"margin:0 0 8px\">ما الجديد · " +
        WHATS_NEW.ver +
        "</h3>" +
        "<ul style=\"padding-right:18px;margin:0 0 14px;font-size:14px\">" +
        items +
        "</ul>" +
        "<button id=\"wnOk\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer\">حسناً</button></div>";
      document.body.appendChild(ov);
      ov.querySelector("#wnOk").onclick = function () {
        localStorage.setItem(WHATSNEW_KEY, WHATS_NEW.ver);
        ov.remove();
      };
    } catch (e) {}
  }

  // لا نلمس نظام المكالمات / FCM / AI الموجود في app.js
  // فقط نتأكد إن permission helper موجود للأدمن من Workspace
  window.__eltaEnsureNotifPermission = async function () {
    try {
      if (!("Notification" in window)) return { ok: false, reason: "unsupported" };
      if (Notification.permission === "granted") return { ok: true, permission: "granted" };
      if (Notification.permission === "denied") return { ok: false, permission: "denied" };
      var p = await Notification.requestPermission();
      return { ok: p === "granted", permission: p };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  };

  setInterval(function () {
    updatePresenceChip();
    renderMissionStrip();
  }, 2500);

  setTimeout(function () {
    updatePresenceChip();
    renderMissionStrip();
    maybeWhatsNew();
  }, 4000);
})();
