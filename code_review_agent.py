#!/usr/bin/env python3
"""
Smart Code Review Agent v4 — line-by-line with lexer + AST + taint analysis.

Usage:
  python code_review_agent.py
  python code_review_agent.py --diff-from origin/main
  python code_review_agent.py --update-baseline
  python code_review_agent.py --rules firestore.rules
"""
import os, re, json, hashlib, sys, argparse, pickle
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
import multiprocessing

# ───────────────────── tree-sitter (optional) ─────────────────────
try:
    from tree_sitter import Language, Parser
    import tree_sitter_javascript as tsjs
    LANG_JS = Language(tsjs.language())
    HAS_AST = True
except Exception:
    HAS_AST = False
    LANG_JS = None

# ───────────────────── config ─────────────────────
IGNORE_DIRS = {".git","node_modules",".venv","dist","build","__pycache__",
               ".idea",".vscode",".next","coverage",".cache","vendor","site",
               ".review-cache","pets","garden","icons"}
IGNORE_FILES = {"CODE_REVIEW_REPORT.md","review.sarif","review-summary.json",
                ".review-baseline.json",".review-cache.pkl",
                "package-lock.json","yarn.lock","pnpm-lock.yaml"}
IGNORE_EXTS = {".png",".jpg",".jpeg",".gif",".webp",".ico",".woff",".woff2",
               ".ttf",".otf",".mp3",".mp4",".wav",".glb",".gltf",".wasm",
               ".zip",".apk",".aab",".pdf",".map"}
TEXT_EXTS = {".js",".mjs",".cjs",".ts",".jsx",".tsx",".html",".htm",".css",
             ".scss",".json",".md",".txt",".py",".yml",".yaml",".toml",".xml",".svg"}
MAX_FILE_BYTES = 3_000_000
CACHE_VERSION = 4
CACHE_FILE = ".review-cache.pkl"

# ───────────────────── suppression ─────────────────────
SUPPRESS_NEXT = re.compile(r'//\s*review-ignore-next-line(?:\s+([\w\-, ]+))?')
SUPPRESS_LINE = re.compile(r'//\s*review-ignore-line(?:\s+([\w\-, ]+))?')
SUPPRESS_BLOCK = re.compile(r'/\*\s*review-ignore:\s*([\w\-, ]+)\s*\*/')

# ───────────────────── lexers ─────────────────────
JS_LEX = re.compile(r'''
    (?P<comment_block>/\*[\s\S]*?\*/)         |
    (?P<comment_line>//[^\n]*)                |
    (?P<string_dq>"(?:\\.|[^"\\])*")          |
    (?P<string_sq>'(?:\\.|[^'\\])*')          |
    (?P<string_tpl>`(?:\\.|[^`\\])*`)         |
    (?P<regex>/(?![*/])(?:\\.|\[[^\]]*\]|[^/\\\n])+/[gimsuy]*) |
    (?P<code>[^\s]+)
''', re.VERBOSE)

def tokenize_js(line):
    tokens, pos = [], 0
    while pos < len(line):
        m = JS_LEX.search(line, pos)
        if not m:
            tokens.append(("code", pos, len(line))); break
        if m.start() > pos:
            tokens.append(("code", pos, m.start()))
        tokens.append((m.lastgroup, m.start(), m.end()))
        pos = m.end()
    return tokens

def is_in_code(line, pos, state):
    if state.get("in_block"):
        end = line.find("*/")
        if end == -1 or pos <= end:
            return False
        line = line[end+2:]
        pos = pos - (end+2)
        if pos < 0: return False
    for k, s, e in tokenize_js(line):
        if s <= pos < e:
            return k == "code"
    return False

# ───────────────────── rules ─────────────────────
SAFE_LINE = [
    re.compile(r'apiKey\s*[:=]\s*["\']AIza[0-9A-Za-z_\-]{35}["\']'),
    re.compile(r'messagingSenderId\s*[:=]\s*["\']\d+["\']'),
    re.compile(r'appId\s*[:=]\s*["\']\d+:\d+:web:[0-9a-f]+["\']'),
    re.compile(r'projectId\s*[:=]\s*["\'][a-z0-9\-]+["\']'),
    re.compile(r'(?:ADMIN_UID|ADMIN_EMAIL)\s*[:=]\s*["\'][^"\']+["\']'),
]

