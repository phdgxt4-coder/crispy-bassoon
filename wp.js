/* التفوق — ارسم وخمّن (WP v215) — على نمط ويبلاي
   رسم لحظي (chunks) · تخمين في الشات · صوت · صور · ملصقات · نقاط بالوقت
   لا يعتمد على كود اللعبة القديمة — يستخدم wpRooms في Firestore (القواعد في firestore.rules v215) */
(function(){
"use strict";
if(window.WP)return;
var FSU="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
var WORDS=["أسد", "قطة", "كلب", "فيل", "جمل", "قرد", "زرافة", "دب", "ثعلب", "أرنب", "حصان", "دجاجة", "بطة", "بومة", "عصفور", "سمكة", "تمساح", "ثعبان", "سلحفاة", "عقرب", "نحلة", "فراشة", "عنكبوت", "بطريق", "كنغر", "بقرة", "ماعز", "خروف", "دولفين", "قرش", "خفاش", "جندب", "بعوضة", "صاروخ", "طائرة", "سيارة", "قطار", "سفينة", "غواصة", "دراجة", "مظلة", "كرة قدم", "سلة", "مضرب", "شبكة", "حكم", "جمهور", "سباحة", "ملاكم", "جمباز", "شطرنج", "بلياردو", "إبرة", "مقص", "شمعة", "مروحة", "ثلاجة", "مكواة", "مكنسة", "منبه", "مرآة", "خزانة", "سرير", "وسادة", "بطانية", "مكتب", "كرسي", "نافذة", "باب", "سلم", "مصعد", "برج", "هرم", "متحف", "مسبح", "شاطئ", "صحراء", "واحة", "مطر", "قوس قزح", "برق", "ثلج", "بركان", "نخلة", "وردة", "تفاحة", "موزة", "برتقالة", "بطيخ", "عنب", "جبنة", "عسل", "خبز", "بيتزا", "برجر", "شاورما", "كشري", "كنافة", "بلح", "عصير", "قهوة", "شاي", "طبيب", "معلم", "شرطي", "طيار", "بحار", "خباز", "جزار", "ممثل", "مغني", "راوي", "مخبر", "عالم", "فلاح", "صياد", "نار", "جبل", "كهف", "نفق", "جسر", "نهر", "شلال", "بئر", "راديو", "تلفزيون", "موبايل", "كمبيوتر", "لوحة مفاتيح", "ماوس", "طابعة", "كاميرا", "مايك", "سماعة", "شاحن", "بطارية", "روبوت", "بالون", "هدية", "شجرة", "غابة", "عش", "حصالة", "فانوس", "مشعل", "ميزان", "بوصلة", "خريطة", "كرة أرضية", "مجهر", "تلسكوب", "كيمياء", "مختبر", "سبورة", "قلم", "ممحاة", "مسطرة", "كراسة", "جرس", "حقيبة", "زجاجة", "كوب", "طبق", "ملعقة", "شوكة", "سكينة", "مقلاة", "قدر", "فرن", "غسالة", "صابون", "معجون", "فرشاة أسنان", "منشفة", "حوض", "دش", "سلة مهملات", "مصباح", "لمبة", "شاشة", "ريموت", "مكيف", "سجادة", "ستارة", "رف", "مرتبة"];
var COLORS=["#111827","#ef4444","#f97316","#facc15","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#92400e","#9ca3af","#ffffff"];
var SIZES=[5,10,18,34];
var EMO="😂 🤣 😍 🥰 😎 🤔 😱 😭 😡 🥳 🤯 😴 👍 👎 👏 🙏 💪 🔥 ❤️ 💯 🎉 💩 👻 🙈 🤝 😜 🤪 😅 🥺 😏 🤤 🤮".split(" ");
var FS=null,db=null,ME=null,B=null;
var R=null,code="",U=[],msgs=[],pres={},items=[],off=-1e12,secret="",wordOpts=null,picked=false,cur=null,nextS=0,tickT=null,hbT=null,lastIdx=-9,screen="",strokeUnsub=null,hintLvl=0,rv=[],busy=false,pen={c:COLORS[0],w:SIZES[1]},rec=null,audioEl=null,rafP=0,curAns=false;

var E=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var $=function(i){return document.getElementById(i)};
var now=function(){return Date.now()+(off>-1e11?off:0)};
var ms=function(t){return t&&t.toMillis?t.toMillis():(typeof t==="number"?t:0)};
var rref=function(){return FS.doc(db,"wpRooms",code)};
var col=function(n){return FS.collection(db,"wpRooms",code,n)};

/* ---------- نصوص وتجزئة الكلمة ---------- */
function canon(s){
  return String(s||"").normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,"")
    .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/ؤ/g,"و").replace(/ئ/g,"ي")
    .replace(/[^\p{L}\p{N}]/gu,"").replace(/^ال(?=.{2})/,"");
}
function H(s,salt){ /* cyrb53 */
  s=String(salt)+"|"+s;var h1=0xdeadbeef,h2=0x41c6ce57,i,ch;
  for(i=0;i<s.length;i++){ch=s.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677)}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return String(4294967296*(2097151&h2)+(h1>>>0));
}
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function genCode(){var c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",s="";for(var i=0;i<5;i++)s+=c[Math.floor(Math.random()*c.length)];return s}
function toast(t){var d=document.createElement("div");d.className="wp-toast";d.textContent=t;(($("wp")||document.body)).appendChild(d);setTimeout(function(){d.remove()},2600)}
function hue(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h}
function avatar(u,p,sz){
  p=p||{};sz=sz||44;
  if(p.av&&String(p.av).length>20)return '<img class="wp-av" style="width:'+sz+'px;height:'+sz+'px" src="'+E(p.av)+'">';
  var n=(p.name||"?").trim();
  return '<span class="wp-av" style="width:'+sz+'px;height:'+sz+'px;background:hsl('+hue(u||n)+',55%,45%);font-size:'+(sz*.42)+'px">'+E(n.charAt(0)||"?")+'</span>';
}
var present=function(u){return u===ME.uid||(pres[u]&&now()-pres[u]<45000)};
var plist=function(){return Object.keys((R&&R.players)||{}).filter(present)};

/* ---------- CSS ---------- */
function css(){
  if($("wpCss"))return;
  var s=document.createElement("style");s.id="wpCss";
  s.textContent=
"#wp{position:fixed;inset:0;z-index:99990;background:#0a0a23;color:#f1f1ff;font-family:inherit;direction:rtl;display:flex;flex-direction:column;overflow:hidden;-webkit-tap-highlight-color:transparent}"+
"#wp *{box-sizing:border-box}#wp button{font-family:inherit;cursor:pointer;border:0;color:inherit}"+
".wp-scr{flex:1;display:flex;flex-direction:column;min-height:0;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}"+
".wp-btn{background:#241c52;border-radius:14px;padding:12px 16px;font-weight:800;font-size:15px}.wp-btn.gold{background:linear-gradient(#ffd56a,#f0a92c);color:#2a1a00}.wp-btn.green{background:#16a34a}.wp-btn:disabled{opacity:.45}"+
".wp-center{margin:auto;width:min(92%,420px);display:flex;flex-direction:column;gap:12px;text-align:center}"+
".wp-center h1{font-size:30px;margin:0}.wp-center input{width:100%;padding:14px;border-radius:14px;border:2px solid #3a2f7a;background:#120f33;color:#fff;font-size:20px;text-align:center;letter-spacing:.3em;text-transform:uppercase;font-weight:800}"+
".wp-top{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#120f33;border-bottom:1px solid #2a2260;min-height:50px}"+
".wp-x{background:#241c52;border-radius:12px;width:38px;height:38px;font-size:16px}"+
".wp-hint{flex:1;text-align:center;font-weight:900;font-size:19px;letter-spacing:.18em;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.wp-hint small{display:block;font-size:11px;letter-spacing:0;opacity:.7;font-weight:600}"+
".wp-tm{min-width:46px;height:38px;border-radius:19px;background:#241c52;display:flex;align-items:center;justify-content:center;font-weight:900;font-variant-numeric:tabular-nums}.wp-tm.low{background:#b91c1c;animation:wpP .6s infinite alternate}@keyframes wpP{to{transform:scale(1.12)}}"+
".wp-pl{display:flex;gap:8px;overflow-x:auto;padding:8px 10px;background:#0f0c2b;scrollbar-width:none}.wp-pl::-webkit-scrollbar{display:none}"+
".wp-p{flex:0 0 auto;width:56px;text-align:center;position:relative;opacity:.55}.wp-p.on{opacity:1}.wp-p b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wp-p i{display:block;font-style:normal;font-size:11px;color:#ffd56a;font-weight:800}"+
".wp-p .bd{position:absolute;top:-3px;right:2px;font-size:14px}.wp-p.me .wp-av{outline:2px solid #ffd56a}.wp-p.dr .wp-av{outline:2px solid #22c55e}.wp-p.ok .wp-av{outline:2px solid #3b82f6}"+
".wp-av{border-radius:50%;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#fff;flex:0 0 auto}"+
".wp-cvw{position:relative;margin:6px auto;width:min(100% - 12px,calc(42dvh*1.25));aspect-ratio:5/4;background:#fff;border-radius:16px;overflow:hidden;flex:0 0 auto;box-shadow:0 2px 14px #0008}"+
"#wpCv{width:100%;height:100%;display:block;touch-action:none}"+
".wp-ov{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(10,10,35,.86);color:#fff;text-align:center;padding:12px;flex-direction:column;gap:10px}.wp-ov.show{display:flex}"+
".wp-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:94%}.wp-opts button{background:#fff;color:#14532d;border-radius:14px;padding:16px 6px;font-weight:900;font-size:18px;border:2px solid #86efac}"+
".wp-rv{font-size:26px;font-weight:900;color:#ffd56a}.wp-gain{font-size:13px;max-height:70px;overflow:auto;width:100%}.wp-gain div{padding:2px}"+
".wp-tools{display:none;align-items:center;gap:5px;padding:4px 8px;overflow-x:auto;scrollbar-width:none;flex:0 0 auto}.wp-tools.show{display:flex}.wp-tools::-webkit-scrollbar{display:none}"+
".wp-sw{flex:0 0 auto;width:26px;height:26px;border-radius:50%;border:2px solid #ffffff44}.wp-sw.sel{border-color:#ffd56a;transform:scale(1.18)}"+
".wp-sz{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:#241c52;display:flex;align-items:center;justify-content:center}.wp-sz.sel{background:#4c3bbd}.wp-sz span{background:#fff;border-radius:50%;display:block}"+
".wp-ic{flex:0 0 auto;background:#241c52;border-radius:10px;width:34px;height:32px;font-size:16px}"+
".wp-msgs{flex:1;min-height:70px;overflow-y:auto;padding:6px 10px;display:flex;flex-direction:column;gap:5px;background:#0d0b2a;margin:0 6px;border-radius:14px}"+
".wp-m{display:flex;gap:6px;align-items:flex-start;max-width:88%}.wp-m.me{align-self:flex-start}.wp-mb{background:#1d1748;border-radius:12px;padding:5px 9px;font-size:14px;word-break:break-word}.wp-m.me .wp-mb{background:#2b2170}"+
".wp-mb u{display:block;text-decoration:none;font-size:11px;color:#a5b4fc;font-weight:800}.wp-mb.team{border:1px dashed #3b82f6}.wp-mb img.pic{max-width:190px;max-height:170px;border-radius:10px;display:block}"+
".wp-ok{align-self:center;background:#14532d;color:#bbf7d0;border-radius:14px;padding:5px 12px;font-size:13px;font-weight:800;text-align:center}.wp-sys{align-self:center;background:#1f1a4d;color:#c4b5fd;border-radius:14px;padding:4px 12px;font-size:12px;text-align:center}"+
".wp-stk{font-size:46px;line-height:1}.wp-au{display:flex;align-items:center;gap:8px;min-width:130px}.wp-au button{width:34px;height:34px;border-radius:50%;background:#ffd56a;color:#2a1a00;font-size:14px}.wp-au span{font-size:12px;font-variant-numeric:tabular-nums}"+
".wp-in{display:flex;gap:6px;align-items:center;padding:7px 8px calc(7px + env(safe-area-inset-bottom));background:#120f33;flex:0 0 auto}.wp-in input{flex:1;min-width:0;padding:11px 12px;border-radius:14px;border:1px solid #3a2f7a;background:#0a0a23;color:#fff;font-size:15px}"+
".wp-in .ib{width:40px;height:40px;border-radius:12px;background:#241c52;font-size:18px;flex:0 0 auto}.wp-in .ib.rec{background:#dc2626;animation:wpP .6s infinite alternate}.wp-in .send{background:linear-gradient(#ffd56a,#f0a92c);color:#2a1a00;border-radius:12px;padding:0 14px;height:40px;font-weight:900}"+
".wp-pan{display:none;grid-template-columns:repeat(8,1fr);gap:2px;padding:6px;background:#120f33;max-height:150px;overflow:auto;flex:0 0 auto}.wp-pan.show{display:grid}.wp-pan button{background:none;font-size:24px;padding:4px}"+
".wp-lob{padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1}.wp-card{background:#161238;border:1px solid #2a2260;border-radius:16px;padding:12px}"+
".wp-code{font-size:34px;font-weight:900;letter-spacing:.25em;direction:ltr;text-align:center;color:#ffd56a}"+
".wp-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;background:#120f33;margin-top:6px}.wp-row b{flex:1}.wp-row em{font-style:normal;font-size:12px;color:#86efac}.wp-row em.no{color:#a5a5c8}"+
".wp-set{display:flex;gap:8px;align-items:center;margin-top:8px}.wp-set select{flex:1;padding:8px;border-radius:10px;background:#0a0a23;color:#fff;border:1px solid #3a2f7a;font-family:inherit}"+
".wp-rank{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:#161238;margin-top:6px}.wp-rank.f{background:linear-gradient(90deg,#5b4400,#161238)}.wp-rank b{flex:1}.wp-rank strong{color:#ffd56a;font-size:18px}"+
".wp-toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#ffd56a;color:#2a1a00;padding:10px 16px;border-radius:14px;font-weight:800;z-index:100000;max-width:90%;text-align:center}"+
".wp-big{position:fixed;inset:0;background:#000d;z-index:100001;display:flex;align-items:center;justify-content:center}.wp-big img{max-width:96%;max-height:92%;border-radius:12px}";
  document.head.appendChild(s);
}

/* ---------- تحميل ---------- */
async function init(){
  if(FS)return true;
  B=window.__WPFB&&window.__WPFB();
  if(!B||!B.db||!B.uid){alert("سجّل دخولك الأول");return false}
  FS=await import(FSU);db=B.db;
  return true;
}
function me(){
  B=window.__WPFB();
  var th=B.thumb||"";if(String(th).length>6000)th="";
  ME={uid:B.uid,name:String(B.name||"لاعب").slice(0,30),thumb:th};
}
function root(){
  var r=$("wp");if(!r){r=document.createElement("div");r.id="wp";document.body.appendChild(r)}return r;
}

/* ---------- شاشة الدخول ---------- */
async function open(){
  if(!(await init()))return;
  me();css();stopAll();R=null;
  var saved="";try{saved=sessionStorage.getItem("wpCode")||""}catch(_){}
  if(saved){
    try{var s=await FS.getDoc(FS.doc(db,"wpRooms",saved));
      if(s.exists()&&s.data().players&&s.data().players[ME.uid]){listen(saved);return}
    }catch(_){}
  }
  entry();
}
function entry(){
  screen="entry";
  root().innerHTML='<div class="wp-scr"><div class="wp-top"><button class="wp-x" id="wpBack">✕</button><div class="wp-hint">ارسم وخمّن</div><div style="width:38px"></div></div>'+
  '<div class="wp-center"><div style="font-size:70px">🎨</div><h1>ارسم وخمّن</h1><div style="opacity:.7">ارسم الكلمة وصحابك يخمنوها — الأسرع بياخد نقاط أكتر</div>'+
  '<button class="wp-btn gold" id="wpCreate" style="font-size:18px;padding:16px">🌍 إنشاء غرفة عامة</button><button class="wp-btn" id="wpCreateP" style="padding:14px">🔒 إنشاء غرفة خاصة (بالكود)</button>'+
  '<input id="wpJc" maxlength="5" placeholder="كود الغرفة" autocomplete="off"><button class="wp-btn" id="wpJoin">انضم</button></div></div>';
  $("wpBack").onclick=exit;$("wpCreate").onclick=function(){create(true)};$("wpCreateP").onclick=function(){create(false)};$("wpJoin").onclick=function(){join($("wpJc").value)};
}
async function create(pub){
  if(busy)return;busy=true;$("wpCreate").disabled=true;$("wpCreateP").disabled=true;
  try{
    for(var t=0;t<6;t++){
      var c=genCode(),ref=FS.doc(db,"wpRooms",c),ex=await FS.getDoc(ref);if(ex.exists())continue;
      var pl={};pl[ME.uid]={name:ME.name,av:ME.thumb,ready:true};
      await FS.setDoc(ref,{host:ME.uid,hostName:ME.name,status:"lobby",public:!!pub,players:pl,order:[],scores:{},solved:{},idx:-1,round:0,maxRounds:3,secs:75,createdAt:FS.serverTimestamp(),updatedAt:FS.serverTimestamp()});
      listen(c);break;
    }
  }catch(e){console.warn(e);toast(e&&e.code==="permission-denied"?"انشر firestore.rules الجديد (v215) على Firebase":"فشل إنشاء الغرفة")}
  busy=false;
}
async function join(c){
  c=String(c||"").trim().toUpperCase();if(c.length<4)return toast("اكتب الكود");
  try{
    var ref=FS.doc(db,"wpRooms",c),s=await FS.getDoc(ref);
    if(!s.exists())return toast("الغرفة مش موجودة");
    var d=s.data();
    if(!d.players[ME.uid]){
      if(Object.keys(d.players).length>=12)return toast("الغرفة مليانة");
      var u={updatedAt:FS.serverTimestamp()};u["players."+ME.uid]={name:ME.name,av:ME.thumb,ready:false};
      await FS.updateDoc(ref,u);
    }
    listen(c);
  }catch(e){console.warn(e);toast(e&&e.code==="permission-denied"?"انشر firestore.rules الجديد (v215)":"فشل الانضمام")}
}

/* ---------- الاستماع ---------- */
function stopAll(){
  U.forEach(function(f){try{f()}catch(_){}});U=[];
  if(strokeUnsub){try{strokeUnsub()}catch(_){}strokeUnsub=null}
  clearInterval(tickT);clearInterval(hbT);tickT=hbT=null;lastIdx=-9;items=[];msgs=[];pres={};secret="";wordOpts=null;picked=false;cur=null;hintLvl=0;
}
function listen(c){
  stopAll();code=c;try{sessionStorage.setItem("wpCode",c)}catch(_){}
  U.push(FS.onSnapshot(rref(),function(s){
    if(!s.exists()){toast("الغرفة اتقفلت");exit();return}
    var prev=R;R=s.data({serverTimestamps:"estimate"});
    if(!R.players[ME.uid]&&prev){toast("اتشلت من الغرفة");exit();return}
    onRoom(prev);
  },function(e){console.warn("room",e)}));
  U.push(FS.onSnapshot(FS.query(col("msgs"),FS.orderBy("ts","desc"),FS.limit(70)),function(s){
    msgs=s.docs.map(function(d){return Object.assign({id:d.id},d.data({serverTimestamps:"estimate"}))}).reverse().filter(function(m){var t=ms(m.ts);return !t||Date.now()-t<3600000});paintMsgs();
  },function(e){console.warn("msgs",e)}));
  U.push(FS.onSnapshot(col("presence"),function(s){
    var p={};
    s.docs.forEach(function(d){
      var a=d.data().at;if(!a)return;
      if(d.metadata.hasPendingWrites){if(d.id===ME.uid)p[d.id]=now();return}
      var m=a.toMillis();p[d.id]=m;if(d.id===ME.uid)off=Math.max(off,m-Date.now());
    });
    pres=p;
  },function(e){console.warn("pres",e)}));
  hb();hbT=setInterval(hb,15000);tickT=setInterval(loop,300);
}
function hb(){try{FS.setDoc(FS.doc(db,"wpRooms",code,"presence",ME.uid),{at:FS.serverTimestamp()}).catch(function(){})}catch(_){}}

function onRoom(prev){
  var scr=R.status==="lobby"?"lobby":R.status==="ended"?"end":"game";
  if(scr!==screen){screen=scr;shell()}
  if(scr==="lobby"){lobbyUI();return}
  if(scr==="end"){endUI();return}
  if(R.idx!==lastIdx){
    lastIdx=R.idx;revDone=-1;items=[];nextS=0;secret="";wordOpts=null;picked=false;hintLvl=0;rv=[];cur=null;curAns=false;
    subStrokes();paint();
    if(R.drawer===ME.uid&&R.status==="drawing")loadSecret();
  }
  if(R.status==="choosing"&&R.drawer===ME.uid&&!wordOpts&&!picked){
    wordOpts=shuffle(WORDS).slice(0,4);
  }
  topUI();plUI();toolsUI();ovUI();inputUI();
}
function subStrokes(){
  if(strokeUnsub){try{strokeUnsub()}catch(_){}strokeUnsub=null}
  strokeUnsub=FS.onSnapshot(FS.query(col("strokes"),FS.where("turn","==",R.idx)),function(s){
    var d=s.docs.map(function(x){return x.data()});items=buildItems(d);
    var mx=-1;d.forEach(function(x){if(x.s>mx)mx=x.s});if(mx+1>nextS)nextS=mx+1;
    paint();
  },function(e){console.warn("strokes",e)});
}
function buildItems(docs){
  var by={};docs.forEach(function(d){(by[d.s]=by[d.s]||[]).push(d)});
  var out=[];
  Object.keys(by).map(Number).sort(function(a,b){return a-b}).forEach(function(s){
    var ch=by[s].sort(function(a,b){return a.k-b.k}),f=ch[0];
    if(f.t==="clear")out=[];
    else if(f.t==="undo")out=out.filter(function(o){return o.s!==f.u});
    else out.push({s:s,c:f.c,w:f.w,p:[].concat.apply([],ch.map(function(x){return x.p||[]}))});
  });
  return out;
}
async function loadSecret(){
  try{var s=await FS.getDoc(FS.doc(db,"wpRooms",code,"secret",ME.uid));
    if(s.exists()&&s.data().idx===R.idx){secret=s.data().w||"";rv=shuffle(secret.split("").map(function(c,i){return c===" "?-1:i}).filter(function(i){return i>=0}));topUI()}}catch(_){}
}

/* ---------- الهيكل ---------- */
function shell(){
  var r=root();
  if(screen==="lobby"){
    r.innerHTML='<div class="wp-scr"><div class="wp-top"><button class="wp-x" id="wpLeave">✕</button><div class="wp-hint">اللوبي</div><div style="width:38px"></div></div><div class="wp-lob" id="wpLob"></div></div>';
    $("wpLeave").onclick=leave;
  }else if(screen==="end"){
    r.innerHTML='<div class="wp-scr"><div class="wp-top"><button class="wp-x" id="wpLeave">✕</button><div class="wp-hint">النتيجة النهائية 🏆</div><div style="width:38px"></div></div><div class="wp-lob" id="wpLob"></div></div>';
    $("wpLeave").onclick=leave;
  }else{
    r.innerHTML='<div class="wp-scr"><div class="wp-top"><button class="wp-x" id="wpLeave">✕</button><div class="wp-hint" id="wpHint"></div><div class="wp-tm" id="wpTm">--</div></div>'+
    '<div class="wp-pl" id="wpPl"></div>'+
    '<div class="wp-cvw" id="wpCw"><canvas id="wpCv"></canvas><div class="wp-ov" id="wpOv"></div></div>'+
    '<div class="wp-tools" id="wpTools"></div>'+
    '<div class="wp-msgs" id="wpMsgs"></div><div class="wp-pan" id="wpPan"></div>'+
    '<form class="wp-in" id="wpForm"><button type="button" class="ib" id="wpEmo">😊</button><button type="button" class="ib" id="wpImg">🖼️</button><button type="button" class="ib" id="wpMic">🎤</button>'+
    '<input id="wpTx" maxlength="120" autocomplete="off" placeholder="اكتب إجابتك هنا"><button class="send">إرسال</button></form>'+
    '<input type="file" id="wpFile" accept="image/*" style="display:none"></div>';
    $("wpLeave").onclick=leave;
    $("wpForm").onsubmit=function(e){e.preventDefault();var i=$("wpTx"),v=i.value;i.value="";send(v)};
    $("wpEmo").onclick=function(){var p=$("wpPan");p.classList.toggle("show");if(p.classList.contains("show"))p.innerHTML=EMO.map(function(e){return '<button type="button" data-e="'+e+'">'+e+'</button>'}).join("")};
    $("wpPan").onclick=function(e){var b=e.target.closest("button");if(!b)return;msg({kind:"sticker",text:b.dataset.e});$("wpPan").classList.remove("show")};
    $("wpImg").onclick=function(){$("wpFile").click()};
    $("wpFile").onchange=function(){var f=this.files[0];this.value="";if(f)sendImage(f)};
    $("wpMic").onclick=recToggle;
    initCanvas();msgsInit=false;paintMsgs();
  }
}
var msgsInit=false;

/* ---------- لوبي ---------- */
function lobbyUI(){
  var el=$("wpLob");if(!el)return;
  var host=R.host===ME.uid,ids=Object.keys(R.players),pr=ids.filter(present).length;
  var rows=ids.map(function(u){var p=R.players[u];
    return '<div class="wp-row">'+avatar(u,p,40)+'<b>'+E(p.name)+(u===ME.uid?' <small>(أنت)</small>':'')+(u===R.host?' 👑':'')+'</b>'+(p.ready||u===R.host?'<em>✓ جاهز</em>':'<em class="no">مش جاهز</em>')+'</div>'}).join("");
  var rd=ids.filter(function(u){return u===R.host||R.players[u].ready}).length;
  var mine=R.players[ME.uid]||{};
  el.innerHTML='<div class="wp-card"><div style="text-align:center;opacity:.7;font-size:12px">'+(R.public?'🌍 غرفة عامة':'🔒 غرفة خاصة')+' · كود الغرفة</div><div class="wp-code">'+E(code)+'</div>'+
  '<div style="display:flex;gap:8px;margin-top:8px"><button class="wp-btn" style="flex:1" id="wpCopy">نسخ الكود</button><button class="wp-btn" style="flex:1" id="wpShare">مشاركة</button></div>'+(host?'<button class="wp-btn" style="margin-top:8px;width:100%" id="wpPub">'+(R.public?'اجعلها خاصة 🔒':'اجعلها عامة 🌍')+'</button>':'')+'</div>'+
  '<div class="wp-card"><b>اللاعبين ('+ids.length+') · جاهزين '+rd+' من '+ids.length+'</b>'+rows+'</div>'+
  (host?'<div class="wp-card"><b>الإعدادات</b><div class="wp-set"><span>الجولات</span><select id="wpRounds">'+[1,2,3,4,5,6,8,10].map(function(n){return '<option'+(n===R.maxRounds?' selected':'')+'>'+n+'</option>'}).join("")+'</select></div>'+
   '<div class="wp-set"><span>وقت الرسم</span><select id="wpSecs">'+[45,60,75,90,120,180].map(function(n){return '<option value="'+n+'"'+(n===R.secs?' selected':'')+'>'+n+' ثانية</option>'}).join("")+'</select></div></div>':
   '<div class="wp-card" style="text-align:center">الجولات: '+R.maxRounds+' · وقت الرسم: '+R.secs+' ثانية</div>')+
  (host?'<button class="wp-btn gold" id="wpStart" style="font-size:17px;padding:15px"'+(pr<2?' disabled':'')+'>▶ ابدأ المباراة'+(pr<2?' (محتاج لاعبين)':'')+'</button>':
   '<button class="wp-btn '+(mine.ready?'green':'gold')+'" id="wpReady" style="padding:15px">'+(mine.ready?'✓ جاهز — اضغط للإلغاء':'أنا جاهز')+'</button><div style="text-align:center;opacity:.7;font-size:13px">استنى المضيف يبدأ…</div>');
  $("wpCopy").onclick=function(){try{navigator.clipboard.writeText(code);toast("اتنسخ الكود")}catch(_){toast(code)}};
  $("wpShare").onclick=function(){var t="تعالى العب ارسم وخمّن معايا في التفوق 🎨 كود الغرفة: "+code;if(navigator.share)navigator.share({text:t}).catch(function(){});else{try{navigator.clipboard.writeText(t);toast("اتنسخت الدعوة")}catch(_){}}};
  if(host){
    $("wpPub").onclick=function(){FS.updateDoc(rref(),{public:!R.public,updatedAt:FS.serverTimestamp()})};
    $("wpRounds").onchange=function(){FS.updateDoc(rref(),{maxRounds:+this.value,updatedAt:FS.serverTimestamp()})};
    $("wpSecs").onchange=function(){FS.updateDoc(rref(),{secs:+this.value,updatedAt:FS.serverTimestamp()})};
    $("wpStart").onclick=start;
  }else $("wpReady").onclick=function(){var u={updatedAt:FS.serverTimestamp()};u["players."+ME.uid+".ready"]=!mine.ready;FS.updateDoc(rref(),u)};
}
async function start(){
  var pl=plist();if(pl.length<2)return toast("محتاج لاعبين على الأقل");
  var nr=pl.filter(function(u){return u!==R.host&&!R.players[u].ready}).length;
  if(nr&&!confirm(nr+" لاعب مش جاهز — تبدأ برضه؟"))return;
  var order=shuffle(pl),sc={};Object.keys(R.players).forEach(function(u){sc[u]=0});
  var p=nextTurn({idx:-1,order:order,players:R.players,maxRounds:R.maxRounds});
  p.order=order;p.scores=sc;p.updatedAt=FS.serverTimestamp();
  try{await FS.updateDoc(rref(),p)}catch(e){console.warn(e);toast("فشل البدء")}
}

/* ---------- دورة اللعب ---------- */
function nextTurn(d){
  var order=d.order||[],total=(d.maxRounds||3)*order.length,i=d.idx+1;
  while(i<total){var u=order[i%order.length];if(d.players[u]&&present(u))break;i++}
  if(i>=total)return{status:"ended",endedAt:FS.serverTimestamp()};
  return{status:"choosing",idx:i,round:Math.floor(i/order.length)+1,drawer:order[i%order.length],solved:{},wh:"",wlen:0,hint:"",answer:"",choiceAt:FS.serverTimestamp(),startedAt:null,revealAt:null};
}
async function trans(st,fn){
  var idx=R.idx;
  try{await FS.runTransaction(db,async function(t){
    var s=await t.get(rref()),d=s.data();
    if(!d||d.idx!==idx||d.status!==st)return;
    var p=fn(d);p.updatedAt=FS.serverTimestamp();t.update(rref(),p);
  })}catch(e){console.warn("trans",e)}
}
function loop(){
  if(!R||screen!=="game")return;
  var n=now(),st=R.status,me_=ME.uid;
  var pl=plist(),act=[R.host].concat(R.order||[]).filter(function(u,i,a){return a.indexOf(u)===i&&pl.indexOf(u)>-1});
  var dl=Math.max(0,act.indexOf(me_))*2500;
  tmUI(n);
  if(st==="choosing"){
    var e=n-ms(R.choiceAt);
    if(R.drawer===me_&&e>15000&&wordOpts&&!picked)pick(wordOpts[0]);
    else if(e>20000+dl)trans("choosing",function(d){return nextTurn(d)});
  }else if(st==="drawing"){
    var ends=ms(R.startedAt)+R.secs*1000,sol=R.solved||{};
    var g=Object.keys(R.players).filter(function(u){return u!==R.drawer&&present(u)});
    var all=g.length>0&&g.every(function(u){return sol[u]});
    if(R.drawer===me_)hints();
    if(ms(R.startedAt)&&((all&&n-ms(R.startedAt)>1500&&dl===0)||n>=ends+dl))toReveal();
  }else if(st==="reveal"){
    if(R.drawer===me_&&!R.answer&&secret&&!curAns){curAns=true;FS.updateDoc(rref(),{answer:secret,updatedAt:FS.serverTimestamp()}).catch(function(){curAns=false})}
    if(ms(R.revealAt)&&n-ms(R.revealAt)>(R.answer?5500:7500)+dl)trans("reveal",function(d){return nextTurn(d)});
  }
}
var revDone=-1;
function toReveal(){
  if(revDone===R.idx)return;revDone=R.idx;
  trans("drawing",function(d){return{status:"reveal",revealAt:FS.serverTimestamp()}});
}
async function pick(w){
  if(picked)return;picked=true;secret=w;
  var mask=w.split("").map(function(ch){return ch===" "?" ":"_"}).join(" ");
  rv=shuffle(w.split("").map(function(c,i){return c===" "?-1:i}).filter(function(i){return i>=0}));
  try{
    await FS.setDoc(FS.doc(db,"wpRooms",code,"secret",ME.uid),{w:w,idx:R.idx});
    var c=canon(w),salt=code+":"+R.idx;
    await trans("choosing",function(){return{status:"drawing",wh:H(c,salt),wlen:c.length,hint:mask,startedAt:FS.serverTimestamp()}});
  }catch(e){console.warn(e);picked=false;toast("فشل اختيار الكلمة")}
}
function hints(){
  if(!secret||!R.startedAt)return;
  var el=now()-ms(R.startedAt),tot=R.secs*1000,lvl=el>tot*.7?2:el>tot*.4?1:0;
  if(secret.length<4)lvl=Math.min(lvl,1);
  if(lvl>hintLvl){
    hintLvl=lvl;var show=rv.slice(0,lvl);
    var h=secret.split("").map(function(c,i){return c===" "?" ":(show.indexOf(i)>-1?c:"_")}).join(" ");
    FS.updateDoc(rref(),{hint:h,updatedAt:FS.serverTimestamp()}).catch(function(){});
  }
}

/* ---------- الرسائل والتخمين ---------- */
function msg(m){
  var d=Object.assign({uid:ME.uid,name:ME.name,ts:FS.serverTimestamp(),expireAt:FS.Timestamp.fromMillis(Date.now()+3600000)},m);
  if(ME.thumb)d.av=ME.thumb;
  return FS.addDoc(col("msgs"),d).catch(function(e){console.warn("msg",e);toast("الرسالة ماتبعتتش")});
}
function send(text){
  text=String(text||"").trim();if(!text||!R)return;
  var st=R.status,sv=!!(R.solved||{})[ME.uid],dr=R.drawer===ME.uid;
  if(st==="drawing"&&!dr&&!sv){
    var c=canon(text);
    if(c&&R.wh&&H(c,code+":"+R.idx)===R.wh)return correct();
    return msg({kind:"guess",text:text.slice(0,60)});
  }
  return msg({kind:"text",text:text.slice(0,300),team:(st==="drawing"&&(dr||sv))?1:0});
}
function correct(){
  var tot=R.secs*1000,left=Math.max(0,ms(R.startedAt)+tot-now());
  var first=Object.keys(R.solved||{}).length===0;
  var pts=Math.round(30+70*left/tot)+(first?20:0),dp=Math.round(pts*.4);
  var u={updatedAt:FS.serverTimestamp()};
  u["solved."+ME.uid]=pts;u["scores."+ME.uid]=FS.increment(pts);u["scores."+R.drawer]=FS.increment(dp);
  try{navigator.vibrate&&navigator.vibrate(60)}catch(_){}
  return FS.updateDoc(rref(),u).then(function(){return msg({kind:"correct",text:"",pts:pts})}).catch(function(e){console.warn(e);toast("فشل تسجيل الإجابة")});
}
function msgHTML(m){
  var mine=m.uid===ME.uid;
  if(m.kind==="correct")return '<div class="wp-ok">🎉 '+E(m.name)+' خمّن الكلمة الصحيحة +'+(m.pts||0)+'</div>';
  if(m.kind==="sys")return '<div class="wp-sys">'+E(m.text)+'</div>';
  if(m.team&&!(R&&(R.status!=="drawing"||R.drawer===ME.uid||(R.solved||{})[ME.uid])))return "";
  var pl=(R&&R.players[m.uid])||{name:m.name,av:m.av};
  var body;
  if(m.kind==="sticker")body='<div class="wp-stk">'+E(m.text)+'</div>';
  else if(m.kind==="img")body='<img class="pic" data-big="1" src="'+E(m.img)+'">';
  else if(m.kind==="audio")body='<div class="wp-au"><button data-au="'+E(m.id)+'">▶</button><span>🎤 '+Math.round(m.dur||0)+'ث</span></div>';
  else body=E(m.text);
  return '<div class="wp-m'+(mine?' me':'')+'">'+avatar(m.uid,{name:m.name,av:m.av||pl.av},30)+'<div class="wp-mb'+(m.team?' team':'')+'"><u>'+E(m.name)+(m.team?' 🔒':'')+'</u>'+body+'</div></div>';
}
function paintMsgs(){
  var el=$("wpMsgs");if(!el)return;
  var near=el.scrollHeight-el.scrollTop-el.clientHeight<90||!msgsInit;
  el.innerHTML=msgs.length?msgs.map(msgHTML).join(""):'<div class="wp-sys">ابدأ الدردشة… 👋</div>';
  if(near){el.scrollTop=el.scrollHeight;msgsInit=true}
  el.onclick=function(e){
    var b=e.target.closest("[data-au]"),im=e.target.closest("[data-big]");
    if(b){var m=msgs.find(function(x){return x.id===b.dataset.au});if(m)playAudio(m.audio,b)}
    else if(im){var o=document.createElement("div");o.className="wp-big";o.innerHTML='<img src="'+im.src+'">';o.onclick=function(){o.remove()};document.body.appendChild(o)}
  };
}
function playAudio(src,btn){
  try{if(audioEl){audioEl.pause();document.querySelectorAll("[data-au]").forEach(function(b){b.textContent="▶"})}}catch(_){}
  audioEl=new Audio(src);btn.textContent="⏸";
  audioEl.onended=function(){btn.textContent="▶"};
  audioEl.onerror=function(){btn.textContent="▶";toast("الجهاز ده مش بيشغّل الصوت ده")};
  audioEl.play().catch(function(){btn.textContent="▶";toast("مقدرتش أشغّل الصوت")});
}

/* ---------- صور ---------- */
function sendImage(f){
  var r=new FileReader();
  r.onload=function(){
    var im=new Image();
    im.onload=function(){
      var s=Math.min(1,560/Math.max(im.width,im.height)),c=document.createElement("canvas");
      c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
      c.getContext("2d").drawImage(im,0,0,c.width,c.height);
      var q=.72,d=c.toDataURL("image/jpeg",q);
      while(d.length>600000&&q>.3){q-=.1;d=c.toDataURL("image/jpeg",q)}
      if(d.length>900000)return toast("الصورة كبيرة");
      msg({kind:"img",text:"",img:d});
    };
    im.onerror=function(){toast("الصورة مش مدعومة")};im.src=r.result;
  };r.readAsDataURL(f);
}

/* ---------- صوت ---------- */
async function recToggle(){
  var b=$("wpMic");
  if(rec){recStop(true);return}
  if(!navigator.mediaDevices||!window.MediaRecorder)return toast("التسجيل مش مدعوم هنا");
  try{
    var st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    var mt=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"].filter(function(t){return MediaRecorder.isTypeSupported(t)})[0];
    var mr=mt?new MediaRecorder(st,{mimeType:mt,audioBitsPerSecond:24000}):new MediaRecorder(st);
    rec={mr:mr,st:st,ch:[],t0:Date.now(),send:true,mt:mt||mr.mimeType};
    mr.ondataavailable=function(e){if(e.data&&e.data.size)rec.ch.push(e.data)};
    mr.onstop=function(){
      var r0=rec;rec=null;r0.st.getTracks().forEach(function(t){t.stop()});
      clearInterval(r0.iv);var bb=$("wpMic");if(bb){bb.classList.remove("rec");bb.textContent="🎤"}
      var dur=(Date.now()-r0.t0)/1000;
      if(!r0.send||dur<.7)return;
      var blob=new Blob(r0.ch,{type:r0.mt}),fr=new FileReader();
      fr.onload=function(){
        if(fr.result.length>900000)return toast("الرسالة طويلة — قصّرها");
        msg({kind:"audio",text:"",audio:fr.result,dur:Math.min(300,dur)});
      };fr.readAsDataURL(blob);
    };
    mr.start(250);b.classList.add("rec");
    rec.iv=setInterval(function(){var s=Math.round((Date.now()-rec.t0)/1000);b.textContent="⏹ "+s;if(s>=60)recStop(true)},300);
    toast("بيسجّل… اضغط تاني للإرسال");
  }catch(e){toast("اسمح بالميكروفون الأول")}
}
function recStop(send_){if(!rec)return;rec.send=send_;try{rec.mr.stop()}catch(_){}}

/* ---------- واجهة اللعب ---------- */
function topUI(){
  var h=$("wpHint");if(!h)return;
  var dr=R.drawer===ME.uid,p=R.players[R.drawer]||{name:"؟"};
  if(R.status==="choosing")h.innerHTML=dr?'اختار كلمة':'<small>'+E(p.name)+' بيختار كلمة…</small>';
  else if(R.status==="drawing"){
    if(dr)h.innerHTML=E(secret||"…")+'<small>ارسم الكلمة</small>';
    else if((R.solved||{})[ME.uid])h.innerHTML=E(R.hint||"")+'<small>✓ خمّنت — استنى الباقي</small>';
    else h.innerHTML=E(R.hint||"")+'<small>عدد الحروف: '+(R.wlen||0)+' · الرسام: '+E(p.name)+'</small>';
  }else if(R.status==="reveal")h.innerHTML='الكلمة: '+E(R.answer||"…");
}
function tmUI(n){
  var t=$("wpTm");if(!t||!R)return;
  var l=0;
  if(R.status==="drawing"&&R.startedAt)l=Math.max(0,Math.ceil((ms(R.startedAt)+R.secs*1000-n)/1000));
  else if(R.status==="choosing"&&R.choiceAt)l=Math.max(0,15-Math.floor((n-ms(R.choiceAt))/1000));
  t.textContent=R.status==="reveal"?"⏭":l;
  t.classList.toggle("low",R.status==="drawing"&&l<=10);
  if(R.status==="choosing"){var o=$("wpCnt");if(o)o.textContent=l}
}
function plUI(){
  var el=$("wpPl");if(!el)return;
  var ids=Object.keys(R.players).sort(function(a,b){return ((R.scores||{})[b]||0)-((R.scores||{})[a]||0)});
  el.innerHTML=ids.map(function(u){var p=R.players[u],sv=(R.solved||{})[u];
    return '<div class="wp-p'+(present(u)?' on':'')+(u===ME.uid?' me':'')+(u===R.drawer?' dr':'')+(sv?' ok':'')+'">'+avatar(u,p,44)+(u===R.drawer?'<span class="bd">✏️</span>':sv?'<span class="bd">✅</span>':'')+'<b>'+E(p.name)+'</b><i>'+((R.scores||{})[u]||0)+'</i></div>'}).join("");
}
function toolsUI(){
  var el=$("wpTools");if(!el)return;
  var dr=R.drawer===ME.uid&&R.status==="drawing";
  el.classList.toggle("show",dr);
  if(!dr){return}
  el.innerHTML=COLORS.map(function(c){return '<button type="button" class="wp-sw'+(pen.c===c?' sel':'')+'" data-c="'+c+'" style="background:'+c+'"></button>'}).join("")+
   SIZES.map(function(s){return '<button type="button" class="wp-sz'+(pen.w===s?' sel':'')+'" data-w="'+s+'"><span style="width:'+(3+s/3)+'px;height:'+(3+s/3)+'px"></span></button>'}).join("")+
   '<button type="button" class="wp-ic" data-a="undo">↩️</button><button type="button" class="wp-ic" data-a="clear">🗑️</button>';
  el.onclick=function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.dataset.c){pen.c=b.dataset.c;toolsUI()}
    else if(b.dataset.w){pen.w=+b.dataset.w;toolsUI()}
    else if(b.dataset.a==="undo"){var l=items[items.length-1];if(l)marker("undo",l.s)}
    else if(b.dataset.a==="clear")marker("clear",0);
  };
}
function marker(t,u){
  var s=nextS++;
  FS.setDoc(FS.doc(db,"wpRooms",code,"strokes",R.idx+"_"+s+"_0"),{turn:R.idx,s:s,k:0,t:t,u:u,p:[],c:"",w:0}).catch(function(e){console.warn(e)});
}
function ovUI(){
  var o=$("wpOv");if(!o)return;
  var dr=R.drawer===ME.uid,pn=(R.players[R.drawer]||{}).name||"؟";
  if(R.status==="choosing"){
    if(dr&&wordOpts&&!picked){
      o.innerHTML='<div style="font-weight:900">اختار كلمة للرسم (<span id="wpCnt">15</span>)</div><div class="wp-opts">'+wordOpts.map(function(w,i){return '<button data-i="'+i+'">'+E(w)+'</button>'}).join("")+'</div>';
      o.onclick=function(e){var b=e.target.closest("[data-i]");if(b)pick(wordOpts[+b.dataset.i])};
      o.classList.add("show");
    }else if(dr){o.innerHTML='<div>…</div>';o.classList.add("show")}
    else{o.innerHTML='<div style="font-size:40px">✏️</div><div style="font-weight:800">'+E(pn)+' بيختار كلمة…</div><div>الجولة '+R.round+' من '+R.maxRounds+'</div>';o.classList.add("show");o.onclick=null}
  }else if(R.status==="reveal"){
    var sol=R.solved||{},g=Object.keys(sol).map(function(u){return '<div>'+E((R.players[u]||{}).name||"؟")+' <b style="color:#86efac">+'+sol[u]+'</b></div>'}).join("");
    o.innerHTML='<div>الكلمة كانت</div><div class="wp-rv">'+E(R.answer||"…")+'</div>'+(g?'<div class="wp-gain">'+g+'</div>':'<div style="opacity:.8">محدش خمّنها 😅</div>')+'<button class="wp-btn" id="wpSave" style="padding:8px 14px;font-size:13px">💾 احفظ الرسمة</button>';
    o.classList.add("show");o.onclick=null;var sv=$("wpSave");if(sv)sv.onclick=saveImg;
  }else{o.classList.remove("show");o.innerHTML=""}
}
function saveImg(e){
  e&&e.stopPropagation();var c=$("wpCv");if(!c)return;
  var t=document.createElement("canvas");t.width=c.width;t.height=c.height;var x=t.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,t.width,t.height);x.drawImage(c,0,0);
  t.toBlob(function(b){var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="drawing.png";document.body.appendChild(a);a.click();a.remove()});
}
function inputUI(){
  var i=$("wpTx");if(!i)return;
  var dr=R.drawer===ME.uid,sv=(R.solved||{})[ME.uid];
  i.placeholder=(R.status==="drawing"&&!dr&&!sv)?"اكتب إجابتك هنا":"رسالة للاعبين…";
}

