#!/usr/bin/env python3
"""فاحص الأمان — تابع لمراجع التفوق. مسؤول عن الأمان فقط (الأسرار، eval، XSS، CSP، SRI).
باقي الفحوصات (الصياغة، الإصدار، الكود الميت، التكرار، الأخطاء) في review.mjs.
الناتج: code-review/security.json + code-review/review.sarif — وreview.mjs بيدمجهم في التقرير الواحد."""
import os, re, json, argparse
from pathlib import Path

IGNORE_DIRS = {".git", "node_modules", "dist", "build", "__pycache__", ".github", "icons", "tools", "code-review"}
CODE_EXTS = {".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".html", ".htm", ".json"}
MAX_BYTES = 3_000_000

# مفاتيح Firebase للعميل عامة بطبيعتها — بتتستثنى من فحص الأسرار فقط (مش من باقي القواعد)
PUBLIC_CONFIG = [
    re.compile(r'apiKey\s*[:=]\s*["\']AIza[0-9A-Za-z_\-]{35}["\']'),
    re.compile(r'messagingSenderId\s*[:=]\s*["\']\d+["\']'),
    re.compile(r'appId\s*[:=]\s*["\']\d+:\d+:web:[0-9a-f]+["\']'),
    re.compile(r'projectId\s*[:=]\s*["\'][a-z0-9\-]+["\']'),
]
CRITICAL = [
    (re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'), "private-key"),
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), "aws-access-key"),
    (re.compile(r'\bsk-[A-Za-z0-9]{20,}\b'), "secret-key"),
    (re.compile(r'\bghp_[A-Za-z0-9]{30,}\b'), "github-token"),
    (re.compile(r'\bxox[baprs]-[A-Za-z0-9\-]{10,}\b'), "slack-token"),
    (re.compile(r'"(?:password|passwd|pwd)"\s*:\s*"(?!\$\{|process\.env)[^"]{6,}"'), "hardcoded-password"),
]
HIGH = [
    (re.compile(r'(?<![\w.$])eval\s*\('), "eval", "eval() بينفّذ أي كود"),
    (re.compile(r'\bnew\s+Function\s*\('), "new-function", "new Function() زي eval"),
    (re.compile(r'\bset(?:Timeout|Interval)\s*\(\s*["\'`][^"\'`]+["\'`]'), "string-timer", "setTimeout/setInterval بنص بيتصرف زي eval"),
    (re.compile(r'\bdocument\.write(?:ln)?\s*\('), "document-write", "document.write بيبوّظ الصفحة"),
    (re.compile(r'["\']javascript:[^\s"\'`<]'), "javascript-url", "رابط javascript: — ثغرة XSS سهلة"),
]
MEDIUM = [
    (re.compile(r'\.innerHTML\s*=\s*[^;]*`[^`]*\$\{'), "innerhtml-template", "قيمة ديناميكية داخل innerHTML — اتأكد إن esc() ملفوفة حوالين مدخلات المستخدم"),
    (re.compile(r'\.insertAdjacentHTML\s*\([^)]*`[^`]*\$\{'), "insertadjacent-template", "قيمة ديناميكية داخل insertAdjacentHTML — اتأكد من esc()"),
    (re.compile(r'(?<![.\w])target\s*=\s*["\']_blank["\'](?![^>]{0,200}\brel\s*=\s*["\'][^"\']*noopener)'), "blank-noopener", "target=_blank بدون rel=noopener"),
    (re.compile(r'localStorage\.setItem\s*\(\s*["\'][^"\']*(?:token|secret|password)[^"\']*["\']'), "token-in-localstorage", "قيمة حساسة بتتخزن في localStorage"),
    (re.compile(r'\b(?:src|href)\s*=\s*"\$\{(?!\s*esc\()[^}"]*\}"'), "unescaped-attr", "قيمة داخل src/href من غير esc() — لو جاية من مستخدم تبقى ثغرة حقن"),
    (re.compile(r'\bhttp://(?!localhost|127\.0\.0\.1|0\.0\.0\.0|www\.w3\.org)'), "http-url", "رابط http:// غير آمن"),
]
# مواضع اتراجعت يدوياً واتأكدنا إن قيمتها داخلية (مش جاية من مستخدم) — بتتستثنى بالنص بالظبط
KNOWN_SAFE = {'href="${href}"': "باراميتر داخلي في gcard بيستقبل مسارات ثابتة",
              'src="${el.src}"': "خاصية DOM بتطبّع الرابط وبتشفّر علامات الاقتباس",
              'src="${u}"': "رابط createObjectURL محلي",
              'href="${wa}"': "رابط واتساب مبني من رقم متحقق منه بـ regex"}
SARIF_LEVEL = {"critical": "error", "high": "warning", "medium": "note"}