CRITICAL = [
    (re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'), "private-key-material"),
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), "aws-access-key"),
    (re.compile(r'\bsk-[A-Za-z0-9]{20,}\b'), "openai-style-secret"),
    (re.compile(r'\bghp_[A-Za-z0-9]{30,}\b'), "github-pat"),
    (re.compile(r'\bxox[baprs]-[A-Za-z0-9\-]{10,}\b'), "slack-token"),
    (re.compile(r'"(?:password|passwd|pwd)"\s*:\s*"(?!\$\{|process\.env)[^"]{6,}"'), "hardcoded-password"),
]

HIGH = [
    (re.compile(r'\beval\s*\('), "eval-usage", "eval() executes arbitrary code"),
    (re.compile(r'\bnew\s+Function\s*\('), "new-function", "new Function() is eval in disguise"),
    (re.compile(r'\bset(?:Timeout|Interval)\s*\(\s*["\'`][^"\'`]+["\'`]'), "string-timer", "String timer = eval"),
    (re.compile(r'\bdocument\.write(?:ln)?\s*\('), "document-write", "document.write() is unsafe"),
    (re.compile(r'\bjavascript:[^\s"\'`<]'), "javascript-url", "javascript: URL — XSS"),
    (re.compile(r'\bexec\s*\([^)]*\)'), "python-exec", "exec() with user data"),
]

MEDIUM = [
    (re.compile(r'\bconsole\.(log|debug|info)\s*\('), "console-log", "console.* in production"),
    (re.compile(r'\btarget\s*=\s*["\']_blank["\'](?![^>]{0,200}\brel\s*=\s*["\'][^"\']*noopener)'),
        "blank-noopener", "target=_blank without rel=noopener"),
    (re.compile(r'localStorage\.setItem\s*\(\s*["\'][^"\']*(?:token|secret|password)[^"\']*["\']'),
        "token-in-ls", "Sensitive value in localStorage"),
    (re.compile(r'\bhttp://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)'), "http-url", "Insecure http://"),
]

FIREBASE = [
    (re.compile(r'onSnapshot\s*\(\s*collection\s*\([^)]+\)\s*\)'),
     "high", "fb-unbounded-snapshot", "onSnapshot(collection) بدون where/limit"),
    (re.compile(r'getDocs\s*\(\s*collection\s*\([^)]+\)\s*\)'),
     "medium", "fb-unbounded-getdocs", "getDocs(collection) بدون limit"),
    (re.compile(r'updateDoc\s*\(\s*doc\s*\(\s*db\s*,\s*["\']students["\']'),
     "high", "fb-client-write-students", "Client writes to students — Rules must whitelist"),
    (re.compile(r'setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*["\']life["\']'),
     "high", "fb-client-write-life", "Client writes to life — coins/xp need Cloud Function"),
    (re.compile(r'(?:for|while)\s*\([^)]*\)\s*\{[^}]*addDoc\s*\('),
     "medium", "fb-adddoc-in-loop", "addDoc in loop — use writeBatch"),
    (re.compile(r'(?:for|while)\s*\([^)]*\)\s*\{[^}]*deleteDoc\s*\('),
     "medium", "fb-deletedoc-in-loop", "deleteDoc in loop — use writeBatch"),
    (re.compile(r'S\.profile\.(?:roles|tanaghaSave|blocked)\s*(?:===|\.includes)'),
     "info", "fb-client-role-check", "Role check via S.profile — editable in DevTools"),
]

PWA = [
    (re.compile(r'url\.hostname\s*===\s*["\']www\.gstatic\.com["\'][^}]*?caches\.open'),
     "high", "pwa-stale-firebase-sdk", "SW caches Firebase SDK forever"),
    (re.compile(r'postMessage\s*\([^)]*\)(?!\s*,\s*["\']https?://)'),
     "medium", "pwa-postmessage-no-origin", "postMessage without origin"),
    (re.compile(r'<script[^>]*>[\s\S]{500000,}?</script>'),
     "medium", "pwa-huge-inline-script", "inline script > 500KB"),
    (re.compile(r'addEventListener\s*\(\s*["\'](?:scroll|touchmove|pointermove|wheel)["\'][^)]*\)(?!\s*,\s*\{[^}]*passive)'),
     "low", "pwa-no-passive-listener", "Scroll/touch listener without {passive:true}"),
]

A11Y = [
    (re.compile(r'<html(?![^>]*\blang=)[^>]*>'), "low", "a11y-html-no-lang", "<html> بدون lang"),
    (re.compile(r'<img(?![^>]*\balt=)[^>]+>'), "low", "a11y-img-no-alt", "<img> بدون alt"),
    (re.compile(r'<button(?![^>]*\baria-label=)[^>]*>\s*</button>'), "low", "a11y-empty-button", "<button> فاضي"),
]

