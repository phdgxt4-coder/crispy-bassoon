/* ============================================================
   التفوق — «ارسم وخمّن» (WP v221) — Premium + لحظية أقوى
   ------------------------------------------------------------
   v221:
   (1) الرسم أسرع: دفعات كل 50ms + نقاط أدق + إرسال أول نقطة فور اللمس.
   (2) الشات أثناء الرسم مسموح عادي للرسام (مش سري) — السري بس للمخمّن اللي حلّ.
   (3) ملصقات Premium من dg-stickers.webp (سprite sheet) + إيموجي + ملصقاتي + استوديو صور.
   (4) زر أغاني ظاهر أثناء اللعب + نفس مشغّل مكتبة التفوق.
   (5) تصميم أفخم: زجاج أقوى، توهج ذهبي، شريط لاعبين أوضح، كروت أغنى.
   متوافق 100% مع firestore.rules v215/v216.
   ============================================================ */
(function(){
"use strict";
if(window.WP)return;

var WP_V="v221";
var FSU="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- الكلمات ---------- */
var WORDS=["أسد","قطة","كلب","فيل","جمل","قرد","زرافة","دب","ثعلب","أرنب","حصان","دجاجة","بطة","بومة","عصفور","سمكة","تمساح","ثعبان","سلحفاة","عقرب","نحلة","فراشة","عنكبوت","بطريق","كنغر","بقرة","ماعز","خروف","دولفين","قرش","خفاش","جندب","بعوضة","صاروخ","طائرة","سيارة","قطار","سفينة","غواصة","دراجة","مظلة","كرة قدم","سلة","مضرب","شبكة","حكم","جمهور","سباحة","ملاكم","جمباز","شطرنج","بلياردو","إبرة","مقص","شمعة","مروحة","ثلاجة","مكواة","مكنسة","منبه","مرآة","خزانة","سرير","وسادة","بطانية","مكتب","كرسي","نافذة","باب","سلم","مصعد","برج","هرم","متحف","مسبح","شاطئ","صحراء","واحة","مطر","قوس قزح","برق","ثلج","بركان","نخلة","وردة","تفاحة","موزة","برتقالة","بطيخ","عنب","جبنة","عسل","خبز","بيتزا","برجر","شاورما","كشري","كنافة","بلح","عصير","قهوة","شاي","طبيب","معلم","شرطي","طيار","بحار","خباز","جزار","ممثل","مغني","راوي","مخبر","عالم","فلاح","صياد","نار","جبل","كهف","نفق","جسر","نهر","شلال","بئر","راديو","تلفزيون","موبايل","كمبيوتر","لوحة مفاتيح","ماوس","طابعة","كاميرا","مايك","سماعة","شاحن","بطارية","روبوت","بالون","هدية","شجرة","غابة","عش","حصالة","فانوس","مشعل","ميزان","بوصلة","خريطة","كرة أرضية","مجهر","تلسكوب","كيمياء","مختبر","سبورة","قلم","ممحاة","مسطرة","كراسة","جرس","حقيبة","زجاجة","كوب","طبق","ملعقة","شوكة","سكينة","مقلاة","قدر","فرن","غسالة","صابون","معجون","فرشاة أسنان","منشفة","حوض","دش","سلة مهملات","مصباح","لمبة","شاشة","ريموت","مكيف","سجادة","ستارة","رف","مرتبة"];

var COLORS=["#1f2430","#6b7280","#ef4444","#f97316","#f59e0b","#facc15","#22c55e","#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#92400e","#ffffff"];
var SIZES=[4,8,14,24,36];
var ERASER="#ffffff";

var EMO_FACE="😂 🤣 😍 🥰 😎 🤔 😱 😭 😡 🥳 🤯 😴 👍 👎 👏 🙏 💪 🔥 ❤️ 💯 🎉 💩 👻 🙈 🤝 😜 🤪 😅 🥺 😏 🤤 🤮".split(" ");
var EMO_MORE="⚽ 🏀 🎯 🎮 🎨 🎵 🌟 ⭐ ✨ ⚡ ☀️ 🌈 🌙 💡 🍕 🍔 🍟 🍩 🍪 🎂 🍎 📚 ✏️ 🚌 ✈️ 🚀 🚗 ⛅ 🌊 🏝️ 🐱 🐶".split(" ");
var STICKS="🥳 😂 😭 😱 🤯 😎 🥰 🤔 👏 🔥 💯 ❤️ 🎉 🎁 🌟 💩 👻 🤖 🐱 🐶 🦄 🍕 ⚽ 🏆 🥇 👑 💎 🚀".split(" ");
/* ملصقات Premium (dg-stickers.webp) — شبكة 5×4 · كل خلية 120×120 */
var PACK_SRC="./dg-stickers.webp";
var PACK_COLS=5,PACK_ROWS=4,PACK_CELL=120;
var PACK=[];(function(){for(var i=0;i<PACK_COLS*PACK_ROWS;i++)PACK.push(i)})();

/* ---------- الحالة ---------- */
var FS=null,db=null,ME=null,B=null;
var R=null,code="",U=[],msgs=[],pres={},items=[],off=-1e12,secret="",wordOpts=null,picked=false,cur=null,nextS=0,tickT=null,hbT=null,lastIdx=-9,screen="",strokeUnsub=null,hintLvl=0,rv=[],busy=false,pen={c:COLORS[0],w:SIZES[1]},rec=null,audioURL="",rafP=0,curAns=false;
var myCorrects=0,myDraws=0,undone=[],paintedN=0,paintedS=-1,sticky=true,paidKey="";
var dom={}; /* كاش عناصر رسائل الشات — الرسم بتزايد بدون مسح (يحلّ تكرار/توقف الصوت) */
var sheetMode="",errKey="";
var VP={au:null,id:"",src:""};   /* مشغّل الرسائل الصوتية — واحد بس */
var SONG={list:null,at:0,cur:null,au:null,url:"",loading:false,vol:80,tok:0};
try{SONG.vol=Math.max(0,Math.min(100,parseInt(localStorage.getItem("wp_song_vol")||"80",10)||80))}catch(_){}

/* ---------- أدوات ---------- */
var E=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var $=function(i){return document.getElementById(i)};
var now=function(){return Date.now()+(off>-1e11?off:0)};
var ms=function(t){return t&&t.toMillis?t.toMillis():(typeof t==="number"?t:0)};
var rref=function(){return FS.doc(db,"wpRooms",code)};
var col=function(n){return FS.collection(db,"wpRooms",code,n)};
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
function toast(t){
  var r=$("wp");if(!r)return;
  var d=document.createElement("div");d.className="wp-toast";d.textContent=t;
  r.appendChild(d);setTimeout(function(){try{d.remove()}catch(_){}},2600);
}
function hue(s){var h=0;s=String(s||"?");for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h}
function avatar(u,p,sz){
  p=p||{};sz=sz||44;
  if(p.av&&String(p.av).length>20)return '<img class="wp-av" style="width:'+sz+'px;height:'+sz+'px" src="'+E(p.av)+'" alt="">';
  var n=(p.name||"?").trim();
  return '<span class="wp-av" style="width:'+sz+'px;height:'+sz+'px;background:hsl('+hue(u||n)+',55%,45%);font-size:'+Math.round(sz*.42)+'px">'+E(n.charAt(0)||"?")+'</span>';
}
var present=function(u){return u===ME.uid||(pres[u]&&now()-pres[u]<45000)};
var plist=function(){return Object.keys((R&&R.players)||{}).filter(present)};
function warnOnce(e,alt){
  try{
    var k=(e&&e.code)||String(e||"");
    if(k===errKey)return;errKey=k;
    if(k==="permission-denied")toast(alt||"محتاج نشر قواعد Firestore الجديدة (v216)");
    else if(k==="unavailable"||k==="failed-precondition")toast("الشبكة ضعيفة — هنعيد المحاولة تلقائيًا");
    else toast(alt||"حصلت مشكلة — حاول تاني");
  }catch(_){}
}

/* ---------- CSS ---------- */
function css(){
  if($("wpCss"))return;
  var s=document.createElement("style");s.id="wpCss";
  s.textContent=
/* ===== الأساس والهوية ===== */
"#wp{position:fixed;inset:0;z-index:99990;color:#f4f1ff;font-family:inherit;direction:rtl;display:flex;flex-direction:column;overflow:hidden;-webkit-tap-highlight-color:transparent;"+
"background:radial-gradient(1200px 800px at 90% -15%,rgba(120,80,255,.38) 0%,transparent 58%),radial-gradient(1000px 720px at -8% 110%,rgba(47,181,168,.24) 0%,transparent 55%),radial-gradient(780px 560px at 50% 120%,rgba(245,185,74,.14) 0%,transparent 55%),linear-gradient(165deg,#0a061c 0%,#120a2a 45%,#0b1022 100%)}"+
"#wp *{box-sizing:border-box}:where(#wp) button{font-family:inherit;cursor:pointer;border:0;color:inherit;background:none;padding:0}"+
"#wp h1,#wp h2,#wp h3{margin:0}"+
".wp-scr{flex:1;display:flex;flex-direction:column;min-height:0;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);animation:wpIn .42s cubic-bezier(.22,1,.36,1) both}"+
"@keyframes wpIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}"+
"@keyframes wpPop{0%{opacity:0;transform:scale(.86)}60%{transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}"+
"@keyframes wpFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}"+
"@keyframes wpPulse{to{transform:scale(1.14)}}"+
"@keyframes wpDots{0%{content:'.'}33%{content:'..'}66%{content:'...'}}"+
"@keyframes wpBars{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}"+
"@keyframes wpSpin{to{transform:rotate(360deg)}}"+
/* ===== الشريط العلوي ===== */
".wp-top{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(13,10,34,.72);border-bottom:1px solid rgba(255,211,107,.14);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);min-height:58px;flex:0 0 auto}"+
".wp-x{width:40px;height:40px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);font-size:16px;transition:transform .18s,background .2s}"+
".wp-x:active{transform:scale(.9)}"+
".wp-chip{background:linear-gradient(135deg,rgba(255,211,107,.16),rgba(245,185,74,.08));border:1px solid rgba(255,211,107,.35);color:#FFD36B;border-radius:12px;padding:8px 12px;font-weight:900;letter-spacing:.22em;direction:ltr;font-size:15px}"+
".wp-pill{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:99px;padding:5px 11px;font-size:12px;font-weight:700;color:#d9d4ff}"+
".wp-tt{flex:1;text-align:center;font-weight:900;font-size:16px;font-family:'Reem Kufi',sans-serif;color:#fff;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".wp-tm{width:46px;height:46px;border-radius:50%;position:relative;display:grid;place-items:center;flex:0 0 auto;"+
"background:conic-gradient(#FFD36B calc(var(--p,100)*1%),rgba(255,255,255,.09) 0)}"+
".wp-tm::before{content:'';position:absolute;inset:4px;border-radius:50%;background:#14102e}"+
".wp-tm i{position:relative;font-style:normal;font-weight:900;font-size:15px;font-variant-numeric:tabular-nums;color:#FFD36B}"+
".wp-tm.low{background:conic-gradient(#ff5a5f calc(var(--p,100)*1%),rgba(255,255,255,.09) 0)}"+
".wp-tm.low i{color:#ff9a9e;animation:wpPulse .5s infinite alternate}"+
/* ===== شريط الكلمة ===== */
".wp-word{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;min-height:58px;padding:8px 14px;flex:0 0 auto;"+
"background:linear-gradient(180deg,rgba(255,211,107,.07),rgba(255,211,107,.02));border-bottom:1px solid rgba(255,211,107,.09)}"+
".wp-word .lbl{font-size:11px;font-weight:700;color:#b8b0e8;order:9;margin-inline-start:8px}"+
".wtxt{font-family:'Reem Kufi',sans-serif;font-size:25px;font-weight:700;color:#FFD36B;text-shadow:0 2px 14px rgba(245,185,74,.35);letter-spacing:.04em}"+
".wtxt.small{font-size:17px;color:#e8e3ff;text-shadow:none}"+
".lbox{min-width:27px;height:35px;padding:0 7px;border-radius:9px;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,211,107,.38);display:grid;place-items:center;font-weight:900;font-size:19px;font-family:'Reem Kufi',sans-serif;color:#5e5684}"+
".lbox.rev{background:rgba(255,211,107,.15);color:#FFD36B;border-color:rgba(255,211,107,.6);animation:wpPop .3s both}"+
".lbox.gap{background:none;border:0;min-width:12px;padding:0}"+
".wp-dots::after{content:'…'}"+
/* ===== الكانفاس ===== */
".wp-cvw{position:relative;margin:8px auto;width:min(100% - 16px,calc(36dvh*1.25));max-width:560px;aspect-ratio:5/4;background:#fff;border-radius:18px;overflow:hidden;flex:0 0 auto;"+
"box-shadow:0 12px 38px rgba(0,0,0,.5),0 0 0 1px rgba(255,211,107,.2)}"+
"@supports not (height:1dvh){.wp-cvw{width:min(100% - 16px,calc(36vh*1.25))}}"+
".wp-cvw.mine{box-shadow:0 12px 38px rgba(0,0,0,.5),0 0 0 2px rgba(47,181,168,.75),0 0 26px rgba(47,181,168,.35)}"+
"#wpCv{width:100%;height:100%;display:block;touch-action:none}"+
/* ===== الطبقات (اختيار/كشف) ===== */
".wp-ov{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(11,8,32,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;text-align:center;padding:12px;flex-direction:column;gap:10px;z-index:3}"+
".wp-ov.show{display:flex;animation:wpIn .3s both}"+
".wp-ov .big{font-size:40px;animation:wpFloat 2.6s ease-in-out infinite}"+
".wp-ov .cap{font-weight:900;font-size:17px;font-family:'Reem Kufi',sans-serif}"+
".wp-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:94%;max-width:380px}"+
".wp-opts button{background:#fff;color:#1c1533;border-radius:16px;padding:15px 6px;font-weight:900;font-size:18px;font-family:'Reem Kufi',sans-serif;border:2px solid transparent;transition:transform .15s,box-shadow .2s;box-shadow:0 6px 18px rgba(0,0,0,.35)}"+
".wp-opts button:active{transform:scale(.95)}"+
".wp-opts button:hover{border-color:#F5B94A}"+
".wp-cnt{font-size:26px;font-weight:900;color:#FFD36B;font-variant-numeric:tabular-nums}"+
".wp-rv{font-family:'Reem Kufi',sans-serif;font-size:29px;font-weight:700;color:#FFD36B;text-shadow:0 2px 16px rgba(245,185,74,.4)}"+
".wp-gain{font-size:13.5px;max-height:88px;overflow:auto;width:100%;max-width:340px;display:flex;flex-direction:column;gap:3px}"+
".wp-gain div{padding:4px 8px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);border-radius:10px}"+
".wp-gain b{color:#86efac}"+
/* ===== أدوات الرسم ===== */
".wp-tools{display:none;flex-direction:column;gap:5px;padding:6px 10px;flex:0 0 auto}.wp-tools.show{display:flex}"+
".wp-trow{display:flex;align-items:center;gap:6px;overflow-x:auto;scrollbar-width:none}.wp-trow::-webkit-scrollbar{display:none}"+
".wp-sw{flex:0 0 auto;width:27px;height:27px;border-radius:50%;border:2px solid rgba(255,255,255,.25);transition:transform .15s,border-color .15s}"+
".wp-sw.sel{border-color:#FFD36B;transform:scale(1.22);box-shadow:0 0 10px rgba(255,211,107,.5)}"+
".wp-sz{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center}"+
".wp-sz.sel{background:rgba(255,211,107,.22);border-color:#FFD36B}"+
".wp-sz span{background:#fff;border-radius:50%;display:block}"+
".wp-ic{flex:0 0 auto;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:11px;width:36px;height:34px;font-size:15px;transition:transform .15s,background .2s}"+
".wp-ic:active{transform:scale(.9)}"+
".wp-ic.sel{background:rgba(255,211,107,.25);border-color:#FFD36B}"+
/* ===== الشات ===== */
".wp-msgs{flex:1;min-height:74px;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;background:rgba(9,7,24,.55);margin:0 8px;border-radius:16px;border:1px solid rgba(255,255,255,.05);scrollbar-width:thin}"+
".wp-m{display:flex;gap:6px;align-items:flex-end;max-width:88%;animation:wpM .28s cubic-bezier(.22,1,.36,1) both}"+
"@keyframes wpM{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"+
".wp-m.me{align-self:flex-end;flex-direction:row-reverse}"+
".wp-mb{background:rgba(37,30,80,.9);border:1px solid rgba(255,255,255,.08);border-radius:15px 15px 15px 5px;padding:6px 10px;font-size:14.5px;word-break:break-word;max-width:100%}"+
".wp-m.me .wp-mb{background:linear-gradient(135deg,#7a5d14,#a37e1e);border-color:rgba(255,211,107,.4);color:#fff8e6;border-radius:15px 15px 5px 15px}"+
".wp-mb u{display:block;text-decoration:none;font-size:11px;color:#FFD36B;font-weight:800;margin-bottom:2px}"+
".wp-m.me .wp-mb u{color:#ffe9b0}"+
".wp-mb.team{border:1px dashed rgba(59,130,246,.65);background:rgba(23,37,84,.8)}"+
".wp-mb img.pic{max-width:190px;max-height:170px;border-radius:11px;display:block;cursor:zoom-in}"+
".wp-mb img.stk{max-width:150px;max-height:140px;display:block}"+
".wp-stk{font-size:47px;line-height:1.15}"+
".wp-ok{align-self:center;background:rgba(21,94,53,.85);border:1px solid rgba(74,222,128,.4);color:#bbf7d0;border-radius:14px;padding:6px 14px;font-size:13.5px;font-weight:900;text-align:center;animation:wpPop .35s both}"+
".wp-sys{align-self:center;background:rgba(255,255,255,.06);color:#c4b5fd;border-radius:99px;padding:4px 13px;font-size:12px;text-align:center}"+
/* مشغل الصوت */
".wp-au{display:flex;align-items:center;gap:8px;min-width:168px;padding:2px 0}"+
".wp-au .pb{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FFD36B,#F0A92C);color:#2a1a00;font-size:14px;font-weight:900;flex:0 0 auto;display:grid;place-items:center;transition:transform .15s}"+
".wp-au .pb:active{transform:scale(.9)}"+
".wp-au .sb{width:26px;height:26px;border-radius:50%;background:rgba(255,90,95,.2);border:1px solid rgba(255,90,95,.5);color:#ff9a9e;font-size:10px;flex:0 0 auto;display:grid;place-items:center}"+
".wp-au .bars{display:flex;align-items:center;gap:2px;height:22px;flex:1;min-width:44px}"+
".wp-au .bars i{width:3px;border-radius:2px;background:rgba(255,211,107,.75);height:100%;transform:scaleY(.35);transform-origin:center}"+
".wp-au.playing .bars i{animation:wpBars 1s ease-in-out infinite}"+
".wp-au .dur{font-size:11px;color:#b8b0e8;font-variant-numeric:tabular-nums;flex:0 0 auto}"+
".wp-au .pg{position:absolute;bottom:-3px;inset-inline-start:6px;height:3px;border-radius:3px;background:#FFD36B;width:0%;max-width:calc(100% - 12px);transition:width .2s linear}"+
".wp-au-wrap{position:relative}"+
/* ===== شريط اللاعبين (أسفل) ===== */
".wp-pl{display:flex;gap:10px;overflow-x:auto;padding:8px 12px;background:rgba(13,10,34,.72);border-top:1px solid rgba(255,211,107,.1);scrollbar-width:none;flex:0 0 auto;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}"+
".wp-pl::-webkit-scrollbar{display:none}"+
".wp-p{flex:0 0 auto;width:56px;text-align:center;position:relative;opacity:.5;transition:opacity .3s;animation:wpPop .35s both}"+
".wp-p.on{opacity:1}"+
".wp-p b{display:block;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d9d4ff}"+
".wp-p i{display:block;font-style:normal;font-size:11px;color:#FFD36B;font-weight:900;font-variant-numeric:tabular-nums}"+
".wp-p .bd{position:absolute;top:-4px;inset-inline-end:2px;font-size:14px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}"+
".wp-p.me .wp-av{outline:2px solid #FFD36B;outline-offset:2px}"+
".wp-p.dr .wp-av{outline:2px solid #2FB5A8;outline-offset:2px}"+
".wp-p.ok .wp-av{outline:2px solid #4ade80;outline-offset:2px}"+
".wp-av{border-radius:50%;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;font-weight:900;color:#fff;flex:0 0 auto}"+
/* ===== شريط الدور + الإدخال ===== */
".wp-role{text-align:center;font-size:11.5px;font-weight:700;color:#b8b0e8;padding:2px 8px 0;flex:0 0 auto;min-height:18px}"+
".wp-role .rk{display:inline-block;background:rgba(47,181,168,.15);border:1px solid rgba(47,181,168,.4);color:#7fe0d6;border-radius:99px;padding:1px 10px}"+
".wp-role .rk.g{background:rgba(255,211,107,.12);border-color:rgba(255,211,107,.4);color:#FFD36B}"+
".wp-in{display:flex;gap:6px;align-items:center;padding:7px 8px calc(7px + env(safe-area-inset-bottom));background:rgba(13,10,34,.85);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);flex:0 0 auto}"+
".wp-in input{flex:1;min-width:0;padding:11px 13px;border-radius:15px;border:1px solid rgba(255,255,255,.12);background:rgba(9,7,24,.8);color:#fff;font-size:15px;transition:border-color .2s,box-shadow .2s}"+
".wp-in input:focus{outline:none;border-color:#F5B94A;box-shadow:0 0 0 3px rgba(245,185,74,.18)}"+
".wp-in .ib{width:41px;height:41px;border-radius:13px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);font-size:18px;flex:0 0 auto;transition:transform .15s,background .2s}"+
".wp-in .ib:active{transform:scale(.88)}"+
".wp-in .ib.rec{background:#dc2626;color:#fff;animation:wpPulse .6s infinite alternate}"+
".wp-in .send{background:linear-gradient(135deg,#FFD36B,#F0A92C);color:#2a1a00;border-radius:13px;padding:0 15px;height:41px;font-weight:900;font-size:14px;transition:transform .15s;box-shadow:0 4px 14px rgba(245,185,74,.3)}"+
".wp-in .send:active{transform:scale(.93)}"+
/* ===== اللوحات السفلية (ملصقات/أغاني) ===== */
".wp-sheet{position:absolute;left:0;right:0;bottom:0;max-height:52dvh;background:rgba(17,13,40,.98);border-radius:22px 22px 0 0;border-top:1px solid rgba(255,211,107,.22);transform:translateY(105%);transition:transform .32s cubic-bezier(.22,1,.36,1);z-index:8;display:flex;flex-direction:column;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);box-shadow:0 -12px 40px rgba(0,0,0,.5)}"+
"@supports not (height:1dvh){.wp-sheet{max-height:52vh}}"+
".wp-sheet.show{transform:none}"+
".wp-shead{display:flex;align-items:center;gap:6px;padding:10px 12px 6px;flex:0 0 auto}"+
".wp-shead .hnd{width:44px;height:4px;border-radius:4px;background:rgba(255,255,255,.2);margin:0 auto}"+
".wp-tabs{display:flex;gap:6px;padding:4px 12px 8px;flex:0 0 auto}"+
".wp-tab{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:6px 14px;font-size:13px;font-weight:800;color:#d9d4ff;transition:background .2s,color .2s}"+
".wp-tab.on{background:linear-gradient(135deg,#FFD36B,#F0A92C);color:#2a1a00;border-color:transparent}"+
".wp-body{flex:1;overflow-y:auto;padding:4px 12px calc(14px + env(safe-area-inset-bottom));scrollbar-width:thin}"+
".wp-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}"+
".wp-grid button{font-size:24px;padding:5px 0;border-radius:10px;transition:transform .15s,background .15s}"+
".wp-grid button:active{transform:scale(1.25);background:rgba(255,255,255,.08)}"+
".wp-grid.big button{font-size:38px;padding:8px 0}"+
".wp-grid.myst{grid-template-columns:repeat(4,1fr);gap:8px}"+
".wp-grid.myst button{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:6px}"+
".wp-grid.myst img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:10px}"+
".wp-pack-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}"+
".wp-pack{aspect-ratio:1;border-radius:16px;background-color:rgba(255,255,255,.06);background-repeat:no-repeat;border:1px solid rgba(255,211,107,.18);box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s,border-color .2s,box-shadow .2s}"+
".wp-pack:active{transform:scale(.92);border-color:#FFD36B;box-shadow:0 0 16px rgba(255,211,107,.35)}"+
".wp-empty{padding:24px 12px;text-align:center;color:#b8b0e8;font-size:13.5px;line-height:2}"+
".wp-add{grid-column:1/-1;background:rgba(255,211,107,.1);border:1.5px dashed rgba(255,211,107,.45)!important;color:#FFD36B;font-size:14px!important;font-weight:800;padding:12px!important;border-radius:14px}"+
/* الأغاني */
".wp-song{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:6px;transition:background .2s}"+
".wp-song:active{background:rgba(255,211,107,.12)}"+
".wp-song.on{border-color:rgba(255,211,107,.5);background:rgba(255,211,107,.08)}"+
".wp-song .si{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,rgba(255,211,107,.25),rgba(47,181,168,.2));display:grid;place-items:center;font-size:18px;flex:0 0 auto}"+
".wp-song b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}"+
".wp-song small{color:#b8b0e8;font-size:11.5px;display:block}"+
".wp-song .sp{font-size:18px;color:#FFD36B;flex:0 0 auto}"+
".wp-mini{display:none;align-items:center;gap:8px;margin:4px 8px 0;padding:6px 10px;border-radius:14px;background:rgba(255,211,107,.1);border:1px solid rgba(255,211,107,.3);flex:0 0 auto;animation:wpIn .3s both}"+
".wp-mini.show{display:flex}"+
".wp-mini b{flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#FFD36B}"+
".wp-mini .mb{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#FFD36B,#F0A92C);color:#2a1a00;font-size:12px;font-weight:900;display:grid;place-items:center;flex:0 0 auto}"+
".wp-mini .mx{width:30px;height:30px;border-radius:10px;background:rgba(255,90,95,.18);color:#ff9a9e;font-size:11px;display:grid;place-items:center;flex:0 0 auto}"+
".wp-mini input[type=range]{width:74px;accent-color:#F5B94A}"+
/* ===== اللوبي ===== */
".wp-lob{padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1;min-height:0;scrollbar-width:thin}"+
".wp-card{background:rgba(22,17,48,.72);border:1px solid rgba(255,211,107,.13);border-radius:20px;padding:14px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);animation:wpIn .4s both}"+
".wp-card b{font-size:14.5px}"+
".wp-code{font-family:'Reem Kufi',sans-serif;font-size:36px;font-weight:700;letter-spacing:.28em;direction:ltr;text-align:center;color:#FFD36B;text-shadow:0 2px 18px rgba(245,185,74,.35)}"+
".wp-badge{display:inline-flex;align-items:center;gap:4px;border-radius:99px;padding:3px 11px;font-size:11.5px;font-weight:800}"+
".wp-badge.pub{background:rgba(47,181,168,.15);color:#7fe0d6;border:1px solid rgba(47,181,168,.4)}"+
".wp-badge.priv{background:rgba(139,92,246,.15);color:#c4b5fd;border:1px solid rgba(139,92,246,.4)}"+
".wp-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:15px;padding:12px 16px;font-weight:800;font-size:14.5px;transition:transform .15s,filter .2s,box-shadow .25s;text-align:center}"+
".wp-btn:active{transform:scale(.96)}"+
".wp-btn:disabled{opacity:.45;cursor:wait}"+
".wp-btn.gold{background:linear-gradient(135deg,#FFD36B,#F0A92C);color:#2a1a00;box-shadow:0 6px 20px rgba(245,185,74,.35);border:0}"+
".wp-btn.green{background:linear-gradient(135deg,#34d399,#16a34a);color:#052e16;box-shadow:0 6px 20px rgba(22,163,74,.3);border:0}"+
".wp-btn.big{font-size:16.5px;padding:15px}"+
".wp-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);margin-top:6px}"+
".wp-row b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".wp-row em{font-style:normal;font-size:12px;color:#86efac;font-weight:800}"+
".wp-row em.no{color:#a5a5c8}"+
".wp-set{display:flex;gap:8px;align-items:center;margin-top:9px;font-size:13.5px}"+
".wp-set select{flex:1;padding:9px;border-radius:12px;background:rgba(9,7,24,.8);color:#fff;border:1px solid rgba(255,255,255,.14);font-family:inherit;font-weight:700}"+
".wp-or{display:flex;align-items:center;gap:10px;color:#8f87c0;font-size:12px;margin:2px 0}"+
".wp-or::before,.wp-or::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.12)}"+
/* ===== شاشة الدخول ===== */
".wp-entry{margin:auto;width:min(92%,400px);display:flex;flex-direction:column;gap:11px;text-align:center;padding:10px 0 calc(16px + env(safe-area-inset-bottom))}"+
".wp-hero-ic{width:92px;height:92px;margin:0 auto 4px;display:grid;place-items:center;font-size:46px;border-radius:28px;background:linear-gradient(145deg,rgba(255,211,107,.25),rgba(47,181,168,.12));border:1px solid rgba(255,211,107,.35);box-shadow:0 14px 40px rgba(245,185,74,.22),inset 0 1px 0 rgba(255,255,255,.25);animation:wpFloat 3s ease-in-out infinite}"+
".wp-title{font-family:'Reem Kufi',sans-serif;font-size:33px;font-weight:700;background:linear-gradient(180deg,#FFE9B8,#FFD36B 55%,#E8A43A);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}"+
".wp-tag{color:#b8b0e8;font-size:13.5px;line-height:1.9}"+
".wp-brand{display:inline-flex;align-items:center;gap:6px;margin:0 auto;color:#FFD36B;font-size:12px;font-weight:800;letter-spacing:.06em}"+
".wp-entry input{width:100%;padding:14px;border-radius:16px;border:1.5px solid rgba(255,211,107,.35);background:rgba(9,7,24,.8);color:#fff;font-size:20px;text-align:center;letter-spacing:.32em;text-transform:uppercase;font-weight:900;font-family:inherit;direction:ltr}"+
".wp-entry input:focus{outline:none;border-color:#FFD36B;box-shadow:0 0 0 3px rgba(255,211,107,.15)}"+
".wp-how{font-size:11.5px;color:#8f87c0;line-height:2;padding:0 8px}"+
/* ===== النهاية ===== */
".wp-pod{display:flex;align-items:flex-end;justify-content:center;gap:8px;margin:12px 0 4px}"+
".wp-pod .pod{flex:1;max-width:108px;text-align:center;display:flex;flex-direction:column;align-items:center;animation:wpPop .5s both}"+
".wp-pod .pod .nm{font-weight:800;font-size:12.5px;margin:4px 0 1px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".wp-pod .pod .sc{font-size:11px;color:#FFD36B;font-weight:900}"+
".wp-pod .pod .bar{width:100%;border-radius:12px 12px 5px 5px;margin-top:7px;display:flex;align-items:flex-start;justify-content:center;padding-top:7px;font-weight:900;font-size:17px;color:#2a1a00}"+
".wp-pod .p1 .bar{height:84px;background:linear-gradient(180deg,#FFD36B,#B8860B);animation-delay:.05s}"+
".wp-pod .p2 .bar{height:60px;background:linear-gradient(180deg,#d8d8e0,#8a8a96);animation-delay:.15s}"+
".wp-pod .p3 .bar{height:44px;background:linear-gradient(180deg,#e0a370,#8B4513);animation-delay:.25s}"+
".wp-rank{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-top:6px;animation:wpIn .4s both}"+
".wp-rank.f{background:linear-gradient(90deg,rgba(255,211,107,.16),rgba(255,255,255,.03));border-color:rgba(255,211,107,.4)}"+
".wp-rank b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".wp-rank strong{color:#FFD36B;font-size:17px;font-variant-numeric:tabular-nums}"+
/* ===== استوديو الملصقات ===== */
".wp-modal{position:absolute;inset:0;background:rgba(5,3,16,.8);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:12;display:flex;align-items:center;justify-content:center;padding:14px;animation:wpIn .25s both}"+
".wp-studio{width:min(94%,380px);max-height:92%;overflow:auto;background:rgba(20,15,46,.98);border:1px solid rgba(255,211,107,.25);border-radius:22px;padding:14px;display:flex;flex-direction:column;gap:9px;animation:wpPop .3s both}"+
".wp-studio h3{font-family:'Reem Kufi',sans-serif;font-size:17px;color:#FFD36B;text-align:center}"+
".wp-scv{background:repeating-conic-gradient(#2a2450 0 25%,#221c42 0 50%) 0 0/20px 20px;border-radius:16px;overflow:hidden;align-self:center;border:1px solid rgba(255,255,255,.12)}"+
".wp-scv canvas{display:block;width:280px;height:280px;touch-action:none}"+
".wp-acts{display:flex;gap:7px;flex-wrap:wrap;justify-content:center}"+
".wp-acts .wp-btn{flex:1;min-width:100px;padding:10px 8px;font-size:13px}"+
/* ===== توست ===== */
".wp-toast{position:absolute;bottom:96px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#FFD36B,#F0A92C);color:#2a1a00;padding:10px 17px;border-radius:15px;font-weight:800;z-index:100000;max-width:90%;text-align:center;font-size:13.5px;box-shadow:0 10px 30px rgba(0,0,0,.45);animation:wpPop .3s both}"+
".wp-big{position:absolute;inset:0;background:rgba(0,0,0,.92);z-index:100001;display:flex;align-items:center;justify-content:center;cursor:zoom-out}.wp-big img{max-width:96%;max-height:92%;border-radius:14px}"+
".wp-spin{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.25);border-top-color:#FFD36B;border-radius:50%;animation:wpSpin .8s linear infinite;vertical-align:-2px}"+
"@media (prefers-reduced-motion:reduce){#wp *{animation:none!important;transition:none!important}}";
  document.head.appendChild(s);
}

/* ---------- تحميل ---------- */
async function init(){
  if(FS)return true;
  B=window.__WPFB&&window.__WPFB();
  if(!B||!B.db||!B.uid){toast("سجّل دخولك الأول");return false}
  try{FS=await import(FSU)}catch(e){toast("فشل تحميل قاعدة البيانات — اتصل بالإنترنت");return false}
  db=B.db;
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
  var r=root();
  r.innerHTML='<div class="wp-scr">'+
  '<div class="wp-top"><button class="wp-x" id="wpBack" aria-label="رجوع">✕</button><div class="wp-tt">ارسم وخمّن</div><span class="wp-brand">✦ التفوق</span></div>'+
  '<div class="wp-entry">'+
  '<div class="wp-hero-ic">🎨</div>'+
  '<h1 class="wp-title">ارسم وخمّن</h1>'+
  '<div class="wp-tag">ارسم الكلمة وصحابك يخمّنوها لحظيًا — نقاط بالسرعة، تلميحات حروف، ملصقات، وأغاني 🎵</div>'+
  '<button class="wp-btn gold big" id="wpCreate">🌍 إنشاء غرفة عامة</button>'+
  '<button class="wp-btn big" id="wpCreateP">🔒 غرفة خاصة (بالكود)</button>'+
  '<div class="wp-or">أو انضم بكود</div>'+
  '<input id="wpJc" maxlength="5" placeholder="CODE" autocomplete="off" enterkeyhint="go">'+
  '<button class="wp-btn" id="wpJoin">انضم للغرفة ➜</button>'+
  '<div class="wp-how">🌍 العامة بتظهر للكل في «الغرف المفتوحة» · 🔒 الخاصة بالكود بس<br>لاعبين لحد 12 · رسم لحظي · شات وصوت وملصقات</div>'+
  '</div></div>';
  $("wpBack").onclick=exit;
  $("wpCreate").onclick=function(){create(true)};
  $("wpCreateP").onclick=function(){create(false)};
  $("wpJoin").onclick=function(){join($("wpJc").value)};
  $("wpJc").onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();join(this.value)}};
  setTimeout(function(){try{$("wpJc").blur()}catch(_){}},50);
}
async function create(pub){
  if(busy)return;busy=true;
  var b1=$("wpCreate"),b2=$("wpCreateP");
  if(b1)b1.disabled=true;if(b2)b2.disabled=true;
  try{
    for(var t=0;t<6;t++){
      var c=genCode(),ref=FS.doc(db,"wpRooms",c),ex=await FS.getDoc(ref);
      if(ex.exists())continue;
      var pl={};pl[ME.uid]={name:ME.name,av:ME.thumb,ready:true};
      await FS.setDoc(ref,{host:ME.uid,hostName:ME.name,status:"lobby",public:!!pub,players:pl,order:[],scores:{},solved:{},idx:-1,round:0,maxRounds:3,secs:75,createdAt:FS.serverTimestamp(),updatedAt:FS.serverTimestamp()});
      listen(c);break;
    }
  }catch(e){console.warn(e);warnOnce(e,"فشل إنشاء الغرفة — حاول تاني")}
  busy=false;
  if(b1)b1.disabled=false;if(b2)b2.disabled=false;
}
async function join(c){
  c=String(c||"").trim().toUpperCase();
  if(c.length<4)return toast("اكتب كود الغرفة (5 حروف)");
  root();
  try{
    var ref=FS.doc(db,"wpRooms",c),s=await FS.getDoc(ref);
    if(!s.exists())return toast("الغرفة مش موجودة");
    var d=s.data();
    if(!d.players[ME.uid]){
      if(Object.keys(d.players).length>=12)return toast("الغرفة مليانة (12 كحد أقصى)");
      var u={updatedAt:FS.serverTimestamp()};u["players."+ME.uid]={name:ME.name,av:ME.thumb,ready:false};
      await FS.updateDoc(ref,u);
      listen(c); /* ضبط code الأول ثم الترحيب */
      msg({kind:"text",text:"👋 "+ME.name+" دخل الغرفة"}); /* kind text فقط — القواعد لا تسمح بـ sys */
      return;
    }
    listen(c);
  }catch(e){console.warn(e);warnOnce(e,"فشل الانضمام — حاول تاني");
    var r=$("wp");if(r&&!r.firstElementChild){try{r.remove()}catch(_){}}
  }
}

/* ---------- الاستماع ---------- */
function stopAll(){
  U.forEach(function(f){try{f()}catch(_){}});U=[];
  if(strokeUnsub){try{strokeUnsub()}catch(_){}strokeUnsub=null}
  clearInterval(tickT);clearInterval(hbT);tickT=hbT=null;
  lastIdx=-9;items=[];msgs=[];pres={};secret="";wordOpts=null;picked=false;cur=null;hintLvl=0;rv=[];curAns=false;
  dom={};paintedN=0;paintedS=-1;paintedP=0;undone=[];myCorrects=0;myDraws=0;errKey="";
  vpStop(true);songStop(true);closeSheet();closeStudio();
}
function listen(c){
  stopAll();code=c;
  try{sessionStorage.setItem("wpCode",c)}catch(_){}
  U.push(FS.onSnapshot(rref(),function(s){
    if(!s.exists()){toast("الغرفة اتقفلت");exit();return}
    var prev=R;R=s.data({serverTimestamps:"estimate"});
    if(!R.players){R.players={}}
    if(!R.players[ME.uid]&&prev&&prev.players&&prev.players[ME.uid]){toast("اتشلت من الغرفة");exit();return}
    onRoom(prev);
  },function(e){console.warn("room",e);warnOnce(e)}));
  U.push(FS.onSnapshot(FS.query(col("msgs"),FS.orderBy("ts","desc"),FS.limit(70)),function(s){
    msgs=s.docs.map(function(d){return Object.assign({id:d.id},d.data({serverTimestamps:"estimate"}))}).reverse()
      .filter(function(m){var t=ms(m.ts);return !t||Date.now()-t<3600000});
    syncMsgs();
  },function(e){console.warn("msgs",e)}));
  U.push(FS.onSnapshot(col("presence"),function(s){
    var p={};
    s.docs.forEach(function(d){
      var a=d.data().at;if(!a)return;
      if(d.metadata.hasPendingWrites){if(d.id===ME.uid)p[d.id]=now();return}
      var m=a.toMillis();p[d.id]=m;if(d.id===ME.uid)off=Math.max(off,m-Date.now());
    });
    pres=p;plUI();
  },function(e){console.warn("pres",e)}));
  hb();hbT=setInterval(hb,12000);
  tickT=setInterval(loop,250);
}
function hb(){try{FS.setDoc(FS.doc(db,"wpRooms",code,"presence",ME.uid),{at:FS.serverTimestamp()}).catch(function(){})}catch(_){}}

/* ---------- تحديثات الغرفة ---------- */
var revDone=-1;
function onRoom(prev){
  var scr=R.status==="lobby"?"lobby":R.status==="ended"?"end":"game";
  if(scr!==screen){screen=scr;shell()}
  if(scr==="lobby"){lobbyUI();return}
  if(scr==="end"){endUI();payEnd();return}
  /* ---- داخل الماتش ---- */
  if(R.idx!==lastIdx){
    lastIdx=R.idx;revDone=-1;items=[];nextS=0;secret="";wordOpts=null;picked=false;hintLvl=0;rv=[];cur=null;curAns=false;
    paintedN=0;paintedS=-1;paintedP=0;undone=[];
    subStrokes();
    paintSoon();
  }
  ensureSecret();              /* (1) إصلاح الكلمات المخفية — بتتحمّل في أي لقطة */
  var cw=$("wpCw");if(cw)cw.classList.toggle("mine",R.drawer===ME.uid&&R.status==="drawing");
  tmUI(now());
  if(R.status==="choosing"&&R.drawer===ME.uid&&!wordOpts&&!picked){
    wordOpts=shuffle(WORDS).slice(0,4);
  }
  topUI();plUI();toolsUI();ovUI();inputUI();
}
function ensureSecret(){
  if(R.drawer!==ME.uid||R.status!=="drawing"||secret)return;
  loadSecret();
}
async function loadSecret(){
  try{
    var s=await FS.getDoc(FS.doc(db,"wpRooms",code,"secret",ME.uid));
    if(s.exists()&&s.data().idx===R.idx){
      secret=s.data().w||"";
      rv=shuffle(secret.split("").map(function(c,i){return c===" "?-1:i}).filter(function(i){return i>=0}));
      topUI();
    }
  }catch(_){}
}
function subStrokes(){
  if(strokeUnsub){try{strokeUnsub()}catch(_){}strokeUnsub=null}
  if(!R||typeof R.idx!=="number"||R.idx<0)return;
  var idx=R.idx;
  strokeUnsub=FS.onSnapshot(FS.query(col("strokes"),FS.where("turn","==",idx)),function(s){
    if(!R||R.idx!==idx)return;
    var structural=false,mx=-1;
    var docs=s.docs.map(function(x){return x.data()});
    docs.forEach(function(x){if(x.t)structural=true;if(x.s>mx)mx=x.s});
    items=buildItems(docs);
    if(mx+1>nextS)nextS=mx+1;
    if(structural||items.length<paintedN){paintedN=0;paintedS=-1;paintedP=0;paint()}
    else{paintIncremental()}
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

/* ============================================================
   الهيكل — شاشات اللوبي / اللعب / النهاية
   ============================================================ */
function shell(){
  var r=root();
  dom={};sticky=true;
  if(screen==="lobby"){
    r.innerHTML='<div class="wp-scr">'+
    '<div class="wp-top"><button class="wp-x" id="wpLeave">✕</button><div class="wp-tt">🎨 غرفة اللعب</div><button class="wp-ic" id="wpSongsT" title="الأغاني">🎵</button></div>'+
    '<div class="wp-lob" id="wpLob"></div>'+
    '<div class="wp-mini" id="wpMini"></div>'+
    '<div class="wp-msgs" id="wpMsgs"></div>'+
    '<form class="wp-in" id="wpForm"><button type="button" class="ib" id="wpEmo">😊</button><button type="button" class="ib" id="wpImg">🖼️</button><button type="button" class="ib" id="wpMic">🎤</button>'+
    '<input id="wpTx" maxlength="120" autocomplete="off" placeholder="شات قبل الماتش…"><button class="send" type="submit">إرسال</button></form>'+
    '<input type="file" id="wpFile" accept="image/*" style="display:none">'+
    '<div class="wp-sheet" id="wpSheet"></div></div>';
    $("wpLeave").onclick=leave;$("wpSongsT").onclick=function(){openSheet("songs")};
  }else if(screen==="end"){
    r.innerHTML='<div class="wp-scr">'+
    '<div class="wp-top"><button class="wp-x" id="wpLeave">✕</button><div class="wp-tt">🏆 النتيجة النهائية</div><span class="wp-brand">✦ التفوق</span></div>'+
    '<div class="wp-lob" id="wpLob"></div>'+
    '<div class="wp-mini" id="wpMini"></div>'+
    '<div class="wp-msgs" id="wpMsgs"></div>'+
    '<form class="wp-in" id="wpForm"><button type="button" class="ib" id="wpEmo">😊</button><button type="button" class="ib" id="wpImg">🖼️</button><button type="button" class="ib" id="wpMic">🎤</button>'+
    '<input id="wpTx" maxlength="120" autocomplete="off" placeholder="قهرة بعد الماتش…"><button class="send" type="submit">إرسال</button></form>'+
    '<input type="file" id="wpFile" accept="image/*" style="display:none">'+
    '<div class="wp-sheet" id="wpSheet"></div></div>';
    $("wpLeave").onclick=leave;
  }else{
    r.innerHTML='<div class="wp-scr">'+
    '<div class="wp-top"><button class="wp-x" id="wpLeave">✕</button><button class="wp-chip" id="wpCode" title="نسخ الكود"></button><div class="wp-pill" id="wpRd"></div><div style="flex:1"></div><button class="wp-ic" id="wpSongsT" title="الأغاني" style="margin-inline-end:6px">🎵</button><div class="wp-tm" id="wpTm" style="--p:100"><i id="wpTmI">--</i></div></div>'+
    '<div class="wp-word" id="wpWord"></div>'+
    '<div class="wp-cvw" id="wpCw"><canvas id="wpCv"></canvas><div class="wp-ov" id="wpOv"></div></div>'+
    '<div class="wp-tools" id="wpTools"></div>'+
    '<div class="wp-mini" id="wpMini"></div>'+
    '<div class="wp-msgs" id="wpMsgs"></div>'+
    '<div class="wp-pl" id="wpPl"></div>'+
    '<div class="wp-role" id="wpRole"></div>'+
    '<form class="wp-in" id="wpForm"><button type="button" class="ib" id="wpEmo">😊</button><button type="button" class="ib" id="wpImg">🖼️</button><button type="button" class="ib" id="wpMic">🎤</button>'+
    '<input id="wpTx" maxlength="120" autocomplete="off" placeholder="اكتب رسالة أو تخمين…"><button class="send" type="submit">إرسال</button></form>'+
    '<input type="file" id="wpFile" accept="image/*" style="display:none">'+
    '<div class="wp-sheet" id="wpSheet"></div></div>';
    $("wpLeave").onclick=leave;
    $("wpCode").textContent=code;
    $("wpCode").onclick=copyCode;
    $("wpSongsT").onclick=function(){openSheet("songs")};
    $("wpForm").onsubmit=function(e){e.preventDefault();var i=$("wpTx"),v=i.value;i.value="";sticky=true;send(v)};
    $("wpEmo").onclick=function(){openSheet(sheetMode==="stick"?"":"stick")};
    $("wpImg").onclick=function(){$("wpFile").click()};
    $("wpFile").onchange=function(){var f=this.files[0];this.value="";if(f)sendImage(f)};
    $("wpMic").onclick=recToggle;
    var msx=$("wpMsgs");
    msx.onscroll=function(){sticky=msx.scrollHeight-msx.scrollTop-msx.clientHeight<140};
    msx.onclick=msgClick;
    initCanvas();syncMsgs();
  }
  bindCommon();
}
function bindCommon(){
  var f=$("wpForm");
  if(f&&!f._b){
    f._b=1;
    f.onsubmit=function(e){e.preventDefault();var i=$("wpTx"),v=i.value;i.value="";sticky=true;send(v)};
    $("wpEmo").onclick=function(){openSheet(sheetMode==="stick"?"":"stick")};
    $("wpImg").onclick=function(){$("wpFile").click()};
    $("wpFile").onchange=function(){var f2=this.files[0];this.value="";if(f2)sendImage(f2)};
    $("wpMic").onclick=recToggle;
    var msx=$("wpMsgs");
    if(msx){msx.onscroll=function(){sticky=msx.scrollHeight-msx.scrollTop-msx.clientHeight<140};msx.onclick=msgClick}
  }
}
function copyCode(){
  try{navigator.clipboard.writeText(code);toast("اتنسخ الكود ✓")}catch(_){toast(code)}
}

/* ---------- اللوبي (بشات قبل الماتش) ---------- */
function lobbyUI(){
  var el=$("wpLob");if(!el)return;
  var host=R.host===ME.uid,ids=Object.keys(R.players),pr=ids.filter(present).length;
  var rows=ids.map(function(u){var p=R.players[u];
    return '<div class="wp-row">'+avatar(u,p,40)+'<b>'+E(p.name)+(u===ME.uid?' <small>(أنت)</small>':'')+(u===R.host?' 👑':'')+'</b>'+(p.ready||u===R.host?'<em>✓ جاهز</em>':'<em class="no">مش جاهز</em>')+'</div>'}).join("");
  var rd=ids.filter(function(u){return u===R.host||R.players[u].ready}).length;
  var mine=R.players[ME.uid]||{};
  el.innerHTML=
  '<div class="wp-card"><div style="display:flex;justify-content:center;gap:8px;align-items:center;margin-bottom:6px">'+
  '<span class="wp-badge '+(R.public?'pub">🌍 غرفة عامة':'priv">🔒 غرفة خاصة')+'</span>'+
  (host?'<button class="wp-btn" id="wpPub" style="padding:4px 10px;font-size:11.5px;border-radius:99px">'+(R.public?'اجعلها خاصة 🔒':'اجعلها عامة 🌍')+'</button>':'')+'</div>'+
  '<div style="text-align:center;font-size:11.5px;color:#b8b0e8;margin-bottom:2px">كود الغرفة — ابعته لصحابك</div><div class="wp-code">'+E(code)+'</div>'+
  '<div style="display:flex;gap:8px;margin-top:10px"><button class="wp-btn" style="flex:1" id="wpCopy">📋 نسخ الكود</button><button class="wp-btn" style="flex:1" id="wpShare">📤 مشاركة</button></div></div>'+
  '<div class="wp-card"><b>اللاعبين ('+ids.length+'/12)</b><span class="wp-pill" style="float:left">جاهزين '+rd+' من '+ids.length+'</span>'+rows+'</div>'+
  (host?'<div class="wp-card"><b>⚙️ الإعدادات</b>'+
   '<div class="wp-set"><span>الجولات</span><select id="wpRounds">'+[1,2,3,4,5,6,8,10].map(function(n){return '<option'+(n===R.maxRounds?' selected':'')+'>'+n+'</option>'}).join("")+'</select></div>'+
   '<div class="wp-set"><span>وقت الرسم</span><select id="wpSecs">'+[45,60,75,90,120,180].map(function(n){return '<option value="'+n+'"'+(n===R.secs?' selected':'')+'>'+n+' ثانية</option>'}).join("")+'</select></div></div>':
   '<div class="wp-card" style="text-align:center;font-size:13px;color:#b8b0e8">الجولات: '+E(R.maxRounds)+' · وقت الرسم: '+E(R.secs)+' ثانية</div>')+
  (host?'<button class="wp-btn gold big" id="wpStart"'+(pr<2?' disabled':'')+'>▶ ابدأ الماتش'+(pr<2?' (محتاج لاعبين اتنين على الأقل)':'')+'</button>':
   '<button class="wp-btn '+(mine.ready?'green':'gold')+' big" id="wpReady">'+(mine.ready?'✓ جاهز — اضغط للإلغاء':'أنا جاهز!')+'</button><div style="text-align:center;color:#8f87c0;font-size:12.5px;padding-bottom:4px">استنى المضيف يبدأ… 👀</div>');
  $("wpCopy").onclick=copyCode;
  $("wpShare").onclick=function(){
    var t="تعالى العب «ارسم وخمّن» معايا في منصة التفوق 🎨✨ كود الغرفة: "+code;
    if(navigator.share)navigator.share({text:t}).catch(function(){});
    else{try{navigator.clipboard.writeText(t);toast("اتنسخت الدعوة ✓")}catch(_){toast(t)}}
  };
  if(host){
    var pb=$("wpPub");if(pb)pb.onclick=function(){FS.updateDoc(rref(),{public:!R.public,updatedAt:FS.serverTimestamp()}).catch(function(e){warnOnce(e)})};
    $("wpRounds").onchange=function(){FS.updateDoc(rref(),{maxRounds:+this.value,updatedAt:FS.serverTimestamp()}).catch(function(e){warnOnce(e)})};
    $("wpSecs").onchange=function(){FS.updateDoc(rref(),{secs:+this.value,updatedAt:FS.serverTimestamp()}).catch(function(e){warnOnce(e)})};
    $("wpStart").onclick=start;
  }else{
    $("wpReady").onclick=function(){
      var u={updatedAt:FS.serverTimestamp()};u["players."+ME.uid+".ready"]=!mine.ready;
      FS.updateDoc(rref(),u).catch(function(e){warnOnce(e)});
    };
  }
}
async function start(){
  var pl=plist();if(pl.length<2)return toast("محتاج لاعبين على الأقل");
  var nr=pl.filter(function(u){return u!==R.host&&!R.players[u].ready}).length;
  if(nr&&!confirm(nr+" لاعب مش جاهز — تبدأ برضه؟"))return;
  var order=shuffle(pl),sc={};Object.keys(R.players).forEach(function(u){sc[u]=0});
  var p=nextTurn({idx:-1,order:order,players:R.players,maxRounds:R.maxRounds});
  p.order=order;p.scores=sc;p.updatedAt=FS.serverTimestamp();
  try{await FS.updateDoc(rref(),p)}catch(e){console.warn(e);warnOnce(e,"فشل البدء — حاول تاني")}
}
/* ============================================================
   الشات — رسائل بتزايد (بدون إعادة بناء) + تخمين + صوت + صور + ملصقات
   ============================================================ */
var paintedP=0;
function msg(m){
  var d=Object.assign({uid:ME.uid,name:ME.name,ts:FS.serverTimestamp(),expireAt:FS.Timestamp.fromMillis(Date.now()+3600000)},m);
  if(ME.thumb)d.av=ME.thumb;
  sticky=true;
  return FS.addDoc(col("msgs"),d).catch(function(e){console.warn("msg",e);warnOnce(e,"الرسالة ماتبعتتش — حاول تاني")});
}
function send(text){
  text=String(text||"").trim();if(!text||!R)return;
  var st=R.status,sv=!!(R.solved||{})[ME.uid],dr=R.drawer===ME.uid;
  if(st==="drawing"&&!dr&&!sv){
    var c=canon(text);
    if(c&&R.wh&&H(c,code+":"+R.idx)===R.wh)return correct();
    return msg({kind:"guess",text:text.slice(0,60)});
  }
  /* الرسام يكتب عادي للجميع؛ السري بس للمخمّن اللي حلّ بالفعل */
  return msg({kind:"text",text:text.slice(0,300),team:(st==="drawing"&&sv&&!dr)?1:0});
}
function correct(){
  var tot=R.secs*1000,left=Math.max(0,ms(R.startedAt)+tot-now());
  var first=Object.keys(R.solved||{}).length===0;
  var pts=Math.round(30+70*left/tot)+(first?20:0),dp=Math.round(pts*.4);
  var u={updatedAt:FS.serverTimestamp()};
  u["solved."+ME.uid]=pts;u["scores."+ME.uid]=FS.increment(pts);u["scores."+R.drawer]=FS.increment(dp);
  myCorrects++;
  try{navigator.vibrate&&navigator.vibrate(60)}catch(_){}
  ding();
  return FS.updateDoc(rref(),u).then(function(){sticky=true;return msg({kind:"correct",text:"",pts:pts})})
    .catch(function(e){console.warn(e);warnOnce(e,"فشل تسجيل الإجابة — حاول تاني")});
}
/* نغمة صغيرة للإجابة الصحيحة (مكتومة من إعدادات wp_snd) */
var AC=null;
function ding(){
  try{
    if(localStorage.getItem("wp_snd")==="0")return;
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==="suspended")AC.resume();
    var t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
    o.type="sine";o.frequency.setValueAtTime(880,t);o.frequency.setValueAtTime(1318,t+.09);
    g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);
    o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+.32);
  }catch(_){}
}
function msgHidden(m){
  return !!(m.team&&R&&R.status==="drawing"&&R.drawer!==ME.uid&&!(R.solved||{})[ME.uid]);
}
function msgNode(m){
  var d=document.createElement("div");
  var mine=m.uid===ME.uid;
  if(m.kind==="correct"){d.className="wp-ok";d.innerHTML="🎉 "+E(m.name)+" خمّن الكلمة الصحيحة +"+E(m.pts||0);return d}
  if(m.kind==="sys"){d.className="wp-sys";d.textContent=m.text||"";return d}
  if(msgHidden(m)){d.style.display="none";return d}
  d.className="wp-m"+(mine?" me":"");
  var pl=(R&&R.players&&R.players[m.uid])||{};
  var body;
  if(m.kind==="sticker"){
    if(m.img&&String(m.img).length>20)body='<img class="stk" data-big="1" src="'+E(m.img)+'" alt="ملصق">';
    else body='<div class="wp-stk">'+E(m.text||"🙂")+'</div>';
  }else if(m.kind==="img"){
    body='<img class="pic" data-big="1" src="'+E(m.img)+'" alt="صورة">';
  }else if(m.kind==="audio"){
    var dur=Math.round(m.dur||0),bars="",i;
    for(i=0;i<14;i++)bars+='<i style="animation-delay:'+Math.round(i*70)+'ms;height:'+(40+(i%3)*20)+'%"></i>';
    body='<div class="wp-au" data-auid="'+E(m.id)+'"><button type="button" class="pb" data-au="'+E(m.id)+'">▶</button><div class="bars">'+bars+'</div><span class="dur">'+dur+'ث</span><button type="button" class="sb" data-astop="'+E(m.id)+'" title="إيقاف">■</button><div class="pg"></div></div>';
  }else body=E(m.text||"");
  d.innerHTML=avatar(m.uid,{name:m.name,av:m.av||pl.av},30)+'<div class="wp-mb'+(m.team?' team':'')+'"><u>'+E(m.name)+(m.team?' 🔒':'')+'</u>'+body+'</div>';
  return d;
}
function syncMsgs(){
  var el=$("wpMsgs");if(!el)return;
  if(!msgs.length){
    for(var k in dom){try{dom[k].remove()}catch(_){}delete dom[k]}
    el.innerHTML='<div class="wp-sys wp-ph">ابدأ الدردشة… 👋 (الإيموجي والملصقات من زر 😊)</div>';
    return;
  }
  var ph=el.querySelector(".wp-ph");if(ph){try{ph.remove()}catch(_){}}
  var have={},i;
  for(i=0;i<msgs.length;i++)have[msgs[i].id]=1;
  for(var id in dom){if(!have[id]){try{dom[id].remove()}catch(_){}delete dom[id]}}
  var prev=null,added=0;
  for(i=0;i<msgs.length;i++){
    var m=msgs[i],n=dom[m.id];
    if(!n){n=msgNode(m);dom[m.id]=n;added++}
    var want=prev?prev.nextSibling:el.firstChild;
    if(n!==want){try{if(prev)prev.after(n);else el.insertBefore(n,el.firstChild)}catch(_){}}
    prev=n;
  }
  if(added||sticky){el.scrollTop=el.scrollHeight;sticky=added?true:sticky}
}
function lightbox(src){
  var o=document.createElement("div");o.className="wp-big";o.innerHTML='<img src="'+E(src)+'" alt="">';
  o.onclick=function(){try{o.remove()}catch(_){}};
  var r=$("wp");(r||document.body).appendChild(o);
}
function msgClick(e){
  var st=e.target.closest("[data-astop]"),au=e.target.closest("[data-au]"),im=e.target.closest("[data-big]");
  if(st){var sid=st.getAttribute("data-astop");if(VP.id===sid)vpStop();return}
  if(au){
    var id=au.getAttribute("data-au"),m=null;
    for(var i=0;i<msgs.length;i++)if(msgs[i].id===id){m=msgs[i];break}
    if(m&&m.audio)vpPlay(id,m.audio);
  }else if(im)lightbox(im.getAttribute("src"));
}

/* ---------- مشغّل الصوت الواحد (يحلّ التكرار وعدم التوقف) ---------- */
function auBtn(id,playing){
  var n=document.querySelector('#wp [data-auid="'+id+'"]');if(!n)return;
  n.classList.toggle("playing",!!playing);
  var b=n.querySelector(".pb");if(b)b.textContent=playing?"❚❚":"▶";
  if(!playing){var pg=n.querySelector(".pg");if(pg)pg.style.width="0%"}
}
function vpStop(hard){
  if(VP.au){try{VP.au.pause();try{VP.au.currentTime=0}catch(_){}}catch(_){}}
  if(VP.id)auBtn(VP.id,false);
  VP.id="";
  if(hard){VP.au=null;VP.src=""}
}
function vpPlay(id,src){
  songPause(); /* صوت واحد بس في نفس الوقت */
  if(VP.id===id&&VP.au&&!VP.au.paused&&!VP.au.ended){vpStop();return}
  if(VP.id!==id){
    vpStop();
    if(!VP.au||VP.src!==src){
      VP.au=new Audio(src);VP.src=src;
      VP.au.ontimeupdate=function(){
        if(!VP.id||!VP.au||!VP.au.duration)return;
        var n=document.querySelector('#wp [data-auid="'+VP.id+'"] .pg');
        if(n)n.style.width=Math.min(100,VP.au.currentTime/VP.au.duration*100)+"%";
      };
      VP.au.onended=function(){var i=VP.id;auBtn(i,false);if(VP.id===i)VP.id=""};
      VP.au.onerror=function(){var i=VP.id;auBtn(i,false);if(VP.id===i)VP.id="";toast("الجهاز ده مش بيشغّل الصوت ده")};
    }
    VP.id=id;
  }
  auBtn(id,true);
  var p;
  try{p=VP.au.play()}catch(_){p=null}
  if(p&&p.catch)p.catch(function(){auBtn(id,false);toast("اضغط ▶ تاني لتشغيل الصوت")});
}

/* ---------- صور ---------- */
function sendImage(f){
  var r=new FileReader();
  r.onload=function(){
    var im=new Image();
    im.onload=function(){
      var s=Math.min(1,640/Math.max(im.width,im.height)),c=document.createElement("canvas");
      c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
      c.getContext("2d").drawImage(im,0,0,c.width,c.height);
      var q=.72,d=c.toDataURL("image/jpeg",q);
      while(d.length>600000&&q>.3){q-=.1;d=c.toDataURL("image/jpeg",q)}
      if(d.length>900000)return toast("الصورة كبيرة");
      msg({kind:"img",text:"",img:d});
    };
    im.onerror=function(){toast("الصورة مش مدعومة")};
    im.src=r.result;
  };
  r.readAsDataURL(f);
}

/* ---------- رسائل صوتية ---------- */
async function recToggle(){
  var b=$("wpMic");
  if(rec){recStop(true);return}
  if(!navigator.mediaDevices||!window.MediaRecorder)return toast("التسجيل مش مدعوم هنا");
  try{
    var st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    var mt=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"].filter(function(t){return MediaRecorder.isTypeSupported(t)})[0];
    var mr=mt?new MediaRecorder(st,{mimeType:mt,audioBitsPerSecond:24000}):new MediaRecorder(st);
    rec={mr:mr,st:st,ch:[],t0:Date.now(),send:true,mt:mt||mr.mimeType,done:false};
    mr.ondataavailable=function(e){if(rec&&e.data&&e.data.size)rec.ch.push(e.data)};
    mr.onstop=function(){
      var r0=rec;rec=null;
      if(!r0||r0.done)return;r0.done=true;
      try{r0.st.getTracks().forEach(function(t){t.stop()})}catch(_){}
      clearInterval(r0.iv);
      var bb=$("wpMic");if(bb){bb.classList.remove("rec");bb.textContent="🎤"}
      var dur=(Date.now()-r0.t0)/1000;
      if(!r0.send||dur<.7)return;
      var blob=new Blob(r0.ch,{type:r0.mt}),fr=new FileReader();
      fr.onload=function(){
        if(fr.result.length>900000)return toast("الرسالة طويلة — قصّرها");
        msg({kind:"audio",text:"",audio:fr.result,dur:Math.min(300,dur)});
      };
      fr.readAsDataURL(blob);
    };
    mr.start(250);
    if(b){b.classList.add("rec");b.textContent="⏹"}
    rec.iv=setInterval(function(){
      if(!rec)return;
      var s=Math.round((Date.now()-rec.t0)/1000);
      var bb=$("wpMic");if(bb)bb.textContent="⏹ "+s;
      if(s>=90)recStop(true);
    },300);
    toast("بيسجّل… اضغط ⏹ تاني للإرسال");
  }catch(e){toast("اسمح بالميكروفون الأول")}
}
function recStop(send_){if(!rec)return;rec.send=send_;try{rec.mr.stop()}catch(_){}}

/* ============================================================
   الملصقات — إيموجي + ستيكرات + ملصقاتي + استوديو
   ============================================================ */
function myStickers(){try{return JSON.parse(localStorage.getItem("wp_myst")||"[]")}catch(_){return[]}}
function saveMyst(a){
  try{
    var out=a.slice(0,40),tot=0,i;
    for(i=0;i<out.length;i++)tot+=(out[i].d||"").length;
    while(tot>3500000&&out.length>1){tot-=(out.shift().d||"").length}
    localStorage.setItem("wp_myst",JSON.stringify(out));
  }catch(_){toast("الجهاز رفض حفظ الملصق (المساحة ممتلئة)")}
}
function openSheet(mode){
  sheetMode=mode||"";
  var sh=$("wpSheet");if(!sh)return;
  if(!mode)return closeSheet();
  sh.classList.add("show");
  renderSheet();
}
function closeSheet(){sheetMode="";var sh=$("wpSheet");if(sh)sh.classList.remove("show")}
function renderSheet(){
  var sh=$("wpSheet");if(!sh||!sheetMode)return;
  var tabs=[["face","😀 وجوه"],["stick","🎉 ستيكرات"],["myst","🖼️ ملصقاتي"],["songs","🎵 أغاني"]];
  sh.innerHTML='<div class="wp-shead"><div class="hnd"></div></div><div class="wp-tabs">'+
  tabs.map(function(t){return '<button type="button" class="wp-tab'+(sheetMode===t[0]?' on':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>'}).join("")+
  '<button type="button" class="wp-tab" id="wpClose" style="margin-inline-start:auto">✕</button></div><div class="wp-body" id="wpBody"></div>';
  sh.querySelectorAll("[data-tab]").forEach(function(b){b.onclick=function(){sheetMode=this.getAttribute("data-tab");renderSheet()}});
  $("wpClose").onclick=closeSheet;
  var body=$("wpBody");
  if(sheetMode==="face"){
    body.innerHTML='<div class="wp-grid">'+EMO_FACE.concat(EMO_MORE).map(function(e){return '<button type="button" data-e="'+e+'">'+e+'</button>'}).join("")+'</div>';
    body.onclick=pickEmoji;
  }else if(sheetMode==="stick"){
    var packHtml=PACK.map(function(i){
      var col=i%PACK_COLS,row=Math.floor(i/PACK_COLS);
      var x=-col*PACK_CELL,y=-row*PACK_CELL;
      return '<button type="button" class="wp-pack" data-pi="'+i+'" style="background-image:url('+PACK_SRC+');background-size:'+(PACK_COLS*100)+'% '+(PACK_ROWS*100)+'%;background-position:'+x+'px '+y+'px" title="ملصق"></button>';
    }).join("");
    body.innerHTML='<div class="wp-pack-grid">'+packHtml+'</div>'+
      '<div style="font-size:11px;color:#9a93c8;padding:4px 2px 2px">إيموجي سريع</div>'+
      '<div class="wp-grid big">'+STICKS.map(function(e){return '<button type="button" data-e="'+e+'">'+e+'</button>'}).join("")+'</div>';
    body.onclick=function(ev){
      var pb=ev.target.closest("[data-pi]");
      if(pb){sendPack(+pb.getAttribute("data-pi"));return}
      pickEmoji(ev);
    };
  }else if(sheetMode==="myst")renderMyst(body);
  else if(sheetMode==="songs")renderSongs(body);
}
function pickEmoji(e){
  var b=e.target.closest("button[data-e]");if(!b)return;
  msg({kind:"sticker",text:b.getAttribute("data-e")});closeSheet();
}
function sendPack(i){
  if(i<0||i>=PACK.length)return;
  var col=i%PACK_COLS,row=Math.floor(i/PACK_COLS);
  var c=document.createElement("canvas");c.width=PACK_CELL;c.height=PACK_CELL;
  var img=new Image();
  img.onload=function(){
    try{
      c.getContext("2d").drawImage(img,col*PACK_CELL,row*PACK_CELL,PACK_CELL,PACK_CELL,0,0,PACK_CELL,PACK_CELL);
      var d=c.toDataURL("image/webp",0.9);
      if(d.length<40)d=c.toDataURL("image/png");
      msg({kind:"sticker",text:"",img:d});closeSheet();
    }catch(err){console.warn(err);toast("فشل إرسال الملصق")}
  };
  img.onerror=function(){toast("ملف الملصقات مش موجود — ارفع dg-stickers.webp مع الموقع")};
  img.src=PACK_SRC;
}
function renderMyst(body){
  var a=myStickers();
  body.innerHTML='<div class="wp-grid myst"><button type="button" class="wp-add" id="wpAddSt">🎨 اصنع ملصق جديد</button>'+
  a.map(function(s,i){return '<button type="button" data-mi="'+i+'" title="اضغط للإرسال — ضغطة طويلة للحذف"><img src="'+E(s.d)+'" alt="ملصق"></button>'}).join("")+
  (a.length?"":'<div class="wp-empty">مفيش ملصقات لسه — اصنع ملصقك (ارسمه أو من صورة الفون وارسم فوقه) 🎨</div>')+'</div>';
  $("wpAddSt").onclick=function(){studioOpen(null)};
  var timer=null,longPress=false;
  body.querySelectorAll("[data-mi]").forEach(function(b){
    b.addEventListener("touchstart",function(){
      longPress=false;
      timer=setTimeout(function(){
        longPress=true;
        var i=+b.getAttribute("data-mi"),a2=myStickers();
        a2.splice(i,1);saveMyst(a2);toast("اتحذف الملصق 🗑️");renderSheet();
      },650);
    },{passive:true});
    b.addEventListener("touchend",function(){clearTimeout(timer)},{passive:true});
    b.addEventListener("click",function(){
      if(longPress)return;
      var i=+b.getAttribute("data-mi"),a2=myStickers();
      if(a2[i]){msg({kind:"sticker",text:"",img:a2[i].d});closeSheet()}
    });
  });
}
/* ---------- استوديو الملصقات ---------- */
var STU={strokes:[],cur:null,pen:{c:"#1f2430",w:8},img:null,eraser:false};
function closeStudio(){var s=$("wpStu");if(s){try{s.remove()}catch(_){}}STU.strokes=[];STU.cur=null;STU.img=null;STU.eraser=false}
function studioOpen(){
  closeSheet();
  var r=root();
  var ov=document.createElement("div");ov.className="wp-modal";ov.id="wpStu";
  ov.innerHTML='<div class="wp-studio"><h3>🎨 استوديو الملصقات</h3>'+
  '<div class="wp-scv"><canvas id="wpScv" width="560" height="560"></canvas></div>'+
  '<div class="wp-trow" id="wpStuC"></div>'+
  '<div class="wp-trow" id="wpStuT"></div>'+
  '<div class="wp-acts">'+
  '<button class="wp-btn" id="wpStuImg">🖼️ صورة</button>'+
  '<button class="wp-btn" id="wpStuCam">📷 كاميرا</button>'+
  '<button class="wp-btn" id="wpStuUndo">↩️ تراجع</button>'+
  '<button class="wp-btn" id="wpStuClr">🗑️ مسح</button></div>'+
  '<div class="wp-acts">'+
  '<button class="wp-btn gold" id="wpStuSend">🚀 إرسال للشات</button>'+
  '<button class="wp-btn" id="wpStuSave">💾 ملصقاتي</button>'+
  '<button class="wp-btn" id="wpStuX">إغلاق</button></div>'+
  '<input type="file" id="wpStuFile" accept="image/*" style="display:none">'+
  '<input type="file" id="wpStuCam" accept="image/*" capture="user" style="display:none"></div>';
  r.appendChild(ov);
  ov.addEventListener("click",function(e){if(e.target===ov)closeStudio()});
  STU.strokes=[];STU.cur=null;STU.img=null;STU.pen={c:COLORS[0],w:8};STU.eraser=false;
  $("wpStuC").innerHTML=COLORS.map(function(c){return '<button type="button" class="wp-sw'+(STU.pen.c===c?' sel':'')+'" data-c="'+c+'" style="background:'+c+'"></button>'}).join("")+
  '<button type="button" class="wp-ic" data-a="er" title="ممحاة">🧽</button>';
  $("wpStuT").innerHTML='<button type="button" class="wp-sz" data-w="5"><span style="width:4px;height:4px"></span></button>'+
  '<button type="button" class="wp-sz sel" data-w="10"><span style="width:7px;height:7px"></span></button>'+
  '<button type="button" class="wp-sz" data-w="18"><span style="width:11px;height:11px"></span></button>'+
  '<button type="button" class="wp-sz" data-w="34"><span style="width:16px;height:16px"></span></button>';
  $("wpStuC").onclick=function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.dataset.c){STU.pen.c=b.dataset.c;STU.eraser=false}
    else if(b.dataset.a==="er"){STU.eraser=true}
    this.querySelectorAll(".wp-sw").forEach(function(x){x.classList.toggle("sel",!STU.eraser&&x.dataset.c===STU.pen.c)});
    var er=this.querySelector('[data-a="er"]');if(er)er.classList.toggle("sel",STU.eraser);
  };
  $("wpStuT").onclick=function(e){
    var b=e.target.closest("button[data-w]");if(!b)return;
    STU.pen.w=+b.dataset.w;
    this.querySelectorAll(".wp-sz").forEach(function(x){x.classList.toggle("sel",+x.dataset.w===STU.pen.w)});
  };
  $("wpStuImg").onclick=function(){$("wpStuFile").click()};
  $("wpStuCam").onclick=function(){$("wpStuCamF").click()};
  var camf=document.getElementById("wpStuCam");camf.id="wpStuCamF";
  $("wpStuCamF").onchange=imgToStudio;
  $("wpStuFile").onchange=imgToStudio;
  $("wpStuUndo").onclick=function(){STU.strokes.pop();stuPaint()};
  $("wpStuClr").onclick=function(){STU.strokes=[];STU.img=null;stuPaint()};
  $("wpStuX").onclick=closeStudio;
  $("wpStuSave").onclick=function(){stuOut(true)};
  $("wpStuSend").onclick=function(){stuOut(false)};
  stuBind();stuPaint();
}
function imgToStudio(){
  var f=this.files[0];this.value="";if(!f)return;
  var fr=new FileReader();
  fr.onload=function(){
    var im=new Image();
    im.onload=function(){
      var c=$("wpScv"),x=c.getContext("2d");
      var s=Math.max(560/im.width,560/im.height); /* تغطية كاملة */
      var w=im.width*s,h=im.height*s;
      var cv2=document.createElement("canvas");cv2.width=560;cv2.height=560;
      var x2=cv2.getContext("2d");
      x2.drawImage(im,(560-w)/2,(560-h)/2,w,h);
      STU.img=cv2;STU.strokes=[];stuPaint();
    };
    im.onerror=function(){toast("الصورة مش مدعومة")};
    im.src=fr.result;
  };
  fr.readAsDataURL(f);
}
function stuBind(){
  var c=$("wpScv");if(!c)return;
  var pos=function(e){var r=c.getBoundingClientRect();return[Math.max(0,Math.min(560,Math.round((e.clientX-r.left)/r.width*560))),Math.max(0,Math.min(560,Math.round((e.clientY-r.top)/r.height*560)))]};
  c.onpointerdown=function(e){
    e.preventDefault();
    try{c.setPointerCapture(e.pointerId)}catch(_){}
    var p=pos(e);
    STU.cur={c:STU.eraser?"__BG__":STU.pen.c,w:STU.pen.w,p:[p[0],p[1]]};
    stuPaint();
  };
  c.onpointermove=function(e){
    if(!STU.cur)return;
    var ev=e.getCoalescedEvents?e.getCoalescedEvents():[e];if(!ev.length)ev=[e];
    ev.forEach(function(x2){var p=pos(x2),n=STU.cur.p.length;if(Math.abs(p[0]-STU.cur.p[n-2])+Math.abs(p[1]-STU.cur.p[n-1])>=3)STU.cur.p.push(p[0],p[1])});
    stuPaintSoon();
  };
  var up=function(){if(STU.cur){STU.strokes.push(STU.cur);STU.cur=null;stuPaintSoon()}};
  c.onpointerup=up;c.onpointercancel=up;
}
var stuRaf=0;
function stuPaintSoon(){if(stuRaf)return;stuRaf=requestAnimationFrame(function(){stuRaf=0;stuPaint()})}
function stuPaint(){
  var c=$("wpScv");if(!c)return;
  var x=c.getContext("2d"),W=c.width,Hh=c.height;
  x.setTransform(1,0,0,1,0,0);
  if(STU.img){x.drawImage(STU.img,0,0)}
  else{x.clearRect(0,0,W,Hh)}
  x.lineCap="round";x.lineJoin="round";
  var all=STU.strokes.slice();
  if(STU.cur)all.push(STU.cur);
  all.forEach(function(it){
    var p=it.p;if(!p||p.length<2)return;
    var col2=it.c==="__BG__"?(STU.img?null:"#ffffff"):it.c;
    if(!col2)return; /* ممحاة فوق صورة = مستحيلة بدون بكسل، نتجاهلها */
    x.strokeStyle=col2;x.fillStyle=col2;x.lineWidth=Math.max(2,it.w*2.2);
    if(p.length===2){x.beginPath();x.arc(p[0],p[1],x.lineWidth/2,0,6.3);x.fill();return}
    x.beginPath();x.moveTo(p[0],p[1]);
    for(var i=2;i<p.length-1;i+=2)x.lineTo(p[i],p[i+1]);
    x.stroke();
  });
}
function stuOut(saveOnly){
  var c=$("wpScv");if(!c)return;
  var t=document.createElement("canvas");t.width=288;t.height=288;
  var x=t.getContext("2d");
  if(STU.img){x.drawImage(STU.img,0,0,288,288)}
  else{x.clearRect(0,0,288,288)}
  x.drawImage(c,0,0,288,288);
  var d=STU.img?t.toDataURL("image/jpeg",.78):t.toDataURL("image/png");
  if(d.length>500000){toast("الملصق كبير — قلل التفاصيل");return}
  if(saveOnly){
    var a=myStickers();a.push({d:d,t:Date.now()});saveMyst(a);
    toast("اتحفظ في ملصقاتي ✓");closeStudio();openSheet("myst");
  }else{
    msg({kind:"sticker",text:"",img:d});closeStudio();
  }
}

/* ============================================================
   الأغاني — مكتبة التفوق جوه الغرفة 🎵
   ============================================================ */
var songsCache=[];
async function songsList(){
  if(SONG.list&&Date.now()-SONG.at<180000)return SONG.list;
  var sn=await FS.getDocs(FS.query(FS.collection(db,"songs"),FS.limit(80)));
  SONG.list=sn.docs.map(function(d){return Object.assign({id:d.id},d.data())})
    .filter(function(s){return s&&s.title&&!s.hidden&&((s.parts|0)>0||s.url)});
  SONG.at=Date.now();
  songsCache=SONG.list;
  return SONG.list;
}
async function songPlay(s){
  if(!s)return;
  if(SONG.cur&&SONG.cur.id===s.id&&SONG.au&&!SONG.loading){
    if(SONG.au.paused){try{await SONG.au.play()}catch(_){}}else{try{SONG.au.pause()}catch(_){}}
    updateMini();refreshSongsTab();return;
  }
  vpStop(true);songStop();
  var tok=++SONG.tok; /* بعد الإيقاف — عشان guard الصحيح */
  SONG.loading=true;updateMini(s);
  try{
    var url;
    if(s.url){url=s.url}
    else{
      var n=Math.max(0,s.parts|0);
      var sn=await FS.getDocs(FS.query(FS.collection(db,"songParts"),FS.where("sid","==",s.id)));
      if(tok!==SONG.tok)return;
      var parts=sn.docs.map(function(d){return d.data()}).filter(function(x){return x&&typeof x.d==="string"})
        .sort(function(a,b){return (a.k|0)-(b.k|0)});
      if(parts.length<n)throw new Error("الأغنية ناقصة على السيرفر ("+parts.length+" من "+n+" جزء)");
      var dec=function(x){var b=atob(String(x).replace(/\s+/g,"")),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
      var blob=new Blob(parts.map(function(x){return dec(x.d)}),{type:s.mime||"audio/mpeg"});
      if(!blob.size)throw new Error("ملف الأغنية فارغ");
      url=URL.createObjectURL(blob);
    }
    if(tok!==SONG.tok){if(url&&url.indexOf("blob:")===0){try{URL.revokeObjectURL(url)}catch(_){}}return}
    SONG.au=new Audio();SONG.au.src=url;SONG.au.preload="auto";
    SONG.au.volume=Math.min(1,SONG.vol/100);
    SONG.au.onplay=updateMini;SONG.au.onpause=updateMini;
    SONG.au.onerror=function(){if(SONG.cur){toast("مشكلة في ملف الأغنية — جرب غير واحدة");songStop(true)}};
    SONG.cur=s;SONG.url=url;SONG.loading=false;
    var p=SONG.au.play();
    if(p&&p.catch)p.catch(function(){toast("اضغط ▶ لتشغيل الأغنية")});
    updateMini();refreshSongsTab();
  }catch(e){
    console.warn(e);
    if(tok===SONG.tok){SONG.loading=false;updateMini();toast((e&&e.message)||"فشل تحميل الأغنية")}
  }
}
function songPause(){if(SONG.au&&!SONG.au.paused){try{SONG.au.pause()}catch(_){}updateMini()}}
function songStop(hard){
  SONG.tok++;
  if(SONG.au){try{SONG.au.pause()}catch(_){}SONG.au=null}
  if(SONG.url&&SONG.url.indexOf("blob:")===0){try{URL.revokeObjectURL(SONG.url)}catch(_){}}
  SONG.url="";SONG.cur=null;SONG.loading=false;
  var m=$("wpMini");if(m){m.classList.remove("show")}
  if(!hard)refreshSongsTab();
}
function updateMini(st){
  var m=$("wpMini");if(!m)return;
  if(!SONG.cur){m.classList.remove("show");m.innerHTML="";return}
  m.classList.add("show");
  var playing=SONG.au&&!SONG.au.paused&&!SONG.loading;
  m.innerHTML='<button type="button" class="mb" id="wpMiniT">'+(SONG.loading?'⏳':(playing?"❚❚":"▶"))+'</button>'+
  '<b>'+E((st&&st.title)||SONG.cur.title||"أغنية")+(SONG.loading?" — جاري التحميل…":"")+'</b>'+
  '<input type="range" min="0" max="100" value="'+SONG.vol+'" id="wpMiniV" title="مستوى الصوت">'+
  '<button type="button" class="mx" id="wpMiniX" title="إيقاف">■</button>';
  $("wpMiniT").onclick=function(){
    if(!SONG.au)return;
    if(SONG.au.paused){try{SONG.au.play()}catch(_){}}else{try{SONG.au.pause()}catch(_){}}
  };
  $("wpMiniX").onclick=function(){songStop()};
  $("wpMiniV").oninput=function(){
    SONG.vol=+this.value;
    try{localStorage.setItem("wp_song_vol",String(SONG.vol))}catch(_){}
    if(SONG.au)SONG.au.volume=Math.min(1,SONG.vol/100);
  };
}
function refreshSongsTab(){
  if(sheetMode!=="songs")return;
  var body=$("wpBody");
  if(body&&body.querySelector("[data-si]"))renderSongs(body);
}
function renderSongs(body){
  if(SONG.list&&Date.now()-SONG.at<180000){paintSongs(body);return}
  body.innerHTML='<div class="wp-empty"><span class="wp-spin"></span> جاري تحميل مكتبة الأغاني…</div>';
  songsList().then(function(){
    if(sheetMode==="songs")paintSongs(body);
  }).catch(function(e){
    console.warn(e);
    if(sheetMode==="songs")body.innerHTML='<div class="wp-empty">فشل تحميل الأغاني — اتصل بالإنترنت وحاول تاني 🎵</div>';
  });
}
function paintSongs(body){
  var list=songsCache;
  if(!list.length){body.innerHTML='<div class="wp-empty">مفيش أغاني متاحة — الأدمن بيضيفها من مكتبة الأغاني 🎵</div>';return}
  body.innerHTML=list.map(function(s,i){
    var on=SONG.cur&&SONG.cur.id===s.id;
    var ic=on&&SONG.loading?"⏳":(on&&SONG.au&&!SONG.au.paused?"⏸":"🎵");
    return '<button type="button" class="wp-song'+(on?' on':'')+'" data-si="'+i+'"><span class="si">'+ic+'</span>'+
    '<span style="flex:1;min-width:0;text-align:start"><b>'+E(s.title)+'</b><small>'+E(s.artist||"مكتبة التفوق")+'</small></span><span class="sp">'+(on?"❚❚":"▶")+'</span></button>';
  }).join("");
  body.querySelectorAll("[data-si]").forEach(function(b){
    b.onclick=function(){var s=songsCache[+b.getAttribute("data-si")];if(s)songPlay(s)};
  });
}

/* ============================================================
   واجهة اللعب — شريط الكلمة / المؤقّت / اللاعبين / الأدوات
   ============================================================ */
function topUI(){
  var rd=$("wpRd");if(rd)rd.textContent="ج "+(R.round||1)+"/"+(R.maxRounds||3);
  wordStrip();
}
function wordStrip(){
  var el=$("wpWord");if(!el||!R)return;
  var dr=R.drawer===ME.uid,sv=(R.solved||{})[ME.uid];
  if(R.status==="choosing"){
    var p=R.players[R.drawer]||{name:"؟"};
    el.innerHTML='<span class="wtxt small">'+(dr?"اختار كلمة تتكلم بيها ✍️":E(p.name)+" بيختار كلمة…")+'</span>'+
    '<span class="lbl">الجولة '+E(R.round||1)+' من '+E(R.maxRounds||3)+'</span>';
  }else if(R.status==="drawing"){
    if(dr){
      el.innerHTML='<span class="wtxt">'+E(secret||"…")+'</span><span class="lbl">✏️ دي كلمتك — ارسمها! ('+E((canon(secret)||"").length||0)+' حروف)</span>';
    }else{
      var h=R.hint||"",boxes="",i;
      if(h){
        boxes=h.split(" ").map(function(t){
          if(t==="")return '<span class="lbox gap"></span>';
          if(t==="_")return '<span class="lbox">&nbsp;</span>';
          return '<span class="lbox rev">'+E(t)+'</span>';
        }).join("");
      }else{
        var n=Math.min(R.wlen||0,22);
        for(i=0;i<n;i++)boxes+='<span class="lbox">&nbsp;</span>';
      }
      el.innerHTML=boxes+(sv?'<span class="lbl">🔒 خمّنتها! استنى باقي اللاعبين</span>':'<span class="lbl">'+E(R.wlen||0)+' حروف · الرسام: '+E((R.players[R.drawer]||{}).name||"؟")+'</span>');
    }
  }else if(R.status==="reveal"){
    el.innerHTML='<span class="wtxt">'+E(R.answer||"…")+'</span><span class="lbl">الكلمة كانت دي</span>';
  }else el.innerHTML="";
}
function tmUI(n){
  var t=$("wpTm"),ti=$("wpTmI");if(!t||!ti||!R)return;
  if(R.status==="reveal"){ti.textContent="⏭";t.style.setProperty("--p",100);t.classList.remove("low");var o2=$("wpCnt");if(o2)o2.textContent="";return}
  var l=0,pct=100;
  if(R.status==="drawing"&&R.startedAt){
    var tot=R.secs*1000;
    l=Math.max(0,Math.ceil((ms(R.startedAt)+tot-n)/1000));
    pct=l/Math.max(1,R.secs)*100;
  }else if(R.status==="choosing"&&R.choiceAt){
    l=Math.max(0,15-Math.floor((n-ms(R.choiceAt))/1000));
    pct=(l/15)*100;
  }
  ti.textContent=l;
  t.style.setProperty("--p",Math.max(0,Math.min(100,pct)));
  t.classList.toggle("low",R.status==="drawing"&&l<=10&&l>0);
  var o=$("wpCnt");if(o)o.textContent=l;
}
function plUI(){
  var el=$("wpPl");if(!el||!R||!R.players)return;
  var ids=Object.keys(R.players).sort(function(a,b){return ((R.scores||{})[b]||0)-((R.scores||{})[a]||0)});
  el.innerHTML=ids.map(function(u){
    var p=R.players[u],sv=(R.solved||{})[u];
    return '<div class="wp-p'+(present(u)?' on':'')+(u===ME.uid?' me':'')+(u===R.drawer?' dr':'')+(sv?' ok':'')+'">'+
    avatar(u,p,46)+(u===R.drawer?'<span class="bd">✏️</span>':sv?'<span class="bd">✅</span>':(u===R.host?'<span class="bd">👑</span>':''))+
    '<b>'+E(p.name)+'</b><i>'+((R.scores||{})[u]||0)+'</i></div>';
  }).join("");
}
function toolsUI(){
  var el=$("wpTools");if(!el||!R)return;
  var dr=R.drawer===ME.uid&&R.status==="drawing";
  el.classList.toggle("show",!!dr);
  if(!dr)return;
  var sw=COLORS.map(function(c){return '<button type="button" class="wp-sw'+(pen.c===c?' sel':'')+'" data-c="'+c+'" style="background:'+c+'"></button>'}).join("");
  var er='<button type="button" class="wp-ic'+(pen.c===ERASER?' sel':'')+'" data-a="eraser" title="ممحاة">🧽</button>';
  var sz=SIZES.map(function(s){return '<button type="button" class="wp-sz'+(pen.w===s&&pen.c!==ERASER?' sel':'')+'" data-w="'+s+'"><span style="width:'+Math.max(4,Math.round(3+s/3))+'px;height:'+Math.max(4,Math.round(3+s/3))+'px"></span></button>'}).join("");
  var ops='<button type="button" class="wp-ic" data-a="undo" title="تراجع">↩️</button><button type="button" class="wp-ic" data-a="redo" title="إعادة">↪️</button><button type="button" class="wp-ic" data-a="clear" title="مسح الكل">🗑️</button>';
  el.innerHTML='<div class="wp-trow">'+sw+er+'</div><div class="wp-trow">'+sz+ops+'</div>';
  el.onclick=function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.dataset.c){pen.c=b.dataset.c;toolsUI()}
    else if(b.dataset.w){pen.w=+b.dataset.w;if(pen.c===ERASER)pen.c=COLORS[0];toolsUI()}
    else if(b.dataset.a==="eraser"){pen.c=ERASER;pen.w=Math.max(pen.w,24);toolsUI()}
    else if(b.dataset.a==="undo"){var l=items[items.length-1];if(l){undone.push(l);marker("undo",l.s)}}
    else if(b.dataset.a==="redo"){var s2=undone.pop();if(s2)reEmit(s2)}
    else if(b.dataset.a==="clear"){undone=[];marker("clear",0)}
  };
}
function marker(t,u){
  if(!R)return;
  var s=nextS++;
  FS.setDoc(FS.doc(db,"wpRooms",code,"strokes",R.idx+"_"+s+"_0"),{turn:R.idx,s:s,k:0,t:t,u:u,p:[],c:"",w:0}).catch(function(e){console.warn(e)});
}
function reEmit(st){
  if(!R||!st)return;
  var parts=st.p||[];if(parts.length<2)return;
  var s=nextS++,k=0,idx=0;
  while(idx<parts.length){
    var start=Math.max(0,idx-((idx>0)?2:0));
    var seg=parts.slice(start,start+380);
    (function(seg2,kk){
      FS.setDoc(FS.doc(db,"wpRooms",code,"strokes",R.idx+"_"+s+"_"+kk),{turn:R.idx,s:s,k:kk,c:st.c,w:st.w,p:seg2}).catch(function(e){console.warn(e)});
    })(seg,k);
    k++;idx=start+380;
  }
}
function ovUI(){
  var o=$("wpOv");if(!o||!R)return;
  var dr=R.drawer===ME.uid,pn=(R.players[R.drawer]||{}).name||"؟";
  if(R.status==="choosing"){
    if(dr&&wordOpts&&!picked){
      o.innerHTML='<div class="cap">اختار كلمة للرسم</div><div class="wp-cnt" id="wpCnt">15</div>'+
      '<div class="wp-opts">'+wordOpts.map(function(w,i){return '<button data-i="'+i+'">'+E(w)+'</button>'}).join("")+'</div>';
      o.onclick=function(e){var b=e.target.closest("[data-i]");if(b)pick(wordOpts[+b.getAttribute("data-i")])};
      o.classList.add("show");
    }else if(dr){o.innerHTML='<div class="big">✍️</div><div class="cap">جاري اختيار كلمتك…</div>';o.classList.add("show");o.onclick=null}
    else{o.innerHTML='<div class="big">✏️</div><div class="cap">'+E(pn)+' بيختار كلمة…</div><div style="opacity:.75;font-size:13px">استنى شوية 👀</div>';o.classList.add("show");o.onclick=null}
  }else if(R.status==="reveal"){
    var sol=R.solved||{};
    var g=Object.keys(sol).map(function(u){return '<div>'+E((R.players[u]||{}).name||"؟")+' <b>+'+E(sol[u])+'</b></div>'}).join("");
    var sc=R.scores||{},top=Object.keys(sc).sort(function(a,b){return (sc[b]||0)-(sc[a]||0)}).slice(0,3);
    var st=top.map(function(u,i){return (["🥇","🥈","🥉"][i]||(i+1)+"º ")+E((R.players[u]||{}).name||"؟")+" "+(sc[u]||0)}).join(" · ");
    o.innerHTML='<div style="opacity:.85;font-size:13px">الكلمة كانت</div><div class="wp-rv">'+E(R.answer||"…")+'</div>'+
    (g?'<div class="wp-gain">'+g+'</div>':'<div style="opacity:.8;font-size:13px">محدش خمّنها 😅</div>')+
    (st?'<div style="font-size:12px;color:#b8b0e8">'+st+'</div>':'')+
    '<button class="wp-btn" id="wpSave" style="padding:8px 16px;font-size:13px">💾 احفظ الرسمة</button>';
    o.classList.add("show");o.onclick=null;
    var sv=$("wpSave");if(sv)sv.onclick=saveImg;
  }else{o.classList.remove("show");o.innerHTML="";o.onclick=null}
}
function saveImg(ev){
  if(ev)ev.stopPropagation();
  var c=$("wpCv");if(!c)return;
  var t=document.createElement("canvas");t.width=c.width;t.height=c.height;
  var x=t.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,t.width,t.height);x.drawImage(c,0,0);
  t.toBlob(function(b){
    var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="drawing-"+code+".png";
    document.body.appendChild(a);a.click();a.remove();
  });
}
function inputUI(){
  var i=$("wpTx");if(!i||!R)return;
  var dr=R.drawer===ME.uid,sv=(R.solved||{})[ME.uid];
  var rl=$("wpRole");
  if(rl){
    if(R.status==="drawing"&&dr)rl.innerHTML='<span class="rk">✏️ أنت الرسام — ارسم واكتب في الشات عادي</span>';
    else if(R.status==="drawing"&&sv)rl.innerHTML='<span class="rk g">🔒 خمّنتها! رسائلك صارت سرية بينك وبين الرسام</span>';
    else rl.innerHTML="";
  }
  if(R.status==="drawing"&&!dr&&!sv)i.placeholder="اكتب تخمينك هنا…";
  else if(R.status==="drawing"&&dr)i.placeholder="اكتب رسالة للاعبين…";
  else i.placeholder="اكتب رسالة…";
}

/* ============================================================
   الكانفاس — رسم لحظي فوري (أول نقطة تتبعت لحظة اللمس + دفعات كل 100ms)
   ============================================================ */
function initCanvas(){
  var c=$("wpCv");if(!c)return;
  var sizeIt=function(){
    var r=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    var w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
    if(w&&h&&(c.width!==w||c.height!==h)){c.width=w;c.height=h;paintedN=0;paintedS=-1;paintedP=0;paint()}
  };
  sizeIt();
  if(window.ResizeObserver){try{new ResizeObserver(sizeIt).observe(c)}catch(_){}}
  var pos=function(e){
    var r=c.getBoundingClientRect();
    return[Math.max(0,Math.min(1000,Math.round((e.clientX-r.left)/r.width*1000))),Math.max(0,Math.min(1000,Math.round((e.clientY-r.top)/r.height*1000)))];
  };
  var canDraw=function(){return R&&R.status==="drawing"&&R.drawer===ME.uid};
  c.onpointerdown=function(e){
    if(!canDraw())return;e.preventDefault();
    try{c.setPointerCapture(e.pointerId)}catch(_){}
    var p=pos(e);
    cur={s:nextS++,k:0,c:pen.c,w:pen.w,p:[p[0],p[1]],sent:0,timer:setInterval(flush,50)};
    flush();            /* ← أول نقطة بتوصل للاعبين فورًا */
    paintSoon();
  };
  c.onpointermove=function(e){
    if(!cur)return;
    var ev=e.getCoalescedEvents?e.getCoalescedEvents():[e];if(!ev.length)ev=[e];
    ev.forEach(function(x){
      var p=pos(x),n=cur.p.length;
      if(Math.abs(p[0]-cur.p[n-2])+Math.abs(p[1]-cur.p[n-1])>=1)cur.p.push(p[0],p[1]);
    });
    paintSoon();
  };
  var up=function(){if(!cur)return;clearInterval(cur.timer);flush();cur=null};
  c.onpointerup=up;c.onpointercancel=up;c.onpointerleave=up;
}
function flush(){
  if(!cur||!R)return;
  if(cur.p.length<=cur.sent&&cur.k>0)return;
  var from=Math.max(0,cur.sent-2),all=cur.p.slice(from);
  if(cur.sent===0&&all.length===2)all=all.concat(all);
  while(all.length){
    var part=all.splice(0,380);
    var id=R.idx+"_"+cur.s+"_"+cur.k;
    FS.setDoc(FS.doc(db,"wpRooms",code,"strokes",id),{turn:R.idx,s:cur.s,k:cur.k,c:cur.c,w:cur.w,p:part}).catch(function(e){console.warn("stroke",e)});
    cur.k++;
    if(all.length)all.unshift(part[part.length-2],part[part.length-1]);
  }
  cur.sent=cur.p.length;
}
function paintSoon(){if(rafP)return;rafP=requestAnimationFrame(function(){rafP=0;paintLocal()})}
function paintLocal(){paintFull()}
function paintFull(){
  var c=$("wpCv");if(!c)return;
  var x=c.getContext("2d"),W=c.width,Hh=c.height;
  x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,W,Hh);x.fillStyle="#fff";x.fillRect(0,0,W,Hh);
  x.lineCap="round";x.lineJoin="round";
  var i;
  for(i=0;i<items.length;i++)drawStroke(x,W,Hh,items[i]);
  if(cur)drawStroke(x,W,Hh,{c:cur.c,w:cur.w,p:cur.p});
  paintedN=items.length;paintedS=items.length?items[items.length-1].s:-1;
  paintedP=items.length?items[items.length-1].p.length:0;
}
function paintIncremental(){
  var c=$("wpCv");if(!c)return;
  var x=c.getContext("2d"),W=c.width,Hh=c.height;
  x.lineCap="round";x.lineJoin="round";
  if(paintedN>0&&items[paintedN-1]&&items[paintedN-1].p.length>paintedP){
    drawStroke(x,W,Hh,items[paintedN-1]); /* chunk جديد وصل لنفس الخط */
  }
  for(var i=paintedN;i<items.length;i++)drawStroke(x,W,Hh,items[i]);
  paintedN=items.length;
  paintedS=items.length?items[items.length-1].s:-1;
  paintedP=items.length?items[items.length-1].p.length:0;
  if(cur)drawStroke(x,W,Hh,{c:cur.c,w:cur.w,p:cur.p});
}
function paint(){paintFull()}
function drawStroke(x,W,Hh,it){
  var p=it.p;if(!p||p.length<2)return;
  x.strokeStyle=it.c;x.fillStyle=it.c;
  x.lineWidth=Math.max(1.2,it.w/1000*W);
  var X=function(v){return v/1000*W},Y=function(v){return v/1000*Hh};
  if(p.length===2||(p.length===4&&p[0]===p[2]&&p[1]===p[3])){
    x.beginPath();x.arc(X(p[0]),Y(p[1]),x.lineWidth/2,0,6.3);x.fill();return;
  }
  x.beginPath();x.moveTo(X(p[0]),Y(p[1]));
  var i;
  for(i=2;i<p.length-3;i+=2){
    var mx=(X(p[i])+X(p[i+2]))/2,my=(Y(p[i+1])+Y(p[i+3]))/2;
    x.quadraticCurveTo(X(p[i]),Y(p[i+1]),mx,my);
  }
  for(;i<p.length-1;i+=2)x.lineTo(X(p[i]),Y(p[i+1]));
  x.stroke();
}

/* ============================================================
   دورة اللعب — اختيار/رسم/كشف/نهاية (انتقال تلقائي آمن)
   ============================================================ */
function nextTurn(d){
  var order=d.order||[],total=(d.maxRounds||3)*order.length,i=d.idx+1;
  while(i<total){var u=order[i%order.length];if(d.players[u]&&present(u))break;i++}
  if(i>=total)return{status:"ended",endedAt:FS.serverTimestamp()};
  return{status:"choosing",idx:i,round:Math.floor(i/order.length)+1,drawer:order[i%order.length],solved:{},wh:"",wlen:0,hint:"",answer:"",choiceAt:FS.serverTimestamp(),startedAt:null,revealAt:null};
}
async function trans(st,fn){
  var idx=R.idx;
  try{
    await FS.runTransaction(db,async function(t){
      var s=await t.get(rref()),d=s.data();
      if(!d||d.idx!==idx||d.status!==st)return;
      var p=fn(d);p.updatedAt=FS.serverTimestamp();
      t.update(rref(),p);
    });
  }catch(e){console.warn("trans",e)}
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
function toReveal(){
  if(revDone===R.idx)return;revDone=R.idx;
  if(R.drawer===ME.uid)myDraws++;
  trans("drawing",function(d){return{status:"reveal",revealAt:FS.serverTimestamp()}});
}
async function pick(w){
  if(picked)return;picked=true;secret=w;
  var mask=w.split("").map(function(ch){return ch===" "?" ":"_"}).join(" ");
  rv=shuffle(w.split("").map(function(c,i){return c===" "?-1:i}).filter(function(i){return i>=0}));
  topUI();
  try{
    await FS.setDoc(FS.doc(db,"wpRooms",code,"secret",ME.uid),{w:w,idx:R.idx});
    var c=canon(w),salt=code+":"+R.idx;
    await trans("choosing",function(){return{status:"drawing",wh:H(c,salt),wlen:c.length,hint:mask,startedAt:FS.serverTimestamp()}});
  }catch(e){console.warn(e);picked=false;warnOnce(e,"فشل اختيار الكلمة — حاول تاني")}
}
function hints(){
  if(!secret||!R.startedAt)return;
  var el=now()-ms(R.startedAt),tot=R.secs*1000,lvl=el>tot*.7?2:el>tot*.4?1:0;
  if(secret.length<4)lvl=Math.min(lvl,1);
  if(lvl>hintLvl){
    hintLvl=lvl;
    var show=rv.slice(0,lvl);
    var h=secret.split("").map(function(c,i){return c===" "?" ":(show.indexOf(i)>-1?c:"_")}).join(" ");
    FS.updateDoc(rref(),{hint:h,updatedAt:FS.serverTimestamp()}).catch(function(){});
  }
}

/* ---------- شاشة النهاية + المكافآت ---------- */
function endUI(){
  var el=$("wpLob");if(!el||!R)return;
  var sc=R.scores||{};
  var ids=Object.keys(sc).sort(function(a,b){return (sc[b]||0)-(sc[a]||0)});
  var nm=function(u){return (R.players[u]||{}).name||"؟"};
  var pod="",cls={0:"p1",1:"p2",2:"p3"},medal={0:"🥇",1:"🥈",2:"🥉"};
  [1,0,2].forEach(function(r){
    if(!ids[r])return;
    pod+='<div class="pod '+cls[r]+'">'+avatar(ids[r],R.players[ids[r]]||{},r===0?58:46)+
    '<div class="nm">'+medal[r]+" "+E(nm(ids[r]))+(ids[r]===ME.uid?" (أنت)":"")+'</div><div class="sc">'+(sc[ids[r]]||0)+' نقطة</div><div class="bar">'+(sc[ids[r]]||0)+'</div></div>';
  });
  var rest=ids.slice(3).map(function(u,i){
    return '<div class="wp-rank"><span style="font-size:15px;width:22px;text-align:center;color:#b8b0e8">'+(i+4)+'</span>'+
    avatar(u,R.players[u]||{},36)+'<b>'+E(nm(u))+(u===ME.uid?" (أنت)":"")+'</b><strong>'+(sc[u]||0)+'</strong></div>';
  }).join("");
  var host=R.host===ME.uid;
  el.innerHTML='<div style="text-align:center;font-size:44px;line-height:1.2;padding-top:2px">🏆</div>'+
  '<div class="wp-card"><div class="wp-pod">'+(pod||"")+'</div>'+(rest||"")+'</div>'+
  (host?'<button class="wp-btn gold big" id="wpAgain">🔄 العب تاني بنفس الغرفة</button>':'<div style="text-align:center;color:#8f87c0;font-size:12.5px">استنى المضيف يعيد الماتش…</div>')+
  '<button class="wp-btn" id="wpOut" style="padding:12px">خروج من الغرفة</button>';
  $("wpOut").onclick=leave;
  if(host)$("wpAgain").onclick=function(){
    var u={status:"lobby",idx:-1,round:0,drawer:"",solved:{},scores:{},wh:"",hint:"",answer:"",updatedAt:FS.serverTimestamp()};
    Object.keys(R.players).forEach(function(k){u["players."+k+".ready"]=false});
    FS.updateDoc(rref(),u).catch(function(e){warnOnce(e)});
  };
}
function payEnd(){
  if(!R||R.status!=="ended"||!ME)return;
  var key=code+":"+ms(R.endedAt||0);
  if(paidKey===key)return;paidKey=key;
  try{
    var sc=R.scores||{},top=Object.keys(sc).sort(function(a,b){return (sc[b]||0)-(sc[a]||0)});
    var mine=sc[ME.uid]||0,rank=top.indexOf(ME.uid);
    var coins=15+Math.min(50,Math.round(mine/4));
    if(rank===0)coins+=50;else if(rank===1)coins+=25;else if(rank===2)coins+=10;
    if(typeof window.lfAdd==="function")window.lfAdd(coins,"ارسم وخمّن 🎨");
    if(typeof window.sfx==="function"){try{window.sfx("win")}catch(_){}}
    if(typeof window.confetti==="function"){try{window.confetti()}catch(_){}}
    try{navigator.vibrate&&navigator.vibrate([80,60,80])}catch(_){}
    /* إحصائيات دائمة (زي الكود القديم) */
    var dref=FS.doc(db,"dgStats",ME.uid);
    FS.getDoc(dref).then(function(s2){
      var d=s2.exists()?s2.data():{};
      var xp=(d.xp||0)+20+(rank===0?40:0),lvl=Math.max(1,Math.floor(xp/150)+1);
      var titles=["مبتدئ","رسام شاطر","مخمّن محترف","فنان الغرفة","أسطورة الألوان"];
      var last=Array.isArray(d.last)?d.last.slice(-4):[];
      last.push({at:Date.now(),score:mine,rank:(rank<0?top.length:rank+1)});
      return FS.setDoc(dref,{uid:ME.uid,name:ME.name,games:(d.games||0)+1,wins:(d.wins||0)+(rank===0?1:0),
        drawn:(d.drawn||0)+(myDraws||0),correct:(d.correct||0)+(myCorrects||0),
        best:Math.max(d.best||0,mine),xp:xp,level:lvl,title:titles[Math.min(4,lvl-1)]||titles[4],
        ach:Array.isArray(d.ach)?d.ach:[],last:last,updatedAt:FS.serverTimestamp()});
    }).catch(function(){});
  }catch(_){}
}

/* ---------- خروج ---------- */
async function leave(){
  if(!R){exit();return}
  if(screen==="game"&&!confirm("تخرج من الماتش؟"))return;
  var c=code,r=R;
  try{
    var rest=Object.keys(r.players).filter(function(u){return u!==ME.uid});
    if(!rest.length){await FS.deleteDoc(FS.doc(db,"wpRooms",c))}
    else{
      var u={updatedAt:FS.serverTimestamp()};u["players."+ME.uid]=FS.deleteField();
      if(r.host===ME.uid){var nh=rest.filter(present)[0]||rest[0];u.host=nh;u.hostName=(r.players[nh]||{}).name||"مضيف"}
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

/* ---------- التصدير ---------- */
window.WP={open:open,leave:leave,version:WP_V,joinCode:async function(c){
  if(!(await init()))return;
  me();css();
  root();
  await join(String(c||""));
},_t:{canon:canon,H:H,buildItems:buildItems}};
})();
