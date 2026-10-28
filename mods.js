/* mods.js — روابط التواصل + Terminal + نظام أدمن فرعي */
(function () {
  const TG = "https://t.me/T_YAXC";
  const WA = "https://wa.me/201013905431";
  const TERM = "https://phdgxt4-coder.github.io/system-terminal/";

  // ===== صلاحيات الأدمن الفرعي =====
  // التخزين: localStorage مفتاح subAdmins = { phone: { name, perms: ["students","exams",...] } }
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
  ];

  function loadSubAdmins() {
    try {
      return JSON.parse(localStorage.getItem("subAdmins") || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveSubAdmins(obj) {
    try {
      localStorage.setItem("subAdmins", JSON.stringify(obj));
    } catch (e) {}
  }

  function currentPhone() {
    try {
      return (window.S && S.profile && S.profile.phone) || localStorage.getItem("last_phone") || "";
    } catch (e) {
      return "";
    }
  }

  function isMainAdmin() {
    try {
      return !!(window.S && S.isAdmin);
    } catch (e) {
      return false;
    }
  }

  function mySubPerms() {
    if (isMainAdmin()) return ALL_PERMS.map((p) => p.id); // الرئيسي يشوف كل حاجة
    const phone = currentPhone();
    const map = loadSubAdmins();
    const entry = map[phone];
    return entry && Array.isArray(entry.perms) ? entry.perms : [];
  }

  function hasPerm(id) {
    if (isMainAdmin()) return true;
    return mySubPerms().includes(id);
  }

  // ===== Credit + روابط =====
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
    window.open(TERM, "_blank", "noopener");
  }
  window.__openTerminal = openTerminal;

  // زر Terminal عائم
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

  // ===== لوحة إدارة الأدمن الفرعي (للأدمن الرئيسي فقط) =====
  function openSubAdminPanel() {
    if (!isMainAdmin()) return;
    let map = loadSubAdmins();
    const overlay = document.createElement("div");
    overlay.id = "subAdminOv";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";

    function renderList() {
      const rows = Object.keys(map)
        .map((phone) => {
          const e = map[phone];
          const permsTxt = (e.perms || []).length
            ? (e.perms || []).join(", ")
            : "لا توجد أذونات";
          return `<div style="border:1px solid var(--line,#ccc);border-radius:12px;padding:10px;margin-bottom:8px;text-align:right">
            <b>${e.name || phone}</b> · <span dir="ltr">${phone}</span><br>
            <small style="opacity:.8">${permsTxt}</small><br>
            <button data-edit="${phone}" style="margin-top:6px;padding:6px 10px;border-radius:8px;border:0;background:#0B5D57;color:#fff;cursor:pointer">تعديل</button>
            <button data-del="${phone}" style="margin-top:6px;padding:6px 10px;border-radius:8px;border:1px solid #c00;background:transparent;color:#c00;cursor:pointer">حذف</button>
          </div>`;
        })
        .join("");

      overlay.innerHTML = `
        <div style="background:var(--card,#fff);color:var(--ink,#111);border-radius:16px;max-width:420px;width:100%;padding:18px;max-height:90vh;overflow:auto">
          <h3 style="margin:0 0 12px">إدارة الأدمن الفرعي</h3>
          <p style="font-size:13px;opacity:.8;margin:0 0 12px">اختار رقم التليفون والصلاحيات. لو مفيش صلاحيات هيظهرله «لا توجد أذونات».</p>
          <label style="display:block;font-weight:600;margin-bottom:4px">رقم التليفون</label>
          <input id="saPhone" class="ltr" placeholder="01xxxxxxxxx" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-bottom:8px">
          <label style="display:block;font-weight:600;margin-bottom:4px">الاسم (اختياري)</label>
          <input id="saName" placeholder="اسم الأدمن الفرعي" style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-bottom:8px">
          <div style="margin:10px 0;text-align:right">
            ${ALL_PERMS.map(
              (p) =>
                `<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" data-perm="${p.id}"> ${p.label}</label>`
            ).join("")}
          </div>
          <button id="saSave" style="width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer;margin-bottom:12px">حفظ الأدمن الفرعي</button>
          <div id="saList">${rows || "<div style='opacity:.7'>مفيش أدمن فرعي لسه</div>"}</div>
          <button id="saClose" style="width:100%;margin-top:12px;padding:10px;border-radius:12px;border:1px solid #888;background:transparent;cursor:pointer">إغلاق</button>
        </div>`;

      overlay.querySelector("#saClose").onclick = () => overlay.remove();
      overlay.querySelector("#saSave").onclick = () => {
        const phone = (overlay.querySelector("#saPhone").value || "").trim();
        if (!/^01\d{9}$/.test(phone)) {
          alert("اكتب رقم مصري صحيح 01xxxxxxxxx");
          return;
        }
        const name = (overlay.querySelector("#saName").value || "").trim();
        const perms = [...overlay.querySelectorAll("[data-perm]:checked")].map(
          (el) => el.getAttribute("data-perm")
        );
        map[phone] = { name: name || phone, perms };
        saveSubAdmins(map);
        alert("تم الحفظ");
        renderList();
      };
      overlay.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const phone = btn.getAttribute("data-edit");
          const e = map[phone];
          overlay.querySelector("#saPhone").value = phone;
          overlay.querySelector("#saName").value = e.name || "";
          overlay.querySelectorAll("[data-perm]").forEach((cb) => {
            cb.checked = (e.perms || []).includes(cb.getAttribute("data-perm"));
          });
        };
      });
      overlay.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = () => {
          const phone = btn.getAttribute("data-del");
          if (confirm("حذف الأدمن الفرعي؟")) {
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

  // زر إدارة الأدمن الفرعي (يظهر للأدمن الرئيسي فقط)
  function ensureSubAdminBtn() {
    if (!isMainAdmin()) return;
    if (document.getElementById("subAdminBtn")) return;
    const b = document.createElement("button");
    b.id = "subAdminBtn";
    b.textContent = "أدمن فرعي";
    b.title = "إدارة الأدمن الفرعي";
    b.style.cssText =
      "position:fixed;bottom:88px;right:14px;z-index:80;padding:10px 14px;border-radius:99px;border:0;background:#4F46E5;color:#fff;font-size:13px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openSubAdminPanel;
    document.body.appendChild(b);
  }

  // لو أدمن فرعي ومفيش أي صلاحيات → رسالة
  function checkNoPerms() {
    if (isMainAdmin()) return;
    const phone = currentPhone();
    if (!phone) return;
    const map = loadSubAdmins();
    if (!map[phone]) return; // مش أدمن فرعي أصلاً
    const perms = map[phone].perms || [];
    if (perms.length === 0) {
      const app = document.getElementById("app");
      if (app && !document.getElementById("noPermMsg")) {
        const d = document.createElement("div");
        d.id = "noPermMsg";
        d.style.cssText =
          "position:fixed;inset:0;z-index:90;background:var(--bg,#0C1716);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center";
        d.innerHTML =
          `<div><div style="font-size:48px;margin-bottom:12px">🔒</div><h2>لا توجد أذونات</h2><p style="opacity:.8">حسابك أدمن فرعي بس مفيش صلاحيات متسجلة. كلّم الأدمن الرئيسي.</p></div>`;
        document.body.appendChild(d);
      }
    }
  }

  // مراقب
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