PROJECT = [
    (re.compile(r'\bS\.profile\.(?:xp|coins|roles|blocked|tanaghaSave)\s*=[^=]'),
     "high", "client-writes-profile-privileged", "Client writes privileged field"),
    (re.compile(r'addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["\']suspicious["\']'),
     "high", "student-writes-suspicious", "Student can spam suspicious collection"),
]

RULES_BY_EXT = {
    ".js":  ["CRITICAL","HIGH","MEDIUM","FIREBASE","PROJECT"],
    ".mjs": ["CRITICAL","HIGH","MEDIUM","FIREBASE","PROJECT"],
    ".html":["CRITICAL","HIGH","MEDIUM","FIREBASE","PROJECT","PWA","A11Y"],
    ".htm": ["CRITICAL","HIGH","MEDIUM","FIREBASE","PROJECT","PWA","A11Y"],
    ".css": ["CRITICAL","MEDIUM"],
    ".py":  ["CRITICAL","HIGH","MEDIUM"],
    ".json":["CRITICAL"],
    ".yml": ["CRITICAL"],
    ".yaml":["CRITICAL"],
    ".md":  ["CRITICAL"],
    ".txt": ["CRITICAL"],
}

RULE_SETS = {
    "CRITICAL": [(p, r, "critical", "secret") for p,r in CRITICAL],
    "HIGH":     [(p, r, "high", m) for p, r, m in HIGH],
    "MEDIUM":   [(p, r, "medium", m) for p, r, m in MEDIUM],
    "FIREBASE": [(p, r, s, m) for p, s, r, m in FIREBASE],
    "PWA":      [(p, r, s, m) for p, s, r, m in PWA],
    "A11Y":     [(p, r, s, m) for p, s, r, m in A11Y],
    "PROJECT":  [(p, r, s, m) for p, s, r, m in PROJECT],
}

# ───────────────────── AST rules (JS) ─────────────────────
JS_AST_RULES = [
    ("call_expression",
     lambda n, src: (n.child_by_field_name("function") and
                     src[n.child_by_field_name("function").start_byte:
                         n.child_by_field_name("function").end_byte] in (b"eval", b"Function")),
     "high", "eval-usage-ast", "eval/Function via AST"),

    ("assignment_expression",
     lambda n, src: (n.child_by_field_name("left") and
                     b".innerHTML" in src[n.child_by_field_name("left").start_byte:
                                         n.child_by_field_name("left").end_byte]),
     "high", "innerhtml-assign", "Assignment to innerHTML — XSS unless sanitized"),

    ("call_expression",
     lambda n, src: (n.child_by_field_name("function") and
                     src[n.child_by_field_name("function").start_byte:
                         n.child_by_field_name("function").end_byte] == b"document.write"),
     "high", "document-write-ast", "document.write() via AST"),
]

def ast_scan_js(source_bytes):
    if not HAS_AST: return []
    try:
        tree = Parser(LANG_JS).parse(source_bytes)
    except Exception:
        return []
    hits = []
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        for node_type, pred, sev, rule, msg in JS_AST_RULES:
            if node.type == node_type:
                try:
                    if pred(node, source_bytes):
                        line = source_bytes[:node.start_byte].count(b"\n") + 1
                        snippet = source_bytes[node.start_byte:node.end_byte].decode("utf-8","replace")[:140]
                        hits.append({"rule": rule, "severity": sev, "line": line,
                                     "column": 0, "message": f"{msg}: {snippet}",
                                     "confidence": 95})
                except Exception:
                    pass
        for i in range(node.child_count):
            stack.append(node.child(i))
    return hits

# ───────────────────── taint (XSS) ─────────────────────
TAINT_SRC = re.compile(
    r'\b(?:S\.profile\.\w+|S\.user\.\w+|document\.location\.\w+|'
    r'location\.(?:search|hash)|prompt\(|localStorage\.getItem\(|'
    r'params\.\w+|event\.target\.value|snapshot\.data\(\)|'
    r'msg\.\w+|m\.\w+|q\.\w+|c\.\w+)\b'
)
TAINT_SINK = re.compile(
    r'\.innerHTML\s*=|\.outerHTML\s*=|\.insertAdjacentHTML\s*\(|'
    r'document\.write(?:ln)?\s*\(|'
    r'\.setAttribute\s*\(\s*["\'](?:href|src|onclick|onerror)'
)