/* ---------- الكانفاس ---------- */
function initCanvas(){
  var c=$("wpCv");if(!c)return;
  var sizeIt=function(){
    var r=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    var w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;paint()}
  };
  sizeIt();
  if(window.ResizeObserver)new ResizeObserver(sizeIt).observe(c);
  var pos=function(e){var r=c.getBoundingClientRect();return[Math.max(0,Math.min(1000,Math.round((e.clientX-r.left)/r.width*1000))),Math.max(0,Math.min(1000,Math.round((e.clientY-r.top)/r.height*1000)))]};
  var canDraw=function(){return R&&R.status==="drawing"&&R.drawer===ME.uid};
  c.onpointerdown=function(e){
    if(!canDraw())return;e.preventDefault();
    try{c.setPointerCapture(e.pointerId)}catch(_){}
    var p=pos(e);cur={s:nextS++,k:0,c:pen.c,w:pen.w,p:[p[0],p[1]],sent:0,timer:setInterval(flush,220)};
    paintSoon();
  };
  c.onpointermove=function(e){
    if(!cur)return;
    var ev=e.getCoalescedEvents?e.getCoalescedEvents():[e];if(!ev.length)ev=[e];
    ev.forEach(function(x){var p=pos(x),n=cur.p.length;if(Math.abs(p[0]-cur.p[n-2])+Math.abs(p[1]-cur.p[n-1])>=2)cur.p.push(p[0],p[1])});
    paintSoon();
  };
  var up=function(){if(!cur)return;clearInterval(cur.timer);flush();cur=null};
  c.onpointerup=up;c.onpointercancel=up;
}
function flush(){
  if(!cur||!R)return;
  if(cur.p.length<=cur.sent&&cur.k>0)return;
  var from=Math.max(0,cur.sent-2),all=cur.p.slice(from);
  if(cur.sent===0&&all.length===2)all=all.concat(all); /* نقطة واحدة */
  while(all.length){
    var part=all.splice(0,380);
    var id=R.idx+"_"+cur.s+"_"+cur.k;
    FS.setDoc(FS.doc(db,"wpRooms",code,"strokes",id),{turn:R.idx,s:cur.s,k:cur.k,c:cur.c,w:cur.w,p:part}).catch(function(e){console.warn("stroke",e)});
    cur.k++;
    if(all.length)all.unshift(part[part.length-2],part[part.length-1]);
  }
  cur.sent=cur.p.length;
}
function paintSoon(){if(rafP)return;rafP=requestAnimationFrame(function(){rafP=0;paint()})}
function paint(){
  var c=$("wpCv");if(!c)return;
  var x=c.getContext("2d"),W=c.width,Hh=c.height;
  x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,W,Hh);x.fillStyle="#fff";x.fillRect(0,0,W,Hh);
  x.lineCap="round";x.lineJoin="round";
  var draw=function(it){
    var p=it.p;if(!p||p.length<2)return;
    x.strokeStyle=it.c;x.fillStyle=it.c;x.lineWidth=Math.max(1,it.w/1000*W);
    if(p.length<=4&&p[0]===p[p.length-2]&&p[1]===p[p.length-1]){x.beginPath();x.arc(p[0]/1000*W,p[1]/1000*Hh,x.lineWidth/2,0,6.3);x.fill();return}
    x.beginPath();x.moveTo(p[0]/1000*W,p[1]/1000*Hh);
    for(var i=2;i<p.length-1;i+=2)x.lineTo(p[i]/1000*W,p[i+1]/1000*Hh);
    x.stroke();
  };
  items.forEach(draw);
  if(cur)draw(cur);
}

