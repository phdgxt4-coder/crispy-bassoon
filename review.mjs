#!/usr/bin/env node
/* مراجع كود التفوق — بدون أي مكتبات، بدون أي استهلاك Firebase.
   التشغيل:  node tools/code-review/review.mjs [--root .] [--out code-review] [--errors ملف-أخطاء.txt]
   كل تشغيل = مراجعة كاملة سطر بسطر + تمريرة تحقق ذاتي + مقارنة بالتشغيل السابق. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import os from "node:os";
import { spawnSync } from "node:child_process";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "."));
const OUT = path.resolve(ROOT, arg("--out", "code-review"));
const ERRFILE = arg("--errors", "");
const SECFILE = arg("--security", "");
const PRUNE = process.argv.includes("--prune");
const EXT = new Set([".html", ".js", ".mjs", ".css", ".json"]);
const SKIP = new Set(["node_modules", ".git", "icons", "code-review", ".github"]);
/* وضع المراقبة: أي تعديل أو سطر جديد في أي ملف => مراجعة كاملة تلقائياً */
if (process.argv.includes("--watch")) {
  const args = process.argv.slice(1).filter((a) => a !== "--watch");
  const once = () => spawnSync(process.execPath, args, { stdio: "inherit" });
  once(); let tm;
  fs.watch(ROOT, { recursive: true }, (_e, fn) => {
    if (!fn || /^(code-review|node_modules|\.git)([\\/]|$)/.test(fn)) return;
    clearTimeout(tm); tm = setTimeout(() => { console.log("\n🔄 اتغيّر: " + fn); once(); }, 1500);
  });
  console.log("👀 المراقبة شغالة — أي تعديل هيتراجع لوحده (Ctrl+C للإيقاف)");
  await new Promise(() => {});
}
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

/* ───────── 1) جمع الملفات ───────── */
function walk(d, acc = []) {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(n.name) || n.name.startsWith(".")) continue;
    const p = path.join(d, n.name);
    if (n.isDirectory()) walk(p, acc);
    else if (EXT.has(path.extname(n.name)) && fs.statSync(p).size < 5e6 && !/package-lock\.json$/.test(n.name)) acc.push(p);
  }
  return acc;
}
const files = walk(ROOT).map((abs) => {
  const text = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
  return { abs, rel: path.relative(ROOT, abs).replace(/\\/g, "/"), ext: path.extname(abs), text, lines: text.replace(/\n$/, "").split("\n") };
});

