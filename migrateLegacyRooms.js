// One-time operation for legacy v178 rooms. Review the impact, then run manually:
// node functions/migrateLegacyRooms.js
// It resets active legacy rooms to lobby and strips answer-bearing fields before new rules go live.
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
(async () => {
  const snap = await db.collection('dgRooms').get();
  let batch = db.batch(), count = 0, writes = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const patch = { word: admin.firestore.FieldValue.delete(), answer: admin.firestore.FieldValue.delete(), hint: admin.firestore.FieldValue.delete() };
    if (d.status === 'playing' || d.status === 'choosing') {
      patch.status = 'lobby'; patch.drawer = admin.firestore.FieldValue.delete(); patch.strokes = []; patch.round = 0;
      patch.answerHint = admin.firestore.FieldValue.delete(); patch.deadline = admin.firestore.FieldValue.delete();
    }
    batch.update(doc.ref, patch); count++; writes++;
    if (writes >= 450) { await batch.commit(); batch=db.batch(); writes=0; }
  }
  if (writes) await batch.commit();
  console.log(`Processed ${count} rooms. Existing active rounds were reset.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
