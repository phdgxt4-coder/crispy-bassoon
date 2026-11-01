#!/usr/bin/env python3
"""Firestore rules linter — catches holes that let students self-edit privileged fields."""
import re, sys, json
from pathlib import Path

# (?:(?!\bmatch\b).)*? = ما يعديش على match تانية (عشان مفيش false positives بين الـ collections)
_IN = r'(?:(?!\bmatch\b).)*?'

CHECKS = [
    (re.compile(r'allow\s+(?:read\s*,\s*write|write\s*,\s*read)\s*:\s*if\s+true'),
     "critical", "open-all", "allow read, write: if true", "أي حد على النت يقدر يقرا ويكتب"),
    (re.compile(r'allow\s+write\s*:\s*if\s+true'),
     "critical", "open-write", "allow write: if true", "أي حد يقدر يكتب"),
    (re.compile(r'match\s+/studentsPrivate/' + _IN + r'allow\s+(?:read|write|get|list|create|update)[^;]*:\s*if\s+(?!false)', re.S),
     "critical", "private-collection", "studentsPrivate مفتوحة في القواعد", "لازم read/write = false تمامًا"),
    (re.compile(r'allow\s+read\s*:\s*if\s+request\.auth\s*==\s*null'),
     "critical", "null-auth-read", "allow read للـ null auth", "غير المسجلين يقرأوا"),
    (re.compile(r'match\s+/students/\{uid\}' + _IN + r'allow\s+update\s*:\s*if\s+request\.auth\.uid\s*==\s*uid\s*;', re.S),
     "high", "student-self-update", "الطالب يعدّل students/{uid} بلا تقييد", "لازم hasOnly([...])"),
    (re.compile(r'match\s+/life/\{uid\}' + _IN + r'allow\s+update\s*:\s*if\s+request\.auth\.uid\s*==\s*uid\s*;', re.S),
     "high", "life-self-update", "الطالب يعدّل life/{uid} بلا تقييد", "coins/xp لازم Cloud Function"),
    (re.compile(r'match\s+/(?:results|starts|leaderboard)/' + _IN + r'allow\s+write\s*:\s*if\s+request\.auth\s*!=\s*null\s*;', re.S),
     "high", "user-write-results", "أي مستخدم يكتب في results/starts/leaderboard", "قيّد بـ resource.data.uid == request.auth.uid"),
    (re.compile(r'match\s+/(?:comments|suspicious|fadaye7)/' + _IN + r'allow\s+create\s*:\s*if\s+request\.auth\s*!=\s*null\s*;', re.S),
     "medium", "spam-create", "نشر بلا حدود", "قيّد بالحجم والـ uid"),
]
ORDER = {"critical": 0, "high": 1, "medium": 2, "info": 3}

def scan_rules(path):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    all_lines = text.splitlines()
    hits = []
    for pat, sev, rule, msg, why in CHECKS:
        for m in pat.finditer(text):
            line_no = text[:m.start()].count("\n") + 1
            hits.append({"rule": f"rules-{rule}", "severity": sev, "file": str(path),
                         "line": line_no, "column": 0, "message": msg, "why": why,
                         "source": all_lines[line_no-1].strip()[:200] if line_no <= len(all_lines) else "",
                         "confidence": 90})
    hits.sort(key=lambda h: (ORDER[h["severity"]], h["line"]))
    return hits

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "firestore.rules"
    if not Path(path).exists():
        print(f"⚠️  {path} not found"); sys.exit(0)
    hits = scan_rules(path)
    print(json.dumps(hits, ensure_ascii=False, indent=2))
    sys.exit(2 if any(h["severity"] == "critical" for h in hits) else 0)
