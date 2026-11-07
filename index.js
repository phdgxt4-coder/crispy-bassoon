/**
 * التفوق — ارسم وخمّن: Cloud Functions اختيارية (تدعيم أمان للمرحلة المتقدمة)
 * ------------------------------------------------------------------
 * اللعبة شغالة بالكامل من غير الملف ده (التحقق عند الرسام + قواعد Firestore v140).
 * الملف ده بيضيف طبقة تحقق مركزية اختيارية:
 *   1) verifyGuess  : التحقق من التخمين على السيرفر بدل جهاز الرسام (مستحيل غش من الرسام).
 *   2) onRoomCleanup: تنظيف غرف مهجورة (دورية كل 6 ساعات).
 *
 * التركيب (اختياري — يتطلب خطة Blaze):
 *   cd functions && npm install && firebase deploy --only functions
 *   وبعدين في إعدادات اللعبة (لو فعّلته) العميل يفضل يشتغل بنفس الطريقة —
 *   الدوال دي للترقية المستقبلية ومش شرط لتشغيل اللعبة.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/* تطبيع الإجابة العربية — نفس منطق العميل بالظبط */
function normAns(s) {
  return String(s || "").normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s+/g, "").toLowerCase();
}
function lev1(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 9;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ja = a.length - 1, jb = b.length - 1;
  while (ja >= i && jb >= i && a[ja] === b[jb]) { ja--; jb--; }
  const da = ja - i + 1, db2 = jb - i + 1;
  if (da === 0 || db2 === 0) return 1;
  if (da === 1 && db2 === 1) return 1;
  return 9;
}

/** التحقق المركزي من التخمين — بديل آمن 100% لتحقق الرسام */
exports.verifyGuess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "لازم تسجل دخول");
  }
  const uid = context.auth.uid;
  const code = String(data.code || "").toUpperCase().slice(0, 5);
  const text = String(data.text || "").slice(0, 60);
  if (!code || !text) throw new functions.https.HttpsError("invalid-argument", "بيانات ناقصة");

  const roomRef = db.doc(`dgRooms/${code}`);
  const wordRef = roomRef.doc("word").parent === null ? null : db.doc(`dgRooms/${code}/word/state`);

  const result = await db.runTransaction(async (tr) => {
    const roomSnap = await tr.get(roomRef);
    if (!roomSnap.exists) throw new functions.https.HttpsError("not-found", "الغرفة مش موجودة");
    const room = roomSnap.data();
    if (room.status !== "drawing") return { state: "idle" };
    if (!room.players || !room.players[uid]) throw new functions.https.HttpsError("permission-denied", "مش من لاعبين الغرفة");
    const turn = room.turn || {};
    if (turn.drawerUid === uid) throw new functions.https.HttpsError("permission-denied", "أنت الرسام!");
    if (room.guessed && room.guessed[uid]) return { state: "already" };

    const wordSnap = await tr.get(wordRef);
    const word = (wordSnap.exists && wordSnap.data().word) || "";
    if (!word) return { state: "idle" };

    const g = normAns(text), w = normAns(word);
    const res = (g === w) ? "correct" : ((w.length >= 4 && lev1(g, w) === 1) ? "close" : "wrong");

    const drawSecs = (room.settings && room.settings.drawSecs) || 75;
    const left = Math.max(0, (turn.endsAt || 0) - Date.now());
    const frac = Math.max(0, Math.min(1, left / (drawSecs * 1000)));
    const guessSnap = await tr.get(roomRef.collection("scores").doc(uid));
    const sc = guessSnap.exists ? guessSnap.data() : {};
    const streak = (sc.streak || 0) + 1;
    let pts = 60 + Math.round(140 * frac);
    if (streak >= 2) pts += 15 * Math.min(streak - 1, 4);
    const spent = Math.max(1, Math.round((drawSecs * 1000 - left) / 1000));

    if (res === "correct") {
      tr.set(roomRef.collection("scores").doc(uid), {
        uid, name: (room.players[uid] || {}).name || "لاعب",
        score: (sc.score || 0) + pts, dpts: sc.dpts || 0,
        correct: (sc.correct || 0) + 1, wrong: sc.wrong || 0,
        streak, bestStreak: Math.max(sc.bestStreak || 0, streak),
        fastest: (sc.fastest && sc.fastest > 0) ? Math.min(sc.fastest, spent) : spent,
        lastPts: pts, updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      tr.set(roomRef.collection("scores").doc(turn.drawerUid), {
        uid: turn.drawerUid, name: turn.drawerName || "لاعب",
        score: 0, dpts: 35, correct: 0, wrong: 0, streak: 0, bestStreak: 0, fastest: 0, lastPts: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      tr.update(roomRef, {
        [`guessed.${uid}`]: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      tr.set(roomRef.collection("msgs").doc(), {
        uid: turn.drawerUid, name: turn.drawerName || "", kind: "correct", text: "",
        img: null, audio: null, dur: 0, solverUid: uid, solverName: (room.players[uid] || {}).name || "",
        ts: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    tr.set(roomRef.collection("guesses").doc(uid), {
      uid, name: (room.players[uid] || {}).name || "لاعب", text, at: Date.now(), result: res
    }, { merge: true });
    return { state: res, pts: res === "correct" ? pts : 0 };
  });
  return result;
});

/** تنظيف دوري للغرف المهجورة (أكتر من 6 ساعات بدون نشاط) */
exports.onRoomCleanup = functions.pubsub
  .schedule("every 6 hours")
  .timeZone("Africa/Cairo")
  .onRun(async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 6 * 3600 * 1000);
    const snap = await db.collection("dgRooms")
      .where("updatedAt", "<", cutoff)
      .limit(200)
      .get();
    const jobs = [];
    snap.forEach((d) => {
      const room = d.data() || {};
      const empty = !room.players || Object.keys(room.players).length === 0;
      if (empty || room.status === "ended") jobs.push(d.ref.delete());
    });
    await Promise.all(jobs);
    functions.logger.log("dgRooms cleanup:", jobs.length);
    return null;
  });