def taint_check(line, line_no):
    if not TAINT_SINK.search(line): return None
    if not TAINT_SRC.search(line): return None
    if re.search(r'\besc\(|\bescapeHtml\(|\bDOMPurify\.sanitize\(|\bsanitize\(', line):
        return {"rule": "xss-tainted-mitigated", "severity": "medium", "line": line_no,
                "column": 0, "confidence": 60,
                "message": "Tainted data to HTML sink — verify esc() covers all paths"}
    return {"rule": "xss-tainted-sink", "severity": "critical", "line": line_no,
            "column": 0, "confidence": 92,
            "message": "Direct XSS: user data → HTML sink without escaping"}

# ───────────────────── helpers ─────────────────────
def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def _fingerprint(iss):
    return hashlib.sha1(f"{iss['rule']}|{iss['file']}|{iss['message']}".encode()).hexdigest()[:16]

def safe_line(line):
    return any(p.search(line) for p in SAFE_LINE)

def _redact(s):
    s = re.sub(r'(AIza[0-9A-Za-z_\-]{4})[0-9A-Za-z_\-]{15,}', r'\1…', s)
    s = re.sub(r'(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{10,}', r'\1…', s)
    s = re.sub(r'(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]{10,}', r'\1…', s)
    return s

def is_binary(path):
    try:
        with open(path, "rb") as f: chunk = f.read(8192)
        if b"\0" in chunk: return True
        printable = sum(1 for b in chunk if b >= 32 or b in (9,10,13))
        return printable / max(1, len(chunk)) < 0.85
    except Exception:
        return True

def build_suppressions(lines):
    sup = set()
    for i, line in enumerate(lines):
        m = SUPPRESS_LINE.search(line)
        if m:
            for r in (m.group(1) or "*").split(","):
                sup.add((i+1, r.strip()))
        m = SUPPRESS_NEXT.search(line)
        if m:
            for r in (m.group(1) or "*").split(","):
                sup.add((i+2, r.strip()))
        for m in SUPPRESS_BLOCK.finditer(line):
            for r in m.group(1).split(","):
                sup.add((i+1, r.strip()))
    return sup

def check_html_whole(text, rel):
    hits = []
    if "<head" in text.lower() and "Content-Security-Policy" not in text:
        hits.append({"rule": "missing-csp", "severity": "medium", "file": rel, "line": 1,
                     "column": 0, "message": "HTML without CSP meta", "confidence": 90})
    for m in re.finditer(r'<script[^>]+\bsrc\s*=\s*["\'](https?://[^"\']+)["\'][^>]*>', text, re.I):
        tag = m.group(0)
        if "integrity=" not in tag.lower() and "gstatic" not in m.group(1) and "googleapis" not in m.group(1):
            line_no = text[:m.start()].count("\n") + 1
            hits.append({"rule": "external-script-no-sri", "severity": "medium",
                         "file": rel, "line": line_no, "column": 0,
                         "message": f"External script without SRI: {m.group(1)[:80]}",
                         "confidence": 85})
    return hits# ───────────────────── worker ─────────────────────
_WORKER_CFG = {}

def _worker_init(cfg):
    _WORKER_CFG.clear()
    _WORKER_CFG.update(cfg)

