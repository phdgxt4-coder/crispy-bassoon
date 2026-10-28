/* mods2.js — fixed clean version */
(function () {
  var TG = "https://t.me/T_YAXC";
  var WA = "https://wa.me/201013905431";
  var TERM = "https://phdgxt4-coder.github.io/system-terminal/";

  function currentPhone() {
    try {
      return (window.S && S.profile && S.profile.phone) || localStorage.getItem("last_phone") || "";
    } catch (e) {
      return "";
    }
  }
  function currentUid() {
    try {
      return (window.S && S.user && S.user.uid) || "";
    } catch (e) {
      return "";
    }
  }
  function currentName() {
    try {
      return (window.S && S.profile && S.profile.name) || "";
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
    var q = [];
    if (uid) q.push("sid=" + encodeURIComponent(uid));
    if (phone) q.push("phone=" + encodeURIComponent(phone));
    if (name) q.push("name=" + name);
    q.push("from=eltafawoq");
    window.open(TERM + "?" + q.join("&"), "_blank", "noopener");
  }
  window.__openTerminal = openTerminal;

  function ensureTermBtn() {
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

  var ALL_PERMS = [
    { id: "students", label: "الطلاب" },
    { id: "exams", label: "الامتحانات" },
    { id: "chat", label: "التواصل" },
    { id: "games", label: "الألعاب" },
    { id: "life", label: "المتجر" },
    { id: "books", label: "الكتب" },
    { id: "asms", label: "التقييمات" },
    { id: "features", label: "المزايا" },
    { id: "site", label: "إعدادات الموقع" },
    { id: "terminal", label: "Terminal" },
    { id: "devices", label: "تقارير الأجهزة" }
  ];

  function openDeviceReports() {
    var ov = document.createElement("div");
    ov.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
    var cache = [];
    try {
      cache = JSON.parse(localStorage.getItem("deviceReportsCache") || "[]");
    } catch (e) {}
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
        rows +=
          "<div style=\"display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06)\">" +
          "<span style=\"opacity:.7\">" +
          String(k) +
          "</span><span dir=\"auto\" style=\"text-align:left;word-break:break-all\">" +
          String(v) +
          "</span></div>";
      }
      html +=
        "<div style=\"border:1px solid #ddd;border-radius:10px;padding:10px;margin-bottom:8px;font-size:13px;text-align:right\">" +
        "<b>" +
        title +
        "</b> · <small>" +
        when +
        "</small><div style=\"margin-top:8px\">" +
        rows +
        "</div></div>";
    }
    if (!html) html = "<div style=\"opacity:.7;text-align:right\">مفيش تقارير لسه</div>";
    ov.innerHTML =
      "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:480px;width:100%;padding:18px;max-height:90vh;overflow:auto\">" +
      "<h3 style=\"margin:0 0 10px;text-align:right\">تقارير الأجهزة</h3>" +
      "<div>" +
      html +
      "</div>" +
      "<button id=\"devClose\" style=\"width:100%;margin-top:12px;padding:10px;border-radius:12px;border:1px solid #888;background:transparent;cursor:pointer\">إغلاق</button></div>";
    document.body.appendChild(ov);
    ov.querySelector("#devClose").onclick = function () {
      ov.remove();
    };
  }

  function openSubAdminPanel() {
    if (!isMainAdmin()) return;
    var map = loadSubAdmins();
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";

    function renderList() {
      var rows = "";
      var phones = Object.keys(map);
      for (var i = 0; i < phones.length; i++) {
        var phone = phones[i];
        var e = map[phone];
        var permsTxt = e.perms && e.perms.length ? e.perms.join(", ") : "لا توجد أذونات";
        rows +=
          "<div style=\"border:1px solid #ccc;border-radius:12px;padding:10px;margin-bottom:8px;text-align:right\">" +
          "<b>" +
          (e.name || phone) +
          "</b> · <span dir=\"ltr\">" +
          phone +
          "</span><br><small>" +
          permsTxt +
          "</small><br>" +
          "<button data-edit=\"" +
          phone +
          "\" style=\"margin-top:6px;padding:6px 10px;border-radius:8px;border:0;background:#0B5D57;color:#fff;cursor:pointer\">تعديل</button> " +
          "<button data-del=\"" +
          phone +
          "\" style=\"margin-top:6px;padding:6px 10px;border-radius:8px;border:1px solid #c00;background:transparent;color:#c00;cursor:pointer\">حذف</button></div>";
      }
      if (!rows) rows = "<div style=\"opacity:.7;text-align:right\">مفيش أدمن فرعي لسه</div>";

      var checks = "";
      for (var j = 0; j < ALL_PERMS.length; j++) {
        var p = ALL_PERMS[j];
        checks +=
          "<label style=\"display:flex;align-items:center;gap:8px;margin:4px 0\"><input type=\"checkbox\" data-perm=\"" +
          p.id +
          "\"> " +
          p.label +
          "</label>";
      }

      overlay.innerHTML =
        "<div style=\"background:#fff;color:#111;border-radius:16px;max-width:420px;width:100%;padding:18px;max-height:90vh;overflow:auto;text-align:right\">" +
        "<h3 style=\"margin:0 0 12px\">إدارة الأدمن الفرعي</h3>" +
        "<label style=\"display:block;font-weight:600;margin-bottom:4px\">رقم التليفون</label>" +
        "<input id=\"saPhone\" placeholder=\"01xxxxxxxxx\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-bottom:8px;direction:ltr\">" +
        "<label style=\"display:block;font-weight:600;margin-bottom:4px\">الاسم</label>" +
        "<input id=\"saName\" placeholder=\"اسم\" style=\"width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-bottom:8px\">" +
        "<div style=\"margin:10px 0\">" +
        checks +
        "</div>" +
        "<button id=\"saSave\" style=\"width:100%;padding:12px;border:0;border-radius:12px;background:#0B5D57;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px\">حفظ</button>" +
        "<button id=\"saDevices\" style=\"width:100%;padding:10px;border:0;border-radius:12px;background:#4F46E5;color:#fff;font-weight:700;cursor:pointer;margin-bottom:12px\">تقارير الأجهزة</button>" +
        "<div>" +
        rows +
        "</div>" +
        "<button id=\"saClose\" style=\"width:100%;margin-top:12px;padding:10px;border-radius:12px;border:1px solid #888;background:transparent;cursor:pointer\">إغلاق</button></div>";

      overlay.querySelector("#saClose").onclick = function () {
        overlay.remove();
      };
      overlay.querySelector("#saDevices").onclick = function () {
        openDeviceReports();
      };
      overlay.querySelector("#saSave").onclick = function () {
        var phone = (overlay.querySelector("#saPhone").value || "").trim();
        if (!/^01\d{9}$/.test(phone)) {
          alert("رقم غير صحيح");
          return;
        }
        var name = (overlay.querySelector("#saName").value || "").trim();
        var perms = [];
        var boxes = overlay.querySelectorAll("[data-perm]");
        for (var x = 0; x < boxes.length; x++) {
          if (boxes[x].checked) perms.push(boxes[x].getAttribute("data-perm"));
        }
        map[phone] = { name: name || phone, perms: perms };
        saveSubAdmins(map);
        alert("تم الحفظ");
        renderList();
      };
      var editBtns = overlay.querySelectorAll("[data-edit]");
      for (var ei = 0; ei < editBtns.length; ei++) {
        editBtns[ei].onclick = function () {
          var phone = this.getAttribute("data-edit");
          var e = map[phone];
          overlay.querySelector("#saPhone").value = phone;
          overlay.querySelector("#saName").value = e.name || "";
          var boxes = overlay.querySelectorAll("[data-perm]");
          for (var bi = 0; bi < boxes.length; bi++) {
            boxes[bi].checked = (e.perms || []).indexOf(boxes[bi].getAttribute("data-perm")) >= 0;
          }
        };
      }
      var delBtns = overlay.querySelectorAll("[data-del]");
      for (var di = 0; di < delBtns.length; di++) {
        delBtns[di].onclick = function () {
          var phone = this.getAttribute("data-del");
          if (confirm("حذف؟")) {
            delete map[phone];
            saveSubAdmins(map);
            renderList();
          }
        };
      }
    }

    document.body.appendChild(overlay);
    renderList();
  }

  function ensureSubAdminBtn() {
    if (!isMainAdmin()) return;
    if (document.getElementById("subAdminBtn")) return;
    var b = document.createElement("button");
    b.id = "subAdminBtn";
    b.textContent = "أدمن فرعي";
    b.style.cssText =
      "position:fixed;bottom:88px;right:14px;z-index:80;padding:10px 14px;border-radius:99px;border:0;background:#4F46E5;color:#fff;font-size:13px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openSubAdminPanel;
    document.body.appendChild(b);
  }

  window.addEventListener("message", function (ev) {
    try {
      if (!ev.data || ev.data.type !== "eltafawoq-device-report") return;
      var r = ev.data.payload || {};
      r.at = r.at || Date.now();
      var cache = [];
      try {
        cache = JSON.parse(localStorage.getItem("deviceReportsCache") || "[]");
      } catch (e) {}
      cache.unshift(r);
      if (cache.length > 100) cache = cache.slice(0, 100);
      localStorage.setItem("deviceReportsCache", JSON.stringify(cache));
    } catch (e) {}
  });

  setInterval(function () {
    fixCredit();
    ensureTermBtn();
    ensureSubAdminBtn();
  }, 1500);

  setTimeout(function () {
    fixCredit();
    ensureTermBtn();
    ensureSubAdminBtn();
  }, 1200);
})();
