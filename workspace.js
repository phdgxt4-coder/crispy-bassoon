/* Admin Workspace — Error / Performance / Activity / DevTools / Health */
(function () {
  var ACT_KEY = "elta_activity_log";

  function isMainAdmin() {
    try { return !!(window.S && S.isAdmin); } catch (e) { return false; }
  }

  function loadActivity() {
    try { return JSON.parse(localStorage.getItem(ACT_KEY) || "[]"); } catch (e) { return []; }
  }
  function pushActivity(text, meta) {
    try {
      var list = loadActivity();
      list.unshift({
        t: Date.now(),
        text: String(text).slice(0, 200),
        meta: meta || {},
        uid: (window.S && S.user && S.user.uid) || "",
        name: (window.S && S.profile && S.profile.name) || ""
      });
      if (list.length > 200) list = list.slice(0, 200);
      localStorage.setItem(ACT_KEY, JSON.stringify(list));
    } catch (e) {}
  }
  window.__logActivity = pushActivity;

  // التقاط نقرات أدمن بسيطة كـ activity
  document.addEventListener(
    "click",
    function (ev) {
      if (!isMainAdmin()) return;
      try {
        var t = ev.target;
        if (!t || !t.closest) return;
        var btn = t.closest("button,[role=button],.tab,a");
        if (!btn) return;
        var label = (btn.textContent || btn.getAttribute("aria-label") || "").trim().slice(0, 80);
        if (label && label.length > 1) pushActivity("نقر: " + label);
      } catch (e) {}
    },
    true
  );

  function fmtTime(ts) {
    try { return new Date(ts).toLocaleString("ar-EG"); } catch (e) { return ""; }
  }

  function css() {
    return "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:10px";
  }

  function panel() {
    return "background:#0f172a;color:#e2e8f0;border-radius:16px;width:100%;max-width:560px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;font-family:system-ui,sans-serif";
  }

  function tabBtn(id, label, active) {
    return (
      "<button data-tab=\"" +
      id +
      "\" style=\"flex:1;padding:10px 6px;border:0;border-bottom:2px solid " +
      (active ? "#38bdf8" : "transparent") +
      ";background:transparent;color:" +
      (active ? "#38bdf8" : "#94a3b8") +
      ";font-size:11px;font-weight:700;cursor:pointer\">" +
      label +
      "</button>"
    );
  }

  function card(title, body) {
    return (
      "<div style=\"background:#1e293b;border-radius:12px;padding:12px;margin-bottom:10px\">" +
      "<div style=\"font-size:12px;color:#94a3b8;margin-bottom:6px\">" +
      title +
      "</div>" +
      "<div>" +
      body +
      "</div></div>"
    );
  }

  function getEC() {
    return window.__EC || { log: [], ops: [], net: [] };
  }

  function renderErrors() {
    var EC = getEC();
    var log = (EC.log || []).slice().reverse().slice(0, 40);
    if (!log.length) return "<div style=\"opacity:.6;padding:20px;text-align:center\">مفيش أخطاء مسجّلة</div>";
    var h = "";
    for (var i = 0; i < log.length; i++) {
      var e = log[i];
      var color =
        e.type === "js" ? "#f87171" : e.type === "firebase" ? "#fb923c" : e.type === "network" ? "#60a5fa" : "#a78bfa";
      h +=
        "<div style=\"border-right:3px solid " +
        color +
        ";padding:8px 10px;margin-bottom:8px;background:#1e293b;border-radius:8px;font-size:12px\">" +
        "<div style=\"display:flex;justify-content:space-between;gap:8px\">" +
        "<b style=\"color:" +
        color +
        "\">" +
        (e.type || "?") +
        "</b>" +
        "<span style=\"opacity:.6\">" +
        fmtTime(e.t) +
        "</span></div>" +
        "<div style=\"margin-top:4px;word-break:break-word\">" +
        String(e.msg || "").slice(0, 220) +
        "</div>" +
        (e.page ? "<div style=\"opacity:.55;margin-top:2px\">صفحة: " + e.page + "</div>" : "") +
        (e.fn ? "<div style=\"opacity:.55\">fn: " + e.fn + "</div>" : "") +
        (e.dev ? "<div style=\"opacity:.45;font-size:11px\">" + e.dev + "</div>" : "") +
        "</div>";
    }
    return h;
  }

  function renderPerf() {
    var EC = getEC();
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    var mem = performance.memory;
    var online = navigator.onLine ? "✅ Online" : "❌ Offline";
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var ping = "—";
    var ops = EC.ops || [];
    var reads = 0,
      writes = 0;
    for (var i = 0; i < ops.length; i++) {
      var op = (ops[i].op || "").toLowerCase();
      if (/get|listen|query|onSnapshot/.test(op)) reads++;
      if (/set|add|update|delete|write/.test(op)) writes++;
    }
    var loadMs = nav ? Math.round(nav.loadEventEnd - nav.startTime) : "?";
    var ram = mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + " / " + (mem.jsHeapSizeLimit / 1048576).toFixed(0) + " MB" : "N/A";
    var netInfo = conn ? (conn.effectiveType || "?") + " · " + (conn.downlink || "?") + " Mbps" : "N/A";
    var students = 0;
    try {
      if (window.S && Array.isArray(S.students)) students = S.students.length;
    } catch (e) {}
    var presence = 0;
    try {
      if (window.S && S.presence) presence = Object.keys(S.presence).length;
    } catch (e) {}

    return (
      card("الحالة", online + " · Firebase: " + (window.S && S.user ? "Auth OK" : "—")) +
      card("Load Time", loadMs + " ms") +
      card("JS Heap (RAM)", ram) +
      card("Network", netInfo) +
      card("Firebase ops (جلسة)", "Reads≈ " + reads + " · Writes≈ " + writes + " · Total " + ops.length) +
      card("Network requests", String((EC.net || []).length)) +
      card("طلاب محملين", String(students)) +
      card("Presence keys", String(presence)) +
      card("Build", String(window.APP_BUILD || "?"))
    );
  }

  function renderActivity() {
    var list = loadActivity().slice(0, 50);
    if (!list.length) return "<div style=\"opacity:.6;padding:20px;text-align:center\">مفيش نشاط مسجّل بعد</div>";
    var h = "";
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      h +=
        "<div style=\"padding:8px 0;border-bottom:1px solid #334155;font-size:13px\">" +
        "<div>" +
        a.text +
        "</div>" +
        "<div style=\"opacity:.5;font-size:11px\">" +
        fmtTime(a.t) +
        (a.name ? " · " + a.name : "") +
        "</div></div>";
    }
    return h;
  }

  async function runHealth() {
    var checks = [];
    function add(name, ok, detail) {
      checks.push({ name: name, ok: !!ok, detail: detail || "" });
    }
    add("Internet", navigator.onLine, navigator.onLine ? "Online" : "Offline");
    add("Service Worker", "serviceWorker" in navigator, "serviceWorker" in navigator ? "Supported" : "No");
    try {
      var regs = await navigator.serviceWorker.getRegistrations();
      add("SW Registered", regs && regs.length, regs && regs.length ? regs.length + " reg" : "none");
    } catch (e) {
      add("SW Registered", false, String(e.message || e));
    }
    add("Firebase Auth", !!(window.S && S.user), window.S && S.user ? "uid ok" : "not signed");
    add("Error Center", !!window.__EC, window.__EC ? "log=" + (window.__EC.log || []).length : "missing");
    try {
      var t0 = performance.now();
      await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store" });
      add("Latency probe", true, Math.round(performance.now() - t0) + " ms");
    } catch (e) {
      add("Latency probe", false, "fail");
    }
    try {
      var r = await fetch("https://firestore.googleapis.com/", { method: "HEAD", mode: "no-cors" });
      add("Firestore reach", true, "reachable");
    } catch (e) {
      add("Firestore reach", false, "blocked?");
    }
    return checks;
  }

  function renderHealth(checks) {
    if (!checks) return "<div style=\"opacity:.6\">جاري الفحص…</div>";
    var h = "";
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      h +=
        "<div style=\"display:flex;justify-content:space-between;gap:8px;padding:10px;margin-bottom:6px;background:#1e293b;border-radius:10px\">" +
        "<span>" +
        (c.ok ? "✅" : "❌") +
        " " +
        c.name +
        "</span>" +
        "<span style=\"opacity:.65;font-size:12px\">" +
        c.detail +
        "</span></div>";
    }
    return h;
  }

  async function renderDevTools(box) {
    box.innerHTML =
      "<div style=\"display:grid;gap:8px\">" +
      "<button data-test=\"sw\" style=\"padding:12px;border:0;border-radius:10px;background:#1e293b;color:#e2e8f0;cursor:pointer;text-align:right\">اختبار Service Worker</button>" +
      "<button data-test=\"net\" style=\"padding:12px;border:0;border-radius:10px;background:#1e293b;color:#e2e8f0;cursor:pointer;text-align:right\">اختبار الإنترنت</button>" +
      "<button data-test=\"err\" style=\"padding:12px;border:0;border-radius:10px;background:#1e293b;color:#e2e8f0;cursor:pointer;text-align:right\">حقن خطأ تجريبي</button>" +
      "<button data-test=\"clear-err\" style=\"padding:12px;border:0;border-radius:10px;background:#1e293b;color:#e2e8f0;cursor:pointer;text-align:right\">مسح سجل الأخطاء</button>" +
      "<button data-test=\"clear-act\" style=\"padding:12px;border:0;border-radius:10px;background:#1e293b;color:#e2e8f0;cursor:pointer;text-align:right\">مسح Activity Log</button>" +
      "<div id=\"devOut\" style=\"margin-top:8px;font-size:12px;opacity:.85;min-height:40px\"></div></div>";

    var out = box.querySelector("#devOut");
    box.querySelector('[data-test="sw"]').onclick = async function () {
      try {
        var regs = await navigator.serviceWorker.getRegistrations();
        out.textContent = "SW regs: " + regs.length + (regs[0] ? " · scope " + regs[0].scope : "");
      } catch (e) {
        out.textContent = "SW error: " + e;
      }
    };
    box.querySelector('[data-test="net"]').onclick = async function () {
      var t0 = performance.now();
      try {
        await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store" });
        out.textContent = "OK · " + Math.round(performance.now() - t0) + " ms · online=" + navigator.onLine;
      } catch (e) {
        out.textContent = "Fail: " + e;
      }
    };
    box.querySelector('[data-test="err"]').onclick = function () {
      try {
        if (window.__EC && __EC.report) __EC.report("js", { message: "تجربة Error Center من Workspace" }, { fn: "devTools" });
        out.textContent = "تم تسجيل خطأ تجريبي في Error Center";
      } catch (e) {
        out.textContent = String(e);
      }
    };
    box.querySelector('[data-test="clear-err"]').onclick = function () {
      try {
        if (window.__EC) {
          __EC.log = [];
          localStorage.setItem("ec_log", "[]");
        }
        out.textContent = "تم مسح الأخطاء";
      } catch (e) {
        out.textContent = String(e);
      }
    };
    box.querySelector('[data-test="clear-act"]').onclick = function () {
      localStorage.setItem(ACT_KEY, "[]");
      out.textContent = "تم مسح Activity";
    };
  }

  function openWorkspace() {
    if (!isMainAdmin()) return;
    if (document.getElementById("wsOv")) return;

    var tab = "errors";
    var ov = document.createElement("div");
    ov.id = "wsOv";
    ov.style.cssText = css();

    function draw() {
      ov.innerHTML =
        "<div style=\"" +
        panel().replace(/"/g, "") +
        ";\">".replace(";\">", "") +
        "";
      // rebuild cleanly
      ov.innerHTML = "";
      var shell = document.createElement("div");
      shell.style.cssText = panel();
      shell.innerHTML =
        "<div style=\"padding:14px 16px 0;display:flex;justify-content:space-between;align-items:center\">" +
        "<div><div style=\"font-weight:800;font-size:16px\">Admin Workspace</div>" +
        "<div style=\"font-size:11px;color:#94a3b8\">" +
        (window.APP_BUILD || "") +
        "</div></div>" +
        "<button id=\"wsClose\" style=\"border:0;background:#334155;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer\">إغلاق</button></div>" +
        "<div style=\"display:flex;border-bottom:1px solid #334155;margin-top:10px\">" +
        tabBtn("errors", "🐞 Errors", tab === "errors") +
        tabBtn("perf", "📈 Perf", tab === "perf") +
        tabBtn("activity", "📋 Log", tab === "activity") +
        tabBtn("health", "❤ Health", tab === "health") +
        tabBtn("dev", "🛠 Dev", tab === "dev") +
        "</div>" +
        "<div id=\"wsBody\" style=\"padding:14px;overflow:auto;flex:1\"></div>";
      ov.appendChild(shell);

      shell.querySelector("#wsClose").onclick = function () {
        ov.remove();
      };
      var tabs = shell.querySelectorAll("[data-tab]");
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = function () {
          tab = this.getAttribute("data-tab");
          draw();
        };
      }

      var body = shell.querySelector("#wsBody");
      if (tab === "errors") body.innerHTML = renderErrors();
      else if (tab === "perf") body.innerHTML = renderPerf();
      else if (tab === "activity") body.innerHTML = renderActivity();
      else if (tab === "health") {
        body.innerHTML = "<div style=\"opacity:.6\">جاري الفحص…</div>";
        runHealth().then(function (c) {
          body.innerHTML = renderHealth(c);
        });
      } else if (tab === "dev") renderDevTools(body);
    }

    document.body.appendChild(ov);
    draw();
    pushActivity("فتح Admin Workspace");
  }

  function ensureBtn() {
    if (!isMainAdmin()) {
      var o = document.getElementById("wsBtn");
      if (o) o.remove();
      return;
    }
    if (document.getElementById("wsBtn")) return;
    var b = document.createElement("button");
    b.id = "wsBtn";
    b.textContent = "Workspace";
    b.title = "Admin Workspace";
    b.style.cssText =
      "position:fixed;bottom:140px;right:14px;z-index:80;padding:10px 12px;border-radius:99px;border:0;background:#0f172a;color:#38bdf8;font-size:12px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer";
    b.onclick = openWorkspace;
    document.body.appendChild(b);
  }

  setInterval(ensureBtn, 2000);
  setTimeout(ensureBtn, 1500);
})();