/* ---------- النهاية ---------- */
function endUI(){
  var el=$("wpLob");if(!el)return;
  var ids=Object.keys(R.players).sort(function(a,b){return ((R.scores||{})[b]||0)-((R.scores||{})[a]||0)}),m=["🥇","🥈","🥉"];
  var host=R.host===ME.uid;
  el.innerHTML='<div style="text-align:center;font-size:54px">🏆</div>'+ids.map(function(u,i){var p=R.players[u];
    return '<div class="wp-rank'+(i===0?' f':'')+'"><span style="font-size:22px">'+(m[i]||(i+1))+'</span>'+avatar(u,p,40)+'<b>'+E(p.name)+(u===ME.uid?' (أنت)':'')+'</b><strong>'+((R.scores||{})[u]||0)+'</strong></div>'}).join("")+
  (host?'<button class="wp-btn gold" id="wpAgain" style="padding:15px;margin-top:10px">🔄 العب تاني</button>':'<div style="text-align:center;opacity:.7;margin-top:10px">استنى المضيف يعيد اللعب…</div>')+
  '<button class="wp-btn" id="wpOut" style="padding:13px">خروج</button>';
  $("wpOut").onclick=leave;
  if(host)$("wpAgain").onclick=function(){
    var u={status:"lobby",idx:-1,round:0,drawer:"",solved:{},scores:{},wh:"",hint:"",answer:"",updatedAt:FS.serverTimestamp()};
    Object.keys(R.players).forEach(function(k){u["players."+k+".ready"]=false});
    FS.updateDoc(rref(),u);
  };
}

