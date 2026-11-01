# تحويل التفوق إلى تطبيق أندرويد (APK / AAB)

> الموقع لازم يكون على **HTTPS** (GitHub Pages تمام) وفيه `manifest.json` بأيقونة 512×512 (+ maskable) و `sw.js` شغّال.
> الرابط عندك: `https://phdgxt4-coder.github.io/<اسم-الريبو>/` — استبدل `<اسم-الريبو>` بالحقيقي.

## الطريقة 1 (الأسهل — من غير Android Studio): PWABuilder
1. افتح https://www.pwabuilder.com وحط رابط الموقع واضغط Start.
2. لو طلعلك نواقص في الـ manifest (أيقونات / start_url) صلّحها وأعد الفحص.
3. اضغط **Package for stores ← Android** واختار:
   - `Package ID`: مثلاً `com.eltafawoq.app`
   - `Signing key`: **New** (احتفظ بملف الـ keystore والباسورد — لو ضاعوا مش هتقدر تحدّث التطبيق).
4. نزّل الـ zip: فيه `app-release-signed.apk` (للتثبيت المباشر) و `.aab` (لـ Google Play) و `assetlinks.json`.
5. ارفع `assetlinks.json` على الموقع في `/.well-known/assetlinks.json` (عشان شريط الرابط يختفي ويبقى زي تطبيق حقيقي).
6. على موبايلك: فعّل «تثبيت من مصادر غير معروفة» وثبّت الـ APK.

## الطريقة 2: Bubblewrap من اللابتوب (CLI)
```bash
npm i -g @bubblewrap/cli
mkdir eltafawoq-apk && cd eltafawoq-apk
bubblewrap init --manifest https://phdgxt4-coder.github.io/<اسم-الريبو>/manifest.json
bubblewrap build        # هيطلع app-release-signed.apk + app-release-bundle.aab
bubblewrap fingerprint  # الـ SHA256 اللي تحطه في assetlinks.json
```
(بيحمّل JDK و Android SDK لوحده أول مرة، محتاج نت ~ 1GB.)

## الطريقة 3: Android Studio + Capacitor (لو عايز تحكم أكبر)
```bash
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init Eltafawoq com.eltafawoq.app --web-dir=www
mkdir www && cp -r index.html sw.js manifest.json icons www/
npx cap add android && npx cap sync
npx cap open android    # Build ► Build APK(s)
```
أو خلّيه يحمّل الموقع الحي بدل النسخة المحلية في `capacitor.config.json`:
```json
{ "appId":"com.eltafawoq.app","appName":"التفوق","webDir":"www",
  "server":{"url":"https://phdgxt4-coder.github.io/<اسم-الريبو>/","cleartext":false} }
```

## الإشعارات داخل الـ APK
- مع PWABuilder/Bubblewrap (TWA) إشعارات الويب (FCM اللي في الكود) **بتشتغل زي ما هي** — الطالب هيتطلب منه الإذن أول مرة.
- مع Capacitor الأفضل تستخدم `@capacitor/push-notifications` + ملف `google-services.json` من Firebase.

## نصايح
- كل ما تحدّث الموقع، التطبيق (TWA) بيتحدّث لوحده — مفيش داعي تبني APK جديد إلا لو غيّرت الأيقونة/الاسم.
- ارفع الـ `.aab` على Google Play Console (رسوم تسجيل مرة واحدة 25$) لو عايز تنشره رسمي.
