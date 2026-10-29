/* mods2 — credit + professional sub-admin */
(function () {
  var TG = "https://t.me/T_YAXC";
  var WA = "https://wa.me/201013905431";
  var TERM = "https://phdgxt4-coder.github.io/system-terminal/";
  var LS_KEY = "subAdmins_v2";

  var ALL_PERMS = [
    { id: "students", label: "الطلاب" },
    { id: "exams", label: "الامتحانات" },
    { id: "chat", label: "التواصل / الشات" },
    { id: "games", label: "الألعاب" },
    { id: "life", label: "المتجر" },
    { id: "books", label: "الكتب" },
    { id: "asms", label: "التقييمات" },
    { id: "features", label: "تفعيل المزايا" },
    { id: "site", label: "إعدادات الموقع" },
    { id: "terminal", label: "Terminal" },
    { id: "devices", label: "تقارير الأجهزة" }
  ];

  function isMainAdmin() {
    try { return !!(window.S && S.isAdmin); } catch (e) { return false; }
  }
  function currentPhone() {
    try {
      return (window.S && S.profile && S.profile.phone) || localStorage.getItem("last_phone") || "";
    } catch (e) { return ""; }
  }
  function currentUid() {
    try { return (window.S && S.user && S.user.uid) || ""; } catch (e) { return ""; }
  }
  function currentName() {
    try { return (window.S && S.profile && S.profile.name) || ""; } catch (e) { return ""; }
  }

  function loadMap() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveMap(map) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function getStudentList() {
    var list = [];
    try {
      if (window.S && Array.isArray(S.students)) {
        S.students.forEach(function (st) {
          if (!st) return;
          list.push({
            id: st.id || st.uid || "",
            name: st.name || st.displayName || "بدون اسم",
            phone: st.phone || "",
            grade: st.grade || st.className || ""
          });
        });
      }
    } catch (e) {}
    return list;
  }

  function searchStudents(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) return [];
    return getStudentList().filter(function (st) {
      return (
        (st.name && st.name.toLowerCase().indexOf(q) >= 0) ||
        (st.phone && String(st.phone).indexOf(q) >= 0) ||
        (st.id && String(st.id).toLowerCase().indexOf(q) >= 0)
      );
    }).slice(0, 30);
  }

  function fixCredit() {
    var cr = document.getElementById("credit");
    if (!cr) return;
    cr.innerHTML =
      "<div><b>بواسطة المبرمج مورا 么</b></div>" +
      "<div class=\"cr-sub\" style=\"margin-top:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap\">" +
      "<a href=\"" + TG + "\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-block;padding:6px 14px;border-radius:99px;border:1px solid var(--line,#ccc);background:var(--card,#fff);color:var(--pri,#0B5D57);text-decoration:none;font-weight:700\">تلجرام</a>" +
      "<a href=\"" + WA + "\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-block;padding:6px 14px;border-radius:99px;border:1px solid var(--line,#ccc);background:var(--card,#fff);color:var(--pri,#0B5D57);text-decoration:none;font-weight:700\">واتساب</a>" +
      "</div>";
  }

  function openTerminal() {
    var uid = currentUid();
    var phone = currentPhone();
    var name = encodeURIComponent(currentName() || "");
    var q = ["from=eltafawoq"];
    if (uid) q.push("sid=" + encodeURIComponent(uid));
    if (phone) q.push("phone=" + encodeURIComponent(phone));
    if (name) q.push("name=" + name);
    window.open(TERM + "?" + q.join("&"), "_blank", "noopener");
  }
  window.__openTerminal = openTerminal;

  function ensureAdminTermBtn() {
    if (!isMainAdmin()) {
      var old = document.getElementById("termFab");
      if (old) old.remove();
      return;
    }
    if (document.getElementById("termFab")) return;
    var b = document.createElement("button");
    b.id = "termFab";
    b.title = "System Terminal";
    b.textContent = "👾";
    b.style.cssText =
      "position:fixed;bottom:88px;left:14px;z-index:80;width:46px;height:46px;border-radius:50%;border:0;background:#0B5D57;color:#fff;font-size:22px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openTerminal;
    document.body.appendChild(b);
  }

  function openDeviceReports() {
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
    var cache = [];
    try { cache = JSON.parse(localStorage.getItem("deviceReportsCache") || "[]"); } catch (e) {}
    var html = "";
    for (var i = 0; i < cache.length && i < 40; i++) {
      var r = cache[i];
      var title = r.name || r.phone || r.sid || "جهاز";
      var when = r.at ? new Date(r.at).toLocaleString("ar-EG") : "";
      var rows = "";
      for (var k in r) {
        if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
        if (k === "sid" || k === "at") continue;
        var v = r[k];
        if (v == null || v === "") continue;
        if (typeof v === "object") v = JSON.stringify(v);
        rows += "<div style=\"display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06)\"><span style=\"opacity:.7\">" + String(k) + "</span><span dir=\"auto\" style=\"text-align:left;word-break:break-all\">" + String(v) + "</span></div>";
      }
      html += "<div style=\"border:1px solid #ddd;border-radius:10px;padding:10px;margin-bottom:8px;font-size:13px;text-align:right\"><b>" + title + "</b> · <small>" + when + "</small><div style=\"margin-top:8px\">" + rows + "</div></div>";
    }
    if (!html) html = "<div style=\"opacity:.7;text-align:right\">مفيش تقارير لسه</div>";
    ov.innerHTML = "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:480px;width:100%;padding:18px;max-height:90vh;overflow:auto\"><h3 style=\"margin:0 0 10px;text-align:right\">تقارير الأجهزة</h3><div>" + html + "</div><button id=\"devClose\" style=\"width:100%;margin-top:12px;padding:10px;border-radius:12px;border:1px solid #888;background:transparent;cursor:pointer\">إغلاق</button></div>";
    document.body.appendChild(ov);
    ov.querySelector("#devClose").onclick = function () { ov.remove(); };
  }

  function openSubAdminPanel() {
    if (!isMainAdmin()) return;
    var map = loadMap();
    var selected = null;

    var overlay = document.createElement("div");
    overlay.id = "subAdminOv";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px";

    function permChecksHtml(active) {
      active = active || [];
      var h = "";
      for (var i = 0; i < ALL_PERMS.length; i++) {
        var p = ALL_PERMS[i];
        var on = active.indexOf(p.id) >= 0;
        h += "<label style=\"display:flex;align-items:center;gap:8px;margin:6px 0;padding:6px 8px;border-radius:8px;background:" + (on ? "rgba(11,93,87,.08)" : "transparent") + "\">" +
          "<input type=\"checkbox\" data-perm=\"" + p.id + "\" " + (on ? "checked" : "") + "> " +
          "<span>" + p.label + "</span></label>";
      }
      return h;
    }

    function currentSubListHtml() {
      var keys = Object.keys(map);
      if (!keys.length) return "<div style=\"opacity:.65;padding:8px 0\">مفيش أدمن فرعي مسجل</div>";
      var h = "";
      for (var i = 0; i < keys.length; i++) {
        var phone = keys[i];
        var e = map[phone];
        var nPerm = (e.perms || []).length;
        h += "<div style=\"border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin-bottom:8px;text-align:right\">" +
          "<div style=\"display:flex;justify-content:space-between;align-items:center;gap:8px\">" +
          "<div><b>" + (e.name || phone) + "</b><br><span dir=\"ltr\" style=\"opacity:.75\">" + phone + "</span><br><small style=\"opacity:.7\">" + (nPerm ? nPerm + " صلاحية" : "لا توجد أذونات") + "</small></div>" +
          "<div style=\"display:flex;flex-direction:column;gap:6px\">" +
          "<button data-edit=\"" + phone + "\" style=\"padding:6px 12px;border:0;border-radius:8px;background:#0B5D57;color:#fff;cursor:pointer\">تعديل</button>" +
          "<button data-del=\"" + phone + "\" style=\"padding:6px 12px;border:1px solid #dc2626;border-radius:8px;background:transparent;color:#dc2626;cursor:pointer\">إلغاء الأدمن</button>" +
          "</div></div></div>";
      }
      return h;
    }

    function render() {
      var selName = selected ? (selected.name || selected.phone) : "— لم يُحدد —";
      var selPhone = selected ? selected.phone : "";
      var existing = selPhone && map[selPhone] ? map[selPhone] : null;
      var activePerms = existing && existing.perms ? existing.perms : [];

      overlay.innerHTML =
        "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:16px;text-align:right\">" +
        "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px\">" +
        "<h3 style=\"margin:0\">الأدمن الفرعي</h3>" +
        "<button id=\"saClose\" style=\"border:0;background:#f3f4f6;border-radius:8px;padding:6px 10px;cursor:pointer\">إغلاق</button></div>" +
        "<p style=\"font-size:13px;opacity:.75;margin:0 0 12px\">ابحث بالاسم أو الرقم، اختار الطالب، حدّد الصلاحيات، احفظ. تقدر تلغي الأدمن في أي وقت.</p>" +
        "<label style=\"font-weight:600;display:block;margin-bottom:4px\">بحث عن طالب</label>" +
        "<input id=\"saSearch\" placeholder=\"اسم أو رقم...\" style=\"width:100%;padding:11px;border-radius:10px;border:1px solid #d1d5db;margin-bottom:8px\">" +
        "<div id=\"saResults\" style=\"max-height:140px;overflow:auto;margin-bottom:10px\"></div>" +
        "<div style=\"background:#f9fafb;border-radius:12px;padding:10px;margin-bottom:12px\">" +
        "<div style=\"font-size:12px;opacity:.7\">المحدد حالياً</div>" +
        "<div style=\"font-weight:700\">" + selName + "</div>" +
        "<div dir=\"ltr\" style=\"opacity:.75\">" + (selPhone || "") + "</div></div>" +
        "<div style=\"font-weight:600;margin-bottom:6px\">الصلاحيات</div>" +
        "<div id=\"saPerms\" style=\"margin-bottom:12px\">" + permChecksHtml(activePerms) + "</div>" +
        "<button id=\"saSave\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">حفظ كأدمن فرعي</button>" +
        "<button id=\"saRemove\" style=\"width:100%;padding:10px;border:1px solid #dc2626;border-radius:12px;background:transparent;color:#dc2626;font-weight:700;cursor:pointer;margin-bottom:8px;display:" + (existing ? "block" : "none") + "\">إلغاء صلاحية الأدمن الفرعي</button>" +
        "<button id=\"saDevices\" style=\"width:100%;padding:10px;border:0;border-radius:12px;background:#4F46E5;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">تقارير الأجهزة</button>" +
        "<button id=\"saTerm\" style=\"width:100%;padding:10px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:700;cursor:pointer;margin-bottom:14px\">فتح Terminal</button>" +
        "<div style=\"font-weight:600;margin-bottom:6px\">الأدمن الفرعي الحالي</div>" +
        "<div id=\"saList\">" + currentSubListHtml() + "</div></div>";

      overlay.querySelector("#saClose").onclick = function () { overlay.remove(); };
      overlay.querySelector("#saDevices").onclick = function () { openDeviceReports(); };
      overlay.querySelector("#saTerm").onclick = function () { openTerminal(); };

      var searchInput = overlay.querySelector("#saSearch");
      var resultsBox = overlay.querySelector("#saResults");

      function showResults(q) {
        var hits = searchStudents(q);
        if (!q) {
          resultsBox.innerHTML = "<div style=\"opacity:.6;font-size:13px\">اكتب للبحث في قائمة الطلاب (افتح صفحة الطلاب مرة لو مفيش نتائج)</div>";
          return;
        }
        if (!hits.length) {
          resultsBox.innerHTML = "<div style=\"opacity:.6;font-size:13px\">لا توجد نتائج</div>";
          return;
        }
        var h = "";
        for (var i = 0; i < hits.length; i++) {
          var st = hits[i];
          var isSub = !!(st.phone && map[st.phone]);
          h += "<button type=\"button\" data-idx=\"" + i + "\" style=\"display:block;width:100%;text-align:right;padding:10px;margin-bottom:6px;border:1px solid #e5e7eb;border-radius:10px;background:" + (isSub ? "#ecfdf5" : "#fff") + ";cursor:pointer\">" +
            "<b>" + st.name + "</b>" + (isSub ? " <span style=\"color:#0B5D57;font-size:12px\">· أدمن فرعي</span>" : "") +
            "<br><span dir=\"ltr\" style=\"opacity:.75\">" + (st.phone || "بدون رقم") + "</span></button>";
        }
        resultsBox.innerHTML = h;
        var btns = resultsBox.querySelectorAll("[data-idx]");
        for (var bi = 0; bi < btns.length; bi++) {
          (function (st) {
            btns[bi].onclick = function () {
              if (!st.phone) { alert("الطالب مفيش له رقم تليفون"); return; }
              selected = st;
              render();
            };
          })(hits[parseInt(btns[bi].getAttribute("data-idx"), 10)]);
        }
      }

      searchInput.oninput = function () { showResults(searchInput.value); };
      showResults("");

      overlay.querySelector("#saSave").onclick = function () {
        if (!selected || !selected.phone) {
          alert("اختار طالب من نتائج البحث أولاً");
          return;
        }
        var phone = String(selected.phone).trim();
        if (phone.length < 8) { alert("رقم غير صالح"); return; }
        var perms = [];
        var boxes = overlay.querySelectorAll("[data-perm]");
        for (var x = 0; x < boxes.length; x++) {
          if (boxes[x].checked) perms.push(boxes[x].getAttribute("data-perm"));
        }
        map[phone] = {
          name: selected.name || phone,
          phone: phone,
          id: selected.id || "",
          perms: perms,
          updatedAt: Date.now()
        };
        saveMap(map);
        alert("تم حفظ الأدمن الفرعي ✓\n" + (perms.length ? perms.length + " صلاحية" : "بدون صلاحيات"));
        render();
      };

      overlay.querySelector("#saRemove").onclick = function () {
        if (!selected || !selected.phone) return;
        if (!confirm("إلغاء صلاحية الأدمن الفرعي؟")) return;
        delete map[selected.phone];
        saveMap(map);
        selected = null;
        alert("تم الإلغاء");
        render();
      };

      var editBtns = overlay.querySelectorAll("[data-edit]");
      for (var ei = 0; ei < editBtns.length; ei++) {
        editBtns[ei].onclick = function () {
          var phone = this.getAttribute("data-edit");
          var e = map[phone];
          selected = { name: e.name, phone: phone, id: e.id || "" };
          render();
        };
      }
      var delBtns = overlay.querySelectorAll("[data-del]");
      for (var di = 0; di < delBtns.length; di++) {
        delBtns[di].onclick = function () {
          var phone = this.getAttribute("data-del");
          if (!confirm("إلغاء الأدمن الفرعي؟")) return;
          delete map[phone];
          saveMap(map);
          if (selected && selected.phone === phone) selected = null;
          render();
        };
      }
    }

    document.body.appendChild(overlay);
    render();
  }

  function ensureSubAdminBtn() {
    if (!isMainAdmin()) {
      var o = document.getElementById("subAdminBtn");
      if (o) o.remove();
      return;
    }
    if (document.getElementById("subAdminBtn")) return;
    var b = document.createElement("button");
    b.id = "subAdminBtn";
    b.textContent = "أدمن فرعي";
    b.style.cssText =
      "position:fixed;bottom:88px;right:14px;z-index:80;padding:10px 14px;border-radius:99px;border:0;background:#4F46E5;color:#fff;font-size:13px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openSubAdminPanel;
    document.body.appendChild(b);
  }

  function checkNoPerms() {
    if (isMainAdmin()) return;
    var phone = currentPhone();
    if (!phone) return;
    var map = loadMap();
    if (!map[phone]) return;
    if (!(map[phone].perms || []).length) {
      if (!document.getElementById("noPermMsg")) {
        var d = document.createElement("div");
        d.id = "noPermMsg";
        d.style.cssText = "position:fixed;inset:0;z-index:90;background:var(--bg,#0C1716);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center";
        d.innerHTML = "<div><div style=\"font-size:48px;margin-bottom:12px\">🔒</div><h2>لا توجد أذونات</h2><p style=\"opacity:.8\">حسابك أدمن فرعي بدون صلاحيات.</p></div>";
        document.body.appendChild(d);
      }
    }
  }

  window.addEventListener("message", function (ev) {
    try {
      if (!ev.data || ev.data.type !== "eltafawoq-device-report") return;
      var r = ev.data.payload || {};
      r.at = r.at || Date.now();
      var cache = [];
      try { cache = JSON.parse(localStorage.getItem("deviceReportsCache") || "[]"); } catch (e) {}
      cache.unshift(r);
      if (cache.length > 100) cache = cache.slice(0, 100);
      localStorage.setItem("deviceReportsCache", JSON.stringify(cache));
    } catch (e) {}
  });

  setInterval(function () {
    fixCredit();
    ensureAdminTermBtn();
    ensureSubAdminBtn();
    checkNoPerms();
  }, 1500);

  setTimeout(function () {
    fixCredit();
    ensureAdminTermBtn();
    ensureSubAdminBtn();
  }, 1200);
})();