def in_comment(line, pos):
    """True لو pos جوّه تعليق. بيمشي حرف حرف ويتجاهل // اللي داخل نص أو بعد : (روابط)."""
    q, i = None, 0
    while i < pos:
        c = line[i]
        if q:
            if c == "\\": i += 2; continue
            if c == q: q = None
        elif c in "\"'`": q = c
        elif line.startswith("//", i) and (i == 0 or line[i - 1] != ":"): return True
        elif line.startswith("/*", i):
            j = line.find("*/", i + 2)
            if j == -1 or j >= pos: return True
            i = j + 1
        elif line.startswith("<!--", i):
            j = line.find("-->", i + 4)
            if j == -1 or j >= pos: return True
            i = j + 2
        i += 1
    s = line.lstrip()
    return s.startswith("*") and not s.startswith("*/")


def redact(s):
    s = re.sub(r'(AIza[0-9A-Za-z_\-]{4})[0-9A-Za-z_\-]{15,}', r'\1…', s)
    s = re.sub(r'\b(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{10,}', r'\1…', s)
    return re.sub(r'\b(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]{10,}', r'\1…', s)


def scan(root):
    issues, files, lines_n = [], 0, 0
    for dp, dn, fns in os.walk(root):
        dn[:] = [d for d in dn if d not in IGNORE_DIRS and not d.startswith(".")]
        for fn in fns:
            p = Path(dp) / fn
            if p.suffix.lower() not in CODE_EXTS or fn in {"package-lock.json"}: continue
            try:
                if p.stat().st_size > MAX_BYTES: continue
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            rel = p.relative_to(root).as_posix()
            lines = text.splitlines(); files += 1; lines_n += len(lines)
            for i, line in enumerate(lines, 1):
                if len(line) > 8000: continue
                public = any(r.search(line) for r in PUBLIC_CONFIG)
                for sev, rules in (("critical", CRITICAL), ("high", HIGH), ("medium", MEDIUM)):
                    for rule in rules:
                        pat, rid = rule[0], rule[1]
                        msg = rule[2] if len(rule) > 2 else rid
                        for m in pat.finditer(line):
                            if in_comment(line, m.start()): continue
                            if rid == "unescaped-attr" and m.group(0) in KNOWN_SAFE: continue
                            if sev == "critical" and public: continue
                            shown = redact(m.group(0))[:120] if sev == "critical" else m.group(0)[:120]
                            issues.append({"rule": rid, "severity": sev, "file": rel, "line": i,
                                           "message": msg if sev != "critical" else f"{rid}: {shown}", "match": m.group(0)[:120]})
            if p.suffix.lower() in {".html", ".htm"}:
                static = re.sub(r'<script\b[^>]*>[\s\S]*?</script\s*>', '', text, flags=re.I)  # بدون السكريبتات: الـ meta لازم يكون في الـ HTML الفعلي
                if "<head" in static.lower() and not re.search(r'<meta[^>]+http-equiv\s*=\s*["\']content-security-policy', static, re.I):
                    issues.append({"rule": "missing-csp", "severity": "medium", "file": rel, "line": 1,
                                   "message": "صفحة HTML بدون Content-Security-Policy — مفيش خط دفاع إضافي ضد XSS", "match": ""})
                for m in re.finditer(r'<script[^>]+\bsrc\s*=\s*["\'](https?://[^"\']+)["\'][^>]*>', text, re.I):
                    if "integrity=" not in m.group(0).lower() and not re.search(r"gstatic|googleapis", m.group(1)):
                        issues.append({"rule": "external-script-no-sri", "severity": "medium", "file": rel,
                                       "line": text[:m.start()].count("\n") + 1,
                                       "message": f"سكريبت خارجي بدون SRI: {m.group(1)[:80]}", "match": m.group(1)[:80]})
    return issues, files, lines_n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", default="code-review")
    a = ap.parse_args()
    root = Path(a.root).resolve(); out = (root / a.out) if not Path(a.out).is_absolute() else Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    issues, files, lines_n = scan(root)
    (out / "security.json").write_text(json.dumps({"files": files, "lines": lines_n, "issues": issues}, ensure_ascii=False, indent=1), encoding="utf-8")
    rules = sorted({i["rule"] for i in issues})
    sev_of = {i["rule"]: i["severity"] for i in issues}
    sarif = {"$schema": "https://json.schemastore.org/sarif-2.1.0.json", "version": "2.1.0", "runs": [{
        "tool": {"driver": {"name": "eltafawoq-security-scan", "rules": [
            {"id": r, "shortDescription": {"text": r}, "defaultConfiguration": {"level": SARIF_LEVEL[sev_of[r]]}} for r in rules]}},
        "results": [{"ruleId": i["rule"], "level": SARIF_LEVEL[i["severity"]], "message": {"text": i["message"]},
                     "locations": [{"physicalLocation": {"artifactLocation": {"uri": i["file"]}, "region": {"startLine": max(1, i["line"])}}}]} for i in issues]}]}
    (out / "review.sarif").write_text(json.dumps(sarif, ensure_ascii=False), encoding="utf-8")
    c = {s: sum(1 for i in issues if i["severity"] == s) for s in ("critical", "high", "medium")}
    print(f"security: {files} files, {lines_n} lines, critical={c['critical']} high={c['high']} medium={c['medium']}")


if __name__ == "__main__":
    main()