def scan_one_file(args):
    root, rel = args
    path = Path(root) / rel
    ext = path.suffix.lower()
    if ext not in TEXT_EXTS: return []
    if is_binary(path): return []
    try:
        size = path.stat().st_size
        if size > MAX_FILE_BYTES: return []
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    lines = text.splitlines()
    rule_sets = _WORKER_CFG.get("rule_sets") or RULES_BY_EXT.get(ext, ["CRITICAL","MEDIUM"])
    cfg_ignore = _WORKER_CFG.get("ignore_rules", set())
    cfg_paths = _WORKER_CFG.get("ignore_paths", [])
    sev_override = _WORKER_CFG.get("severity_override", {})

    if any(p.search(rel) for p in cfg_paths):
        return []

    suppressions = build_suppressions(lines)
    issues = []
    state = {"in_block": False}

    all_rules = []
    for s in rule_sets:
        all_rules.extend(RULE_SETS.get(s, []))

    for i, line in enumerate(lines, 1):
        if len(line) > 12000:
            chunks = [line[j:j+2000] for j in range(0, len(line), 2000)]
        else:
            chunks = [line]
        for chunk in chunks:
            chunk_offset = line.find(chunk)
            for pat, rule, sev, msg in all_rules:
                if rule in cfg_ignore: continue
                for m in pat.finditer(chunk):
                    pos = chunk_offset + m.start()
                    if not is_in_code(line, pos, state):
                        continue
                    if safe_line(line):
                        continue
                    if (i, rule) in suppressions or (i, "*") in suppressions:
                        continue
                    severity = sev_override.get(rule, sev)
                    issues.append({
                        "rule": rule, "severity": severity, "file": rel,
                        "line": i, "column": pos, "confidence": 85,
                        "message": _redact(msg),
                        "source": line.strip()[:200],
                    })

    if ext in {".js",".mjs",".cjs"} and HAS_AST:
        for hit in ast_scan_js(text.encode("utf-8", errors="replace")):
            if hit["rule"] in cfg_ignore: continue
            if (hit["line"], hit["rule"]) in suppressions: continue
            src_line = lines[hit["line"]-1].strip()[:200] if hit["line"] <= len(lines) else ""
            hit.update({"file": rel, "source": src_line,
                        "severity": sev_override.get(hit["rule"], hit["severity"])})
            issues.append(hit)

    if ext in {".js",".mjs",".html",".htm"}:
        for i, line in enumerate(lines, 1):
            if len(line) > 5000: continue
            h = taint_check(line, i)
            if not h: continue
            if h["rule"] in cfg_ignore: continue
            if (i, h["rule"]) in suppressions: continue
            h.update({"file": rel, "source": line.strip()[:200],
                      "severity": sev_override.get(h["rule"], h["severity"])})
            issues.append(h)

    if ext in {".html",".htm"}:
        for h in check_html_whole(text, rel):
            if h["rule"] in cfg_ignore: continue
            issues.append(h)

    return issues

def discover_files(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        for fn in filenames:
            if fn in IGNORE_FILES: continue
            ext = Path(fn).suffix.lower()
            if ext in IGNORE_EXTS: continue
            if ext not in TEXT_EXTS: continue
            p = Path(dirpath) / fn
            try: rel = p.relative_to(root).as_posix()
            except ValueError: continue
            if rel.startswith(".git/"): continue
            out.append((root, rel))
    return out

# ───────────────────── cache ─────────────────────
def load_cache():
    if Path(CACHE_FILE).exists():
        try:
            d = pickle.loads(Path(CACHE_FILE).read_bytes())
            if d.get("v") == CACHE_VERSION:
                return d["files"]
        except Exception: pass
    return {}

def save_cache(files):
    try: Path(CACHE_FILE).write_bytes(pickle.dumps({"v": CACHE_VERSION, "files": files}))
    except Exception: pass

# ───────────────────── SARIF ─────────────────────
RULE_META = {
    "private-key-material": ("error","9.0","Private key material"),
    "aws-access-key": ("error","9.0","AWS key"),
    "openai-style-secret": ("error","9.0","Secret"),
    "github-pat": ("error","9.0","GitHub PAT"),
    "slack-token": ("error","9.0","Slack token"),
    "hardcoded-password": ("error","8.5","Hardcoded password"),
    "eval-usage": ("warning","8.0","eval"),
    "eval-usage-ast": ("error","8.5","eval (AST)"),
    "new-function": ("warning","7.5","new Function"),
    "string-timer": ("warning","7.0","String timer"),
    "document-write": ("warning","6.5","document.write"),
    "document-write-ast": ("warning","7.0","document.write (AST)"),
    "javascript-url": ("error","8.0","javascript: URL"),
    "innerhtml-assign": ("error","8.0","innerHTML assign"),
    "xss-tainted-sink": ("error","9.0","Direct XSS"),
    "xss-tainted-mitigated": ("warning","6.0","Possible XSS"),
    "console-log": ("note","3.0","console.*"),
    "blank-noopener": ("warning","5.0","tabnabbing"),
    "token-in-ls": ("warning","6.0","Token in localStorage"),
    "http-url": ("warning","5.5","http://"),
    "missing-csp": ("warning","6.0","No CSP"),
    "external-script-no-sri": ("warning","5.5","No SRI"),
    "fb-unbounded-snapshot": ("warning","7.5","Unbounded snapshot"),
    "fb-unbounded-getdocs": ("warning","6.5","Unbounded getDocs"),
    "fb-client-write-students": ("error","8.0","Client writes students"),
    "fb-client-write-life": ("error","8.0","Client writes life"),
    "fb-adddoc-in-loop": ("warning","6.0","addDoc in loop"),
    "fb-deletedoc-in-loop": ("warning","6.0","deleteDoc in loop"),
    "fb-client-role-check": ("note","3.0","Client role check"),
    "pwa-stale-firebase-sdk": ("error","8.0","Stale Firebase SDK"),
    "pwa-postmessage-no-origin": ("warning","6.0","postMessage no origin"),
    "pwa-huge-inline-script": ("warning","5.0","Huge inline JS"),
    "pwa-no-passive-listener": ("note","3.0","Non-passive listener"),
    "a11y-html-no-lang": ("note","2.0","<html> no lang"),
    "a11y-img-no-alt": ("note","2.0","<img> no alt"),
    "a11y-empty-button": ("note","2.0","empty button"),
    "client-writes-profile-privileged": ("error","8.5","Client writes privileged"),
    "student-writes-suspicious": ("error","8.0","Student writes suspicious"),
}

def rule_meta(rule_id):
    return RULE_META.get(rule_id, ("warning","5.0",rule_id))

def write_sarif(results, out_path):
    rules = {}
    for iss in results["issues"]:
        rules[iss["rule"]] = rule_meta(iss["rule"])
    rule_index = {rid: i for i, rid in enumerate(rules)}
    sarif_rules = []
    for rid, (sev, score, desc) in rules.items():
        sarif_rules.append({
            "id": rid, "shortDescription": {"text": desc},
            "defaultConfiguration": {"level": sev},
            "properties": {"security-severity": score, "tags": ["security"]},
        })
    sarif_results = []
    for iss in results["issues"]:
        sev, _, _ = rule_meta(iss["rule"])
        r = {
            "ruleId": iss["rule"], "ruleIndex": rule_index[iss["rule"]],
            "level": sev, "message": {"text": iss["message"]},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": iss["file"]},
                    "region": {
                        "startLine": max(1, iss["line"]),
                        "startColumn": max(1, iss.get("column", 0)+1),
                        "snippet": {"text": iss.get("source","")},
                    },
                }
            }],
            "properties": {"confidence": iss.get("confidence", 100)},
        }
        sarif_results.append(r)
    sarif = {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {
                "name": "smart-code-review", "version": "4.0",
                "rules": sarif_rules,
            }},
            "results": sarif_results,
        }],
    }
    Path(out_path).write_text(json.dumps(sarif, ensure_ascii=False, indent=2), encoding="utf-8")# ───────────────────── markdown report ─────────────────────
