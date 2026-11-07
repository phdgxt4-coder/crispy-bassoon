const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const crypto = require('node:crypto');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 20 });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const WORDS = [
  'قطة','كلب','أسد','فيل','زرافة','أرنب','حصان','جمل','فراشة','نحلة','سمكة','طائر','سلحفاة','دلفين','قرد',
  'تفاحة','موزة','برتقالة','بطيخ','عنب','فراولة','بيتزا','كعكة','خبز','آيس كريم','قهوة','عصير',
  'سيارة','دراجة','طائرة','قطار','سفينة','حافلة','صاروخ','مروحية','قارب','شاحنة',
  'مدرسة','مستشفى','حديقة','ملعب','مكتبة','مسجد','سوق','مطار','شاطئ','جبل','قلعة','برج',
  'كتاب','قلم','هاتف','حاسوب','كاميرا','ساعة','مفتاح','مظلة','حقيبة','نظارة','مصباح','مرآة','كرسي','طاولة',
  'شمس','قمر','نجمة','سحابة','مطر','قوس قزح','شجرة','زهرة','نخلة','بحر','نهر','جسر','كرة','تاج','بالون','موسيقى',
  'طبيب','معلم','طباخ','طيار','شرطي','رسام','لاعب كرة','روبوت','رائد فضاء','ملك','أميرة','مهرج'
];
const roomRef = code => db.collection('dgRooms').doc(code);
const secretRef = code => db.collection('dgSecrets').doc(code);
const msgRef = code => roomRef(code).collection('msgs');
function fail(code, message) { throw new HttpsError(code, message); }
function uidOf(req) { if (!req.auth) fail('unauthenticated', 'يلزم تسجيل الدخول'); return req.auth.uid; }
async function ensureAllowed(uid) {
  const adminUid='JQs0vS5OomSJy3qlYf8HRXAwS1w1'; if(uid===adminUid) return;
  const [student,features]=await Promise.all([db.doc(`students/${uid}`).get(),db.doc('config/features').get()]);
  if(student.exists && student.data().blocked===true) fail('permission-denied','الحساب موقوف عن استخدام المنصة');
  if(features.exists && features.data().games===false) fail('permission-denied','اللعب متوقف حاليًا من إدارة المنصة');
}
function cleanName(v) { return String(v || 'لاعب').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 32) || 'لاعب'; }
function codeNew() { return crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, 'A').toUpperCase().slice(0, 5); }
function normalize(s) { return String(s || '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[\s\u200b]/g, '').toLowerCase(); }
function sampleWords(n = 3) { const a = WORDS.slice(); for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a.slice(0,n); }
function mask(word, revealed = 0) { let visible=0; return [...word].map(ch => { if (/\s/.test(ch)) return ' '; if (visible++ < revealed) return ch; return '＿'; }).join(' '); }
function sanitizeStrokes(input) { return input.map(s => { if(!s || !/^#[0-9a-fA-F]{6}$/.test(s.c||'') || !Array.isArray(s.p) || s.p.length<2 || s.p.length>120) fail('invalid-argument','خط رسم غير صالح'); return {id:String(s.id||''),c:s.c,w:Math.max(2,Math.min(18,Number(s.w)||4)),p:s.p.map(v=>[Math.max(0,Math.min(1,Number(v[0])||0)),Math.max(0,Math.min(1,Number(v[1])||0))])}; }); }
function member(room, uid) { if (!room.players || !room.players[uid]) fail('permission-denied', 'لست عضوًا في هذه الغرفة'); }

async function clearStrokeDocs(code) {
  const col=roomRef(code).collection('strokes');
  while(true){const snap=await col.limit(400).get();if(snap.empty)break;const b=db.batch();snap.docs.forEach(d=>b.delete(d.ref));await b.commit();if(snap.size<400)break;}
}

function pickNext(room) {
  const ids=Object.keys(room.players || {}).filter(id => id !== room.drawer);
  return ids.length ? ids[Math.floor(Math.random()*ids.length)] : room.drawer;
}
async function beginChoice(tx, code, room, nextDrawer, completedTurns, scoreMap) {
  const opts=sampleWords(3); const sref=secretRef(code);
  const playerCount=Math.max(1,Object.keys(room.players || {}).length);
  const targetTurns=(Number(room.rounds)||3)*playerCount;
  const activeScores=scoreMap||room.scores||{};
  const top=Object.entries(activeScores).sort((a,b)=>b[1]-a[1])[0];
  const ended=room.endMode==='points' ? !!top && top[1]>=(Number(room.pointsToWin)||100) : completedTurns>=targetTurns;
  if (ended) {
    tx.update(roomRef(code), { status:'ended', turnsCompleted:completedTurns, drawer:null, answerHint:'', deadline:null, winner:top?{uid:top[0],score:top[1]}:null, endedAt:FieldValue.serverTimestamp() });
    tx.set(sref, { answer:null, choices:[], updatedAt:FieldValue.serverTimestamp() }, {merge:true});
    return;
  }
  const round=Math.floor(completedTurns/playerCount)+1;
  tx.update(roomRef(code), { status:'choosing', drawer:nextDrawer, round, turnsCompleted:completedTurns, answerHint:'', strokes:[], hintLevel:0, deadline:Timestamp.fromMillis(Date.now()+20000) });
  tx.set(sref, { answer:null, choices:opts, updatedAt:FieldValue.serverTimestamp() }, {merge:true});
}

exports.createDrawRoom = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const name=cleanName(req.data && req.data.name);
  for(let i=0;i<5;i++) {
    const code=codeNew(), ref=roomRef(code);
    try {
      await db.runTransaction(async tx => {
        const snap=await tx.get(ref); if(snap.exists) throw new Error('CODE_COLLISION');
        tx.create(ref,{host:uid,status:'lobby',players:{[uid]:{name}},scores:{[uid]:0},correctCounts:{[uid]:0},streaks:{[uid]:0},strokes:[],round:0,rounds:3,endMode:'rounds',pointsToWin:100,turnSeconds:60,turnsCompleted:0,hintLevel:0,createdAt:FieldValue.serverTimestamp()});
        tx.create(secretRef(code),{answer:null,choices:[],updatedAt:FieldValue.serverTimestamp()});
      });
      return { code };
    } catch(e) { if(e.message==='CODE_COLLISION') continue; throw e; }
  }
  fail('resource-exhausted','تعذر إنشاء رمز غرفة، حاول مرة أخرى');
});

exports.joinDrawRoom = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').trim().toUpperCase();
  if(!/^[A-Z0-9]{5}$/.test(code)) fail('invalid-argument','رمز الغرفة غير صحيح');
  const ref=roomRef(code), name=cleanName(req.data && req.data.name);
  await db.runTransaction(async tx => {
    const snap=await tx.get(ref); if(!snap.exists) fail('not-found','الغرفة غير موجودة');
    const room=snap.data();
    if(room.status!=='lobby') fail('failed-precondition','اللعبة بدأت بالفعل');
    if(Object.keys(room.players||{}).length>=12 && !room.players[uid]) fail('resource-exhausted','الغرفة ممتلئة');
    tx.update(ref,{[`players.${uid}`]:{name},[`scores.${uid}`]:room.scores?.[uid]||0,[`correctCounts.${uid}`]:room.correctCounts?.[uid]||0,[`streaks.${uid}`]:room.streaks?.[uid]||0});
  });
  return { code };
});

exports.startDrawGame = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), ref=roomRef(code);
  let result={choices:[]};
  await db.runTransaction(async tx => {
    const snap=await tx.get(ref); if(!snap.exists) fail('not-found','الغرفة غير موجودة');
    const room=snap.data(); if(room.host!==uid) fail('permission-denied','المضيف فقط يبدأ اللعبة');
    if(room.status!=='lobby') fail('failed-precondition','اللعبة بدأت');
    const ids=Object.keys(room.players||{}); if(ids.length<2) fail('failed-precondition','يلزم لاعبان على الأقل');
    const drawer=ids[Math.floor(Math.random()*ids.length)], choices=sampleWords(3);
    tx.update(ref,{status:'choosing',drawer,round:1,turnsCompleted:0,strokes:[],hintLevel:0,deadline:Timestamp.fromMillis(Date.now()+20000)});
    tx.set(secretRef(code),{answer:null,choices,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    if(drawer===uid) result.choices=choices;
  });
  return result;
});

exports.getMyDrawChoices = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase();
  const [rs,ss]=await Promise.all([roomRef(code).get(),secretRef(code).get()]);
  if(!rs.exists || !ss.exists) fail('not-found','الغرفة غير موجودة');
  const room=rs.data(); member(room,uid);
  if(room.status!=='choosing' || room.drawer!==uid) fail('permission-denied','لا توجد كلمات لاختيارك الآن');
  return { choices:ss.data().choices || [] };
});

