/* v95 loader */
const PARTS = ["s0.js", "s1.js", "s2.js", "s3.js", "s4.js", "s5.js", "s6.js", "s7.js", "s8.js", "s9.js", "s10.js", "s11.js", "s12.js", "s13.js"];
(async () => {
  try {
    let code = "";
    for (const p of PARTS) {
      const r = await fetch(p + "?v=95p4");
      if (!r.ok) throw new Error("fail " + p + " " + r.status);
      code += await r.text();
    }
    const blob = new Blob([code], { type: "text/javascript" });
    await import(URL.createObjectURL(blob));
  } catch (e) {
    console.error("[v95 loader]", e);
    const el = document.getElementById("app");
    if (el) el.innerHTML = '<div style="padding:24px;text-align:center;color:#fff;background:#0C1716;min-height:60vh"><h2>خطأ تحميل</h2><p dir="ltr">' + String(e && e.message || e) + '</p><button onclick="location.reload()" style="padding:12px 20px;border:0;border-radius:10px;background:#0B5D57;color:#fff">إعادة</button></div>';
  }
})();
