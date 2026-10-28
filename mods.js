/* mods.js — روابط التواصل + وضع Terminal + تعديلات خفيفة */
(function () {
  const TG = "https://t.me/T_YAXC";
  const WA = "https://wa.me/201013905431";
  const TERM = "https://phdgxt4-coder.github.io/system-terminal/";

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
    try {
      if (typeof window.uiDialog === "function") {
        window.uiDialog({
          title: "👾 System Terminal",
          icon: "👾",
          msg: "هتفتح وضع الـ Terminal في نافذة جديدة.",
          ok: "فتح",
        }).then(function (ok) {
          if (ok) window.open(TERM, "_blank", "noopener");
        });
      } else {
        window.open(TERM, "_blank", "noopener");
      }
    } catch (e) {
      window.open(TERM, "_blank", "noopener");
    }
  }

  // راقب ظهور الـ credit وعدّله
  const obs = new MutationObserver(function () {
    if (document.getElementById("credit")) fixCredit();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(fixCredit, 1500);

  // زر Terminal عائم (للطالب والأدمن)
  function ensureTermBtn() {
    if (document.getElementById("termFab")) return;
    const b = document.createElement("button");
    b.id = "termFab";
    b.title = "System Terminal";
    b.textContent = "👾";
    b.style.cssText =
      "position:fixed;bottom:88px;left:14px;z-index:80;width:46px;height:46px;border-radius:50%;border:0;background:#0B5D57;color:#fff;font-size:22px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer";
    b.onclick = openTerminal;
    document.body.appendChild(b);
  }
  setTimeout(ensureTermBtn, 2000);
  setInterval(ensureTermBtn, 4000);

  // للأدمن: زر في أعلى الصفحة يفتح الـ Terminal + تذكير بوضع الأدمن الفرعي
  window.__openTerminal = openTerminal;
})();
