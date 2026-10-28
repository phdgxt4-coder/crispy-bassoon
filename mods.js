/* mods.js — روابط + Terminal + أدمن فرعي + تقارير ديناميكية */
(function () {
  const TG = "https://t.me/T_YAXC";
  const WA = "https://wa.me/201013905431";
  const TERM = "https://phdgxt4-coder.github.io/system-terminal/";

  const ALL_PERMS = [
    { id: "students", label: "الطلاب" },
    { id: "exams", label: "الامتحانات" },
    { id: "chat", label: "التواصل / الشات" },
    { id: "games", label: "الألعاب" },
    { id: "life", label: "المتجر" },
    { id: "books", label: "الكتب" },
    { id: "asms", label: "التقييمات" },
    { id: "features", label: "تفعيل/إيقاف المزايا" },
    { id: "site", label: "إعدادات الموقع" },
    { id: "terminal", label: "وضع Terminal 👾" },
    { id: "devices", label: "تقارير الأجهزة" },
  ];

  function loadSubAdmins() {
    try { return JSON.parse(localStorage.getItem("subAdmins") || "{}"); } catch (e) { return {}; }
  }
  function saveSubAdmins(obj) {
    try { localStorage.setItem("subAdmins", JSON.stringify(obj)); } catch (e) {}
  }
  function currentPhone() {
    try { return (window.S && S.profile && S.profile.phone) || localStorage.getItem("last_phone") || ""; } catch (e) { return ""; }
  }
  function currentUid() {
    try { return (window.S && S.user && S.user.uid) || ""; } catch (e) { return ""; }
  }
  function currentName() {
    try { return (window.S && S.profile && S.profile.name) || ""; } catch (e) { return ""; }
  }
  function isMainAdmin() {
    try { return !!(window.S && S.isAdmin); } catch (e) { return false; }
  }
  function mySubPerms() {
    if (isMainAdmin()) return ALL_PERMS.map((p) => p.id);
    const entry = loadSubAdmins()[currentPhone()];
    return entry && Array.isArray(entry.perms) ? entry.perms : [];
  }
  function hasPerm(id) {
    if (isMainAdmin()) return true;
    return mySubPerms().includes(id);
  }

  function fixCredit() {
    const cr = document.getElementById("credit");
    if (!cr) return;
    cr.innerHTML =
      `<div><b>بواسطة المبرمج مورا 么</b></div>` +
      `<div class="cr-sub" style="margin-top:6px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">` +
      `<a href="${TG}" target="_blank" rel="noopener" style="display:inline-block;padding:4px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--pri);text-decoration:none;font-weight:600">تلجرام</a>` +
      `<a href="${WA}" target="_blank" rel="noopener" style="display:inline-block;padding:4px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--pri);text-decoration:none;font-weight:600">واتساب</a>` +
      `</div>`;
  }

  function openTerminal() {
    if (!hasPerm("terminal") && !isMainAdmin()) {
      alert("مفيش صلاحية لوضع Terminal");
      return;
    }
    const uid = currentUid();
    const phone = currentPhone();
    const name = encodeURIComponent(currentName() || "");
    const q = [];
    if (uid) q.push("sid=" + encodeURIComponent(uid));
    if (phone) q.push("phone=" + encodeURIComponent(phone));
    if (name) q.push("name=" + name);
    q.push("from=eltafawoq");
    const url = TERM + (q.length ? "?" + q.join("&") : "");
    window.open(url, "_blank", "noopener");
  }
  window.__openTerminal = openTerminal;

  function ensureTermBtn() {
    if (document.getElementById("termFab")) return;
    if (!isMainAdmin() && !hasPerm("terminal")) return;
    const b = document.createElement("button");
    b.id = "termFab";
    b.title = "System Terminal";
    b.textContent = "👾";
    b.style.cssText =
      "position:fixed;bottom:88px;left:14px;z-index:80;width:46px;height:46px;border-radius:50%;border:0;background:#0B5D57;color:#fff;font-size:22px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openTerminal;
    document.body.appendChild(b);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, """);
  }

  // عرض ديناميكي: أي حقل جديد من Terminal يظهر لوحده
  function renderReportCard(r) {
    const skip = { sid: 1, at: 1 };
    const title = r.name || r.phone || r.sid || "جهاز";
    const when = r.at ? new Date(r.at).toLocaleString("ar-EG") : "";
    let rows = "";
    Object.keys(r).forEach(function (k) {
      if (skip[k]) return;
      let v = r[k];
      if (v == null || v === "") return;
      if (typeof v === "object") v = JSON.stringify(v);
      rows += `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06)">
        <span style="opacity:.7">${esc(k)}</span>
        <span dir="auto" style="text-align:left;word-break:break-all">${esc(v)}</span>
      </div>`;
    });
    return `<div style="border:1px solid var(--line,#ddd);border-radius:10px;padding:10px;margin-bottom:8px;font-size:13px">
      <b>${esc(title)}</b> · <small>${esc(when)}</small>
      <div style="margin-top:8px">${rows}</div>
    </div>`;
  }

  async function openDeviceReports() {
    if (!isMainAdmin() && !hasPerm("devices")) {
      alert("مفيش صلاحية");
      return;
    }
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = `<div style="background:var(--card,#fff);color:var(--ink,#111);border-radius:16px;max-width:480px;width:100%;padding:18px;max-height:90vh;overflow:auto;text-align:right">
      <h3 style="margin:0 0 10px">تقارير الأجهزة 👾</h3>
      <p style="font-size:13px;opacity:.8">أي حقل جديد يبعته Terminal بيتسجل ويتعرض تلقائي من غير تحديث المنصة.</p>
      <div id="devList" style="margin:12px 0">جاري التحميل…</div>
      <button id="devClose" style="width:100%;padding:10px;border-radius:12px;border:1px solid #888;background:transparent;cursor:pointer">إغلاق</button>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#devClose").onclick = function () { ov.remove(); };

    const box = ov.querySelector("#devList");
    try {
      const cache = JSON.parse(localStorage.getItem("deviceReportsCache") || "[]");
      if (cache.length) {
        box.innerHTML = cache.slice(0, 40).map(renderReportCard).join("");
      } else {
        box.innerHTML = "<div style='opacity:.7'>مفيش تقارير لسه. افتح 👾 من حساب طالب والنافذة تفضل مفتوحة مع المنصة.</div>";
      }
    } catch (e) {
      box.textContent = "تعذر التحميل";
    }
  }

  // استقبال أي payload من Terminal — كله بيتخزن كما هو
  window.addEventListener("message", function (ev) {
    try {
      if (!ev.data || ev.data.type !== "eltafawoq-device-report") return;
      const r = Object.assign({}, ev.data.payload || {});
      r.at = r.at || Date.now();
      let cache = [];
      try { cache = JSON.parse(localStorage.getItem("deviceReportsCache") || "[]"); } catch (e) {}
      cache.unshift(r);
      if (cache.length > 100) cache = cache.slice(0, 100);
      localStorage.setItem("deviceReportsCache", JSON.stringify(cache));
    } catch (e) {}
  });

  function openSubAdminPanel() {
    if (!isMainAdmin()) return;
    let map = loadSubAdmins();
    const overlay = document.createElement("div");
    overlay.id = "subAdminOv";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";

    function renderList() {
      const rows = Object.keys(map).map(function (phone) {
        const e = map[phone];
        const permsTxt = (e.perms || []).length ? (e.perms || []).join(", ") : "لا توجد أذونات";
        return `<div style="border:1px solid var(--line,#ccc);border-radius:12px;padding:10px;margin-bottom:8px;text-align:right">
          <b>${e.name || phone}</b> · <span dir="ltr">${phone}</span><br>
          <small style="opacity:.8">${permsTxt}</small><br>
          <button data-edit="${phone}" style="margin-top:6px;padding:6px 10px;border-radius:8px;border:0;background:#0B5D57;color:#fff;cursor:pointer">تعديل</button>
          <button data-del="${phone}" style="margin-top:6px;padding:6px 10px;border-radius:8px;border:1px solid #c00;background:transparent;color:#c00;cursor:pointer">حذف</button>
        </div>`;
      }).join("");

      overlay.innerHTML = `
        <div style="background:var(--card,#fff);color:var(--ink,#111);border-radius:16px;max-width:420px;width:100%;padding:18px;max-height:90vh;overflow:auto">
          <h3 style="margin:0 0 12px">إدارة الأدمن الفرعي</h3>
          <label style="display:block;font-weight:600;margin-bottom:4px">رقم التليفون</label>
          <input id="saPhone" class="ltr" placeholder="01xxxxxxxxx" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-bottom:8px">
          <label style="display:block;font-weight:600;margin-bottom:4px">الاسم</label>
          <input id="saName" placeholder="اسم الأدمن الفرعي" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-bottom:8px">
          <div style="margin:10px 0;text-align:right">
            ${ALL_PERMS.map(function (p) {
              return `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" data-perm="${p.id}"> ${p.label}</label>`;
            }).join("")}
          </div>
          <button id="saSave" style="width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px">حفظ</button>
          <button id="saDevices" style="width:100%;padding:10px;border:0;border-radius:12px;background:#4F46E5;color:#fff;font-weight:700;cursor:pointer;margin-bottom:12px">تقارير الأجهزة 👾</button>
          <div id="saList">${rows || "<div style='opacity:.7'>مفيش أدمن فرعي لسه</div>"}</div>
          <button id="saClose" style="width:100%;margin-top:12px;padding:10px;border-radius:12px;border:1px solid #888;background:transparent;cursor:pointer">إغلاق</button>
        </div>`;

      overlay.querySelector("#saClose").onclick = function () { overlay.remove(); };
      overlay.querySelector("#saDevices").onclick = function () { openDeviceReports(); };
      overlay.querySelector("#saSave").onclick = function () {
        const phone = (overlay.querySelector("#saPhone").value || "").trim();
        if (!/^01\d{9}$/.test(phone)) { alert("رقم غير صحيح"); return; }
        const name = (overlay.querySelector("#saName").value || "").trim();
        const perms = [...overlay.querySelectorAll("[data-perm]:checked")].map(function (el) {
          return el.getAttribute("data-perm");
        });
        map[phone] = { name: name || phone, perms: perms };
        saveSubAdmins(map);
        alert("تم الحفظ");
        renderList();
      };
      overlay.querySelectorAll("[data-edit]").forEach(function (btn) {
        btn.onclick = function () {
          const phone = btn.getAttribute("data-edit");
          const e = map[phone];
          overlay.querySelector("#saPhone").value = phone;
          overlay.querySelector("#saName").value = e.name || "";
          overlay.querySelectorAll("[data-perm]").forEach(function (cb) {
            cb.checked = (e.perms || []).includes(cb.getAttribute("data-perm"));
          });
        };
      });
      overlay.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.onclick = function () {
          const phone = btn.getAttribute("data-del");
          if (confirm("حذف؟")) {
            delete map[phone];
            saveSubAdmins(map);
            renderList();
          }
        };
      });
    }

    document.body.appendChild(overlay);
    renderList();
  }

  function ensureSubAdminBtn() {
    if (!isMainAdmin()) return;
    if (document.getElementById("subAdminBtn")) return;
    const b = document.createElement("button");
    b.id = "subAdminBtn";
    b.textContent = "أدمن فرعي";
    b.style.cssText =
      "position:fixed;bottom:88px;right:14px;z-index:80;padding:10px 14px;border-radius:99px;border:0;background:#4F46E5;color:#fff;font-size:13px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openSubAdminPanel;
    document.body.appendChild(b);
  }

  function checkNoPerms() {
    if (isMainAdmin()) return;
    const phone = currentPhone();
    if (!phone) return;
    const map = loadSubAdmins();
    if (!map[phone]) return;
    if ((map[phone].perms || []).length === 0) {
      if (!document.getElementById("noPermMsg")) {
        const d = document.createElement("div");
        d.id = "noPermMsg";
        d.style.cssText = "position:fixed;inset:0;z-index:90;background:var(--bg,#0C1716);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center";
        d.innerHTML = `<div><div style="font-size:48px;margin-bottom:12px">🔒</div><h2>لا توجد أذونات</h2><p style="opacity:.8">كلّم الأدمن الرئيسي.</p></div>`;
        document.body.appendChild(d);
      }
    }
  }

  const obs = new MutationObserver(function () {
    if (document.getElementById("credit")) fixCredit();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(function () {
    fixCredit();
    ensureTermBtn();
    ensureSubAdminBtn();
    checkNoPerms();
  }, 1500);

  setTimeout(function () {
    fixCredit();
    ensureTermBtn();
    ensureSubAdminBtn();
  }, 2000);
})();
