/* v95 compressed loader */
const PARTS = ["z0.txt", "z1.txt", "z2.txt", "z3.txt", "z4.txt", "z5.txt"];
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej(new Error("script "+src));document.head.appendChild(s);});}
(async () => {
  try {
    await loadScript("https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js");
    let b64 = "";
    for (const p of PARTS) {
      const r = await fetch(p + "?v=95z");
      if (!r.ok) throw new Error("fail " + p + " " + r.status);
      b64 += (await r.text()).trim();
    }
    const compressed = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const code = pako.inflate(compressed, { to: "string" });
    const blob = new Blob([code], { type: "text/javascript" });
    await import(URL.createObjectURL(blob));
  } catch (e) {
    console.error("[v95]", e);
    const el = document.getElementById("app");
    if (el) el.innerHTML = '<div style="padding:24px;text-align:center;color:#fff;background:#0C1716;min-height:60vh"><h2>خطأ تحميل v95</h2><p dir="ltr">' + String(e && e.message || e) + '</p><button onclick="location.reload()" style="padding:12px 20px;border:0;border-radius:10px;background:#0B5D57;color:#fff">إعادة</button></div>';
  }
})();
