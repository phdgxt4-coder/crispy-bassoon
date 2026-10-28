# معمارية منصة التفوق (Production)

## المبادئ
1. **GitHub Pages + Firebase** — تطبيق ثابت (SPA) بدون خادم تطبيق خاص.
2. **فصل الاهتمامات** — إعدادات / أدوات / Firebase / واجهة / منطق الشاشات.
3. **عزل الميزات منطقيًا** — Feature Flags في `config/features`؛ إيقاف ميزة لا يكسر الباقي.
4. **أوامر قابلة للتوسع** — ألعاب HTML مستقلة + سجل `games-registry.js`.

## طبقات المشروع

```
index.html          → هيكل + استيراد فقط
css/                → أنماط حسب المجال (main, exams, games, chat, life, admin, responsive)
js/config.js        → Feature catalog + حدود + أسماء المجموعات
js/logger.js        → تسجيل موحّد (error/warn دائمًا؛ debug اختياري)
js/firebase.js      → تهيئة Firebase وwrappers
js/utils.js         → أدوات عامة + SUBJECTS + ADMIN_UID + ثوابت
js/ui-helpers.js    → emptyBox / pill / loadingCard
js/exams-helpers.js → تحليل وتصحيح الامتحانات
js/games-registry.js→ سجل الألعاب الخارجية
js/app.js           → الحالة S + render + إجراءات A + لوحات الأدمن
js/splash-fx.js     → شاشة البداية وPWA
sw.js               → كاش وتحديثات
firestore.rules     → أمان على السيرفر (Firebase)
```

## الميزات المعزولة (Feature Flags)
المفاتيح في `FEATURE_CATALOG` (`js/config.js`) وتُدار من الأدمن عبر `config/features`.
دوال `featOn` / `featState` في `app.js` تقرأ `S.features`.

## لوحات الأدمن التشغيلية (موجودة)
- **Error Center** → تبويب `errors`
- **Health Check** → تبويب `health`
- **Performance** → تبويب `perf`
- **Developer Tools** → تبويب `devtools`

## إضافة لعبة خارجية
1. أنشئ `my-game.html` في الجذر.
2. سجّلها في `js/games-registry.js`.
3. أضف بطاقة `gcard(...)` في واجهة الألعاب داخل `app.js`.

## إضافة ميزة جديدة
1. مفتاح في `FEATURE_CATALOG` إن كانت قابلة للقفل.
2. منطق نقي → ملف helpers إن أمكن.
3. شاشة + إجراءات في `app.js` (S.view / A.*).
4. قواعد Firestore إن لزم.

## حدود تقنية مقصودة (دين تقني موثّق)
- `app.js` ما زال كبيرًا لأن الحالة `S` و`render` مشتركة؛ التقسيم التدريجي آمن عبر استخراج helpers فقط.
- XP/النتائج من العميل — الحماية الكاملة تحتاج Cloud Functions لاحقًا.