/* ───────── 2) تقسيم كل ملف لمناطق: html / style / script ───────── */
function zones(f) {
  const z = new Array(f.lines.length).fill("html");
  const blocks = []; // {kind:'classic'|'module'|'json', code, startLine}
  if (f.ext === ".js" || f.ext === ".mjs") { z.fill("script"); blocks.push({ kind: f.ext === ".mjs" ? "module" : "classic", code: f.text, startLine: 1 }); }
  else if (f.ext === ".css") z.fill("style");
  else if (f.ext === ".html") {
    const re = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi; let m;
    while ((m = re.exec(f.text))) {
      const bodyStart = m.index + m[0].indexOf(">") + 1;
      const startLine = f.text.slice(0, bodyStart).split("\n").length;
      const n = m[3].split("\n").length;
      const tag = m[1].toLowerCase(), attrs = m[2];
      const kind = tag === "style" ? "style" : /\bsrc\s*=/.test(attrs) ? "ext" : /type\s*=\s*["']?module/i.test(attrs) ? "module" : /type\s*=\s*["']?(importmap|application\/json|application\/ld\+json)/i.test(attrs) ? "json" : "classic";
      for (let i = 0; i < n; i++) if (startLine - 1 + i < z.length) z[startLine - 1 + i] = tag === "style" ? "style" : kind === "json" || kind === "ext" ? "html" : "script";
      if (tag === "script" && kind !== "ext" && m[3].trim()) blocks.push({ kind, code: m[3], startLine });
    }
  }
  return { z, blocks };
}
for (const f of files) Object.assign(f, zones(f));

/* ───────── 3) تجميع النتائج ───────── */
const findings = [];
const add = (rule, sev, conf, f, line, msg, fix) => findings.push({ rule, sev, conf, file: f.rel, line, msg, fix: fix || "", snippet: line ? (f.lines[line - 1] || "").trim().slice(0, 160) : "" });
const agg = {}; // قواعد معلوماتية: تجميع
const addAgg = (rule, f, line) => { (agg[rule] ||= []).push({ file: f.rel, line }); };
const checks = []; // ما تم فحصه فعلاً (لقسم "سليم")
const check = (name, scope, ok, detail) => checks.push({ name, scope, ok, detail: detail || "" });

/* ───────── 4) فحص الصياغة (Syntax) لكل سكريبت ───────── */
let nBlocks = 0, badBlocks = 0;
for (const f of files) {
  if (f.ext === ".json") {
    try { JSON.parse(f.text); } catch (e) { add("syntax", "error", "confirmed", f, 1, "JSON غير صالح: " + e.message); }
    continue;
  }
  for (const b of f.blocks) {
    nBlocks++;
    let err = null, ln = 1;
    if (b.kind === "classic") {
      try { new vm.Script(b.code, { filename: f.rel }); } catch (e) { err = e; const m = /:(\d+)/.exec(String(e.stack).split("\n")[0]); ln = m ? +m[1] : 1; }
    } else if (b.kind === "module") {
      const tmp = path.join(os.tmpdir(), "rv-" + process.pid + "-" + nBlocks + ".mjs");
      fs.writeFileSync(tmp, b.code);
      const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
      fs.unlinkSync(tmp);
      if (r.status !== 0) { err = new Error((r.stderr.split("\n").find((l) => /Error/.test(l)) || "خطأ صياغة").trim()); const m = /\.mjs:(\d+)/.exec(r.stderr); ln = m ? +m[1] : 1; }
    }
    if (err) { badBlocks++; add("syntax", "error", "confirmed", f, b.startLine + ln - 1, "خطأ صياغة JavaScript: " + String(err.message).slice(0, 160), "صحّح السطر ده — المتصفح هيوقف السكريبت كله عنده."); }
  }
}
check("صياغة JavaScript (Syntax)", `${nBlocks} كتلة سكريبت`, badBlocks === 0, badBlocks ? badBlocks + " كتلة فيها خطأ" : "كل الكتل اتحلّلت بنجاح بدون أخطاء");

/* ───────── 5) اتساق رقم الإصدار (meta / شارة / APP_BUILD / sw.js) ───────── */
{
  const idx = files.find((f) => f.rel === "index.html"), sw = files.find((f) => f.rel === "sw.js");
  if (idx && sw) {
    const found = []; // [name, version, file, line]
    const grab = (f, re, name) => f.lines.forEach((l, i) => { const m = re.exec(l); if (m) found.push([name, m[1], f, i + 1]); });
    grab(idx, /<meta name="sw-build" content="(v\d+)"/, "meta sw-build");
    grab(idx, /window\.APP_BUILD\s*=\s*"(v\d+)"/, "APP_BUILD");
    grab(idx, /id="verBadge">(v\d+)</, "شارة الإصدار (verBadge)");
    grab(sw, /const CACHE\s*=\s*"eltafawoq-(v\d+)"/, "sw.js CACHE");
    grab(sw, /const BUILD\s*=\s*"\d+-(v\d+)"/, "sw.js BUILD");
    const ref = (found.find((x) => x[0] === "APP_BUILD") || [])[1];
    const bad = found.filter((x) => x[1] !== ref);
    bad.forEach((x) => add("build-mismatch", "error", "confirmed", x[2], x[3], `رقم الإصدار في «${x[0]}» = ${x[1]} بينما APP_BUILD = ${ref}`, `خلّيه ${ref}`));
    check("اتساق رقم الإصدار", `${found.length} موضع`, bad.length === 0, bad.length ? bad.length + " موضع مختلف" : "كل المواضع على " + ref);
  }
}

/* ───────── 6) تكرار id في HTML الثابت + مراجع id مفقودة ───────── */
{
  const idLines = {};
  for (const f of files.filter((x) => x.ext === ".html"))
    f.lines.forEach((l, i) => { if (f.z[i] !== "html") return; for (const m of l.matchAll(/\sid\s*=\s*"([^"$]+)"/g)) (idLines[f.rel + "|" + m[1]] ||= []).push(i + 1); });
  let dup = 0;
  for (const [k, ls] of Object.entries(idLines)) if (ls.length > 1) { dup++; const [fr, id] = k.split("|"); add("duplicate-id", "warn", "confirmed", files.find((x) => x.rel === fr), ls[1], `id="${id}" مكرر في HTML (الأسطر ${ls.join("، ")})`, "كل id لازم يكون فريد."); }
  check("تكرار id في HTML الثابت", Object.keys(idLines).length + " id", dup === 0, dup ? dup + " مكرر" : "ولا id مكرر");

  const all = files.map((f) => f.text).join("\n");
  const declared = new Set(), prefixes = new Set();
  for (const m of all.matchAll(/\bid\s*=\s*\\?["']([^"'\\]*)/g)) { const v = m[1]; const k = v.indexOf("${"); if (k > -1) prefixes.add(v.slice(0, k)); else declared.add(v); }
  for (const m of all.matchAll(/\.id\s*=\s*["']([^"']+)["']/g)) declared.add(m[1]);
  for (const m of all.matchAll(/\bid\s*:\s*["']([^"']+)["']/g)) declared.add(m[1]);
  for (const m of all.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["']([^"']+)["']/g)) declared.add(m[1]);
  let miss = 0, refs = 0;
  for (const f of files.filter((x) => x.ext !== ".json" && x.ext !== ".css"))
    f.lines.forEach((l, i) => {
      if (f.z[i] !== "script") return;
      for (const m of l.matchAll(/getElementById\(\s*["']([^"'$+]+)["']\s*\)|querySelector\(\s*["']#([\w-]+)["']\s*\)/g)) {
        const id = m[1] || m[2]; refs++;
        if (declared.has(id) || [...prefixes].some((p) => p && id.startsWith(p))) continue;
        miss++; add("missing-id", "warn", "suspect", f, i + 1, `الكود بيدوّر على id="${id}" ومش لاقي تعريف له في أي ملف`, "اتأكد إن العنصر بيتعمل ديناميكياً، أو صحّح الاسم.");
      }
    });
  check("مراجع getElementById/querySelector('#…')", refs + " مرجع", miss === 0, miss ? miss + " مرجع بدون تعريف ظاهر" : "كل المراجع ليها تعريف");
}

/* ───────── 7) دوال/متغيرات غير مستخدمة + دوال مكررة ───────── */
const fnNow = {}; let freqAll = new Map();
const bodyOf = (arr, k) => { let bal = 0, st = false; const o = []; for (let j = k; j < arr.length && j < k + 400; j++) { const t = arr[j].replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ""); o.push(arr[j]); for (const c of t) { if (c === "{") { bal++; st = true; } else if (c === "}") bal--; } if (st && bal <= 0) break; if (!st && /[;,]\s*$/.test(t)) break; } return o.join("\n"); };
{
  /* sw.js له نطاق منفصل عن الصفحات: الاسم لازم يتعدّ جوّا نطاقه بس */
  const grp = (f) => (/(^|\/)sw\.js$|service-?worker/i.test(f.rel) ? "sw" : "page");
  const freq = freqAll;
  for (const f of files) for (const t of f.text.match(/[A-Za-z_$][\w$]*/g) || []) freq.set(grp(f) + "|" + t, (freq.get(grp(f) + "|" + t) || 0) + 1);
  const FN = /^(\s{0,4})(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/;
  const AR = /^(\s{0,4})(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/;
  const VR = /^(\s{0,2})(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
  let unused = 0, dupFn = 0, decl = 0;
  for (const f of files) {
    if (f.ext === ".json" || f.ext === ".css") continue;
    for (const b of f.blocks) {
      const seen = {};
      const bl = b.code.split("\n");
      bl.forEach((l, k) => {
        const ln = b.startLine + k; let m, kind = "";
        if ((m = FN.exec(l))) kind = "دالة"; else if ((m = AR.exec(l))) kind = "دالة"; else if ((m = VR.exec(l))) kind = "متغير";
        if (!m) return;
        const name = m[2]; decl++;
        if (kind === "دالة") fnNow[name] = fnNow[name] ? sha(fnNow[name] + bodyOf(bl, k)) : sha(bodyOf(bl, k));
        if (name.length >= 3 && freq.get(grp(f) + "|" + name) === 1 && !/review:keep/.test(l)) { unused++; add("unused", "info", "suspect", f, ln, `${kind} «${name}» معرّفة ومفيش أي استخدام ليها في أي ملف`, "لو مش بتتنادى ديناميكياً (window[...]) احذفها."); }
        if (kind === "دالة" && m[1].length === 0) { if (seen[name]) { dupFn++; add("duplicate-function", "warn", "suspect", f, ln, `الدالة «${name}» معرّفة أكتر من مرة في نفس السكريبت (أول تعريف سطر ${seen[name]}) — الأخيرة بتلغي اللي قبلها`, "احذف النسخة القديمة أو غيّر الاسم."); } else seen[name] = ln; }
      });
    }
  }
  check("دوال/متغيرات غير مستخدمة", decl + " تعريف", unused === 0, unused ? unused + " اشتباه" : "كل التعريفات مستخدمة");
  check("دوال مكررة بنفس الاسم (مستوى أعلى)", decl + " تعريف", dupFn === 0, dupFn ? dupFn + " اشتباه" : "مفيش تكرار");
}

/* ───────── 8) مراجعة سطر بسطر: قواعد بسيطة ───────── */
const stats = [];
for (const f of files) {
  const st = { file: f.rel, total: f.lines.length, blank: 0, comment: 0, code: 0, dead: 0 };
  let inBlock = false, blankRun = 0;
  f.lines.forEach((raw, i) => {
    const ln = i + 1, l = raw.replace(/\r$/, ""), t = l.trim(), zone = f.z[i];
    if (!t) { st.blank++; blankRun++; if (blankRun === 3) { addAgg("blank-run", f, ln); st.dead++; } return; } blankRun = 0;
    if (inBlock) { st.comment++; if (t.includes("*/")) inBlock = false; return; }
    if (/^\/\*/.test(t) && zone !== "html") { st.comment++; if (!t.includes("*/")) inBlock = true; return; }
    if (/^\/\//.test(t) && zone === "script") {
      st.comment++;
      if (/(;|\{|\})\s*$/.test(t) && !/https?:/.test(t) && /\b(const|let|var|if|for|return|await|function|\w+\()/.test(t.slice(2))) { addAgg("commented-code", f, ln); st.dead++; }
      return;
    }
    st.code++;
    if (/\s+$/.test(l)) addAgg("trailing-space", f, ln);
    if (zone === "script") {
      if (/^\s*debugger\s*;?/.test(l)) add("debugger", "warn", "confirmed", f, ln, "كلمة debugger متسابة في الكود", "احذفها.");
      if (/console\.log\s*\(/.test(l)) addAgg("console-log", f, ln);
      if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(l)) addAgg("empty-catch", f, ln);
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) addAgg("todo", f, ln);
      if (l.length > 3000) addAgg("very-long-line", f, ln);
    }
  });
  stats.push(st);
}

/* ───────── 9) كود مكرر (نفس 8 أسطر ورا بعض في أكتر من مكان) ───────── */
{
  const W = 8, map = new Map(), dups = [];
  for (const f of files.filter((x) => x.ext === ".html" || x.ext === ".js" || x.ext === ".mjs")) {
    const L = f.lines.map((l, i) => (f.z[i] === "script" ? l.trim() : ""));
    for (let i = 0; i + W <= L.length; i++) {
      const w = L.slice(i, i + W); if (w.some((x) => x.length < 25)) continue;
      const h = sha(w.join("\n")); (map.get(h) || map.set(h, []).get(h)).push({ f, line: i + 1 });
    }
  }
  const covered = new Set();
  for (const occ of map.values()) {
    if (occ.length < 2) continue;
    const key = occ[0].f.rel + ":" + occ[0].line; if (covered.has(key)) continue;
    // مد التطابق لأقصى طول
    let len = W; const a = occ[0], b = occ[1];
    while (a.f.lines[a.line - 1 + len] !== undefined && a.f.lines[a.line - 1 + len].trim() === (b.f.lines[b.line - 1 + len] || "").trim() && a.f.lines[a.line - 1 + len].trim().length >= 25) len++;
    for (const o of occ) for (let k = 0; k < len; k++) covered.add(o.f.rel + ":" + (o.line + k));
    dups.push({ len, at: occ.map((o) => `${o.f.rel}:${o.line}`) });
  }
  dups.sort((x, y) => y.len - x.len);
  dups.slice(0, 25).forEach((d) => { const [fr, ln] = d.at[0].split(":"); add("duplicate-block", "info", "suspect", files.find((x) => x.rel === fr), +ln, `نفس ${d.len} سطر متكررين في ${d.at.length} أماكن: ${d.at.join("، ")}`, "اعمل دالة مشتركة بدل النسخ."); });
  check("كود مكرر (≥ 8 أسطر ورا بعض)", "كل السكريبتات", dups.length === 0, dups.length ? dups.length + " كتلة مكررة (أكبر 25 اتعرضت)" : "مفيش تكرار");
}

/* ───────── 10) sw.js: الملفات المخزّنة مسبقاً موجودة؟ ───────── */
{
  const sw = files.find((f) => f.rel === "sw.js");
  const partial = !fs.existsSync(path.join(ROOT, ".git")) && files.filter((f) => f.ext === ".html").length < 3;
  if (sw && !partial) {
    const m = /Promise\.allSettled\(\[([^\]]*)\]/.exec(sw.text);
    if (m) {
      const list = [...m[1].matchAll(/"\.\/([^"]+)"/g)].map((x) => x[1]); let miss = 0;
      for (const p of list) if (!fs.existsSync(path.join(ROOT, p))) { miss++; add("sw-precache-missing", "warn", "confirmed", sw, sw.lines.findIndex((l) => l.includes("Promise.allSettled")) + 1, `الملف «${p}» في قائمة التخزين المسبق ومش موجود في الريبو`, "ارفعه أو شيله من القائمة."); }
      check("ملفات التخزين المسبق في sw.js", list.length + " ملف", miss === 0, miss ? miss + " ناقص" : "كلها موجودة");
    }
  } else if (sw) checks.push({ name: "ملفات التخزين المسبق في sw.js", scope: "—", ok: null, detail: "اتخطّى: النسخة المرفوعة جزئية (ملفات متغيّرة بس). هيشتغل تلقائياً على الريبو الكامل." });
}

/* ───────── 11) قراءة ملف أخطاء المنصة (تصدير مركز الأخطاء .txt) ───────── */
let errParsed = null;
if (ERRFILE && fs.existsSync(ERRFILE)) {
  const raw = fs.readFileSync(ERRFILE, "utf8").replace(/^\uFEFF/, ""), at = raw.search(/^#1\s+—/m);
  const header = at > -1 ? raw.slice(0, at) : raw, blocks = at > -1 ? raw.slice(at).split(/\n-{20,}\n/).filter((x) => x.trim()) : [];
  const groups = new Map(), g1 = (blk, re) => (re.exec(blk) || [])[1] || "";
  for (const blk of blocks) {
    const type = g1(blk, /^#\d+\s+—\s*(.*)$/m), msg = g1(blk, /^الرسالة:\s*(.*)$/m).trim(), fn = g1(blk, /^الدالة:\s*(.*)$/m).trim() || "-", ver = g1(blk, /^الإصدار:\s*(.*)$/m).trim() || "-";
    let dev = g1(blk, /^الجهاز:\s*(.*)$/m).trim().replace(/^"|"$/g, ""); dev = dev.split(" · ").slice(0, 2).join(" · ") || "؟";
    const k = type + "|" + msg.slice(0, 120) + "|" + fn, g = groups.get(k) || { type, msg, fn, vers: new Set(), devs: new Map(), n: 0, blocks: [], loc: null };
    g.n++; g.vers.add(ver); g.devs.set(dev, (g.devs.get(dev) || 0) + 1); g.blocks.push(blk);
    const m = /([\w.-]+\.(?:html|js|mjs)):(\d+):(\d+)/.exec(blk); if (m) g.loc = { file: m[1], line: +m[2], ver };
    groups.set(k, g);
  }
  errParsed = { header, groups: [...groups.values()], total: blocks.length, file: path.basename(ERRFILE) };
}

/* ───────── 11ب) دمج نتائج فاحص الأمان (security_scan.py) في نفس التقرير ───────── */
{
  const sp = SECFILE || path.join(OUT, "security.json");
  if (fs.existsSync(sp)) {
    const j = JSON.parse(fs.readFileSync(sp, "utf8")), SM = { critical: "error", high: "warn", medium: "info" };
    for (const i of j.issues) { const f = files.find((x) => x.rel === i.file); if (!f || !i.line) continue; add("sec-" + i.rule, SM[i.severity], "suspect", f, i.line, "[أمان] " + i.message); findings[findings.length - 1].verifyText = i.match || ""; }
    const hard = j.issues.filter((i) => i.severity !== "medium").length;
    check("فحص الأمان (أسرار، eval، XSS، CSP، SRI)", j.files + " ملف", hard === 0, hard ? hard + " مشكلة حرجة/عالية" : "لا أسرار ولا eval ولا document.write" + (j.issues.length ? " — فيه " + j.issues.length + " ملاحظة متوسطة" : ""));
  } else checks.push({ name: "فحص الأمان", scope: "—", ok: null, detail: "security.json مش موجود — شغّل: python3 tools/code-review/security_scan.py الأول" });
}

/* ───────── 12) تمريرة التحقق الذاتي: كل نتيجة لازم تتطابق مع سطرها الفعلي ───────── */
const byRel = Object.fromEntries(files.map((f) => [f.rel, f]));
let verified = 0; const unverified = [];
for (const x of findings) {
  const f = byRel[x.file]; const real = f && x.line ? (f.lines[x.line - 1] || "").trim().slice(0, 160) : null;
  if (x.line && real === x.snippet && x.line <= f.lines.length && (!x.verifyText || real.includes(x.verifyText) || (f.lines[x.line - 1] || "").includes(x.verifyText))) { x.verified = true; verified++; } else unverified.push(x);
}
const good = findings.filter((x) => x.verified);

/* ───────── 13) الحالة بين التشغيلات (اتنفذ / لسه / جديد) ───────── */
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, "state.json");
let state = { runs: 0, firstAt: null, files: {}, issues: {}, history: [] };
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}
state.runs++; const run = state.runs, now = new Date().toISOString(); state.firstAt ||= now;
const seenNow = new Map(); const occ = {};
for (const x of good) { const base = sha([x.rule, x.file, x.snippet, x.msg.replace(/\d+/g, "#")].join("|")); occ[base] = (occ[base] || 0) + 1; x.fp = base + "-" + occ[base]; seenNow.set(x.fp, x); }
const isNew = [], still = [], fixed = [];
for (const [fp, x] of seenNow) { const o = state.issues[fp]; if (!o || o.status === "fixed") { state.issues[fp] = { status: "open", rule: x.rule, file: x.file, msg: x.msg, firstRun: o ? o.firstRun : run, reopened: !!o, lastRun: run, line: x.line }; isNew.push(x); } else { o.lastRun = run; o.line = x.line; still.push(x); } }
for (const [fp, o] of Object.entries(state.issues)) if (o.status === "open" && !seenNow.has(fp)) { o.status = "fixed"; o.fixedRun = run; fixed.push(o); }
const totalLines = stats.reduce((s, x) => s + x.total, 0);
for (const f of files) { const p = state.files[f.rel] || { reviews: 0 }; const before = p.lines; p.delta = before === undefined ? null : f.lines.length - before; p.reviews++; p.changed = p.hash !== sha(f.text); p.hash = sha(f.text); p.lines = f.lines.length; p.lastRun = run; state.files[f.rel] = p; }
/* ───────── 13ب) أخطاء المنصة: لسه موجودة ولا اتصلّحت؟ ───────── */
const idxFile = files.find((f) => f.rel === "index.html"), curBuild = (/window\.APP_BUILD\s*=\s*"(v\d+)"/.exec(idxFile ? idxFile.text : "") || [])[1] || null;
const vn = (v) => +(String(v).replace(/\D/g, "") || 0);
state.fnHashes ||= {};
let errSummary = null;
if (errParsed) {
  const open = [], resolved = [];
  for (const g of errParsed.groups) {
    const vers = [...g.vers].filter((v) => v !== "-"), newest = vers.sort((x, y) => vn(y) - vn(x))[0] || "-";
    const devs = [...g.devs.entries()].sort((x, y) => y[1] - x[1]);
    Object.assign(g, { newest, devList: devs.map(([d, n]) => `${d} ×${n}`) });
    const nm = g.fn, simple = /^[A-Za-z_$][\w$]*$/.test(nm);
    const used = simple ? (freqAll.get("page|" + nm) || 0) + (freqAll.get("sw|" + nm) || 0) : null;
    if (!curBuild) { g.reason = "مفيش APP_BUILD في index.html للمقارنة"; open.push(g); }
    else if (newest === "-") { g.reason = "الخطأ من غير رقم إصدار — مش قادر أحكم"; open.push(g); }
    else if (vn(newest) >= vn(curBuild)) { g.reason = "لسه بيحصل في الإصدار الحالي " + curBuild; open.push(g); }
    else if (simple && used === 0) { g.reason = `الدالة «${nm}» مش موجودة في الكود دلوقتي`; resolved.push(g); }
    else if (simple && state.fnHashes[newest] && state.fnHashes[newest][nm] !== undefined && fnNow[nm] !== undefined) {
      if (state.fnHashes[newest][nm] !== fnNow[nm]) { g.reason = `الدالة «${nm}» اتعدّلت من إصدار ${newest} لحد ${curBuild} ومفيش تكرار للخطأ بعدها`; resolved.push(g); }
      else { g.reason = `الدالة «${nm}» لسه زي ما هي من ${newest} — الخطأ غالباً لسه موجود`; open.push(g); }
    } else { g.reason = simple ? `مفيش سجل مراجعة لإصدار ${newest} للمقارنة` : "الخطأ مش مربوط باسم دالة نقدر نقارنها"; open.push(g); }
  }
  open.sort((x, y) => y.n - x.n); resolved.sort((x, y) => y.n - x.n);
  errSummary = { total: errParsed.total, open, resolved, file: errParsed.file, pruned: false };
  if (PRUNE && resolved.length) {
    const sep = "\n" + "-".repeat(40) + "\n", keep = open.flatMap((g) => g.blocks), gone = resolved.flatMap((g) => g.blocks);
    fs.writeFileSync(ERRFILE, "\uFEFF" + errParsed.header.replace(/عدد الأخطاء:\s*\d+/, "عدد الأخطاء: " + keep.length) + keep.join(sep) + (keep.length ? sep : ""));
    fs.appendFileSync(path.join(OUT, "errors-resolved.txt"), `\n===== مراجعة ${run} — ${new Date().toISOString()} — اتشالت ${gone.length} =====\n` + resolved.map((g) => `[${g.n}×] ${g.type} — ${g.msg}\nالسبب: ${g.reason}`).join("\n\n") + "\n");
    errSummary.pruned = true;
  }
}
if (curBuild) { state.fnHashes[curBuild] = fnNow; for (const k of Object.keys(state.fnHashes).sort((x, y) => vn(y) - vn(x)).slice(4)) delete state.fnHashes[k]; }

const affected = new Set(good.filter((x) => x.line && x.sev !== "info").map((x) => x.file + ":" + x.line)).size;
const errs = good.filter((x) => x.sev === "error"), warns = good.filter((x) => x.sev === "warn"), infos = good.filter((x) => x.sev === "info");
state.history.push({ run, at: now, lines: totalLines, errors: errs.length, warns: warns.length, infos: infos.length + Object.values(agg).reduce((s, a) => s + a.length, 0) });
state.history = state.history.slice(-50);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

/* ───────── 14) كتابة التقرير (MD + HTML) ───────── */
const AGG = {
  "blank-run": ["أسطر فاضية زيادة (3 ورا بعض أو أكتر)", "احذف الزيادة — صفر تأثير على التشغيل."],
  "commented-code": ["كود قديم متعلّق (معمول له تعليق)", "احذفه — لو محتاجه Git محتفظ بيه."],
  "trailing-space": ["مسافات زيادة في آخر السطر", "نضّفها تلقائياً من المحرر."],
  "console-log": ["console.log متسابة", "احذفها من النسخة النهائية."],
  "empty-catch": ["catch فاضي (بيبلع الخطأ بصمت)", "معظمها مقصود (localStorage مثلاً)، راجع بس اللي حواليه مهم."],
  "todo": ["ملاحظات TODO/FIXME", "خلّصها أو احذفها."],
  "very-long-line": ["سطر أطول من 3000 حرف", "صعب المراجعة — قسّمه."],
};
const SEV = { error: "خطأ", warn: "تحذير", info: "معلومة" }, CONF = { confirmed: "مؤكد", suspect: "اشتباه (محتاج نظرة بشرية)" };
const dl = (d) => (d === null || d === undefined ? "أول مرة" : d === 0 ? "بدون تغيير في عدد الأسطر" : d > 0 ? `+${d} سطر مضاف` : `${d} سطر محذوف`);
const lc = (x) => `${x.file}:${x.line}`;
const sum = `المراجعة رقم ${run} · راجعت ${files.length} ملف / ${totalLines.toLocaleString("en")} سطر · لقيت ${errs.length} خطأ + ${warns.length} تحذير + ${infos.length} ملاحظة/اشتباه في ${affected} سطر مختلف`;
const codeLines = stats.reduce((s, x) => s + x.code, 0), blank = stats.reduce((s, x) => s + x.blank, 0), comm = stats.reduce((s, x) => s + x.comment, 0), dead = stats.reduce((s, x) => s + x.dead, 0);

const md = [];
md.push(`# تقرير مراجعة كود التفوق`, ``, `**${sum}**`, ``, `- وقت التشغيل: ${now}`, `- عدد التمريرات في هذا التشغيل: 2 (١: اكتشاف سطر بسطر — ٢: تحقق ذاتي: كل نتيجة اتقارنت بسطرها الفعلي)`, `- نتائج اتحققت: ${verified} / ${findings.length}${unverified.length ? ` — ${unverified.length} نتيجة اتشالت لأنها ما طابقتش السطر` : " (كلها طابقت)"}`, `- إجمالي مرات المراجعة من أول مرة: ${run} (من ${state.firstAt})`, ``);
md.push(`## الحالة مقابل التشغيل السابق`, `- جديد: ${isNew.length}`, `- لسه موجود: ${still.length}`, `- اتحل من آخر مرة: ${fixed.length}`, ``);
if (fixed.length) fixed.forEach((o) => md.push(`  - ✅ اتحل: ${o.file}:${o.line || "?"} — ${o.msg}`)); md.push(``);
md.push(`## أرقام الأسطر`, `| الملف | الأسطر | كود | فاضي | تعليقات | مرات المراجعة | التغيير عن آخر مرة |`, `|---|---|---|---|---|---|---|`);
stats.forEach((s) => md.push(`| ${s.file} | ${s.total} | ${s.code} | ${s.blank} | ${s.comment} | ${state.files[s.file].reviews} | ${dl(state.files[s.file].delta)} |`));
md.push(`| **المجموع** | **${totalLines}** | **${codeLines}** | **${blank}** | **${comm}** | | |`, ``);
md.push(`## ✅ اللي اتفحص وطلع سليم فعلاً`);
checks.filter((c) => c.ok === true).forEach((c) => md.push(`- ${c.name} (${c.scope}): ${c.detail}`));
const skipped = checks.filter((c) => c.ok === null); if (skipped.length) { md.push(``, `## ⏭️ اتخطّى`); skipped.forEach((c) => md.push(`- ${c.name}: ${c.detail}`)); }
md.push(``, `## ❌ اللي فيه مشاكل`);
checks.filter((c) => c.ok === false).forEach((c) => md.push(`- ${c.name} (${c.scope}): ${c.detail}`));
for (const [sev, arr] of [["error", errs], ["warn", warns], ["info", infos]]) {
  md.push(``, `### ${SEV[sev]} (${arr.length})`); if (!arr.length) md.push("لا يوجد.");
  arr.forEach((x, i) => md.push(`${i + 1}. **${lc(x)}** [${CONF[x.conf]}] — ${x.msg}`, `   - السطر: \`${x.snippet.replace(/`/g, "'")}\``, x.fix ? `   - الحل: ${x.fix}` : ""));
}
md.push(``, `## 🗑️ حاجات ملهاش لازمة (تنضيف)`);
for (const [k, a] of Object.entries(agg)) { const [t, fx] = AGG[k] || [k, ""]; md.push(`- **${t}**: ${a.length} موضع — ${fx}`, `  - أول المواضع: ${a.slice(0, 8).map(lc).join("، ")}`); }
if (!Object.keys(agg).length) md.push("لا يوجد.");
if (errSummary) {
  const line = (g) => `[${g.n}×] ${g.type} — ${g.msg.slice(0, 150)} (دالة: ${g.fn}، إصدار: ${g.newest}) — أجهزة: ${g.devList.slice(0, 3).join("، ")}${g.loc ? ` ← ${g.loc.file}:${g.loc.line}` : ""}\n   - ${g.reason}`;
  md.push(``, `## 📋 ملف أخطاء المنصة (${errSummary.file})`, `إجمالي ${errSummary.total} خطأ: **${errSummary.open.length} نوع لسه مفتوح**، **${errSummary.resolved.length} نوع ${errSummary.pruned ? "اتشال من الملف" : "اتصلّح على الأرجح"}**.`, ``, `### 🔴 لسه مفتوحة`);
  errSummary.open.slice(0, 30).forEach((g, i) => md.push(`${i + 1}. ${line(g)}`));
  md.push(``, `### ✅ اتصلّحت (${errSummary.resolved.length})`);
  errSummary.resolved.slice(0, 30).forEach((g, i) => md.push(`${i + 1}. ${line(g)}`));
  md.push(``, `> «اتصلّحت» = الدالة المسؤولة اتعدّلت أو اتحذفت ومفيش تكرار في الإصدار الحالي. لو الخطأ رجع هيظهر تاني في التصدير الجاي كمفتوح.`);
}
md.push(``, `## 📈 سجل آخر المراجعات`, `| # | الوقت | أسطر | أخطاء | تحذيرات |`, `|---|---|---|---|---|`);
state.history.slice(-10).forEach((h) => md.push(`| ${h.run} | ${h.at.slice(0, 16).replace("T", " ")} | ${h.lines} | ${h.errors} | ${h.warns} |`));
md.push(``, `> ملاحظة أمانة: «مؤكد» = اتحقق منه آلياً (مثل خطأ صياغة). «اشتباه» = نمط مشبوه ممكن يكون مقصود — الأداة بتقول كده بدل ما تخمّن.`);
const mdText = md.filter((x) => x !== undefined).join("\n");
fs.writeFileSync(path.join(OUT, "report.md"), mdText);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const row = (x) => `<tr class="${x.sev}"><td>${esc(lc(x))}</td><td>${CONF[x.conf]}</td><td>${esc(x.msg)}${x.fix ? `<div class="fx">الحل: ${esc(x.fix)}</div>` : ""}<code>${esc(x.snippet)}</code></td></tr>`;
const sect = (t, arr) => `<h3>${t} (${arr.length})</h3>${arr.length ? `<table><tr><th>المكان</th><th>الثقة</th><th>التفاصيل</th></tr>${arr.map(row).join("")}</table>` : "<p>لا يوجد.</p>"}`;
const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تقرير مراجعة كود التفوق — #${run}</title>
<style>body{font:15px/1.7 system-ui,Tahoma,sans-serif;max-width:1000px;margin:auto;padding:16px;background:#fafafa;color:#111}h1{font-size:22px}h2{margin-top:28px;border-bottom:2px solid #ddd}table{width:100%;border-collapse:collapse;margin:8px 0;background:#fff;font-size:13px}td,th{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:right}code{display:block;direction:ltr;text-align:left;background:#f1f1f1;padding:3px 6px;margin-top:4px;overflow-x:auto;white-space:pre}.sum{background:#0b5d57;color:#fff;padding:12px;border-radius:8px;font-weight:700}.ok{color:#0a7d33}.bad{color:#b00020}.error td:first-child{border-right:4px solid #b00020}.warn td:first-child{border-right:4px solid #e08a00}.info td:first-child{border-right:4px solid #888}.fx{color:#0a7d33}@media print{body{background:#fff}}</style>
<h1>تقرير مراجعة كود التفوق</h1><div class="sum">${esc(sum)}</div>
<p>الوقت: ${now} · تمريرتان في التشغيل (اكتشاف + تحقق ذاتي) · نتائج متحقق منها: ${verified}/${findings.length} · إجمالي مرات المراجعة: ${run}</p>
<h2>الحالة مقابل التشغيل السابق</h2><p>جديد: <b>${isNew.length}</b> · لسه موجود: <b>${still.length}</b> · اتحل: <b class="ok">${fixed.length}</b></p>${fixed.length ? "<ul>" + fixed.map((o) => `<li class="ok">✅ ${esc(o.file)}:${o.line || "?"} — ${esc(o.msg)}</li>`).join("") + "</ul>" : ""}
<h2>أرقام الأسطر</h2><table><tr><th>الملف</th><th>الأسطر</th><th>كود</th><th>فاضي</th><th>تعليقات</th><th>مرات المراجعة</th><th>التغيير</th></tr>${stats.map((s) => `<tr><td>${esc(s.file)}</td><td>${s.total}</td><td>${s.code}</td><td>${s.blank}</td><td>${s.comment}</td><td>${state.files[s.file].reviews}</td><td>${dl(state.files[s.file].delta)}</td></tr>`).join("")}<tr><th>المجموع</th><th>${totalLines}</th><th>${codeLines}</th><th>${blank}</th><th>${comm}</th><th></th><th></th></tr></table>
<h2>✅ اتفحص وطلع سليم فعلاً</h2><ul>${checks.filter((c) => c.ok === true).map((c) => `<li class="ok">${esc(c.name)} (${esc(c.scope)}): ${esc(c.detail)}</li>`).join("") || "<li>—</li>"}</ul>
${skipped.length ? `<h2>⏭️ اتخطّى</h2><ul>${skipped.map((c) => `<li>${esc(c.name)}: ${esc(c.detail)}</li>`).join("")}</ul>` : ""}
<h2>❌ مشاكل</h2><ul>${checks.filter((c) => c.ok === false).map((c) => `<li class="bad">${esc(c.name)} (${esc(c.scope)}): ${esc(c.detail)}</li>`).join("") || "<li class='ok'>لا يوجد</li>"}</ul>
${sect("أخطاء", errs)}${sect("تحذيرات", warns)}${sect("اشتباهات ومعلومات", infos)}
<h2>🗑️ حاجات ملهاش لازمة</h2><ul>${Object.entries(agg).map(([k, a]) => `<li><b>${esc((AGG[k] || [k])[0])}</b>: ${a.length} موضع — ${esc((AGG[k] || ["", ""])[1])}<br><small>${esc(a.slice(0, 8).map(lc).join("، "))}</small></li>`).join("") || "<li>لا يوجد</li>"}</ul>
${errSummary ? `<h2>📋 ملف أخطاء المنصة (${esc(errSummary.file)})</h2><p>إجمالي ${errSummary.total} خطأ: <b class="bad">${errSummary.open.length} لسه مفتوح</b> · <b class="ok">${errSummary.resolved.length} ${errSummary.pruned ? "اتشال من الملف" : "اتصلّح على الأرجح"}</b></p>` + [["🔴 لسه مفتوحة", errSummary.open], ["✅ اتصلّحت", errSummary.resolved]].map(([t, a]) => `<h3>${t} (${a.length})</h3><table><tr><th>العدد</th><th>النوع</th><th>الرسالة</th><th>الدالة / الإصدار</th><th>الأجهزة</th><th>الحالة</th></tr>${a.slice(0, 30).map((g) => `<tr><td>${g.n}</td><td>${esc(g.type)}</td><td>${esc(g.msg.slice(0, 200))}${g.loc ? `<code>${esc(g.loc.file + ":" + g.loc.line)}</code>` : ""}</td><td>${esc(g.fn)} / ${esc(g.newest)}</td><td>${esc(g.devList.slice(0, 3).join("، "))}</td><td>${esc(g.reason)}</td></tr>`).join("")}</table>`).join("") : ""}
<h2>📈 آخر المراجعات</h2><table><tr><th>#</th><th>الوقت</th><th>أسطر</th><th>أخطاء</th><th>تحذيرات</th></tr>${state.history.slice(-10).map((h) => `<tr><td>${h.run}</td><td>${h.at.slice(0, 16).replace("T", " ")}</td><td>${h.lines}</td><td>${h.errors}</td><td>${h.warns}</td></tr>`).join("")}</table>
<p><small>«مؤكد» = اتحقق منه آلياً. «اشتباه» = نمط مشبوه ممكن يكون مقصود.</small></p></html>`;
fs.writeFileSync(path.join(OUT, "report.html"), html);

console.log(sum);
console.log(`جديد ${isNew.length} · لسه ${still.length} · اتحل ${fixed.length} · متحقق ${verified}/${findings.length}`);
console.log(`التقرير: ${path.relative(process.cwd(), path.join(OUT, "report.html"))}`);
if (process.argv.includes("--strict") && errs.length) { console.log("❌ فيه " + errs.length + " خطأ — الرفع هيفشل لحد ما تتصلّح"); process.exit(1); }
