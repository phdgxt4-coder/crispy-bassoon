# Smart Code Review

```bash
pip install -r requirements.txt
python code_review_agent.py --root .
cat CODE_REVIEW_REPORT.md
python rules_checker.py firestore.rules   # لو عندك نسخة القواعد
```

الإعدادات في `.reviewrc.json`. للتجاهل داخل الكود: `// review-ignore-next-line rule-id`.
