# هيكل مشروع منصة التفوق — للصيانة

## الملفات الأساسية
| المسار | الدور |
|--------|--------|
| `index.html` | هيكل الصفحة فقط + استيراد CSS/JS |
| `js/app.js` | المنطق الرئيسي والواجهات (S + render + A) |
| `js/firebase.js` | إعداد Firebase + wrappers |
| `js/utils.js` | أدوات عامة + ثوابت المنصة + SUBJECTS |
| `js/exams-helpers.js` | تحليل الأسئلة وتصحيح المقال |
| `js/ui-helpers.js` | emptyBox / pill / loadingCard |
| `js/splash-fx.js` | شاشة البداية و PWA |
| `css/main.css` | الأساس والثيمات |
| `css/games.css` · `chat.css` · `life.css` | أقسام متخصصة |
| `css/responsive.css` | موبايل + polish + a11y |
| `firestore.rules` | يُنشر على Firebase وليس Pages |
| `sw.js` | Service Worker |
| `*.html` (ألعاب) | تُفتح عند الطلب فقط |

## إضافة ميزة جديدة
1. ثوابت → `js/utils.js`
2. منطق نقي → ملف helpers مناسب
3. واجهة/حالة → `js/app.js` (view + A actions)
4. تنسيق خاص → ملف CSS في `css/`

## إضافة لعبة
1. أنشئ `game-name.html` في الجذر
2. اربطها من قائمة الألعاب في `app.js` عبر `gcard(..., "game-name.html")`

## لا تخلط
- لا تضع مفاتيح Admin SDK في العميل
- الأدمن = `ADMIN_UID` في `utils.js` + `firestore.rules`

## فحص جودة قبل النشر (آخر تشغيل)
- Syntax JS: OK
- Imports/Exports: OK
- UID utils ↔ rules: متطابق
- روابط الألعاب والـ CSS/JS: OK
- SW precache: ملفات موجودة
- لا console.log / TODO / localhost للتطوير
- APK: متوفر
- إصدار: v93-mod10