exports.chooseDrawWord = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), choice=String(req.data && req.data.choice || '');
  const pre=await roomRef(code).get();if(!pre.exists)fail('not-found','الغرفة غير موجودة');member(pre.data(),uid);if(pre.data().drawer!==uid||pre.data().status!=='choosing')fail('permission-denied','ليس دورك لاختيار الكلمة');
  await clearStrokeDocs(code);
  await db.runTransaction(async tx => {
    const [rs,ss]=await Promise.all([tx.get(roomRef(code)),tx.get(secretRef(code))]);
    if(!rs.exists||!ss.exists) fail('not-found','الغرفة غير موجودة');
    const room=rs.data(), secret=ss.data(); member(room,uid);
    if(room.status!=='choosing'||room.drawer!==uid) fail('permission-denied','ليس دورك لاختيار الكلمة');
    if(!(secret.choices||[]).includes(choice)) fail('invalid-argument','اختر كلمة من الخيارات');
    tx.set(secretRef(code),{answer:choice,choices:[],updatedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.update(roomRef(code),{status:'playing',answerHint:mask(choice,0),hintLevel:0,deadline:Timestamp.fromMillis(Date.now()+(Number(room.turnSeconds)||60)*1000)});
  });
  return { ok:true, answer:choice };
});

exports.submitDrawGuess = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), guess=String(req.data && req.data.guess || '').trim().slice(0,80);
  if(!guess) fail('invalid-argument','اكتب تخمينًا');
  const ref=roomRef(code); let correct=false;
  await db.runTransaction(async tx => {
    const [rs,ss]=await Promise.all([tx.get(ref),tx.get(secretRef(code))]);
    if(!rs.exists||!ss.exists) fail('not-found','الغرفة غير موجودة');
    const room=rs.data(), answer=ss.data().answer; member(room,uid);
    if(room.status!=='playing' || room.drawer===uid || !answer) fail('failed-precondition','لا يمكن التخمين الآن');
    if(room.deadline && room.deadline.toMillis()<=Date.now()) fail('failed-precondition','انتهى وقت التخمين');
    if(normalize(guess)!==normalize(answer)) return;
    const strokesSnap=await tx.get(ref.collection('strokes'));
    correct=true;
    const elapsed=room.deadline?Math.max(0,Date.now()-(room.deadline.toMillis()-(Number(room.turnSeconds)||60)*1000)):0;
    const speedBonus=Math.max(0,5-Math.floor(elapsed/12000));
    const streaks={...(room.streaks||{})};streaks[uid]=(streaks[uid]||0)+1;
    const comboBonus=streaks[uid]>=3?5:0, awarded=10+speedBonus+comboBonus;
    const scores={...(room.scores||{})}; scores[uid]=(scores[uid]||0)+awarded; scores[room.drawer]=(scores[room.drawer]||0)+5+Math.floor(speedBonus/2);
    const correctCounts={...(room.correctCounts||{})};correctCounts[uid]=(correctCounts[uid]||0)+1;
    const turns=(Number(room.turnsCompleted)||0)+1;
    const winner=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
    tx.create(msgRef(code).doc(),{uid,name:room.players[uid].name,text:`✔ ${room.players[uid].name} خمن الكلمة · +${awarded}`,kind:'correct',ts:FieldValue.serverTimestamp()});
    tx.create(msgRef(code).doc(),{uid:'system',name:'النظام',text:`كانت الكلمة: ${answer}`,kind:'reveal',ts:FieldValue.serverTimestamp()});
    tx.create(ref.collection('history').doc(String(turns)),{round:room.round||1,drawer:room.drawer,answer,strokes:room.strokes||[],completedBy:uid,reason:'guessed',strokes:strokesSnap.docs.map(d=>d.data()),createdAt:FieldValue.serverTimestamp()});
    // The answer is available in chat/history only after a correct guess.
    tx.update(ref,{scores,correctCounts,streaks});
    const ids=Object.keys(room.players||{}), current=ids.indexOf(room.drawer), next=ids[(current+1+ids.length)%ids.length];
    await beginChoice(tx,code,room,next,turns,scores);
    const afterLimit=room.endMode==='points' ? (winner && winner[1]>=(Number(room.pointsToWin)||100)) : turns >= (Number(room.rounds)||3)*Math.max(1,ids.length);
    if(afterLimit) tx.update(ref,{winner:winner ? {uid:winner[0],score:winner[1]} : null});
  });
  return { correct };
});