def grade(results):
    s = results["summary"]
    if s["critical"] > 0: return "F"
    if s["high"] > 3: return "D"
    if s["high"] > 0: return "C"
    if s["medium"] > 30: return "B"
    if s["medium"] > 5: return "B+"
    return "A"

SEV_ICON = {"critical":"🔴","high":"🟠","medium":"🟡","low":"⚪","info":"ℹ️"}

def write_markdown(results, out_path):
    s = results["summary"]
    g = grade(results)
    lines = [
        f"# تقرير مراجعة الكود — الدرجة: **{g}**",
        f"_تم الفحص: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
        "## ملخص",
        f"- الملفات: **{s['files']}** · الأسطر: **{s['lines']:,}**",
        f"- 🔴 حرجة: **{s['critical']}** · 🟠 عالية: **{s['high']}** · 🟡 متوسطة: **{s['medium']}** · ⚪ منخفضة: **{s['low']}**",
        f"- ♻️ ملفات مكررة: **{s['redundant']}** · 🕰️ مستبعدة بالـ baseline: **{s['baseline_suppressed']}**",
        "",
    ]
    order = {"critical":0,"high":1,"medium":2,"low":3,"info":4}
    priority = sorted(results["issues"], key=lambda x: (order[x["severity"]], x["file"]))
    if priority:
        lines += ["## 🎯 أعلى 5 أولويات", ""]
        for idx, iss in enumerate(priority[:5], 1):
            lines.append(f"{idx}. {SEV_ICON[iss['severity']]} **{iss['rule']}** — `{iss['file']}:{iss['line']}`")
            lines.append(f"   > {iss['message']}")
            if iss.get("source"):
                lines.append(f"   ```\n   {iss['source']}\n   ```")
        lines.append("")
    by_file = defaultdict(lambda: {"critical":0,"high":0,"medium":0,"low":0,"info":0})
    for iss in results["issues"]:
        by_file[iss["file"]][iss["severity"]] += 1
    if by_file:
        lines += ["## 📊 الملفات الأكثر مشاكل", ""]
        lines.append("| الملف | 🔴 | 🟠 | 🟡 | ⚪ | ℹ️ |")
        lines.append("|---|---|---|---|---|---|")
        for f, c in sorted(by_file.items(), key=lambda kv: -(kv[1]["critical"]*100 + kv[1]["high"]*10 + kv[1]["medium"])):
            lines.append(f"| `{f}` | {c['critical']} | {c['high']} | {c['medium']} | {c['low']} | {c['info']} |")
        lines.append("")
    for sev in ["critical","high","medium","low","info"]:
        sev_issues = [x for x in results["issues"] if x["severity"] == sev]
        if not sev_issues: continue
        lines += [f"## {SEV_ICON[sev]} {sev.upper()} ({len(sev_issues)})", ""]
        for iss in sev_issues[:100]:
            lines.append(f"- `{iss['file']}:{iss['line']}` — **{iss['rule']}** — {iss['message']}")
            if iss.get("source"):
                lines.append(f"  ```\n  {iss['source']}\n  ```")
        if len(sev_issues) > 100:
            lines.append(f"- … و{len(sev_issues)-100} حالة أخرى (راجع `review.sarif`)")
        lines.append("")
    if results["redundant"]:
        lines += ["## ♻️ ملفات مكررة", ""]
        for r in results["redundant"]:
            lines.append(f"- `{r['file']}` = `{r['same_as']}`")
        lines.append("")
    lines += [
        "## استثناءات مقصودة",
        "- **مفتاح Firebase client** — ليس سرًا، الحماية في Rules.",
        "- **`projectId` / `appId` / `messagingSenderId`** — معرفات عامة.",
        "- **`ADMIN_UID`** — معرّف وليس كلمة سر.",
        "- **`console.log` في التعليقات أو الـ strings** — مستبعد.",
        "",
        "## خطوات مقترحة",
        "1. ابدأ بـ **الحرجة** — صلّحها قبل أي نشر.",
        "2. أضف `Content-Security-Policy` في `<head>` بـ `index.html`.",
        "3. راجع كل `innerHTML`/`insertAdjacentHTML` — تأكد `esc()` بتغلّف كل مدخلات المستخدم.",
        "4. لو `firestore.rules` موجودة: شغّل `python rules_checker.py firestore.rules`.",
        "5. استخدم `// review-ignore-next-line RULE` للاستثناءات الواعية.",
    ]
    Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")

