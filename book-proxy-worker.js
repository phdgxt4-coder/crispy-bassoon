// Cloudflare Worker: وسيط لقراءة ملف الكتاب (Drive/روابط عامة) من المنصة.
// نشر: Cloudflare Dashboard > Workers > Create > الصق الكود > Deploy، وبعدين حط رابطه في خانة "Worker وسيط" في الأدمن.
const ALLOW = ["https://phdgxt4-coder.github.io"];          // دومين المنصة فقط
const MAX = 25 * 1024 * 1024;                               // 25MB
export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ALLOW.includes(origin) ? origin : ALLOW[0], "Vary": "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    if (!ALLOW.includes(origin)) return new Response("forbidden", { status: 403, headers: cors });
    const u = new URL(req.url).searchParams.get("url") || "";
    let t; try { t = new URL(u); } catch (_) { return new Response("bad url", { status: 400, headers: cors }); }
    if (t.protocol !== "https:" || !/(^|\.)((drive|docs)\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com)$/.test(t.hostname) && !/\.(pdf|txt)(\?|$)/i.test(t.pathname))
      return new Response("host not allowed", { status: 400, headers: cors });
    const r = await fetch(t.href, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    const len = +(r.headers.get("content-length") || 0);
    if (len > MAX) return new Response("too large", { status: 413, headers: cors });
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("Content-Type") || "application/octet-stream" } });
  }
};