exports.sendDrawChat = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase();
  const text=String(req.data && req.data.text || '').trim().slice(0,500);
  if(!text) fail('invalid-argument','الرسالة فارغة');
  const ref=roomRef(code), snap=await ref.get(); if(!snap.exists) fail('not-found','الغرفة غير موجودة');
  const room=snap.data(); member(room,uid);
  await msgRef(code).add({uid,name:room.players[uid].name,text,kind:'chat',ts:FieldValue.serverTimestamp()});
  return {ok:true};
});

exports.addDrawStroke = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), stroke=req.data && req.data.stroke;
  if(!stroke || !Array.isArray(stroke.p) || stroke.p.length<2 || stroke.p.length>120) fail('invalid-argument','خط الرسم غير صالح');
  if(!/^#[0-9a-fA-F]{6}$/.test(stroke.c||'')) fail('invalid-argument','لون غير صالح');
  const p=stroke.p.map(v=>[Math.max(0,Math.min(1,Number(v[0]))),Math.max(0,Math.min(1,Number(v[1])))]);
  const id=String(stroke.id||'').slice(0,120);if(!id.startsWith(uid+':'))fail('permission-denied','معرّف خط غير صالح');
  const safe={id,uid,c:stroke.c,w:Math.max(2,Math.min(18,Number(stroke.w)||4)),p};
  await db.runTransaction(async tx => {
    const ref=roomRef(code), sref=ref.collection('strokes').doc(id), [snap,old]=await Promise.all([tx.get(ref),tx.get(sref)]);
    if(!snap.exists) fail('not-found','الغرفة غير موجودة');
    const r=snap.data(); member(r,uid); if(r.drawer!==uid||r.status!=='playing') fail('permission-denied','الرسام الحالي فقط يرسم');
    if(r.deadline && r.deadline.toMillis()<=Date.now()) fail('failed-precondition','انتهى وقت الرسم');
    if(!old.exists && (await tx.get(ref.collection('strokes').limit(251))).size>=250) fail('resource-exhausted','وصلت اللوحة للحد الأقصى من الخطوط');
    tx.set(sref,{...safe,createdAt:old.exists?old.data().createdAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});

exports.replaceDrawStrokes = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), strokes=req.data && req.data.strokes;
  if(!Array.isArray(strokes)||strokes.length>250) fail('invalid-argument','حالة اللوحة غير صالحة');
  const safeStrokes=sanitizeStrokes(strokes).map((s,i)=>{const id=String(s.id||`${uid}:${Date.now()}:${i}`).slice(0,120);if(!id.startsWith(uid+':'))fail('permission-denied','معرّف خط غير صالح');return {...s,id,uid}});
  await db.runTransaction(async tx => {
    const ref=roomRef(code), snap=await tx.get(ref); if(!snap.exists) fail('not-found','الغرفة غير موجودة');
    const r=snap.data(); member(r,uid); if(r.drawer!==uid||r.status!=='playing') fail('permission-denied','الرسام الحالي فقط يعدل اللوحة');
    if(r.deadline && r.deadline.toMillis()<=Date.now()) fail('failed-precondition','انتهى وقت الرسم');
    const col=ref.collection('strokes'), old=await tx.get(col);
    old.docs.forEach(d=>tx.delete(d.ref));
    safeStrokes.forEach((stroke,i)=>tx.set(col.doc(stroke.id||`${uid}:${Date.now()}:${i}`),{...stroke,createdAt:FieldValue.serverTimestamp()}));
  });
  return {ok:true};
});
exports.leaveDrawRoom = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), ref=roomRef(code);
  await db.runTransaction(async tx => {
    const snap=await tx.get(ref); if(!snap.exists) return;
    const room=snap.data(); if(!room.players?.[uid]) return;
    const players={...room.players}; delete players[uid]; const scores={...room.scores}; delete scores[uid];
    if(!Object.keys(players).length) { tx.delete(ref); tx.delete(secretRef(code)); return; }
    const update={players,scores};
    if(room.host===uid) update.host=Object.keys(players)[0];
    if(room.drawer===uid && ['playing','choosing'].includes(room.status)) {
      const n=Object.keys(players)[0]; const choices=sampleWords(3);
      update.drawer=n;update.status='choosing';update.strokes=[];update.deadline=Timestamp.fromMillis(Date.now()+20000);
      tx.set(secretRef(code),{answer:null,choices,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
    tx.update(ref,update);
  });
  return {ok:true};
});

exports.tickDrawRoom = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), ref=roomRef(code);
  let result={expired:false};
  await db.runTransaction(async tx => {
    const [rs,ss]=await Promise.all([tx.get(ref),tx.get(secretRef(code))]);
    if(!rs.exists||!ss.exists) return;
    const room=rs.data();member(room,uid);
    if(!room.deadline || !['playing','choosing'].includes(room.status)) return;
    const deadline=room.deadline.toMillis(), now=Date.now();
    if(now<deadline){
      if(room.status==='playing' && ss.data().answer){
        const elapsed=now-(deadline-(Number(room.turnSeconds)||60)*1000), level=Number(room.hintLevel)||0;
        const nextLevel=elapsed>=40000?2:(elapsed>=22000?1:0);
        if(nextLevel>level){tx.update(ref,{hintLevel:nextLevel,answerHint:mask(ss.data().answer,nextLevel)});result.hintLevel=nextLevel;}
      }
      return;
    }
    result.expired=true;
    const answer=ss.data().answer;
    const strokesSnap=await tx.get(ref.collection('strokes'));
    const turns=(Number(room.turnsCompleted)||0)+1;
    if(answer){
      tx.create(msgRef(code).doc(),{uid:'system',name:'النظام',text:`انتهى الوقت. كانت الكلمة: ${answer}`,kind:'reveal',ts:FieldValue.serverTimestamp()});
      tx.create(ref.collection('history').doc(String(turns)),{round:room.round||1,drawer:room.drawer,answer,strokes:room.strokes||[],completedBy:null,reason:'timeout',strokes:strokesSnap.docs.map(d=>d.data()),createdAt:FieldValue.serverTimestamp()});
    }
    const ids=Object.keys(room.players||{}), idx=ids.indexOf(room.drawer), next=ids[(idx+1+ids.length)%ids.length];
    await beginChoice(tx,code,room,next,turns);
    tx.create(msgRef(code).doc(),{uid:'system',name:'النظام',text:room.status==='playing'?'انتهى الوقت، ننتقل للاعب التالي':'انتهى وقت اختيار الكلمة',kind:'system',ts:FieldValue.serverTimestamp()});
  });
  return result;
});