# ───────────────────── main ─────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--baseline", default=".review-baseline.json")
    ap.add_argument("--sarif", default="review.sarif")
    ap.add_argument("--json-out", default="review-summary.json")
    ap.add_argument("--markdown", default="CODE_REVIEW_REPORT.md")
    ap.add_argument("--config", default=".reviewrc.json")
    ap.add_argument("--diff-from", help="Git sha/tag — scan changed lines only")
    ap.add_argument("--update-baseline", action="store_true")
    ap.add_argument("--min-severity", default="info",
                    choices=["critical","high","medium","low","info"])
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--jobs", type=int, default=0)
    ap.add_argument("--no-ast", action="store_true")
    args = ap.parse_args()

    if args.no_ast:
        global HAS_AST
        HAS_AST = False

    cfg = {}
    if Path(args.config).exists():
        try: cfg = json.loads(Path(args.config).read_text())
        except Exception: pass

    ignore_rules = set(cfg.get("ignore_rules", []))
    ignore_paths = [re.compile(p) for p in cfg.get("ignore_paths", [])]
    sev_override = cfg.get("severity_override", {})

    changed = {}
    if args.diff_from:
        try:
            import subprocess
            out = subprocess.check_output(
                ["git","diff","--unified=0", f"{args.diff_from}...HEAD","--","."]
            ).decode("utf-8", "replace")
            cur_file = None
            for line in out.splitlines():
                if line.startswith("+++ b/"):
                    cur_file = line[6:]
                    changed.setdefault(cur_file, set())
                elif line.startswith("@@") and cur_file:
                    m = re.search(r'\+(\d+)(?:,(\d+))?', line)
                    if m:
                        start = int(m.group(1))
                        length = int(m.group(2) or 1)
                        for i in range(start, start + length):
                            changed[cur_file].add(i)
        except Exception as e:
            print(f"⚠️  diff mode failed: {e}")

    baseline_fps = set()
    if Path(args.baseline).exists():
        try: baseline_fps = set(json.loads(Path(args.baseline).read_text()).get("fingerprints", []))
        except Exception: pass

    rules_hits = []
    rules_path = Path(args.root) / "firestore.rules"
    if rules_path.exists():
        try:
            sys.path.insert(0, str(Path(__file__).parent))
            from rules_checker import scan_rules
            rules_hits = scan_rules(str(rules_path))
            print(f"📋 rules_checker: {len(rules_hits)} issues in {rules_path}")
        except Exception as e:
            print(f"⚠️  rules_checker: {e}")

    files = discover_files(args.root)
    cache = {} if args.no_cache else load_cache()
    new_cache = {}
    all_issues = []
    files_stats = {"files": len(files), "lines": 0}

    worker_cfg = {
        "ignore_rules": ignore_rules,
        "ignore_paths": ignore_paths,
        "severity_override": sev_override,
    }

    to_scan = []
    for root, rel in files:
        path = Path(root) / rel
        try: sha = file_hash(path)
        except Exception: continue
        if rel in cache and cache[rel][0] == sha:
            all_issues.extend(cache[rel][1])
            new_cache[rel] = cache[rel]
            try: files_stats["lines"] += len(path.read_text(encoding="utf-8", errors="replace").splitlines())
            except Exception: pass
        else:
            to_scan.append((root, rel, sha))

    print(f"📂 {len(files)} files · cached: {len(files)-len(to_scan)} · scanning: {len(to_scan)}")

    if to_scan:
        jobs = args.jobs or max(1, (multiprocessing.cpu_count() or 2) - 1)
        tasks = [(root, rel) for root, rel, _ in to_scan]
        if jobs > 1 and len(tasks) > 20:
            try:
                with ProcessPoolExecutor(max_workers=jobs, initializer=_worker_init, initargs=(worker_cfg,)) as pool:
                    for (root, rel, sha), issues in zip(to_scan, pool.map(scan_one_file, tasks)):
                        all_issues.extend(issues)
                        new_cache[rel] = (sha, issues)
            except Exception as e:
                print(f"⚠️  parallel failed, serial: {e}")
                _worker_init(worker_cfg)
                for (root, rel, sha) in to_scan:
                    issues = scan_one_file((root, rel))
                    all_issues.extend(issues)
                    new_cache[rel] = (sha, issues)
        else:
            _worker_init(worker_cfg)
            for (root, rel, sha) in to_scan:
                issues = scan_one_file((root, rel))
                all_issues.extend(issues)
                new_cache[rel] = (sha, issues)

        for root, rel, _ in to_scan:
            try:
                files_stats["lines"] += len(Path(root, rel).read_text(encoding="utf-8", errors="replace").splitlines())
            except Exception: pass

    if not args.no_cache:
        save_cache(new_cache)

    for h in rules_hits:
        h.setdefault("confidence", 90)
        h.setdefault("source", "")
        h.setdefault("column", 0)
        all_issues.append(h)

    if args.diff_from:
        before = len(all_issues)
        all_issues = [i for i in all_issues if i["file"] in changed and i["line"] in changed[i["file"]]]
        print(f"🔍 diff mode: {before} → {len(all_issues)} issues")

    baseline_hits = 0
    if baseline_fps:
        kept = []
        for i in all_issues:
            if _fingerprint(i) in baseline_fps:
                baseline_hits += 1
            else:
                kept.append(i)
        all_issues = kept

    order = {"critical":0,"high":1,"medium":2,"low":3,"info":4}
    all_issues = [i for i in all_issues if order[i["severity"]] <= order[args.min_severity]]

    if args.update_baseline:
        fps = sorted(_fingerprint(i) for i in all_issues)
        Path(args.baseline).write_text(
            json.dumps({"fingerprints": fps, "updated": datetime.now(timezone.utc).isoformat()}, indent=2),
            encoding="utf-8")
        print(f"✅ baseline updated with {len(fps)} fingerprints → {args.baseline}")
        return 0

    summary = {
        "critical": sum(1 for x in all_issues if x["severity"] == "critical"),
        "high":     sum(1 for x in all_issues if x["severity"] == "high"),
        "medium":   sum(1 for x in all_issues if x["severity"] == "medium"),
        "low":      sum(1 for x in all_issues if x["severity"] == "low"),
        "info":     sum(1 for x in all_issues if x["severity"] == "info"),
        "files":     files_stats["files"],
        "lines":     files_stats["lines"],
        "baseline_suppressed": baseline_hits,
        "redundant": 0,
    }

    results = {"issues": all_issues, "redundant": [], "summary": summary}

    write_sarif(results, args.sarif)
    write_markdown(results, args.markdown)
    Path(args.json_out).write_text(json.dumps({"summary": summary}, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if summary["critical"] > 0:
        sys.exit(2)
    if summary["high"] > 0:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    sys.exit(main())