/* ---------- خروج ---------- */
async function leave(){
  if(!R){exit();return}
  if(screen==="game"&&!confirm("تخرج من المباراة؟"))return;
  var c=code,r=R;
  try{
    var rest=Object.keys(r.players).filter(function(u){return u!==ME.uid});
    if(!rest.length){await FS.deleteDoc(FS.doc(db,"wpRooms",c))}
    else{
      var u={updatedAt:FS.serverTimestamp()};u["players."+ME.uid]=FS.deleteField();
      if(r.host===ME.uid){var nh=rest.filter(present)[0]||rest[0];u.host=nh;u.hostName=r.players[nh].name}
      await FS.updateDoc(FS.doc(db,"wpRooms",c),u);
    }
  }catch(e){console.warn(e)}
  exit();
}
function exit(){
  try{sessionStorage.removeItem("wpCode")}catch(_){}
  if(rec)recStop(false);
  stopAll();R=null;code="";
  var r=$("wp");if(r)r.remove();
  try{B&&B.back&&B.back()}catch(_){}
}
window.WP={open:open,leave:leave,joinCode:async function(c){if(!(await init()))return;me();css();stopAll();R=null;root();await join(c);if(!R&&$("wp")&&screen!=="lobby"&&screen!=="game"){var r=$("wp");if(r&&!R)r.remove()}},_t:{canon:canon,H:H,buildItems:buildItems}};
})();