exports.setDrawSettings = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase();
  const rounds=Math.max(1,Math.min(10,Number(req.data && req.data.rounds)||3));
  const endMode=req.data && req.data.endMode==='points'?'points':'rounds';
  const pointsToWin=Math.max(20,Math.min(1000,Number(req.data && req.data.pointsToWin)||100));
  const turnSeconds=Math.max(30,Math.min(120,Number(req.data && req.data.turnSeconds)||60));
  const ref=roomRef(code), snap=await ref.get(); if(!snap.exists) fail('not-found','الغرفة غير موجودة');
  if(snap.data().host!==uid||snap.data().status!=='lobby') fail('permission-denied','المضيف يضبط إعدادات الانتظار فقط');
  await ref.update({rounds,endMode,pointsToWin,turnSeconds}); return {rounds,endMode,pointsToWin,turnSeconds};
});

exports.getMyDrawState = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase();
  const [rs,ss]=await Promise.all([roomRef(code).get(),secretRef(code).get()]);
  if(!rs.exists||!ss.exists) fail('not-found','الغرفة غير موجودة');
  const room=rs.data(); member(room,uid);
  if(room.drawer!==uid) return { answer:null, choices:[] };
  const secret=ss.data();
  return { answer:room.status==='playing' ? (secret.answer||null) : null, choices:room.status==='choosing' ? (secret.choices||[]) : [] };
});

exports.sendDrawMedia = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase();
  const path=String(req.data && req.data.path || ''), type=String(req.data && req.data.type || '');
  const prefix=`dgRooms/${code}/media/${uid}/`;
  if(!path.startsWith(prefix) || !['image','audio'].includes(type)) fail('invalid-argument','مرفق غير صالح');
  const rs=await roomRef(code).get(); if(!rs.exists) fail('not-found','الغرفة غير موجودة');
  const room=rs.data(); member(room,uid);
  const file=admin.storage().bucket().file(path);
  const [exists,meta]=await file.getMetadata().then(x=>[true,x[0]]).catch(()=>[false,null]);
  if(!exists) fail('not-found','الملف غير موجود');
  const ct=String(meta.contentType||'');
  if(type==='image'&&!/^image\/(jpeg|png|webp|gif)$/.test(ct)) fail('invalid-argument','نوع الصورة غير مسموح');
  if(type==='audio'&&!/^audio\/(webm|ogg|mpeg|mp4|aac|wav)$/.test(ct)) fail('invalid-argument','نوع الصوت غير مسموح');
  await msgRef(code).add({uid,name:room.players[uid].name,type,path,kind:'media',ts:FieldValue.serverTimestamp()});
  return {ok:true};
});

exports.restartDrawGame = onCall(async req => {
  const uid=uidOf(req); await ensureAllowed(uid); const code=String(req.data && req.data.code || '').toUpperCase(), ref=roomRef(code);
  await db.runTransaction(async tx => {
    const snap=await tx.get(ref); if(!snap.exists) fail('not-found','الغرفة غير موجودة');
    const room=snap.data(); if(room.host!==uid || room.status!=='ended') fail('permission-denied','المضيف فقط يعيد المباراة بعد انتهائها');
    const ids=Object.keys(room.players||{}); if(ids.length<2) fail('failed-precondition','يلزم لاعبان على الأقل');
    const drawer=ids[Math.floor(Math.random()*ids.length)], choices=sampleWords(3);
    const scores={}; ids.forEach(id=>scores[id]=0);
    tx.update(ref,{status:'choosing',drawer,round:1,turnsCompleted:0,scores,strokes:[],winner:null,hintLevel:0,deadline:Timestamp.fromMillis(Date.now()+20000)});
    tx.set(secretRef(code),{answer:null,choices,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  return {ok:true};
});

exports.recordDrawMatchStats = onDocumentUpdated('dgRooms/{code}', async event => {
  const before=event.data.before.data(), after=event.data.after.data();
  if(before.status==='ended' || after.status!=='ended') return;
  const code=event.params.code, ids=Object.keys(after.players||{});
  if(!ids.length) return;
  const eventRef=db.collection('dgStatsEvents').doc(code);
  await db.runTransaction(async tx => {
    const already=await tx.get(eventRef); if(already.exists) return;
    const refs=ids.map(uid=>db.collection('dgStats').doc(uid));
    const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
    for(let i=0;i<ids.length;i++){
      const uid=ids[i], old=snaps[i].exists?snaps[i].data():{}, won=after.winner&&after.winner.uid===uid;
      const games=(Number(old.gamesPlayed)||0)+1, xp=(Number(old.xp)||0)+20+(won?50:0);
      const correct=(Number(old.correctGuesses)||0)+(Number((after.correctCounts||{})[uid])||0);
      const badges=Array.isArray(old.achievements)?old.achievements.slice():[];
      if(games>=1&&!badges.includes('first-game'))badges.push('first-game');
      if(games>=5&&!badges.includes('five-games'))badges.push('five-games');
      if(won&&!badges.includes('first-win'))badges.push('first-win');
      tx.set(refs[i],{gamesPlayed:games,xp,level:Math.floor(xp/200)+1,wins:(Number(old.wins)||0)+(won?1:0),correctGuesses:correct,bestScore:Math.max(Number(old.bestScore)||0,Number((after.scores||{})[uid])||0),achievements:badges,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
    tx.create(eventRef,{code,processedAt:FieldValue.serverTimestamp()});
  });
});
