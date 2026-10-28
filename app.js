/** التطبيق الرئيسي — يستورد الوحدات من firebase / utils / exams-helpers / ui-helpers */
import {
  initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updatePassword, setPersistence, browserLocalPersistence,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, deleteField,
  collection, onSnapshot, query, where, orderBy, limit, writeBatch, serverTimestamp,
  arrayUnion, arrayRemove, FieldPath, startAfter, documentId, firebaseConfig
} from "./firebase.js";
import {
  $, esc, pad, dur, pctOf, gcount, norm, tsMs, fmt, tms,
  SUBJECTS, subName, subColor, DOMAIN, MAX_ATTEMPTS, ADMIN_UID,
  XP_TITLES, xpTitle, xpLevel, xpProgress,
  FAD_PAGE_SIZE, FAD_PAGE_MAX, LEADERBOARD_LIMIT, CHATS_LIST_LIMIT,
  BOOKS_PDF_MAX_BYTES, MODE_FILE_MAX_BYTES, EC_KEEP_DAYS, TOAST_DEFAULT_MS, STUDENTS_TABLE_PAGE
} from "./utils.js";
import { emptyBox, pill, loadingCard, skeletonRows } from "./ui-helpers.js";
import { FEATURE_CATALOG, LIMITS } from "./config.js";
import { logger } from "./logger.js";
import { EXTERNAL_GAMES } from "./games-registry.js";
import {
  parseQs, serialize, normalizeAr, tokenSet, extractNums,
  essayScoreOne, essayScore, SAMPLE, mulberry, shuf, buildOrder,
  LET, LETTERS
} from "./exams-helpers.js";

/** كتالوج الميزات — من config.js (مصدر واحد) */
const FEATURES = FEATURE_CATALOG;

function isAsmManager(){if(S.isAdmin)return true;const roles=(S.profile&&S.profile.roles)||[];if(roles.includes("asm"))return true;if(S.site&&Array.isArray(S.site.asmManagers)&&S.user&&S.site.asmManagers.includes(S.user.uid))return true;return false;}

let __cmtUnsub=null;
let __fadUnsub=null,__galUnsub=null;
function ensureFadaye7Listen(){
  if(__fadUnsub||!db)return;
  __fadUnsub=onSnapshot(query(collection(db,"fadaye7"),orderBy("createdAt","desc"),limit(S.fadLimit||FAD_PAGE_SIZE)),s=>{
    S.fadOffline=s.metadata.fromCache&&!s.docs.length;
    /* ترتيب: الدفعة الأجدد فوق خالص · جوّه الدفعة الأقدم الأول (seq) */
    const arr=s.docs.map(d=>({id:d.id,...d.data()}));
    const gt={};
    arr.forEach(f=>{const k=f.batchId||f.id;const t=tsMs(f.createdAt);gt[k]=Math.max(gt[k]||0,t)});
    arr.sort((a,b)=>{
      const ka=a.batchId||a.id,kb=b.batchId||b.id;
      if(ka===kb)return ((a.seq!=null?a.seq:0)-(b.seq!=null?b.seq:0));
      return (gt[kb]||0)-(gt[ka]||0);
    });
    S.fadaye7All=arr;S.fadBusy=0;
    /* المكرر مش بيظهر — نسخة واحدة بس (الأجدد) */
    const seenF=new Set();
    S.fadaye7=arr.filter(f=>{const u=f.url,k=f.fp||(u&&u.length>200?u.length+"|"+u.slice(0,40)+u.slice(-40):u);if(!k)return true;if(seenF.has(k))return false;seenF.add(k);return true});
    if(S.view==="fadaye7")scheduleRender();
  },err=>{console.warn("fad",err);S.fadOffline=true;if(S.view==="fadaye7")scheduleRender()});
  window.__fadUnsub=function(){try{if(typeof __fadUnsub==="function")__fadUnsub()}catch(_){} __fadUnsub=null;window.__fadUnsub=null};
}
function ensureBooksListen(){
  if(window.__bookUnsub||!db)return;
  window.__bookUnsub=onSnapshot(query(collection(db,"books"),limit(50)),s=>{
    S.books=s.docs.map(d=>({id:d.id,...d.data()}));
    try{localStorage.setItem("books_cache_v1",JSON.stringify(S.books.slice(0,40).map(b=>({id:b.id,title:b.title,url:b.url,subject:b.subject}))))}catch(_){}
    if(S.view==="books"||(S.view==="admin"&&S.tab==="books"))scheduleRender();
  },err=>console.warn("books",err));
}
function ensureAsmsListen(){
  if(window.__asmUnsub||!db)return;
  window.__asmUnsub=onSnapshot(query(collection(db,"assessments"),limit(300)),s=>{
    const all=s.docs.map(d=>({id:d.id,...d.data()}));
    if(S.isAdmin)S.asms=all.sort((a,b)=>tms(b)-tms(a));
    else S.asms=all.filter(a=>a.published).sort((a,b)=>tms(b)-tms(a));
    if(S.view==="asmList"||S.view==="asm"||S.view==="home"||(S.view==="admin"&&S.tab==="asms"))scheduleRender();
  },err=>console.warn("asms",err));
}

function ensureGalleriesListen(){
  if(__galUnsub||!db)return;
  const gRef=collection(db,"galleries");
  const gQuery=S.isAdmin?query(gRef,limit(800)):query(gRef,where("status","==","approved"),limit(400));
  __galUnsub=onSnapshot(gQuery,s=>{
    S.galleries=s.docs.map(d=>({id:d.id,...d.data()}));
    if((S.view==="admin"&&S.tab==="tanagha")||S.view==="gallery"||S.view==="tanagha")scheduleRender();
  },err=>console.warn("gal",err));
  window.__galUnsub=function(){try{if(typeof __galUnsub==="function")__galUnsub()}catch(_){} __galUnsub=null;window.__galUnsub=null};
}
function ensureCommentsListen(){
  if(__cmtUnsub||!db)return;
  try{
    __cmtUnsub=onSnapshot(query(collection(db,"comments"),orderBy("createdAt","desc"),limit(120)),s=>{
      S.comments=s.docs.map(d=>({id:d.id,...d.data()}));
      // تحديث خفيف: لو في صفحة تعليقات فقط
      if(S.view==="fadaye7"||S.view==="gallery")scheduleRender();
    },err=>{
      console.warn("comments",err);
      // بدون index: استعلام أبسط
      if(__cmtUnsub){try{__cmtUnsub()}catch(_){}}
      __cmtUnsub=onSnapshot(query(collection(db,"comments"),limit(120)),s=>{
        S.comments=s.docs.map(d=>({id:d.id,...d.data()}));
        if(S.view==="fadaye7"||S.view==="gallery")scheduleRender();
      },e=>console.warn("comments2",e));
    });
  }catch(e){console.warn(e)}
}
function commentsFor(type,id){
  return (S.comments||[]).filter(c=>c.targetType===type&&c.targetId===id)
    .sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
}
function commentsBlock(type,id){
  if(type==="avatar"||type==="profile")return ""; // ممنوع التعليق على صورة الملف الشخصي
  const all=commentsFor(type,id);
  const roots=all.filter(c=>!c.parentId);
  const kids=pid=>all.filter(c=>c.parentId===pid);
  const row=(c,isReply)=>{
    const canDel=S.isAdmin||(S.user&&c.uid===S.user.uid);
    return `<div class="cmt ${isReply?"reply":""}">
      <span class="cn">${esc(c.name||"طالب")}</span>
      <span class="mut" style="font-size:11px">${fmt(c.createdAt)}</span>
      <div class="ct">${esc(c.text||"")}</div>
      <div style="display:flex;gap:10px;align-items:center">
        ${!isReply?`<span class="cr" data-act="replyComment" data-type="${type}" data-id="${id}" data-parent="${c.id}">رد</span>`:""}
        ${canDel?`<span class="cr" style="color:var(--bad)" data-act="delComment" data-cid="${c.id}">حذف</span>`:""}
      </div>
    </div>`;
  };
  let html=roots.map(c=>row(c,false)+kids(c.id).map(k=>row(k,true)).join("")).join("")||`<div class="mut" style="font-size:13px">مفيش تعليقات — كن أول واحد</div>`;
  const replyTo=S.commentReply&&S.commentReply.targetId===id&&S.commentReply.targetType===type?S.commentReply:null;
  return `<div class="cmt-box">
    <b style="font-size:13px">💬 تعليقات (${all.length})</b>
    ${html}
    ${replyTo?`<div class="mut" style="font-size:12px;margin-top:6px">رد على تعليق… <a href="#" data-act="cancelReply">إلغاء</a></div>`:""}
    <div class="cmt-form">
      <input id="cmt_${type}_${id}" type="text" maxlength="400" placeholder="${replyTo?"اكتب ردك…":"اكتب تعليق…"}">
      <button class="btn sm" data-act="postComment" data-type="${type}" data-id="${id}">إرسال</button>
    </div>
  </div>`;
}

const passPill = r => r.passMark>0 ? (r.passed?pill("ناجح","g"):pill("راسب","r")) : "";


const THEME_MODES=["auto","light","dark","morning","golden","comfort","nightread"];
const THEME_ICON={auto:"◐",light:"☀",dark:"☾",morning:"🌤",golden:"👑",comfort:"🍃",nightread:"📖"};
const THEME_LABEL={auto:"تلقائي",light:"فاتح",dark:"داكن",morning:"صباحي",golden:"ذهبي 👑",comfort:"راحة العين",nightread:"قراءة ليلية"};
function getThemeMode(){try{const m=localStorage.getItem("theme_mode");if(localStorage.getItem("theme_chosen")==="1"||(m&&m!=="auto"))return m||"golden";return "golden"}catch(_){return "golden"}}
function setThemeMode(mode,chosen){
  if(chosen){try{localStorage.setItem("theme_mode",mode);localStorage.setItem("theme_chosen","1")}catch(_){}}
  const root=document.documentElement;
  if(mode==="auto"){
    root.removeAttribute("data-theme");
  }else{
    root.setAttribute("data-theme",mode==="light"?"light":mode);
  }
  try{document.querySelector('meta[name="theme-color"]').content={golden:"#0B0A07",dark:"#0C1716",nightread:"#12151A",morning:"#2563EB",comfort:"#6B8F71"}[mode]||"#0B5D57"}catch(_){}
}
function cycleTheme(){
  const cur=getThemeMode();
  const i=THEME_MODES.indexOf(cur);
  const next=THEME_MODES[(i+1)%THEME_MODES.length];
  setThemeMode(next,true);
  try{document.querySelectorAll('.tg[data-act="theme"]').forEach(b=>b.textContent=THEME_ICON[next]||"🎨")}catch(_){}
  try{if(S.user&&!S.isAdmin&&typeof updateDoc==="function")updateDoc(doc(db,"students",S.user.uid),{theme:next}).catch(()=>{})}catch(_){}
  toast("الوضع: "+(THEME_LABEL[next]||next),true);
}
// apply on boot
try{setThemeMode(getThemeMode())}catch(_){}


const __trail={};
function trailR(k,ms){
  const n=Date.now(),last=__trail[k]||0;
  if(n-last>=ms){__trail[k]=n;scheduleRender();return}
  if(__trail["t"+k])return;
  __trail["t"+k]=setTimeout(()=>{__trail["t"+k]=0;__trail[k]=Date.now();scheduleRender()},ms-(n-last));
}
const S = {asms:[],asm:null,editingAsm:null,logins:{},sq:"",starts:[],examsLoaded:false,user:null,isAdmin:false,profile:null,site:{maintenance:false,message:""},exams:[],results:[],students:[],alerts:[],
  myList:[],attempts:{},view:"loading",tab:"dash",subject:null,cur:null,last:null,review:null,studentId:null,editing:null,
  adminLogin:false,mode:"login",error:"",filter:"",unread:0,unreadAlerts:0,registering:false,taps:[],
  qb:null,qbSub:null,qbChatSub:null,qbChat:[],board:[],notifs:[],unreadNotif:0,activity:[],activityLoaded:false,
  fadaye7:[],suspicious:[],adminRooms:[],adminConvs:[]};
// زيارة تانية: مفيش انتظار. أول زيارة: 200ms بس
const splashUntil=Date.now()+2400;

const vis=e=>!e.publishAt||Date.now()>=e.publishAt;
const todayKey=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const dkey=sec=>{const d=new Date(sec*1000);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const lastDays=n=>{const a=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);a.push({k:d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()),l:d.getDate()})}return a};
const device=()=>{const u=navigator.userAgent;const os=/Android/i.test(u)?"Android":/iPhone|iPad|iPod/i.test(u)?"iOS":/Windows/i.test(u)?"Windows":/Mac/i.test(u)?"Mac":/Linux/i.test(u)?"Linux":"?";const br=/Edg\//.test(u)?"Edge":/OPR\//.test(u)?"Opera":/SamsungBrowser/.test(u)?"Samsung":/Chrome\//.test(u)?"Chrome":/Firefox\//.test(u)?"Firefox":/Safari\//.test(u)?"Safari":"?";return os+" · "+br+(/FB_IAB|FBAN|FBAV|Messenger/i.test(u)?" (داخل فيسبوك)":"")};
let myIp=null;
async function getIp(){if(myIp!==null)return myIp;try{const c=new AbortController(),t=setTimeout(()=>c.abort(),4000);const r=await fetch("https://api.ipify.org?format=json",{signal:c.signal});clearTimeout(t);myIp=(await r.json()).ip||""}catch(e){myIp=""}return myIp}
let subs=[],timer=null,hb=null,ansT=null,db,auth,storage,lastLeave=0;

const configured = !firebaseConfig.apiKey.startsWith("PASTE");
let messaging=null, __msgMod=null;
if(configured){
  const app=initializeApp(firebaseConfig);
  auth=getAuth(app);window.__fbApp=app;try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(e){db=initializeFirestore(app,{})}
  try{setPersistence(auth,browserLocalPersistence).catch(function(){})}catch(_){}getIp();
  // FCM اختياري — لو فشل ميمنعش تشغيل المنصة
  (async()=>{
    try{
      __msgMod=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
      if(!(await __msgMod.isSupported()))return;
      messaging=__msgMod.getMessaging(app);
      __msgMod.onMessage(messaging,payload=>{
        const d=(payload&&payload.data)||{};
        const tt=payload?.notification?.title||d.title||"التفوق";
        const b=payload?.notification?.body||d.body||"";
        if(!(d.type==="dm"&&S.view==="chatThread")&&d.type!=="call")toast(tt+": "+b,true);
        if(payload?.data?.type==="call"){try{startRingtone()}catch(_){}}
      });
    }catch(e){console.warn("messaging optional",e)}
  })();
}

/* ---------- أدوات ---------- */
function toast(msg,gold,ms){const t=$("#toast");if(!t)return;t.textContent=msg;t.className=(gold?"gold ":"")+"show";clearTimeout(toast.h);toast.h=setTimeout(()=>t.className=gold?"gold":"",ms!=null?ms:TOAST_DEFAULT_MS)}
function updTitle(){const n=S.unread+S.unreadAlerts;document.title=(n?`(${n}) `:"")+"التفوق"}
function authErr(e){
  const c=e&&e.code||"";
  if(c.includes("email-already-in-use")) return "الرقم ده مسجل قبل كده. سجّل دخول بدل إنشاء حساب.";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")||c.includes("invalid-email")) return "الرقم أو كلمة السر غلط.";
  if(c.includes("weak-password")) return "كلمة السر لازم تبقى 6 حروف أو أرقام على الأقل.";
  if(c.includes("network")) return "مفيش اتصال بالإنترنت. جرّب تاني.";
  if(c.includes("too-many")) return "محاولات كتير. استنى شوية وجرّب تاني.";
  return "حصلت مشكلة. جرّب تاني.";
}
function stopSubs(){
  subs.forEach(u=>{try{u()}catch(_){}});
  subs=[];
  // module-level lazy listeners
  try{if(typeof __fadUnsub==="function"){__fadUnsub();__fadUnsub=null}}catch(_){}
  try{if(typeof __galUnsub==="function"){__galUnsub();__galUnsub=null}}catch(_){}
  try{if(typeof __cmtUnsub==="function"){__cmtUnsub();__cmtUnsub=null}}catch(_){}
  // window-level listeners
  ["__dmUnsub","__dmMetaUnsub","__grpUnsub","__grpListUnsub","__chatsUnsub","__openRoomsUnsub","__callListen","__fadUnsub","__galUnsub","__cmtUnsub","__bookUnsub","__asmUnsub"].forEach(k=>{
    try{if(typeof window[k]==="function"){window[k]();window[k]=null}}catch(_){}
  });
  try{if(S.qbSub){S.qbSub();S.qbSub=null}}catch(_){}
  try{if(S.qbChatSub){S.qbChatSub();S.qbChatSub=null}}catch(_){}
  try{focusStopIv()}catch(_){}
  try{if(S.mathG&&S.mathG._iv){clearTimeout(S.mathG._iv);S.mathG._iv=0}}catch(_){}
  try{clearInterval(timer);clearInterval(hb)}catch(_){}
}
function stopViewSubs(){
  // لما تخرج من شات/جروب/غرف — قفل اللي مش محتاجينه (من غير ما تقفل exams/profile)
  try{if(window.__dmUnsub&&S.view!=="chatThread"){window.__dmUnsub();window.__dmUnsub=null}}catch(_){}
  try{if(window.__grpUnsub&&S.view!=="groupThread"){window.__grpUnsub();window.__grpUnsub=null}}catch(_){}
  try{if(window.__dmMetaUnsub&&S.view!=="chatThread"){window.__dmMetaUnsub();window.__dmMetaUnsub=null}}catch(_){}
  try{if(window.__grpListUnsub&&S.view!=="chatList"&&S.view!=="chatThread"&&S.view!=="groupThread"){window.__grpListUnsub();window.__grpListUnsub=null}}catch(_){}
  // timers per-view
  try{if(S.view!=="focus")focusStopIv()}catch(_){}
  try{if(S.view!=="mathg"&&S.mathG&&S.mathG._iv){clearTimeout(S.mathG._iv);S.mathG._iv=0}}catch(_){}
}

/* ---------- الوضع الليلي ---------- */
const isDark = () => document.documentElement.dataset.theme==="dark";
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem("theme",t)}catch(e){}document.querySelectorAll('.tg[data-act="theme"]').forEach(b=>b.textContent=t==="dark"?"☀":"☾")}
try{setThemeMode(getThemeMode())}catch(_){}
const themeBtn = () => `<button class="tg" data-act="theme" aria-label="تغيير وضع الألوان" title="تغيير وضع الألوان">${THEME_ICON[getThemeMode()]||"🎨"}</button>`;

/* ---------- إحصائيات الأدمن ---------- */
function stats(){
  const R=(Array.isArray(S.results)?S.results:[]).filter(r=>r.total>0);
  const avg=a=>a.length?Math.round(a.reduce((s,r)=>s+pctOf(r),0)/a.length):0;
  const wp=R.filter(r=>r.passMark>0);
  const per=S.exams.map(e=>{const rs=R.filter(r=>r.examId===e.id),w=rs.filter(r=>r.passMark>0);
    const ts=rs.filter(r=>r.secs>0);
    return {e,n:rs.length,avg:avg(rs),secs:ts.length?Math.round(ts.reduce((a,r)=>a+r.secs,0)/ts.length):null,pass:w.length?Math.round(w.filter(r=>r.passed).length/w.length*100):null}});
  const qm={};
  R.forEach(r=>{const e=S.exams.find(x=>x.id===r.examId);if(!e||!r.ans)return;
    e.questions.forEach((q,i)=>{if(q.fun)return;const k=e.id+"#"+i;const m=qm[k]||(qm[k]={q:q.q,exam:e.title,n:0,c:0});m.n++;if(r.ans[i]===q.a)m.c++})});
  const ql=Object.values(qm).filter(m=>m.n>=3).map(m=>({...m,p:Math.round(m.c/m.n*100)})).sort((a,b)=>a.p-b.p);
  return {R,avg:avg(R),passRate:wp.length?Math.round(wp.filter(r=>r.passed).length/wp.length*100):null,per,hard:ql.slice(0,3),easy:ql.slice(-3).reverse()};
}

function board(){
  const by={};S.results.forEach(r=>{(by[r.uid]=by[r.uid]||{uid:r.uid,name:r.name,rs:[]}).rs.push(r)});
  const L=Object.values(by).map(x=>{const good=x.rs.filter(r=>pctOf(r)>=50&&r.secs>0);
    return {uid:x.uid,name:x.name,n:x.rs.length,avg:Math.round(x.rs.reduce((a,r)=>a+pctOf(r),0)/x.rs.length),fast:good.length?Math.round(good.reduce((a,r)=>a+r.secs,0)/good.length):null}});
  return {top:L.slice().sort((a,b)=>b.avg-a.avg||b.n-a.n).slice(0,10),act:L.slice().sort((a,b)=>b.n-a.n).slice(0,5),fast:L.filter(x=>x.fast!=null).sort((a,b)=>a.fast-b.fast).slice(0,3)};
}

/* ---------- الجلسة والاشتراكات ---------- */
function groupAttempts(list){
  const m={};list.forEach(r=>{(m[r.examId]=m[r.examId]||[]).push(r)});
  Object.values(m).forEach(a=>a.sort((x,y)=>(x.attempt||1)-(y.attempt||1)));
  return m;
}

function detectClientType(){
  try{
    if(window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone)return "app";
  }catch(_){}
  return "web";
}

(function(){
  function wmText(){const p=S.profile||{};return ((p.name||"").split(" ")[0]||"")+" · "+String(p.phone||"").replace(/(\d{3})\d{4}(\d{4})/,"$1****$2")}
  window.ensureWatermark=function(){
    try{
      let w=document.getElementById("wm");
      const t=wmText();
      if(!w){w=document.createElement("div");w.id="wm";document.body.appendChild(w)}
      if(w.dataset.t!==t){
        w.dataset.t=t;let h="";
        for(let r=0;r<9;r++)for(let c=0;c<3;c++)h+=`<span style="top:${r*13-4}%;right:${c*36-8+(r%2)*14}%">${esc(t)}</span>`;
        w.innerHTML=h;
      }
    }catch(_){}
  };
  const on=()=>{if(document.body.classList.contains("gal-secure"))document.body.classList.add("gal-blur")};
  const off=()=>document.body.classList.remove("gal-blur");
  document.addEventListener("visibilitychange",()=>{document.hidden?on():off()});
  window.addEventListener("blur",on);window.addEventListener("focus",off);
  window.addEventListener("beforeprint",on);window.addEventListener("afterprint",off);
  document.addEventListener("keyup",e=>{if(e.key==="PrintScreen"&&document.body.classList.contains("gal-secure")){on();try{navigator.clipboard.writeText("")}catch(_){}setTimeout(off,2500)}});
})();

function prefetchSections(){
  if(window.__prefetched||!S.user||S.isAdmin)return;
  window.__prefetched=1;
  const run=(f)=>{try{f()}catch(e){console.warn("prefetch",e)}};
  setTimeout(()=>{
    if(featState("books"))run(ensureBooksListen);
    if(featState("chat"))run(listenMyChats);
  },1200);
  const c=navigator.connection;
  const fast=!c||(!c.saveData&&/4g|5g|wifi/.test(c.effectiveType||"4g"));
  if(fast&&tanaghaState(S.profile)==="approved"){
    setTimeout(()=>{
      if(featState("fadaye7"))run(ensureFadaye7Listen);
      if(featState("tanagha"))run(ensureGalleriesListen);
    },5000);
  }
}
function mergePresence(){
  try{
    if(!S.presence||!Array.isArray(S.students))return;
    S.students.forEach(st=>{const p=S.presence[st.id];if(p){st.lastSeenAt=p.lastSeenAt;st.lastClientAt=p.lastSeenAt;if(p.clientType)st.clientType=p.clientType}});
  }catch(_){}
}
async function pingClientPresence(force){
  if(!S.user||S.isAdmin)return;
  const __n=Date.now(),__lim=force?25000:60000;
  if(window.__lastPing&&__n-window.__lastPing<__lim){if(force){clearTimeout(window.__pingRetry);window.__pingRetry=setTimeout(()=>pingClientPresence(true),__lim-(__n-window.__lastPing)+300)}return}
  window.__lastPing=__n;
  try{
    const t=detectClientType();
    await setDoc(doc(db,"presence",S.user.uid),{
      clientType:t,
      lastSeenAt:serverTimestamp(),
      online:true,
      away:!!document.hidden,
      where:deleteField()
    },{merge:true});
  }catch(e){console.warn("presence",e)}
}
// نبض تواجد كل 40 ثانية
if(!window.__presenceIv){
  window.__presenceIv=setInterval(()=>{try{if(!document.hidden)pingClientPresence()}catch(_){}},300000);
  document.addEventListener("visibilitychange",()=>{
    pingClientPresence(true);
  });
}


async function addXP(amount, reason){
  if(!S.user||S.isAdmin||!amount)return;
  try{
    const ref=doc(db,"students",S.user.uid);
    const snap=await getDoc(ref);
    const cur=snap.exists()?snap.data():{};
    {const _u=cur.xpDay===lfDayKey(0)?(cur.xpToday||0):0;amount=Math.min(amount,Math.max(0,XP_DAY_CAP-_u));if(amount<=0){toast("وصلت للحد اليومي من XP 🌙");return}}
    const xp=(cur.xp||0)+amount;
    const level=xpLevel(xp);
    const title=xpTitle(xp).name;
    const badges=new Set(cur.badges||[]);
    if(xp>=50)badges.add("المجتهد");
    if(xp>=150)badges.add("المثابر");
    if(reason==="exam_full")badges.add("درجة كاملة");
    if(reason==="first_exam")badges.add("أول امتحان");
    if(reason==="game_win")badges.add("فوز لعبة");
    await lfSetXp(ref,{xp,level,title,badges:[...badges],lastXpAt:serverTimestamp()},cur,amount);
    if(S.profile){S.profile.xp=xp;S.profile.level=level;S.profile.title=title;S.profile.badges=[...badges]}
    toast(`+${amount} XP · ${xpTitle(xp).emoji} ${title}`,true);
  }catch(e){console.warn("xp",e);if(String(e&&e.code||"").includes("permission")&&!window.__xpRulesNotice){window.__xpRulesNotice=true;toast("حفظ XP والستريك متوقف لحمايتهما من التلاعب؛ يلزم تحقق خادمي موثوق لاستئنافهما.",true)}}
}
async function touchStreak(){
  if(!S.user||S.isAdmin)return;
  try{
    const ref=doc(db,"students",S.user.uid);
    const snap=await getDoc(ref);
    const cur=snap.exists()?snap.data():{};
    const today=new Date();today.setHours(0,0,0,0);
    const key=today.toISOString().slice(0,10);
    if(cur.lastStreakDay===key)return;
    let streak=1;
    if(cur.lastStreakDay){
      const prev=new Date(cur.lastStreakDay+"T00:00:00");
      const diff=Math.round((today-prev)/86400000);
      if(diff===1)streak=(cur.streak||0)+1;
    }
    const badges=new Set(cur.badges||[]);
    if(streak>=7)badges.add("7 أيام متتالية");
    const dailyXp=cur.lastStreakDay===key?0:5;
    const xp=(cur.xp||0)+dailyXp;
    await lfSetXp(ref,{streak,lastStreakDay:key,xp,level:xpLevel(xp),title:xpTitle(xp).name,badges:[...badges],lastSeenAt:serverTimestamp()},cur,dailyXp);
    if(S.profile){
      S.profile.streak=streak;S.profile.xp=xp;S.profile.level=xpLevel(xp);
      S.profile.title=xpTitle(xp).name;S.profile.badges=[...badges];
    }
    if(dailyXp)toast(`🔥 ستريك ${streak} يوم · +${dailyXp} XP`,true);
  }catch(e){console.warn("streak",e);if(String(e&&e.code||"").includes("permission")&&!window.__xpRulesNotice){window.__xpRulesNotice=true;toast("حفظ XP والستريك متوقف لحمايتهما من التلاعب؛ يلزم تحقق خادمي موثوق لاستئنافهما.",true)}}
}


/* ===== v43: إشعارات حقيقية عبر وسيط Cloudflare (مستقلة تماماً عن فتح/قفل الأقسام) ===== */
function pushBase(){
  const u=(S.site&&S.site.pushUrl)||"";
  return /^https:\/\//i.test(u)?u.replace(/\/+$/,""):"";
}
async function pushCall(path,body){
  const base=pushBase();if(!base||!auth||!auth.currentUser)return null;
  try{
    const t=await auth.currentUser.getIdToken();
    const r=await fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+t},body:JSON.stringify(body||{}),keepalive:true});
    return await r.json().catch(()=>({}));
  }catch(_){return null}
}
const __pushLast={};
function sendPush(body,throttleKey,throttleMs){
  try{
    if(!pushBase())return;
    if(throttleKey){const n=Date.now();if(n-(__pushLast[throttleKey]||0)<(throttleMs||20000))return;__pushLast[throttleKey]=n}
    pushCall("/send",body);
  }catch(_){}
}
async function pushSubscribe(token){
  try{
    if(!token||!pushBase())return;
    const k="push_sub_"+(S.user?S.user.uid:"")+"_"+token.slice(-12);
    if(localStorage.getItem(k))return;
    const r=await pushCall("/subscribe",{token});
    if(r&&r.ok)localStorage.setItem(k,"1");
  }catch(_){}
}
function pushStateText(){
  try{
    if(!("Notification" in window))return "المتصفح ده مش بيدعم الإشعارات (على الآيفون لازم تضيف المنصة للشاشة الرئيسية)";
    const p=Notification.permission;
    const v=(S.site&&S.site.vapidKey)?"المفتاح محفوظ":"المفتاح لسه ما اتحفظش";
    const t=(S.profile&&S.profile.fcmToken)?"الجهاز مسجّل ✓":"الجهاز مش مسجّل";
    return (p==="granted"?"الإذن ممنوح ✓":p==="denied"?"الإذن مرفوض ✗ (فعّله من إعدادات المتصفح)":"الإذن لسه ما اتطلبش")+" · "+v+" · "+t;
  }catch(_){return ""}
}
function maybeAskPush(){
  if(!S.user||S.isAdmin)return;
  setTimeout(async()=>{
    try{
      if(!S.user||!("Notification" in window)||Notification.permission!=="default")return;
      if(!(S.site&&S.site.vapidKey))return;
      const k="push_asked_"+S.user.uid;
      if(localStorage.getItem(k))return;
      localStorage.setItem(k,"1");
      const ok=await uiDialog({title:"الإشعارات",icon:"🔔",msg:"تحب توصلك إشعارات المكالمات والرسائل والامتحانات الجديدة حتى لو التطبيق مقفول؟",ok:"تفعيل"});
      if(ok){const r=await registerFcmToken(true);toast(r.ok?"الإشعارات اشتغلت ✓":r.msg,true)}
    }catch(_){}
  },9000);
}
async function registerFcmToken(userGesture){
  const R=(ok,msg)=>({ok,msg});
  if(!S.user)return R(false,"سجّل دخول الأول");
  try{
    if(!("Notification" in window)||!("serviceWorker" in navigator))return R(false,"المتصفح ده مش بيدعم الإشعارات (على الآيفون ضيف المنصة للشاشة الرئيسية أولاً)");
    if(!__msgMod){
      try{__msgMod=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js")}catch(_){return R(false,"مقدرتش أحمّل مكتبة الإشعارات — تأكد من الإنترنت")}
    }
    if(!(await __msgMod.isSupported()))return R(false,"الجهاز/المتصفح ده مش بيدعم إشعارات FCM");
    if(!messaging){
      try{messaging=__msgMod.getMessaging(window.__fbApp)}catch(e){return R(false,"فشل تهيئة الإشعارات: "+(e&&e.message||e))}
    }
    let perm=Notification.permission;
    if(perm==="default"){
      if(!userGesture)return R(false,"محتاج إذن");
      perm=await Notification.requestPermission();
    }
    if(perm!=="granted")return R(false,perm==="denied"?"الإذن مرفوض — فعّله من إعدادات الموقع في المتصفح":"ما وافقتش على الإذن");
    const vapid=(S.site&&S.site.vapidKey)||window.__VAPID_KEY||"";
    if(!vapid)return R(false,"مفتاح VAPID لسه ما اتحفظش في إعدادات الأدمن");
    const reg=await navigator.serviceWorker.ready;
    const token=await __msgMod.getToken(messaging,{vapidKey:vapid,serviceWorkerRegistration:reg});
    if(!token)return R(false,"فايربيز ما رجّعش توكن");
    await setDoc(doc(db,"students",S.user.uid),{fcmToken:token,fcmUpdatedAt:serverTimestamp()},{merge:true});
    if(S.profile)S.profile.fcmToken=token;
    pushSubscribe(token);
    return R(true,"تم تسجيل الجهاز للإشعارات ✓");
  }catch(e){
    console.warn("fcm token",e);
    const m=String((e&&(e.code||e.message))||e);
    if(/applicationServerKey|invalid|vapid/i.test(m))return R(false,"مفتاح VAPID غلط — انسخه تاني من Firebase → Cloud Messaging → Web Push certificates");
    if(/permission-blocked|denied/i.test(m))return R(false,"الإذن مرفوض من المتصفح");
    if(/permission-denied|insufficient/i.test(m))return R(false,"القواعد مش بتسمح بحفظ التوكن — انشر firestore.rules");
    return R(false,"فشل التسجيل: "+m.slice(0,120));
  }
}


// من Service Worker عند ضغط إشعار مكالمة
if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("message",ev=>{
    const d=ev.data||{};
    if(d.type==="INCOMING_CALL"&&d.callId){
      S._pendingCall=d.callId;
      try{handlePendingCall()}catch(_){}
    }
  });
}

if(!window.__dmTypingDelegated){
  window.__dmTypingDelegated=true;
  document.addEventListener("input",e=>{
    if(e.target&&e.target.id==="dmIn"&&S.view==="chatThread")signalDmTyping();
  },true);
}
async function startSession(u){
  stopSubs();
  S.user=u;
  // ضمانات — أي listener فشل مش هيخلي البيانات undefined
  if(!Array.isArray(S.exams))S.exams=[];
  if(!Array.isArray(S.books))S.books=[];
  if(!Array.isArray(S.asms))S.asms=[];
  if(!Array.isArray(S.fadaye7))S.fadaye7=[];
  if(!Array.isArray(S.board))S.board=[];
  if(!Array.isArray(S.notifs))S.notifs=[];
  if(!S.attempts||typeof S.attempts!=="object")S.attempts={};

  // عرض فوري من الكاش المحلي قبل ما Firestore يرد
  try{
    const raw=localStorage.getItem("exams_cache_v1");
    if(raw&&(!S.exams||!S.exams.length)){
      const cached=JSON.parse(raw);
      if(Array.isArray(cached)&&cached.length){
        S.exams=cached;S.examsLoaded=true;
      }
    }
  }catch(_){}
  try{
    const rawB=localStorage.getItem("books_cache_v1");
    if(rawB&&(!S.books||!S.books.length)){
      const cached=JSON.parse(rawB);
      if(Array.isArray(cached)&&cached.length)S.books=cached;
    }
  }catch(_){}


  S.isAdmin=u.uid===ADMIN_UID;S.adminLogin=false;S.error="";
  // بوابة الصيانة قبل أي كتابة أو listener
  if(S.site&&S.site.maintenance&&!S.isAdmin){
    try{await signOut(auth)}catch(_){}
    S.user=null;S.profile=null;S.view="auth";S.adminLogin=false;
    stopSubs();
    toast("المنصة تحت الصيانة — للأدمن فقط");
    render(true);
    return;
  }
  pingClientPresence();
  try{touchStreak()}catch(_){}try{lfInit()}catch(_){}
  try{syncCallAvailability()}catch(_){}
  try{registerFcmToken()}catch(_){}
  try{maybeAskPush()}catch(_){}
  S.aiCfg=null;
  if(S.isAdmin)try{subs.push(onSnapshot(doc(db,"config","ai"),s=>{S.aiCfg=s.exists()?s.data():null;applyAiCfg()},e=>console.warn("aicfg",e)))}catch(_){}
  try{handlePendingCall()}catch(_){}

  try{
    if(S.isAdmin){
      S.view="admin";S.tab="dash";
      try{autoRebuildBoard()}catch(_){}
      let f1=true,f2=true,f3=true,__resT=0,__altT=0,__staT=0,__exaT=0;
      subs.push(onSnapshot(query(collection(db,"exams"),limit(400)),s=>{
      S.exams=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>tms(b)-tms(a));
      try{if(S.exams.length)localStorage.setItem("exams_cache_v1",JSON.stringify(S.exams.map(e=>({id:e.id,title:e.title,subject:e.subject,minutes:e.minutes,passMark:e.passMark,published:e.published}))))}catch(_){}
      if(S.view==="admin"&&["dash","exams","editExam"].includes(S.tab))trailR("exa",1500)}));
      subs.push(onSnapshot(query(collection(db,"results"),orderBy("createdAt","desc"),limit(200)),s=>{
        if(!f1)s.docChanges().forEach(c=>{if(c.type==="added"&&c.doc.data().createdAt){const r=c.doc.data();toast(`${r.name} امتحن ${r.examTitle} (محاولة ${r.attempt||1}) وجاب ${r.score}/${r.total}`,true);if(S.tab!=="results"){S.unread++;updTitle()}}});
        f1=false;S.results=s.docs.map(d=>({id:d.id,...d.data()}));
        if(S.view==="admin"&&["dash","results","students","live"].includes(S.tab))trailR("res",2000)
      }));
      // assessments: ensureAsmsListen عند تبويب التقييمات

      // lazy fadaye7 + books: عند فتح التبويب
      subs.push(onSnapshot(query(collection(db,"studentsPrivate"),limit(500)),s=>{S.priv={};s.docs.forEach(d=>S.priv[d.id]=d.data());(S.students||[]).forEach(x=>Object.assign(x,S.priv[x.id]||{}))},e=>console.warn("priv",e)));setTimeout(()=>{try{lfMigrate()}catch(_){}},4000);
      subs.push(onSnapshot(query(collection(db,"students"),limit(500)),s=>{
        S.students=s.docs.map(d=>({id:d.id,...d.data(),...((S.priv||{})[d.id]||{})})).sort((a,b)=>tms(b)-tms(a));
        mergePresence();
        try{
          if(!window.__tgSeen){window.__tgSeen=new Set(S.students.filter(x=>x.tanaghaAccess==="pending").map(x=>x.id))}
          else S.students.forEach(x=>{if(x.tanaghaAccess==="pending"&&!window.__tgSeen.has(x.id)){window.__tgSeen.add(x.id);toast("🆕 طالب جديد محتاج موافقة التناغه: "+(x.name||""),true)}});
        }catch(_){}
        if(S.view!=="admin")return;
        if(S.tab==="students"){
          try{const tb=document.getElementById("stbl");if(tb){tb.innerHTML=studentsTable();return}}catch(_){}
        }
        if(S.tab==="dash"||S.tab==="live")trailR("sta",4000)
      }));
      let __prT=0;
      subs.push(onSnapshot(query(collection(db,"presence"),limit(400)),s=>{
        S.presence={};s.docs.forEach(d=>{S.presence[d.id]=d.data()});
        mergePresence();
        if(S.view==="admin"&&["live","dash"].includes(S.tab))trailR("pr",10000)
      },err=>console.warn("presence",err)));
      subs.push(onSnapshot(query(collection(db,"alerts"),orderBy("createdAt","desc"),limit(200)),s=>{
        if(!f2)s.docChanges().forEach(c=>{if(c.type==="added"&&c.doc.data().createdAt){const a=c.doc.data();toast(`⚠ ${a.name} (${a.phone}) خرج من الامتحان: ${a.examTitle}`,true);if(S.tab!=="alerts"){S.unreadAlerts++;updTitle()}}});
        f2=false;S.alerts=s.docs.map(d=>({id:d.id,...d.data()}));
        if(S.view==="admin"&&S.tab==="alerts")trailR("alt",2000)
      }));
      subs.push(onSnapshot(query(collection(db,"starts"),limit(150)),s=>{
        if(!f3)s.docChanges().forEach(c=>{if(c.type==="added"){const a=c.doc.data();toast(`🟢 ${a.name||"طالب"} بدأ امتحان ${a.examTitle||""}`,true)}});
        f3=false;S.starts=s.docs.map(d=>({id:d.id,...d.data()}));
        if(S.view==="admin"&&S.tab==="live")trailR("sta",4000)
      }));
      subs.push(onSnapshot(query(collection(db,"activity"),orderBy("createdAt","desc"),limit(150)),s=>{
        S.activity=s.docs.map(d=>({id:d.id,...d.data()}));S.activityLoaded=true;
        if(S.view==="admin"&&S.tab==="activity")scheduleRender();
      },err=>console.warn("activity",err)));
      subs.push(onSnapshot(query(collection(db,"qb_rooms"),limit(100)),s=>{
        S.adminRooms=s.docs.map(d=>({id:d.id,code:d.id,...d.data()}));
        if(S.view==="admin"&&(S.tab==="activity"||S.tab==="live"))scheduleRender();
      },err=>console.warn("adminRooms",err)));
      subs.push(onSnapshot(query(collection(db,"conversations"),limit(50)),s=>{
        S.adminConvs=s.docs.map(d=>({id:d.id,...d.data()}));
        if(S.view==="admin"&&S.tab==="live")scheduleRender();
      },err=>console.warn("adminConvs",err)));
      const iv=setInterval(()=>{if(S.view==="admin"&&S.tab==="live")scheduleRender()},30000);subs.push(()=>clearInterval(iv));
    }else{
      const p=await getDoc(doc(db,"students",u.uid));
      S.profile=p.exists()?{name:"طالب",phone:"",...p.data()}:{name:"طالب",phone:""};if(!S.profile.name)S.profile.name="طالب";
      // دليل عام محدود بالأسماء فقط؛ لا نفتح قراءة جماعية لمجموعة students.
      try{
        const publicName=String(S.profile.name||"طالب").trim().slice(0,80)||"طالب";
        const pr=doc(db,"publicProfiles",u.uid),ps=await getDoc(pr);
        if(!ps.exists()||ps.data().name!==publicName)await setDoc(pr,{name:publicName,updatedAt:serverTimestamp()},{merge:true});
      }catch(e){console.warn("publicProfile",e)}
      S.view="home";S.examsLoaded=false;render(true);
      // رابط مباشر للغرفة: #room=CODE
      try{
        const h=(location.hash||"").replace(/^#/,"");
        const m=h.match(/^room=([A-Za-z0-9]+)/i);
        if(m){S._pendingRoom=m[1].toUpperCase();history.replaceState(null,"",location.pathname+location.search)}
        const qs=new URLSearchParams(location.search||"");
        const callQ=qs.get("call");
        if(callQ){S._pendingCall=callQ;qs.delete("call");const s=qs.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash)}
      }catch(_){}
      subs.push(onSnapshot(doc(db,"students",u.uid),s=>{
        if(s.exists()){
          const __np=s.data(),__op=S.profile;
          S.profile=__np;
          if(__np.theme&&!window.__thSync){window.__thSync=1;try{if(THEME_MODES.includes(__np.theme)&&__np.theme!==getThemeMode()){setThemeMode(__np.theme,true);scheduleRender()}else if(THEME_MODES.includes(__np.theme)){try{localStorage.setItem("theme_chosen","1")}catch(_){}}}catch(_){}}
          if(!window.__avMig&&__np.avatar&&String(__np.avatar).length>30000){window.__avMig=1;setTimeout(()=>{migrateAvatar(S.user.uid,__np.avatar).catch(()=>{})},3000)}
          const __keys=["tanaghaAccess","theme","name","xp","streak","level","title","badges","avatar","blocked","blockedUntil","blockReason","roles","chatName","note"];
          const __chg=!__op||__keys.some(k=>JSON.stringify(__op[k])!==JSON.stringify(__np[k]));
          if(__chg&&["home","me","profile","progress"].includes(S.view))
            scheduleRender();
        }
      }));
      // lazy: assessments / chats / fadaye7 / books / galleries عند فتح القسم فقط
      // (أول فتح = بروفايل + امتحانات فقط → أسرع)

      getIp().then(ip=>{
        updateDoc(doc(db,"students",u.uid),{lastLogin:serverTimestamp()}).catch(()=>{});setDoc(doc(db,"studentsPrivate",u.uid),{ip:ip||"",device:device(),updatedAt:serverTimestamp()},{merge:true}).catch(()=>{});
        let ok=true;try{const k="lg_"+u.uid,l=+localStorage.getItem(k)||0;if(Date.now()-l<1800000)ok=false;else localStorage.setItem(k,String(Date.now()))}catch(e){}
        if(ok)addDoc(collection(db,"students",u.uid,"logins"),{ip:ip||"",device:device(),screen:screen.width+"×"+screen.height,lang:navigator.language||"",tz:(Intl.DateTimeFormat().resolvedOptions().timeZone||""),createdAt:serverTimestamp()}).catch(()=>{});
      });
      
      let __resumeTried=false,__seenExams=null;
      const maybeResume=()=>{
        if(__resumeTried||!S.examsLoaded||!S.user)return;
        if(typeof S._resultsReady==="undefined")return;
        __resumeTried=true;
        tryResumeExam();
        // بعد التحميل: لو في رابط غرفة
        if(S._pendingRoom){
          const code=S._pendingRoom;S._pendingRoom=null;
          setTimeout(async()=>{
            try{
              const snap=await getDoc(doc(db,"qb_rooms",code));
              if(!snap.exists()){toast("الغرفة مش موجودة");return}
              const room=snap.data();
              if(room.players&&room.players[S.user.uid]){
                S.qb={mode:"friends",roomCode:code};qbListenRoom(code);return;
              }
              if(room.public&&room.status==="lobby"){
                await updateDoc(doc(db,"qb_rooms",code),{[`joinRequests.${S.user.uid}`]:{uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],at:Date.now()}});
                toast("اتبعت طلب دخول للغرفة");
                S.qb={mode:"friends",roomCode:code,waitingJoin:true};qbListenRoom(code);
              }else if(room.status==="lobby"){
                await updateDoc(doc(db,"qb_rooms",code),{[`players.${S.user.uid}`]:{uid:S.user.uid,name:S.profile.name.split(" ")[0],ready:false,score:0,correct:0,wrong:0,streak:0,bestStreak:0,away:false,seen:Date.now()}});
                S.qb={mode:"friends",roomCode:code};qbListenRoom(code);
              }else toast("الغرفة مش متاحة دلوقتي");
            }catch(e){toast("فشل دخول الغرفة من الرابط")}
          },400);
        }else{
          try{restoreNavState()}catch(_){}
        }
      };
      subs.push(onSnapshot(query(collection(db,"exams"),where("published","==",true)),s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.published).sort((a,b)=>tms(b)-tms(a));
        if(__seenExams){
          list.forEach(e=>{
            if(!__seenExams.has(e.id)&&vis(e)){
              S.unreadNotif=(S.unreadNotif||0)+1;
              toast("📢 امتحان جديد: "+e.title,true);
            }
          });
        }
        __seenExams=new Set(list.map(e=>e.id));
        S.examsLoaded=true;S.exams=list;if(["home","subject","exam","search","ai"].includes(S.view))scheduleRender();maybeResume();
        // بعد ما الامتحانات تستقر: التقييمات في الخلفية (مش على المسار الحرج)
        try{(window.requestIdleCallback||(f=>setTimeout(f,2500)))(function(){try{if(S.user&&!S.isAdmin){ensureAsmsListen();prefetchSections()}}catch(_){}})}catch(_){}
      },err=>{console.warn("exams",err);S.exams=Array.isArray(S.exams)?S.exams:[];S.examsLoaded=true;render();}));
      subs.push(onSnapshot(query(collection(db,"results"),where("uid","==",u.uid)),s=>{
        S.myList=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>tms(a)-tms(b));S.attempts=groupAttempts(S.myList);S._resultsReady=true;if(["home","progress","result","me"].includes(S.view))scheduleRender();maybeResume();syncMyLeaderboard();
      }));
      subs.push(onSnapshot(query(collection(db,"leaderboard"),orderBy("score","desc"),limit(LEADERBOARD_LIMIT)),s=>{
        S.board=s.docs.map(d=>({id:d.id,...d.data()}));
        if(S.board.length<3&&!S._boardFb){
          S._boardFb=1;
          getDocs(query(collection(db,"leaderboard"),orderBy("examsDone","desc"),limit(LEADERBOARD_LIMIT))).then(sn=>{
            if((S.board||[]).length<3){S.board=sn.docs.map(d=>({id:d.id,...d.data()}));if(S.view==="progress")scheduleRender()}
          }).catch(()=>{});
        }
        if(S.view==="progress")scheduleRender();
      },err=>console.warn("leaderboard",err)));
      subs.push(onSnapshot(query(collection(db,"notifications"),where("uid","==",u.uid),orderBy("createdAt","desc"),limit(30)),s=>{
        S.notifs=s.docs.map(d=>({id:d.id,...d.data()}));
        S.unreadNotif=(Array.isArray(S.notifs)?S.notifs:[]).filter(n=>!n.read).length+(S.unreadNotif>0&&!S.notifs.length?S.unreadNotif:0);
        // prefer count from docs when available
        S.unreadNotif=(Array.isArray(S.notifs)?S.notifs:[]).filter(n=>!n.read).length;
        if(S.view==="progress"||S.view==="home")scheduleRender();
      },err=>console.warn("notifs",err)));
    }
  }catch(e){
    console.error("startSession",e);
    if(!S.profile)S.profile={name:"طالب",phone:""};
    if(!S.view||S.view==="loading")S.view=S.isAdmin?"admin":"home";
  }
  render(true);
}

if(configured){
  onSnapshot(doc(db,"config","features"),s=>{S.features=s.exists()?s.data():{};
    if(S.user&&!S.isAdmin){try{syncFeatureAvailability()}catch(_){};scheduleRender()}
  },e=>console.warn("features",e));
  onSnapshot(doc(db,"config","site"),s=>{
    const d=s.exists()?s.data():{};
    const was=S.site.maintenance;
    S.site={maintenance:!!d.maintenance,message:d.message||"",announce:d.announce||"",announceOn:!!d.announceOn,aiUrl:d.aiUrl||"",aiKey:d.aiKey||"",aiProxy:d.aiProxy||"",vapidKey:d.vapidKey||"",turnUrl:d.turnUrl||"",pushUrl:d.pushUrl||"",resetPassUrl:d.resetPassUrl||"",booksUrl:d.booksUrl||"",turnUser:d.turnUser||"",turnCred:d.turnCred||"",cacheBust:d.cacheBust||0,appMode:d.appMode||"platform",modes:Array.isArray(d.modes)?d.modes:[]};
    S.siteRaw=d;applyAiCfg();
    if(S.user&&!S.isAdmin)try{syncFeatureAvailability()}catch(_){}
    // تحديث جماعي غير قسري: لا نمسح كاش المستخدم ولا نعيد تحميل الصفحة تلقائيًا.
    try{
      const bust=Number(S.site.cacheBust)||0;
      const done=Number(localStorage.getItem("cache_bust_done")||0);
      if(bust&&bust>done&&!(window.__busting)){
        window.__busting=true;
        localStorage.setItem("cache_bust_done",String(bust));
        toast("في تحديث جديد — حدّث الصفحة يدويًا عندما يناسبك.",true);
      }
    }catch(_){}

    // ثغرة: طالب كان داخل قبل الصيانة → اطلعه فورًا
    if(S.site.maintenance&&S.user&&!S.isAdmin){
      try{signOut(auth)}catch(_){}
      S.user=null;S.profile=null;S.isAdmin=false;S.view="auth";S.adminLogin=false;
      stopSubs();
      render(true);
      return;
    }
    if(S.view==="loading")return;
    if(S.view==="auth"&&was===S.site.maintenance)return;
    render();
  },()=>{S.site={maintenance:true,message:"في مشكلة مؤقتة. جرّب بعد شوية."};render()});
  // جلسة ثابتة: مفيش خروج غير لما الطالب يدوس «تسجيل خروج»
  let __authBoot=true;
  onAuthStateChanged(auth,u=>{
    if(S.registering)return;
    const run=()=>{
      try{
        if(u){
          if(S.site&&S.site.maintenance&&u.uid!==ADMIN_UID){
            try{signOut(auth)}catch(_){}
            stopSubs();S.user=null;S.isAdmin=false;S.profile=null;S.view="auth";S.adminLogin=false;
            render(true);return;
          }
          __authBoot=false;
          Promise.resolve(startSession(u)).catch(e=>{
            console.error(e);
            // حتى لو التحميل فشل — متخرجوش من الحساب
            S.user=u;S.profile=S.profile||{name:"طالب",phone:""};
            if(!S.view||S.view==="loading"||S.view==="auth")S.view="home";
            render(true);
          });
        }else{
          // أول مرة null بعد الإقلاع = مش مسجّل؛ بعد كده null = خرج فعلًا
          stopSubs();
          S.user=null;S.isAdmin=false;S.profile=null;S.myList=[];S.attempts={};
          S.view="auth";
          __authBoot=false;
          render(true);
        }
      }catch(e){
        console.error("auth run",e);
        if(u){
          S.user=u;S.profile=S.profile||{name:"طالب",phone:""};
          S.view="home";
        }else if(!S.user){
          S.view="auth";
        }
        render(true);
      }
    };
    const w=Math.max(0,splashUntil-Date.now());
    w>0?setTimeout(run,w):run();
  });
  // لو التحميل طول: متودّيش لشاشة الدخول لو في مستخدم
  setTimeout(function(){
    if(S.view==="loading"&&!S.user){
      S.view="auth";
      render(true);
    }
  },4000);
}else{S.site={maintenance:true,message:"المنصة تحت التعديل."};S.view="auth"}

/* ---------- العرض ---------- */
const app=$("#app");
try{/* لا نضع نص تحميل — الرندر الحقيقي بيجي من auth/home فوراً */}catch(_e){}

let __renderT=0;
function scheduleRender(force){
  clearTimeout(__renderT);
  __renderT=setTimeout(()=>render(!!force), force?0:120);
}

let __rendPend=false,__rendT=0;

/** مسح كاش الجهاز الحالي — مش بيمسح حساب ولا بيانات Firebase */
async function clearLocalSpeedCache(reason){
  const keep=["last_phone","theme","sw_v35_cleared"];
  try{
    const phone=localStorage.getItem("last_phone");
    const theme=localStorage.getItem("theme");
    const keys=[];
    for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
    keys.forEach(k=>{
      if(!k)return;
      if(k==="last_phone"||k==="theme")return;
      // امسح كاش المنصة فقط
      if(/^(exams_cache|books_cache|dmcache_|sw_v|lg_|__dm|eltaf)/i.test(k)||k.indexOf("dmcache_")==0||k.indexOf("exams_cache")==0||k.indexOf("books_cache")==0)
        try{localStorage.removeItem(k)}catch(_){}
    });
    if(phone)try{localStorage.setItem("last_phone",phone)}catch(_){}
    if(theme)try{localStorage.setItem("theme",theme)}catch(_){}
  }catch(_){}
  try{
    if(window.caches&&caches.keys){
      const ks=await caches.keys();
      await Promise.all(ks.filter(k=>/^eltafawoq-v/i.test(k)).map(k=>caches.delete(k)));
    }
  }catch(_){}
  try{
    if(navigator.serviceWorker&&navigator.serviceWorker.controller)
      navigator.serviceWorker.controller.postMessage({type:"CLEAR_CACHE"});
    const regs=await navigator.serviceWorker.getRegistrations();
    for(const r of regs){
      try{if(r.active)r.active.postMessage({type:"CLEAR_CACHE"})}catch(_){}
    }
  }catch(_){}
  try{localStorage.setItem("cache_bust_done",String(S.site&&S.site.cacheBust||Date.now()))}catch(_){}
  return true;
}
function render(force){
  if(!force&&(S.view==="exam"||S.view==="editExam"||S.view==="editAsm"||S.view==="chatThread"||S.view==="groupThread"))return;
  if(!force){
    if(__rendPend)return;
    __rendPend=true;
    __rendT=requestAnimationFrame(function(){__rendPend=false;render(true)});
    return;
  }

  if(S.view!=="exam"){clearInterval(timer);clearInterval(hb)}
  try{
    if(window.__lastView&&window.__lastView!==S.view&&typeof stopViewSubs==="function")stopViewSubs();
    window.__lastView=S.view;
  }catch(_){}
  try{saveNavState()}catch(_){}
  let h;
  try{
  if(S.view==="loading")h=splash();
  else if(S.site.maintenance&&!S.isAdmin&&!S.adminLogin)h=maintenance();
  else if(!S.user)h=authView();
  else if(S.isAdmin){
    h=S.view==="modePreview"?modeView(modesAll().find(x=>x.id===S.modePrev)||modeCur()):S.view==="editExam"?editor():S.view==="editAsm"?asmEditor():S.view==="studentDetail"?studentDetail():S.view==="review"?reviewView():adminView();
  }else if(typeof isAsmManager==="function"&&isAsmManager()&&(S.view==="editAsm"||S.view==="asmAdmin")){
    h=S.view==="editAsm"?asmEditor():`<div class="wrap wide">${header(`<button class="btn ghost sm" data-act="home">الرئيسية</button><button class="btn ghost sm" data-act="logout">خروج</button>`)}${adminAsm()}</div>`;
  }else if(isBlockedP(S.profile)){h=blockedView()}
  else if(modeOn()&&modeCur().kind!=="games"){h=modeView()}
  else{
    if(modeOn()&&!MODE_GAMEVIEWS.has(S.view))S.view="games";
    const m={games:gamesView,mathg:mathView,xo:xoView,hang:hangView,spin:spinView,react:reactView,subject:subjectView,exam:examView,result:resultView,review:reviewView,progress:progressView,asmList:asmListView,asm:asmView,qbSetup:qbSetupView,qbLobby:qbLobbyView,qbPlay:qbPlayView,qbResult:qbResultView,me:meView,life:lifeView,profile:profileView,search:searchView,chatList:chatListView,chatThread:chatThreadView,fadaye7:fadaye7View,tanagha:tanaghaView,gallery:galleryView,groups:groupsView,groupThread:groupThreadView,ai:aiView,books:booksView,bag:bagView,focus:focusView,notes:notesView};
    let fn=m[S.view];
    {const __ft=featOfView(S.view);if(__ft&&!featOn(__ft))fn=featOffView}
    if(S.view==="tanaghaLock"||(isTgView(S.view)&&tanaghaState(S.profile)!=="approved"))fn=tanaghaLockedView;
    if(typeof fn!=="function"){
      if(S.view&&S.view!=="home")console.warn("Unknown view",S.view);
      S.view="home";
      fn=homeView;
    }
    try{h=fn()}catch(ve){
      console.error("view",S.view,ve);
      h=`<div class="wrap"><div class="card"><b>خطأ في شاشة ${esc(String(S.view||""))}</b><p class="mut">${esc(String(ve&&ve.message||ve))}</p>
      <button class="btn" data-act="home">الرئيسية</button></div></div>`;
    }
  }
  }catch(err){
    console.error("render",err);
    h=`<div class="wrap screen"><div class="card empty"><div class="ei">⚠️</div><b>حصل خطأ في العرض</b>
    <div class="mut" style="margin:8px auto 14px">${esc(String(err&&err.message||err))}</div>
    <button class="btn" data-act="home">إعادة المحاولة</button>
    <button class="btn ghost" data-act="logout" style="margin-top:8px">تسجيل خروج</button></div></div>`;
  }
  try{document.body.classList.toggle("mode-open",typeof h==="string"&&h.indexOf('class="mode-full"')>=0)}catch(_){}
  if(!app)return;
  try{
    const secure=S.view==="gallery"||S.view==="tanagha";
    document.body.classList.toggle("gal-secure",!!secure);
    if(secure&&!S.isAdmin)ensureWatermark();
  }catch(_){}
  const __ae=document.activeElement;const __aeId=__ae&&__ae.id;const __aePos=(__ae&&(__ae.id==="dmIn"||__ae.id==="grpIn"||__ae.id==="qbChatIn"||__ae.id==="aiIn")&&typeof __ae.selectionStart==="number")?__ae.selectionStart:null;const __aeVal=__aeId&&(__aeId==="dmIn"||__aeId==="grpIn"||__aeId==="aiIn")?__ae.value:null;
  try{const __w=presenceWhere();if(S.user&&!S.isAdmin&&__w!==window.__lastWhere){window.__lastWhere=__w;clearTimeout(window.__whT);window.__whT=setTimeout(()=>pingClientPresence(true),3000)}}catch(_){}
  const __vk=S.view+"|"+(S.view==="admin"?S.tab:"");
  const __newView=window.__lastViewKey!==__vk;window.__lastViewKey=__vk;
  try{app.classList.toggle("noanim",!__newView)}catch(_){}
  try{
    let cr=document.getElementById("credit");
    if(!cr){cr=document.createElement("div");cr.id="credit";cr.innerHTML=`<div><b>بواسطة المبرمج مورا 么</b></div><div class="cr-sub">للتواصل، استخدم قناة الإدارة داخل المنصة.</div>`;app.insertAdjacentElement("afterend",cr)}
    const noCr=["loading","exam","chatThread","groupThread","ai","qbPlay"].includes(S.view);
    cr.style.display=noCr?"none":"";document.body.classList.toggle("has-credit",!noCr);
    cr.classList.toggle("nav",!!S.user&&!S.isAdmin&&!noCr&&!(typeof isAsmManager==="function"&&S.view==="asmAdmin"));
  }catch(_){}
  let __chatKeepTop=0;
  try{if(S.view==="chatThread"||S.view==="groupThread"){const __ck=chatLogEl();if(__ck)__chatKeepTop=__ck.scrollTop}}catch(_){}
  app.innerHTML=h||`<div class="wrap"><div class="card mut">جاري التحميل…</div></div>`;
  if(__aeId){const el=document.getElementById(__aeId);if(el){if(__aeVal!=null&&"value" in el)el.value=__aeVal;el.focus();if(__aePos!=null)try{el.setSelectionRange(__aePos,__aePos)}catch(_){}}}

  try{app.querySelectorAll("img:not([loading])").forEach(function(im){im.loading="lazy";im.decoding="async"});app.querySelectorAll("video:not([preload])").forEach(function(v){v.preload="none"});app.querySelectorAll("iframe:not([loading])").forEach(function(f){f.loading="lazy"})}catch(_){}
  if(S.view==="chatThread"||S.view==="groupThread"){
    bindChatScroll();
    if(S.chatStickBottom!==false)scrollChatBottom(false);
    else if(__chatKeepTop>0){const __nk=chatLogEl();if(__nk){try{__nk.scrollTop=__chatKeepTop}catch(_){}}}
    if(S.view==="chatThread"){
      const din=$("#dmIn");
      if(din&&!din._typingBound){
        din._typingBound=true;
        din.addEventListener("input",()=>signalDmTyping());
      }
    }
  }else{
    const j=document.getElementById("chatJumpBtn");if(j)j.remove();
  }
  // live search while typing in group add
  const gq=$("#grpAddQ");
  if(gq&&!gq._bound){gq._bound=true;gq.addEventListener("input",()=>{clearTimeout(window.__grpAddT);window.__grpAddT=setTimeout(()=>{if(typeof A!=="undefined"&&A.searchGrpAdd)A.searchGrpAdd()},280)})}
  if(force&&__newView&&app.firstElementChild)app.firstElementChild.classList.add("screen");
  if(S.view==="result"&&!S.isAdmin&&S.user)runResult();
  if(S.view==="editExam")bindEditor();
  ensureSol();
}
const splash=()=>``; // مفيش شاشة تحميل داخل #app — الـ HTML splash يكفي لجزء من الثانية
const blockedView=()=>`<div class="wrap"><div class="center"><div class="logo" style="display:inline-block">التفوق</div><h1 style="margin-top:28px">حسابك موقوف</h1><p class="mut" style="max-width:360px;margin:8px auto 14px">تواصل مع المدرس لإعادة تفعيل الحساب.</p>${S.profile&&S.profile.blockReason?`<p style="max-width:360px;margin:0 auto 14px"><b>السبب:</b> ${esc(S.profile.blockReason)}</p>`:""}${S.profile&&S.profile.blockedUntil>0?`<p class="mut" style="margin:0 auto 14px">ينتهي الحظر: <b>${new Date(S.profile.blockedUntil).toLocaleString("ar-EG")}</b></p><button class="btn" data-act="home" style="margin-bottom:10px">تحديث</button><br>`:""}<button class="btn ghost" data-act="logout">تسجيل خروج</button></div></div>`;
const logo=`<div class="logo">التفوق</div>`;
const aiBtn=()=>S.user?`<button type="button" class="tg tg-icon" data-act="openAI" aria-label="么" title="مساعد 么">🤖</button>`:"";
const boostBtn=()=>S.user?`<button type="button" class="tg tg-icon tg-lbl" data-act="speedBoost" aria-label="تسريع المنصة للهواتف الضعيفة" title="تسريع المنصة للهواتف الضعيفة"><span>⚡</span><small>للهواتف<br>الضعيفة</small></button>`:"";
const findBtn=()=>(S.user&&!S.isAdmin)?`<button type="button" class="tg tg-icon hdr-s" data-act="openSearch" aria-label="بحث" title="بحث عن زميل">🔍</button>`:"";
const searchBtn=()=>aiBtn()+boostBtn()+findBtn();
const header=(extra)=>`<div class="top"><div class="hdr-r">${logo}${aiBtn()}${boostBtn()}${themeBtn()}${findBtn()}</div><div class="row hdr-l">${extra||""}</div></div>`;
const NOHDR="<span></span>";
const studentNav=()=>modeOn()?modeNav():`<nav class="bot">
<button class="${S.view==="home"||S.view==="subject"||S.view==="exam"||S.view==="result"?"on":""}" data-act="home">المواد</button>
${featOn("progress")?`<button class="${S.view==="progress"?"on":""}" data-act="progress">تقدمي${(S.unreadNotif||0)?` <span class="badge">${S.unreadNotif}</span>`:""}</button>`:""}
${featOn("chat")?`<button class="${S.view==="chatList"||S.view==="chatThread"?"on":""}" data-act="openChats">تواصل${(S.unreadChat||0)?` <span class="badge">${S.unreadChat}</span>`:""}</button>`:""}
${featOn("games")?`<button class="${S.view==="games"||S.view==="mathg"||S.view==="xo"||S.view==="hang"||S.view==="spin"||S.view==="react"||S.view&&String(S.view).startsWith("qb")?"on":""}" data-act="openGames">الألعاب</button>`:""}
${featOn("life")?`<button class="${S.view==="life"?"on":""}" data-act="openLife">المتجر</button>`:""}
<button class="${S.view==="me"||S.view==="profile"||S.view==="search"?"on":""}" data-act="openMe">أنا</button>
</nav>`;

function maintenance(){return `<div class="wrap"><div class="center"><div class="logo" data-act="logoTap" style="display:inline-block;font-size:40px">التفوق</div>
<h1 style="margin-top:28px">المنصة تحت التعديل</h1>
<p class="mut" style="max-width:380px;margin:8px auto 28px">${esc(S.site.message||"بنحدّث المنصة دلوقتي. ارجع بعد شوية.")}</p>
${S.user?`<button class="btn ghost" data-act="logout">تسجيل خروج</button>`:""}
</div></div>`}

function authView(){
  const reg=S.mode==="register"&&!S.adminLogin;
  const rec=!!S.recoverMode&&!reg&&!S.adminLogin;
  return `<div class="wrap">${header()}
<form class="card" data-submit="${reg?"doRegister":rec?"doRecover":"doLogin"}" autocomplete="on">
<h2>${S.adminLogin?"دخول الأدمن":reg?"إنشاء حساب جديد":rec?"استعادة كلمة السر 🔑":"تسجيل الدخول"}</h2>
${reg?`<label class="f" for="nm">الاسم بالكامل</label><input id="nm" type="text" autocomplete="name" required>`:""}
${rec?`<div class="mut" style="margin:0 0 8px">اطلب من الأدمن «كود استعادة» لرقمك، وبعدين اكتب رقمك + الكود + كلمة السر الجديدة.</div>
<label class="f" for="rid">رقم التليفون</label>
<input id="rid" class="ltr" type="tel" inputmode="numeric" autocomplete="username" placeholder="01xxxxxxxxx" required>
<label class="f" for="rcode">كود الاستعادة (6 أرقام من الأدمن)</label>
<input id="rcode" class="ltr" type="text" inputmode="numeric" placeholder="رمز من 6 أرقام" maxlength="6" autocomplete="one-time-code" required>
<label class="f" for="rpw">كلمة السر الجديدة (6+)</label>
<input id="rpw" class="ltr" type="password" autocomplete="new-password" minlength="6" required>
`:`
<label class="f" for="id">رقم التليفون</label>
<input id="id" class="ltr" type="tel" inputmode="numeric" autocomplete="username" placeholder="01xxxxxxxxx" required value="${esc((()=>{try{return localStorage.getItem("last_phone")||""}catch(_){return""}})())}">
<label class="f" for="pw">كلمة السر</label>
<input id="pw" class="ltr" type="password" autocomplete="${reg?"new-password":"current-password"}" required>`}
${S.error?`<div class="err">${esc(S.error)}</div>`:""}
<div style="margin-top:16px"><button class="btn block" id="go">${reg?"إنشاء الحساب":rec?"غيّر كلمة السر ✓":"دخول"}</button></div>
${S.adminLogin?"":(rec?`<p style="font-size:14px;margin:12px 0 0;text-align:center"><a href="#" data-act="recoverToggle" style="color:var(--pri);font-weight:600">← رجوع لتسجيل الدخول</a></p>`:`<p style="font-size:14px;margin:12px 0 0;text-align:center"><a href="#" data-act="recoverToggle" style="color:var(--gold,#d4a017);font-weight:600">نسيت كلمة السر؟ خد كود استعادة من الأدمن</a></p>`)}
${S.adminLogin||rec?"":`<p class="mut" style="text-align:center;margin:14px 0 0">${reg?"عندك حساب؟":"أول مرة؟"} <a href="#" data-act="mode" style="color:var(--pri);font-weight:600">${reg?"سجّل دخول":"أنشئ حساب"}</a></p>`}
</form>${S.adminLogin?`<p style="text-align:center;margin:8px 0 0"><a href="#" data-act="studentLink" class="mut">رجوع</a></p>`:""}</div>`}

/* ---------- الطالب ---------- */
try{window.toast=toast}catch(_){}
function homeView(){ /* stage1 polish */

  if(!S.profile)S.profile={name:"طالب",phone:""};
  if(!Array.isArray(S.exams))S.exams=[];

  const loading=!S.examsLoaded&&!(Array.isArray(S.exams)&&S.exams.length);
  const skel=loading?`<div class="card"><div class="mut">جاري تحميل المواد…</div>
  <div style="height:14px;background:var(--line);border-radius:8px;margin:10px 0;opacity:.5"></div>
  <div style="height:14px;width:70%;background:var(--line);border-radius:8px;opacity:.35"></div></div>`:"";

  const ex=(Array.isArray(S.exams)?S.exams:[]).filter(vis);
  const an=S.site.announceOn&&S.site.announce?`<div class="card ann"><b>📢 إعلان</b><div style="white-space:pre-wrap;margin-top:4px">${esc(S.site.announce)}</div></div>`:"";
  const inst=installBanner();
  const sess=peekExamSession();
  const resume=sess?`<div class="card" style="border-color:var(--gold);background:var(--ybg)"><b>▶ عندك امتحان متوقف</b><div class="mut" style="margin:4px 0">تقدر تكمّل من حيث وقفت — الإجابات محفوظة</div><button class="btn sm gold" data-act="resumeExam">استئناف الامتحان</button></div>`:"";
  return `<div class="wrap screen">${header(`<button class="btn ghost sm" data-act="logout">خروج</button>`)}
<h2>أهلاً يا ${esc(((S.profile&&S.profile.name)||"طالب").split(" ")[0])}</h2><p class="mut">اختار المادة اللي عايز تمتحن فيها.</p>${inst||""}${skel}${an}${resume}${v76HomeExtras()}
<div class="grid">${S.examsLoaded?(featOn("subjects")?SUBJECTS.map(s=>{const l=ex.filter(e=>e.subject===s.id),done=l.filter(e=>(S.attempts[e.id]||[]).length).length,p=l.length?Math.round(done/l.length*100):0;
  return `<button class="subj" style="background:linear-gradient(135deg,${s.c},${s.c2})" data-act="openSubject" data-id="${s.id}"><span class="g">${s.g}</span><b>${s.name}</b><small>${l.length?l.length+" امتحان · خلصت "+done:"مفيش امتحانات لسه"}</small><div class="sp"><i style="--w:${p}%"></i></div></button>`}).join(""):"")+(featOn("asms")?`<button class="subj wide" style="background:linear-gradient(135deg,#4338CA,#0B5D57)" data-act="openAsms"><span class="g">A+</span><div><b>التقييمات</b><br><small>${S.asms.length?S.asms.length+" تقييم · حلول ونماذج":"مفيش تقييمات لسه"}</small></div></button>`:"")+(featOn("games")?`<button class="subj wide" style="background:linear-gradient(135deg,#166534,#B45309)" data-act="openGames"><span class="g">🎮</span><div><b>الألعاب</b><br><small>العب ضد الروبوت أو ضد صاحبك</small></div></button>`:"")+(featOn("fadaye7")?`<button class="subj wide" style="background:linear-gradient(135deg,#9D174D,#BE185D)" data-act="openFadaye7"><span class="g">😂</span><div><b>فضايح</b><br><small>${(S.fadaye7||[]).length?((Array.isArray(S.fadaye7)?S.fadaye7:[]).length)+" لقطة":"صور وفيديوهات من الأدمن"}</small></div></button>`:"")+(featOn("books")?`<button class="subj wide" style="background:linear-gradient(135deg,#1e3a5f,#0B5D57)" data-act="openBooks"><span class="g">📚</span><div><b>الكتب</b><br><small>PDF وملفات للتحميل</small></div></button>`:"")+(typeof isAsmManager==="function"&&isAsmManager()&&!S.isAdmin&&featOn("asms")?`<button class="subj wide" style="background:linear-gradient(135deg,#4338CA,#6366F1)" data-act="openAsmAdmin"><span class="g">📝</span><div><b>إدارة التقييمات</b><br><small>مسؤول تقييمات</small></div></button>`:"")+(featOn("tanagha")?`<button class="subj wide" style="background:linear-gradient(135deg,#BE185D,#F472B6)" data-act="openTanagha"><span class="g">💗</span><div><b>خاص لأولاد التناغه</b><br><small>أجمل شلة · صورنا</small></div></button>`:""):SUBJECTS.map(()=>`<div class="sk"></div>`).join("")}</div>
</div>${studentNav()}`}
function subjectView(){
  const s=SUBJECTS.find(x=>x.id===S.subject),ex=(Array.isArray(S.exams)?S.exams:[]).filter(e=>e&&e.subject===s.id&&vis(e));
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2 style="color:${s.c2}">امتحانات ${s.name}</h2>
${ex.length?ex.map(e=>{
  const at=S.attempts[e.id]||[];
  return `<div class="card lift"><b>${esc(e.title)}</b>
<div class="mut">${gcount(e)} سؤال${e.questions.length>gcount(e)?" + ألغاز":""} · ${e.minutes?e.minutes+" دقيقة":"من غير وقت محدد"}${e.passMark>0?" · النجاح من "+e.passMark:""} · عندك ${MAX_ATTEMPTS} محاولات</div>
${at.map(a=>`<div class="row" style="margin-top:8px"><span>محاولة ${a.attempt||1}: <b>${a.score}/${a.total}</b> ${passPill(a)}</span><button class="btn ghost sm" data-act="reviewMine" data-id="${a.id}">شوف حلّك</button></div>`).join("")}
<div style="margin-top:10px">${(()=>{const sess=peekExamSession();if(sess&&sess.examId===e.id)return `<button class="btn sm gold" data-act="resumeExam">▶ استئناف الامتحان</button>`;return at.length<MAX_ATTEMPTS?`<button class="btn sm" data-act="start" data-id="${e.id}">${at.length?"محاولة تانية":"ابدأ"}</button>`:`<span class="mut">خلصت محاولتيك على الامتحان ده.</span>`;})()}</div></div>`}).join(""):`<div class="card mut">مفيش امتحانات في المادة دي دلوقتي. ارجع تاني بعدين.</div>`}
</div>${studentNav()}`}
function examView(){
  const c=S.cur,e=c.exam;let pos=0,fun=false;
  return `<div class="wrap"><div class="timer"><span>${esc(e.title)} · محاولة ${c.n}</span><span style="display:flex;align-items:center;gap:8px">${c.endAt?`<span id="timer">--:--</span>`:`<span>${gcount(e)} سؤال</span>`}<button type="button" class="btn sm" data-act="pauseExam" style="padding:6px 12px;font-size:13px;font-weight:700;background:#17120a;color:#f5c542;border:1.5px solid #17120a;opacity:1;box-shadow:0 2px 6px rgba(0,0,0,.35)">💾 حفظ وخروج</button></span></div>
<div class="prog"><i id="pg"></i></div>
<form data-submit="submit">
${c.order.map(({i,o})=>{const q=e.questions[i];pos++;
  const head=q.fun&&!fun?(fun=true,`<div class="card" style="background:var(--ybg);border-color:var(--gold)"><b>قسم الترفيه: ألغاز ومسابقات</b><div class="mut">القسم ده للتسلية بس، مش بيتحسب في الدرجة.</div></div>`):"";
  if(q.essay){
    return head+`<div class="q in" style="--i:${Math.min(pos,12)}"><p dir="auto"><span class="n">${pos}</span>${esc(q.q)} <span class="pill i" style="font-size:11px">مقالي</span></p>
    <textarea name="q${i}" rows="4" dir="auto" placeholder="اكتب إجابتك هنا..." style="width:100%;padding:12px;border-radius:12px;border:1.5px solid var(--line);font:inherit;resize:vertical;margin-top:8px;background:var(--bg);color:var(--ink)"></textarea>
    <div class="mut" style="font-size:12px;margin-top:4px">اكتب بأسلوبك — لو قريب من الحل هتاخد درجة جزئية أو كاملة</div></div>`
  }
  return head+`<div class="q in" style="--i:${Math.min(pos,12)}"><p dir="auto"><span class="n">${pos}</span>${esc(q.q)}</p>${o.map(j=>`<label class="opt"><input type="radio" name="q${i}" value="${j}"><span dir="auto">${esc(q.o[j])}</span></label>`).join("")}</div>`}).join("")}
<button class="btn block gold" id="sub">تسليم الامتحان</button></form></div>`}

function reviewBody(r,e,showAns){
  let fun=false;
  return e.questions.map((q,i)=>{
    const a=(r.ans||[])[i];
    const head=q.fun&&!fun?(fun=true,`<div class="card" style="background:var(--ybg);border-color:var(--gold)"><b>الألغاز</b> <span class="mut">(مش في الدرجة)</span></div>`):"";
    if(q.essay){
      const ov=(r.essayOverrides||{})[i];
      const sc=ov!=null?ov:essayScore(a,q.model);
      const label=(!a||!String(a).trim())?pill("لم تُجب","y"):sc>=0.85?pill("ممتاز "+Math.round(sc*100)+"%","g"):sc>=0.5?pill("جزئي "+Math.round(sc*100)+"%","y"):pill("ضعيف "+Math.round(sc*100)+"%","r");
      const adj=S.isAdmin?` <button type="button" class="btn ghost sm" data-act="setEssayScore" data-i="${i}" data-cur="${sc}">تعديل الدرجة</button>`:"";
      return head+`<div class="q"><p dir="auto"><span class="n">${i+1}</span>${esc(q.q)} ${q.fun?"":label}${adj}</p>
        <div style="background:var(--bg);border-radius:10px;padding:10px;margin:6px 0"><b>إجابة الطالب:</b><div dir="auto" style="white-space:pre-wrap;margin-top:4px">${esc(a||"—")}</div></div>
        ${showAns?`<div style="background:var(--gbg);border-radius:10px;padding:10px;margin:6px 0;border:1px solid var(--ok)"><b>الحل النموذجي:</b><div dir="auto" style="white-space:pre-wrap;margin-top:4px">${esc(q.model)}</div></div>`:""}
      </div>`
    }
    const ok=a===q.a;
    return head+`<div class="q"><p dir="auto"><span class="n">${i+1}</span>${esc(q.q)} ${a===-1||a==null?pill("لم تُجب","y"):q.fun?"":ok?pill("صح","g"):pill("غلط","r")}</p>${q.o.map((t,j)=>`<div class="opt ${j===q.a?"right":j===a?"wrong":""}"><span dir="auto">${esc(t)}${j===q.a?` <b class="tk">✓</b>`:j===a?` <b class="tk x">✗</b>`:""}${j===a?` <small>(إجابة ${S.isAdmin?"الطالب":"تك"})</small>`:""}</span></div>`).join("")}</div>`}).join("");
}
function reviewView(){
  const {r,back}=S.review,e=S.exams.find(x=>x.id===r.examId);
  const showAns=S.isAdmin||(e&&e.showAnswers!==false);
  const adminBar=S.isAdmin?`<div class="mut">${esc(r.name)} · ${esc(r.phone)}</div>`:"";
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="backReview">رجوع</button>`)}
<div class="card"><h2>${esc(r.examTitle)} · محاولة ${r.attempt||1}</h2>${adminBar}
<div style="margin-top:6px"><b style="font-size:22px;color:var(--pri)">${r.score}/${r.total}</b> ${pill(pctOf(r)+"%")} ${passPill(r)}</div>
<div class="mut" style="margin-top:4px">${r.secs!=null?"الوقت: "+dur(r.secs)+" · ":""}${r.tabs?`<span style="color:var(--bad)">خرج من الامتحان ${r.tabs} مرة</span> · `:""}${fmt(r.createdAt)}</div></div>
${!e?`<div class="card mut">الامتحان ده اتمسح أو اتخفى، فمش هقدر أعرض الأسئلة.</div>`:!r.ans?`<div class="card mut">مفيش حل محفوظ للمحاولة دي.</div>`:!showAns?`<div class="card mut">المدرس مقفل عرض الإجابات الصحيحة للامتحان ده.</div>`:reviewBody(r,e)}
</div>`}


function celebratePerfect(){
  try{if(navigator.vibrate)navigator.vibrate([40,30,40,30,80])}catch(_){}
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const notes=[523,659,784,1046];
    notes.forEach((f,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type="sine";o.frequency.value=f;g.gain.value=0.06;
      o.connect(g);g.connect(ctx.destination);
      o.start(ctx.currentTime+i*0.12);o.stop(ctx.currentTime+i*0.12+0.2);
    });
  }catch(_){}
  const layer=document.createElement("div");layer.className="confetti-layer";
  const colors=["#0B5D57","#F5C542","#E85D4C","#3B82F6","#22C55E","#fff"];
  for(let i=0;i<48;i++){
    const p=document.createElement("i");p.className="confetti-piece";
    p.style.left=(Math.random()*100)+"%";
    p.style.background=colors[i%colors.length];
    p.style.animationDelay=(Math.random()*0.8)+"s";
    p.style.borderRadius=Math.random()>0.5?"50%":"2px";
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(()=>layer.remove(),3500);
  toast("🏆 مبروك 100%!",true);
}

function resultView(){
  const r=S.last,p=pctOf(r),left=MAX_ATTEMPTS-(S.attempts[r.examId]||[]).length;
  const st=p>=90?3:p>=70?2:p>=50?1:0;
  const perfect=r.total>0&&r.score===r.total;
  if(perfect&&!r._celebrated){r._celebrated=true;setTimeout(celebratePerfect,300)}
  return `<div class="wrap">${header()}
<div class="card" style="text-align:center;padding:24px 16px${perfect?";border-color:var(--gold);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 40%,transparent)":""}"><div class="mut">${esc(r.examTitle)} · محاولة ${r.attempt}${perfect?" · 💯":""}</div>
<div class="ring"><svg viewBox="0 0 120 120" width="150" height="150"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" id="fg" cx="60" cy="60" r="54"/></svg><b id="sc">0</b></div>
<div class="stars">${[1,2,3].map(i=>`<span class="${i<=st?"":"off"}">★</span>`).join("")}</div>
<div class="mut">من ${r.total} · ${p}% ${passPill(r)}</div>
<p style="margin:12px 0 0">${r.passMark>0?(r.passed?"مبروك، نجحت! 🎉":`محتاج ${r.passMark} إجابات صح على الأقل. راجع أخطاءك وحاول تاني.`):p>=85?"ممتاز! كمّل كده.":p>=50?"كويس. شوية مراجعة وهتبقى أحسن.":"محتاج مراجعة أكتر. المرة الجاية أحسن."}</p>
${left>0?`<p class="mut">لسه عندك محاولة تانية على الامتحان ده.</p>`:`<p class="mut">دي كانت آخر محاولة على الامتحان ده.</p>`}</div>
<div class="row"><button class="btn" style="flex:1" data-act="reviewLast">شوف الصح والغلط</button><button class="btn ghost" style="flex:1" data-act="home">رجوع للمواد</button></div></div>`}

const okUrl=u=>/^https?:\/\//i.test(u||"");
const skel=()=>`<div class="sk" style="min-height:90px;margin-bottom:12px"></div>`;
const filesHtml=(l,part,aid)=>l.map(f=>f.kind==="image"?`<div class="card" style="padding:8px"><img class="asmimg" src="${f.data}" alt="${esc(f.name)}" data-act="zoom"><div style="margin-top:6px"><a class="btn ghost sm" href="${f.data}" download="${esc(f.name.replace(/\.\w+$/,""))}.jpg">⬇ تحميل الصورة</a></div></div>`:`<div class="card row"><span>📄 ${esc(f.name)}</span><button class="btn sm" data-act="dlpdf" data-aid="${aid}" data-part="${part}" data-gid="${f.gid}" data-name="${esc(f.name)}">⬇ تحميل</button></div>`).join("");

/* ============================================================
   تحدي الأوائل — Quiz Battle Engine
   ============================================================ */
function qbPool(subject, maxN){
  const pool=[];
  S.exams.filter(e=>e.published && (!subject||subject==="random"||e.subject===subject)).forEach(e=>{
    (e.questions||[]).forEach(q=>{
      if(q.fun||q.essay||!q.o||q.o.length<2||q.a==null||q.a<0) return;
      pool.push({q:q.q,o:q.o.slice(),a:q.a,sub:e.subject,exam:e.title});
    });
  });
  // shuffle pool with fresh seed
  const rnd=mulberry(Date.now()^(Math.random()*1e9|0));
  const sh=shuf(pool,rnd);
  return sh.slice(0, Math.min(maxN, sh.length));
}
function qbShuffleQ(item, seed){
  const rnd=mulberry(seed);
  const idx=item.o.map((_,i)=>i);
  const order=shuf(idx,rnd);
  const o=order.map(i=>item.o[i]);
  const a=order.indexOf(item.a);
  return {q:item.q,o,a,sub:item.sub,exam:item.exam};
}
function qbCode(){const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<5;i++)s+=c[Math.floor(Math.random()*c.length)];return s}
function qbStopSub(){if(S.qbSub){try{S.qbSub()}catch(_){} S.qbSub=null} qbStopChat()}
function qbBotDelay(diff, correct){
  // easy / medium / hard reaction times + accuracy
  const cfg={easy:{acc:.55,min:1800,max:4500},medium:{acc:.72,min:900,max:2800},hard:{acc:.9,min:400,max:1400}}[diff]||{acc:.7,min:1000,max:2500};
  const willCorrect=Math.random()<cfg.acc;
  const ms=cfg.min+Math.random()*(cfg.max-cfg.min);
  return {ms, willCorrect};
}

function qbSetupView(){
  const m=S.qb&&S.qb.mode;
  const subjects=[{id:"random",name:"عشوائي 🎲"},...SUBJECTS];
  if(m==="bot"){
    return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}
<div class="qb-hero" style="padding:18px">
  <div class="qb-crown" style="font-size:36px">🤖</div>
  <div class="qb-title" style="font-size:22px">تحدي الأوائل · ضد الروبوت</div>
  <div style="opacity:.9;font-size:13px;margin-top:4px">إعدادات المباراة الفردية</div>
</div>
<div class="qb-card">
<label class="f">المادة</label>
<select id="qbSub">${subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select>
<label class="f">عدد الأسئلة</label>
<select id="qbN">${[5,10,15,20,25].map(n=>`<option value="${n}" ${n===10?"selected":""}>${n}</option>`).join("")}</select>
<label class="f">وقت كل سؤال (ث)</label>
<select id="qbT">${[10,15,20,30,0].map(n=>`<option value="${n}" ${n===15?"selected":""}>${n?n:"بدون حد"}</option>`).join("")}</select>
<label class="f">مستوى الروبوت</label>
<select id="qbDiff"><option value="easy">سهل</option><option value="medium" selected>متوسط</option><option value="hard">صعب</option></select>
</div>
<button class="btn block gold" data-act="qbStartBot">ابدأ المباراة ⚡</button>
</div>${studentNav()}`;
  }
  // غرف الأصدقاء — اختيار اللعبة هنا + إعداداتها حسب اللعبة
  const gamePick=S.qbCreateGame||"qb";
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}
<div class="qb-hero" style="padding:18px">
  <div class="qb-crown" style="font-size:36px">👥</div>
  <div class="qb-title" style="font-size:22px">غرفة الأصدقاء</div>
  <div style="opacity:.9;font-size:13px;margin-top:4px">اختار اللعبة أولاً — إعداداتها تظهر تحت · نوع الغرفة من هنا فقط</div>
</div>
<div class="qb-card">
<label class="f">اللعبة</label>
<select id="qbCreateGame" data-change="qbCreateGameChange">${Object.entries(QB_GAMES).map(([k,v])=>`<option value="${k}" ${k===gamePick?"selected":""}>${v}</option>`).join("")}</select>
<label class="f">نوع الغرفة</label>
<select id="qbPublicCreate"><option value="0" selected>خاص (كود / رابط فقط)</option><option value="1">عام (تظهر في الغرف المفتوحة)</option></select>
<label class="f">عدد اللاعبين (حد أقصى)</label>
<select id="qbMax">${[2,3,4,5,6,7,8,10,12,16].map(n=>`<option value="${n}" ${n===6?"selected":""}>${n} لاعب</option>`).join("")}</select>
</div>
${gamePick==="qb"?`<div class="qb-card"><b>إعدادات تحدي الأوائل 👑</b>
<label class="f">المادة</label>
<select id="qbSub">${subjects.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select>
<label class="f">عدد الأسئلة</label>
<select id="qbN">${[5,10,15,20,25].map(n=>`<option value="${n}" ${n===10?"selected":""}>${n}</option>`).join("")}</select>
<label class="f">وقت كل سؤال (ث)</label>
<select id="qbT">${[10,15,20,30,0].map(n=>`<option value="${n}" ${n===15?"selected":""}>${n?n:"بدون حد"}</option>`).join("")}</select>
</div>`:gamePick==="los"?`<div class="qb-card"><b>إعدادات آخر واحد واقف 🧍</b>
<p class="mut">اللعبة هتتفتح جوّه الغرفة بعد ما الكل يكون جاهز. حالياً تحدي الأوائل هو المتاح للعب الجماعي الكامل — آخر واحد واقف قريب.</p>
</div>`:`<div class="qb-card mut">اختار لعبة عشان تظهر إعداداتها</div>`}
<button class="btn block gold" data-act="qbCreateRoom">إنشاء غرفة 🔗</button>
<div class="qb-card" style="margin-top:14px"><h3>أو انضم بكود</h3>
<input id="qbJoinCode" class="ltr" type="text" maxlength="6" placeholder="ABX72" style="text-transform:uppercase;letter-spacing:.15em;font-size:20px;text-align:center">
<button class="btn block" style="margin-top:10px" data-act="qbJoinRoom">انضم للغرفة</button></div>
</div>${studentNav()}`;
}

function qbLobbyView(){
  const r=S.qb&&S.qb.room;if(!r)return gamesView();
  const isHost=r.host===S.user.uid;
  const players=Object.values(r.players||{});
  const maxP=r.maxPlayers||16;
  const canStart=players.length>=1 && players.every(p=>p.ready||p.away);
  const gameId=r.game||"qb";
  const color=r.color||"teal";
  const isPublic=!!r.public;
  const showList=S.qb.showViewers;
  const pending=Object.values(r.joinRequests||{});
  return `<div class="wrap qb-room-theme t-${color}">${header(`<button class="btn ghost sm" data-act="qbLeaveRoom">خروج</button>`)}
<div class="qb-hero" style="padding:18px;color:#fff;border-radius:16px">
  <div class="row" style="justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:13px;opacity:.9">اللعبة الحالية</div>
      <div class="qb-title" style="font-size:22px;margin:4px 0">${qbGameLabel(gameId)}</div>
    </div>
    <button type="button" class="qb-viewers" data-act="qbToggleViewers" title="مَن في الغرفة">👁 ${players.length}</button>
  </div>
  <div class="qb-code" style="margin:10px 0;background:rgba(0,0,0,.2)">${esc(r.code)}</div>
  <div style="opacity:.9;font-size:13px">${subName(r.subject)} · ${r.qCount} سؤال · ${r.sec?r.sec+"ث":"بدون وقت"} · حد ${maxP} لاعب · ${isPublic?"عام 🌐":"خاص 🔒"}</div>
</div>
${showList?`<div class="qb-viewers-panel"><b>في الغرفة دلوقتي</b>${players.map(p=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(p.name)}${p.uid===r.host?" 👑":""}${p.away?' <span class="qb-away-badge">(برا الغرفة)</span>':""}${p.ready?" ✓":""}</span>${isHost&&p.uid!==S.user.uid?`<button class="btn danger sm" data-act="qbKick" data-uid="${p.uid}">طرد</button>`:""}</div>`).join("")||`<div class="mut">فاضي</div>`}</div>`:""}
${isHost?`<div class="qb-card"><b>إعدادات المضيف 👑</b>
<label class="f">اللعبة</label>
<select id="qbGameSel">${Object.entries(QB_GAMES).map(([k,v])=>`<option value="${k}" ${k===gameId?"selected":""}>${v}</option>`).join("")}</select>
<label class="f">لون الغرفة</label>
<select id="qbColorSel">${Object.entries(QB_COLORS).map(([k,v])=>`<option value="${k}" ${k===color?"selected":""}>${v}</option>`).join("")}</select>
<button class="btn sm" style="margin-top:8px" data-act="qbRoomSettings">حفظ الإعدادات</button>
<div class="mut" style="margin-top:6px;font-size:12px">نوع الغرفة (عام/خاص) بيتحدد عند الإنشاء فقط</div>
</div>`:""}
${isHost&&pending.length?`<div class="qb-card" style="border-color:var(--gold)"><b>طلبات دخول 🔔</b>${pending.map(j=>`<div class="row" style="margin-top:8px"><span>${esc(j.name||"طالب")}</span><span><button class="btn sm" data-act="qbAcceptJoin" data-uid="${j.uid}">موافق</button> <button class="btn ghost sm" data-act="qbRejectJoin" data-uid="${j.uid}">رفض</button></span></div>`).join("")}</div>`:""}
<div class="qb-card">
<div class="row"><b>اللاعبون (${players.length}/${maxP})</b>
<button class="btn ghost sm" data-act="qbCopyCode">نسخ الكود</button>
<button class="btn ghost sm" data-act="qbCopyLink">رابط مباشر</button>
<button class="btn sm gold" data-act="qbInviteFromLobby">📨 ابعت لصديق</button></div>
${S.qb&&S.qb.inviteOpen?`<div style="margin-top:10px;padding:10px;border-radius:12px;background:var(--sel)">
<input id="inviteFriendQ" type="search" placeholder="ابحث بالاسم…" value="${esc(S.inviteQ||"")}">
<button class="btn sm" style="margin-top:6px" data-act="searchInviteFriend">بحث</button>
${(S.inviteHits||[]).map(h=>`<div class="row" style="margin-top:8px"><span>${esc(h.name||"")}</span><button class="btn sm gold" data-act="inviteRoomFriend" data-uid="${h.id}" data-name="${esc(h.name||"")}">إرسال الدعوة</button></div>`).join("")||(S.inviteQ?`<div class="mut">مفيش نتائج</div>`:"")}
</div>`:""}
<div class="qb-lobby-players">${players.map(p=>`<span class="qb-chip ${p.uid===r.host?"host":""} ${p.ready?"ready":""}" style="cursor:pointer" data-act="openProfile" data-uid="${p.uid}">${p.avatar?`<img src="${p.avatar}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-left:4px">`:""}${esc(p.name)}${p.uid===r.host?" 👑":""}${p.ready?" ✓":""}${p.away?' <span class="qb-away-badge">برا</span>':""}${isHost&&p.uid!==S.user.uid?` <span class="kick" data-act="qbKick" data-uid="${p.uid}" title="طرد" onclick="event.stopPropagation()">✕</span>`:""}</span>`).join("")}</div>
${!isHost?`<button class="btn block ${ (r.players[S.user.uid]||{}).ready?"ghost":"gold"}" data-act="qbReady">${(r.players[S.user.uid]||{}).ready?"إلغاء الاستعداد":"أنا جاهز ✓"}</button>`:
  `<button class="btn block gold" data-act="qbBeginMatch" ${canStart?"":"disabled"}>${canStart?"ابدأ المباراة ⚡ ("+players.length+" لاعب)":"استنى الكل يكون جاهز"}</button>`}
</div>
${qbChatHtml()}
<p class="mut" style="text-align:center">الغرفة مفتوحة لحد ما الكل يخرج · لو قفلت التبويب بس هتظهر «برا» للمضيف</p>
</div>${studentNav()}`;
}

function qbPlayView(){
  const g=S.qb;if(!g||!g.match)return gamesView();
  const roomColor=(g.room&&g.room.color)||g.color||"teal";
  const m=g.match, q=m.qs[m.idx];
  if(!q)return qbResultView();
  const left=m.sec?Math.max(0,Math.ceil((m.deadline-Date.now())/1000)):0;
  const pct=m.sec?Math.max(0,(m.deadline-Date.now())/(m.sec*1000)*100):100;
  const me=m.players.find(p=>p.uid===S.user.uid)||m.players[0];
  const sorted=[...m.players].sort((a,b)=>b.score-a.score);
  const room=g.room||{};
  const gameName=qbGameLabel(room.game||"qb");
  const color=room.color||"teal";
  return `<div class="wrap qb-arena qb-room-theme t-${color}">
<div class="row" style="margin-bottom:6px"><span class="mut"><b>${gameName}</b></span><button class="btn ghost sm" data-act="qbLeaveRoom">خروج</button></div>
<div class="qb-hud" style="flex-wrap:wrap;max-height:120px;overflow:auto">${sorted.map(p=>`<div class="qb-player ${p.uid===S.user.uid?"me":""} ${sorted[0]&&sorted[0].uid===p.uid?"lead":""}" style="min-width:70px;padding:4px 6px">
  <div class="name" style="font-size:11px">${esc(p.name)}${sorted[0]&&sorted[0].uid===p.uid?" 👑":""}</div>
  <div class="score" style="font-size:14px">${p.score}</div>
  ${p.streak>=3?`<span class="qb-streak">🔥${p.streak}</span>`:""}
</div>`).join("")}</div>
<div class="row mut" style="margin-bottom:4px"><span>سؤال ${m.idx+1} / ${m.qs.length}</span>${m.sec?`<span id="qbSec">${left}ث</span>`:""}</div>
<div class="qb-timer-bar ${left<=5&&m.sec?"low":""}"><i id="qbBar" style="width:${pct}%"></i></div>
<div class="prog" style="height:6px;margin-bottom:8px"><i style="width:${(m.idx/m.qs.length)*100}%"></i></div>
<div class="qb-qbox"><p dir="auto" style="margin:0;font-weight:600;font-size:17px">${esc(q.q)}</p></div>
<div class="qb-opts" id="qbOpts">${q.o.map((t,j)=>`<button class="qb-opt" data-act="qbAnswer" data-i="${j}" ${m.answered?"disabled":""} dir="auto">${LETTERS[j]||(j+1)}) ${esc(t)}</button>`).join("")}</div>
${g.roomCode?qbChatHtml():""}
</div>`;
}

function qbResultView(){
  const g=S.qb;if(!g||!g.match)return gamesView();
  const roomColor=(g.room&&g.room.color)||g.color||"teal";
  const m=g.match;
  const sorted=[...m.players].sort((a,b)=>b.score-a.score||b.correct-a.correct);
  const me=sorted.find(p=>p.uid===S.user.uid)||sorted[0];
  const total=m.qs.length;
  const acc=me.correct?Math.round(me.correct/total*100):0;
  return `<div class="wrap qb-room-theme t-${roomColor}">${header(`<button class="btn ghost sm" data-act="openGames">الألعاب</button>`)}
<div class="qb-hero" style="text-align:center;padding:20px">
  <div style="font-size:40px">🏆</div>
  <div class="qb-title" style="font-size:24px">انتهت المباراة</div>
</div>
<div class="qb-podium">${sorted.slice(0,3).map((p,i)=>`<div class="qb-pod p${i+1}">
  <div class="medal">${["🥇","🥈","🥉"][i]}</div>
  <div style="font-weight:700;font-size:13px">${esc(p.name)}</div>
  <div style="color:var(--pri);font-weight:700">${p.score}</div>
  <div class="bar"></div>
</div>`).join("")}</div>
<div class="qb-card">
<div class="stats">
  <div class="stat card"><b>${me.score}</b><span class="mut">نقاطك</span></div>
  <div class="stat card"><b>${me.correct}/${total}</b><span class="mut">صحيحة</span></div>
  <div class="stat card"><b>${acc}%</b><span class="mut">دقة</span></div>
  <div class="stat card"><b>${me.bestStreak||0}</b><span class="mut">أفضل ستريك</span></div>
</div>
</div>
${g.mode==="friends"&&g.roomCode?`<button class="btn block gold" data-act="qbRematchRoom">إعادة في نفس الغرفة ↺</button>
<button class="btn block ghost" style="margin-top:8px" data-act="qbLeaveRoom">خروج من الغرفة</button>`:`<button class="btn block gold" data-act="${g.mode==="bot"?"qbBot":"qbFriends"}">إعادة اللعب ↺</button>
<button class="btn block ghost" style="margin-top:8px" data-act="openGames">رجوع للألعاب</button>`}
</div>${studentNav()}`;
}


function gamesView(){
  if(!Array.isArray(S.exams))S.exams=[];

  const openRooms=(S.openRooms||[]).filter(r=>r.public&&r.status==="lobby");
  const gcard=(ic,bg,title,sub,bot,friend,href)=>{
    const botBtn=href
      ?`<a class="btn sm" href="${href}" style="text-decoration:none">🤖 العب</a>`
      :`<button class="btn sm" data-act="${bot}">🤖 روبوت</button>`;
    return `<div class="card lift"><div class="row" style="flex-wrap:nowrap;gap:14px;align-items:flex-start">
    <div class="av" style="border-radius:16px;font-size:28px;background:${bg}">${ic}</div>
    <div style="flex:1"><b style="font-size:17px">${title}</b><div class="mut">${sub}</div>
    <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">${botBtn}
    <button class="btn sm ghost" data-act="openGameFriends" data-game="${friend}">👥 صاحبك</button>
    </div></div></div></div>`};
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>الألعاب</h2>
<p class="mut">كل لعبة: <b>🤖 روبوت / العب</b> أو <b>👥 صاحبك</b> (غرفة بكود — الاختيار من هنا مش من جوه اللعبة).</p>

<div class="card lift" style="border-color:color-mix(in srgb,var(--gold) 40%,var(--line))">
  <div class="row" style="flex-wrap:nowrap;gap:14px;align-items:flex-start">
    <div class="av" style="border-radius:16px;font-size:28px;background:linear-gradient(135deg,#E3A81C,#B45309)">👑</div>
    <div style="flex:1">
      <b style="font-size:17px">تحدي الأوائل</b>
      <div class="mut">أسئلة من الامتحانات · ترتيب حي · ستريك</div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button class="btn sm gold" data-act="qbBot">🤖 روبوت</button>
        <button class="btn sm ghost" data-act="openGameFriends" data-game="qb">👥 صاحبك</button>
      </div>
    </div>
  </div>
</div>

${gcard("🧠","linear-gradient(135deg,#7C3AED,#A78BFA)","تحدي الذاكرة","سهلة/متوسطة/صعبة · كومبو ونقاط","openMemory","memory","memory-game.html")}
${gcard("✏️","linear-gradient(135deg,#DB2777,#F472B6)","رسم وخمّن","نفس الموبايل · رسّام وخمّن بالتناوب","openDraw","draw","draw-guess.html")}
${gcard("🔤","linear-gradient(135deg,#5b6fd6,#2b1055)","Words Crush","100 مستوى · ابحث عن الكلمات","", "words","words-crush.html")}
${gcard("🏃","linear-gradient(135deg,#2563EB,#60A5FA)","Endless Runner","اجري واجمع العملات","", "runner","runner.html")}
${gcard("🚀","linear-gradient(135deg,#312e81,#8B93FF)","Space Shooter","سفينة فضاء · دمّر الأعداء","", "space","space.html")}
${gcard("🪂","linear-gradient(135deg,#1a0a3e,#0B5D57)","Doodle Jump","اقفز من منصة لمنصة","", "doodle","doodle.html")}
${gcard("🎣","linear-gradient(135deg,#0c2a3a,#2FB5A8)","صيد السمك","اصطياد أسماك نادرة","", "fishing","fishing.html")}
${gcard("🧊","linear-gradient(135deg,#12151A,#7C9CBF)","Push Arena","ادفع صاحبك من المنصة (نفس الجهاز)","", "push","push.html")}
${gcard("🔢","linear-gradient(135deg,#1D4ED8,#38BDF8)","حساب سريع","عمليات بوقت ضد روبوت","openMath","math","")}
${gcard("❌⭕","linear-gradient(135deg,#DC2626,#F87171)","إكس أو","3 مستويات صعوبة ضد روبوت","openXo","xo","")}
${gcard("📝","linear-gradient(135deg,#B45309,#E3A81C)","كلمة مخفية","خمّن الحروف","openHang","hang","")}
${gcard("🎰","linear-gradient(135deg,#E3A81C,#F59E0B)","عجلة الحظ","لفة يومية · اربح عملات","openSpin","spin","")}
${gcard("⚡","linear-gradient(135deg,#059669,#34D399)","سرعة اللمس","زمن رد الفعل","openReact","react","")}

<div class="card lift">
  <div class="row" style="flex-wrap:nowrap;gap:14px;align-items:flex-start">
    <div class="av" style="border-radius:16px;font-size:28px">🔫</div>
    <div style="flex:1">
      <b style="font-size:17px">آخر واحد واقف</b>
      <div class="mut">مواجهة · المنطقة بتضيق</div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <a class="btn sm" href="push.html">🤖 العب</a>
        <button class="btn sm ghost" data-act="openGameFriends" data-game="los">👥 صاحبك</button>
      </div>
    </div>
  </div>
</div>

${gcard("🎳","linear-gradient(135deg,#B45309,#F59E0B)","بولينج","صوّب واسقط القوائم","", "bowling","bowling.html")}
${gcard("🧊","linear-gradient(135deg,#0ea5e9,#38bdf8)","تزحلق الجليد","تفادى العوائق على الجليد","", "ice","ice.html")}
${gcard("👾","linear-gradient(135deg,#7c3aed,#a78bfa)","دفاع الفضائيين","احمِ القاعدة من الغزاة","", "alien","alien.html")}
${gcard("💣","linear-gradient(135deg,#475569,#94a3b8)","بومبر","متاهة · قنابل وأعداء","", "bomber","bomber.html")}
${gcard("🏰","linear-gradient(135deg,#166534,#4ade80)","دفاع القلعة","ابنِ أبراج وصدّ الموجات","", "tower","tower.html")}
${gcard("🎭","linear-gradient(135deg,#9d174d,#f472b6)","اختباء وبحث","اختبئ أو دور على أصحابك","", "hide","hide.html")}
${gcard("🏠","linear-gradient(135deg,#1e3a5f,#60a5fa)","غرفتي","زيّن غرفتك واعرضها","", "room","room.html")}


<div class="card" style="background:linear-gradient(135deg,color-mix(in srgb,var(--pri) 12%,var(--card)),var(--card));border-color:var(--pri)">
  <h3 style="margin:0 0 6px">👥 غرف الأصدقاء</h3>
  <p class="mut" style="margin:0 0 12px">إنشاء أو انضمام بكود — المضيف يختار اللعبة من القائمة.</p>
  <button class="btn" data-act="qbFriends">إنشاء / انضمام لغرفة</button>
</div>

${openRooms.length?`<div class="card"><b>الغرف المفتوحة 🌐</b><div class="mut" style="margin:4px 0 8px">انضم → المضيف يوافق أو يرفض · اللعبة تتحدد جوّه الغرفة</div>${openRooms.map(r=>{
  const n=Object.keys(r.players||{}).length;
  return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><b dir="ltr">${esc(r.code)}</b> · ${esc(qbGameLabel(r.game||"qb"))}<div class="mut">${subName(r.subject)} · ${n}/${r.maxPlayers||8} لاعب · ${r.public?"عام":"خاص"}</div></div><button class="btn sm" data-act="qbRequestJoin" data-code="${esc(r.code)}">انضم</button></div>`;
}).join("")}</div>`:`<div class="card mut">مفيش غرف عامة مفتوحة — اعمل غرفة من الزر فوق.</div>`}

</div>${studentNav()}`}


/* ===== Platform mini-games (robot mode) ===== */
function mathMake(){const ops=["+","-","×"],op=ops[Math.floor(Math.random()*3)];let a,b,ans;if(op==="+"){a=5+Math.floor(Math.random()*40);b=5+Math.floor(Math.random()*40);ans=a+b}else if(op==="-"){a=15+Math.floor(Math.random()*45);b=1+Math.floor(Math.random()*Math.min(a-1,30));ans=a-b}else{a=2+Math.floor(Math.random()*12);b=2+Math.floor(Math.random()*12);ans=a*b}const opts=new Set([ans]);while(opts.size<4)opts.add(ans+(Math.floor(Math.random()*11)-5)||ans+1);return{q:`${a} ${op} ${b}`,ans,opts:[...opts].sort(()=>Math.random()-.5)}}
function mathInit(){S.mathG={score:0,botScore:0,streak:0,left:30,item:mathMake(),over:false,_iv:0}}
function mathView(){if(!S.mathG)mathInit();const g=S.mathG;return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}<h2>حساب سريع 🔢 · روبوت</h2>
<div class="row" style="gap:8px;flex-wrap:wrap"><span class="pill">نقاطك: <b>${g.score}</b></span><span class="pill">روبوت: <b>${g.botScore}</b></span><span class="pill">وقت: <b>${g.left}s</b></span></div>
${g.over?`<div class="card" style="text-align:center"><b>${g.score>=g.botScore?"فزت! 🎉":"الروبوت أعلى"} · ${g.score}</b><div style="margin-top:8px"><button class="btn gold" data-act="mathRestart">تاني</button></div></div>`:`<div style="font-size:34px;font-weight:800;text-align:center;margin:16px">${g.item.q}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:360px;margin:0 auto">${g.item.opts.map(o=>`<button class="btn" data-act="mathPick" data-v="${o}">${o}</button>`).join("")}</div>`}</div>${studentNav()}`}
function xoWins(b,p){const L=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];for(const[a,c,d]of L)if(b[a]===p&&b[c]===p&&b[d]===p)return[a,c,d];return null}
function xoEmpty(b){return b.map((v,i)=>v?null:i).filter(x=>x!=null)}
function xoBest(b,diff){const emp=xoEmpty(b);if(!emp.length)return null;for(const i of emp){const t=b.slice();t[i]="O";if(xoWins(t,"O"))return i}for(const i of emp){const t=b.slice();t[i]="X";if(xoWins(t,"X"))return i}if(diff==="hard"&&b[4]==="")return 4;return emp[Math.floor(Math.random()*emp.length)]}
function xoInit(d){S.xo={board:Array(9).fill(""),turn:"X",diff:d||"medium",win:null,over:false,msg:"دورك (X)"}}
function xoView(){if(!S.xo)xoInit();const g=S.xo;return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}<h2>إكس أو · روبوت</h2>
<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ${g.diff==="easy"?"gold":"ghost"}" data-act="xoDiff" data-d="easy">سهل</button><button class="btn sm ${g.diff==="medium"?"gold":"ghost"}" data-act="xoDiff" data-d="medium">متوسط</button><button class="btn sm ${g.diff==="hard"?"gold":"ghost"}" data-act="xoDiff" data-d="hard">صعب</button><button class="btn ghost sm" data-act="xoRestart">جديد</button></div>
<p class="mut" style="text-align:center">${esc(g.msg)}</p>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:280px;margin:12px auto">${g.board.map((c,i)=>`<button style="aspect-ratio:1;font-size:42px;font-weight:800;border:0;border-radius:14px;background:var(--sel);color:var(--ink)" data-act="xoPlay" data-i="${i}" ${c||g.over||g.turn!=="X"?"disabled":""}>${c}</button>`).join("")}</div></div>${studentNav()}`}
const HANG_WORDS=["مدرسة","امتحان","تفوق","كتاب","مذاكرة","نجاح","ذكاء","علوم","تاريخ","قلم","طالب","معلم"];
const HANG_KEYS="ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآةى";
function hangInit(){S.hang={word:HANG_WORDS[Math.floor(Math.random()*HANG_WORDS.length)],guessed:{},left:7,over:false,won:false}}
function hangView(){if(!S.hang)hangInit();const h=S.hang;return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}<h2>كلمة مخفية</h2>
<span class="pill">محاولات: ${h.left}</span> <button class="btn ghost sm" data-act="hangRestart">جديدة</button>
<div style="display:flex;gap:6px;justify-content:center;margin:14px;font-size:26px;font-weight:800">${[...h.word].map(ch=>`<span style="min-width:28px;border-bottom:2px solid var(--line)">${h.guessed[ch]||h.over?ch:"_"}</span>`).join("")}</div>
${h.over?`<div class="card" style="text-align:center"><b>${h.won?"أحسنت!":"كانت: "+h.word}</b></div>`:`<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center">${[...HANG_KEYS].map(ch=>`<button class="btn sm" data-act="hangKey" data-ch="${ch}" ${h.guessed[ch]?"disabled":""}>${ch}</button>`).join("")}</div>`}</div>${studentNav()}`}
function spinInit(){const today=new Date().toISOString().slice(0,10);let used=false;try{used=localStorage.getItem("spin_day")===today}catch(_){}S.spin={used,rot:0,result:null,spinning:false,today}}
function spinView(){if(!S.spin)spinInit();const s=S.spin,L=["+10","+25","+50","+15","+5","+100"];return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}<h2>عجلة الحظ 🎰</h2>
<div style="width:200px;height:200px;border-radius:50%;margin:16px auto;background:conic-gradient(#E3A81C 0 60deg,#0B5D57 60deg 120deg,#7C3AED 120deg 180deg,#059669 180deg 240deg,#B42318 240deg 300deg,#2563EB 300deg 360deg);transform:rotate(${s.rot}deg);transition:transform 4s cubic-bezier(.15,.8,.2,1)"></div>
${s.spinning?"بتلف…":s.used?`<b>كسبت ${s.result!=null?L[s.result]:""} — بكرة تاني</b>`:`<button class="btn gold" data-act="spinGo">لف</button>`}</div>${studentNav()}`}
function reactInit(){S.reactG={phase:"wait",ms:null,best:null,msg:"اضغط ابدأ"};try{const b=+localStorage.getItem("react_best");if(b)S.reactG.best=b}catch(_){}}
function reactView(){if(!S.reactG)reactInit();const r=S.reactG;return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openGames">رجوع</button>`)}<h2>سرعة اللمس ⚡</h2>
<div data-act="reactTap" style="min-height:200px;border-radius:20px;display:grid;place-items:center;border:2px solid var(--line);background:${r.phase==="ready"?"#065f46":r.phase==="armed"?"#1e293b":"var(--card)"};color:${r.phase==="ready"||r.phase==="armed"?"#fff":"var(--ink)"};cursor:pointer;font-weight:700;font-size:18px">${esc(r.msg)}${r.ms!=null?`<div style="font-size:36px">${r.ms}ms</div>`:""}</div>
${r.phase==="wait"||r.phase==="result"||r.phase==="fail"?`<button class="btn gold" style="margin-top:12px" data-act="reactStart">ابدأ</button>`:""}${r.best?`<span class="pill">أفضل: ${r.best}ms</span>`:""}</div>${studentNav()}`}

function profileView(){
  const u=S.viewProfile;
  if(!u)return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openMe">رجوع</button>`)}<div class="card mut">مفيش ملف</div></div>${studentNav()}`;
  if(u.loading)return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="backProfile">رجوع</button>`)}<div class="card mut">جاري تحميل الملف الشخصي…</div></div>${studentNav()}`;
  const av=u.avatar
    ?`<img src="${u.avatar}" alt="" class="asmimg" data-act="zoom" data-uid="${esc(u.id||"")}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--pri);box-shadow:var(--sh);cursor:zoom-in">`
    :`<div class="av" style="width:96px;height:96px;font-size:36px;margin:0 auto">${esc((u.name||"?")[0])}</div>`;
  const phoneShow=u.phone?String(u.phone).replace(/(\d{3})\d{4}(\d{4})/,"$1****$2"):"";
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="backProfile">رجوع</button>`)}
<div class="card" style="text-align:center;padding:24px 16px">
  ${lfFr(av,lfPeer(u.id))}
  <h2 style="margin:12px 0 4px">${esc(u.name||"طالب")}</h2>${lfTag(u.id)}
  ${phoneShow?`<div class="mut" dir="ltr">${esc(phoneShow)}</div>`:""}
  ${u.blocked?pill("موقوف","r"):""}
  <div class="stats" style="margin-top:18px">
    <div class="stat card"><b>${u.rank!=null?"#"+u.rank:"—"}</b><span class="mut">الترتيب</span></div>
    <div class="stat card"><b>${u.examsDone!=null?u.examsDone:"—"}</b><span class="mut">امتحانات</span></div>
    <div class="stat card"><b>${u.pct!=null?u.pct+"%":"—"}</b><span class="mut">المتوسط</span></div>
    <div class="stat card"><b>${u.totalScore!=null?u.totalScore:"—"}</b><span class="mut">نقاط</span></div>
  </div>
</div>
${(()=>{const l=lfPeer(u.id);return l&&(l.pet||(l.eq&&Object.keys(l.eq.room||{}).length))?`<div class="card" style="padding:12px"><h3 style="margin:0 0 8px">🏠 غرفة ${esc((u.name||"").split(" ")[0])}</h3>${lfRoomHtml(l,u.xp||0,"p"+u.id)}</div>`:""})()}
${u.recent&&u.recent.length?`<div class="card"><h3>آخر النتائج</h3>${u.recent.map(r=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span style="flex:1"><b dir="auto">${esc(r.examTitle||"امتحان")}</b><div class="mut">${esc(subName(r.subject)||"")}</div></span><span><b>${r.score}/${r.total}</b> ${passPill(r)}</span></div>`).join("")}</div>`:`<div class="card mut">لسه مفيش نتائج ظاهرة.</div>`}
${u.id===S.user.uid||S.isAdmin?`<button class="btn block" data-act="studentCard" data-uid="${u.id}" style="margin-bottom:8px">🪪 بطاقة الطالب</button>`:""}${u.id===S.user.uid?`<button class="btn block ghost" data-act="openMe">تعديل حسابي</button>`:`<button class="btn block gold" data-act="startChat" data-uid="${u.id}" data-name="${esc(u.name||"طالب")}">💬 راسله دلوقتي</button><button class="btn block ghost" style="margin-top:8px" data-act="blockUser" data-uid="${u.id}">🚫 حظر</button>`}
</div>${studentNav()}`;
}


function runGlobalSearch(q){
  const qq=(q||"").trim().toLowerCase();
  const out={people:[],exams:[],books:[],games:[],groups:[]};
  if(!qq)return out;
  out.people=(S.friendHits||[]).slice(0,12);
  const exams=Array.isArray(S.exams)?S.exams:[];
  out.exams=exams.filter(e=>{
    if(e.published===false)return false;
    return ((e.title||"")+" "+(e.subject||"")).toLowerCase().includes(qq);
  }).slice(0,10);
  const books=Array.isArray(S.books)?S.books:[];
  out.books=books.filter(b=>((b.title||"")+" "+(b.subject||"")+" "+(b.name||"")).toLowerCase().includes(qq)).slice(0,8);
  const gameNames=[{id:"qb",name:"تحدي الأسئلة"},{id:"memory",name:"الذاكرة"},{id:"xo",name:"XO"}];
  out.games=gameNames.filter(g=>g.name.includes(q)||g.id.includes(qq));
  (S.openRooms||[]).forEach(r=>{
    const tt=((r.code||"")+" "+(r.subject||"")+" "+(r.game||"")).toLowerCase();
    if(tt.includes(qq))out.games.push({id:r.code,name:"غرفة "+r.code,room:true,code:r.code});
  });
  out.games=out.games.slice(0,10);
  const groups=Array.isArray(S.groups)?S.groups:[];
  out.groups=groups.filter(g=>((g.name||"")+" "+(g.lastText||"")).toLowerCase().includes(qq)).slice(0,8);
  return out;
}

function searchView(){
  const q=(S.friendQ||"").trim();
  const hits=S.friendHits||[];
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>🔍 بحث شامل</h2>
<p class="mut">زملاء · امتحانات · كتب · ألعاب · جروبات</p>
<div class="card">
<input id="friendQ" type="search" placeholder="ابحث بالاسم…" value="${esc(q)}" autocomplete="off" autofocus>
<button class="btn block" style="margin-top:10px" data-act="searchFriend">بحث</button>
</div>
${(()=>{
  const g=S.globalHits||{exams:[],books:[],games:[],groups:[]};
  let h="";
  if(g.exams&&g.exams.length)h+=`<div class="card"><b>📚 امتحانات</b>`+g.exams.map(e=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(e.title||"")}<div class="mut">${esc(e.subject||"")}</div></span></div>`).join("")+`</div>`;
  if(g.books&&g.books.length)h+=`<div class="card"><b>📖 كتب</b>`+g.books.map(b=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><a href="${esc(b.url||b.link||"#")}" target="_blank" rel="noopener">${esc(b.title||b.name||"كتاب")}</a></div>`).join("")+`</div>`;
  if(g.games&&g.games.length)h+=`<div class="card"><b>🎮 ألعاب</b>`+g.games.map(x=>x.room?`<button class="btn sm" style="margin:4px" data-act="qbRequestJoin" data-code="${esc(x.code)}">${esc(x.name)}</button>`:`<button class="btn sm" style="margin:4px" data-act="openGames">${esc(x.name)}</button>`).join("")+`</div>`;
  if(g.groups&&g.groups.length)h+=`<div class="card"><b>👥 جروبات</b>`+g.groups.map(gr=>`<button class="btn sm" style="margin:4px" data-act="openGroup" data-id="${gr.id}" data-name="${esc(gr.name||"")}">${esc(gr.name||"جروب")}</button>`).join("")+`</div>`;
  return h;
})()}
${S.friendSearching?`<div class="card mut">جاري البحث…</div>`:""}
${hits.length?hits.map(h=>{
  const av2=h.avatar?`<img src="${h.avatar}" alt="" style="width:52px;height:52px;border-radius:50%;object-fit:cover">`:`<div class="av" style="width:52px;height:52px;font-size:18px">${esc((h.name||"?")[0])}</div>`;
  return `<div class="card" style="padding:12px">
  <div class="row" style="align-items:flex-start;gap:12px">
  <button type="button" data-act="openProfile" data-uid="${h.id}" style="background:none;border:0;padding:0;cursor:pointer">${av2}</button>
  <div style="flex:1">
    <button type="button" data-act="openProfile" data-uid="${h.id}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--pri);font-weight:700;text-align:start">${esc(h.name||"طالب")}</button>
    
    <div style="margin-top:6px;font-size:13px">${h.rank?pill("#"+h.rank,"i"):""} ${h.examsDone!=null?pill(h.examsDone+" امتحان","g"):""} ${h.pct!=null?pill(h.pct+"%","y"):""}</div>
  </div>
  </div>
  <div class="row" style="margin-top:10px;gap:8px">
    <button class="btn sm" data-act="openProfile" data-uid="${h.id}">الملف</button>
    <button class="btn sm gold" data-act="startChat" data-uid="${h.id}" data-name="${esc(h.name||"طالب")}">💬 راسل</button>
  </div>
  </div>`;
}).join(""):(q&&!S.friendSearching?`<div class="card mut">مفيش نتائج لـ «${esc(q)}»</div>`:"")}
</div>${studentNav()}`;
}


function installBanner(){
  const standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone;
  if(standalone)return `<div class="install-banner"><span>✓</span><div style="flex:1"><b>تطبيق التفوق</b><div class="mut">شغّال كتطبيق — تحديثاتك توصل تلقائي</div></div></div>`;
  return `<div class="install-banner">
    <span style="font-size:28px">📲</span>
    <div style="flex:1"><b>حمّل تطبيق التفوق</b><div class="mut">أندرويد — ملف APK للتثبيت المباشر</div></div>
    <button class="btn sm gold" data-act="installApp">⬇ تحميل APK</button>
  </div>`;
}

function chatListView(){
  const tab=S.chatTab||"dms";
  const list=S.chats||[];
  const groups=S.groups||[];
  return `<div class="wrap">${header()}
<h2 style="margin-bottom:4px">صندوق الوارد</h2>
<div class="tk-tabs">
  <button type="button" class="${tab==="dms"?"on":""}" data-act="chatTab" data-id="dms">الرسائل ${(S.unreadChat||0)?`<span class="tk-badge">${S.unreadChat}</span>`:""}</button>
  <button type="button" class="${tab==="groups"?"on":""}" data-act="chatTab" data-id="groups">الجروبات</button>
</div>
${tab==="dms"?`
  ${list.length?list.map(c=>{
    const other=c.otherName||"زميل";
    const av=c.otherAvatar?`<img class="tk-av" src="${c.otherAvatar}" alt="">`:`<div class="tk-av letter">${esc((other[0]||"?"))}</div>`;
    return `<button type="button" class="tk-row" data-act="openChat" data-uid="${c.otherUid}" data-name="${esc(other)}">
      ${av}
      <div class="tk-meta"><b>${esc(other)}</b><div class="preview">${esc(c.lastText||"ابدأ المحادثة…")}</div></div>
      <div style="text-align:end"><div class="tk-time">${c.lastAt?fmt(c.lastAt):""}</div>${c.unread?`<span class="tk-badge">${c.unread}</span>`:""}</div>
    </button>`;
  }).join(""):`<div class="card mut" style="text-align:center">مفيش رسائل لسه<br><button class="btn sm" style="margin-top:10px" data-act="openSearch">ابحث عن حد وراسله</button></div>`}
  <button class="btn block ghost" style="margin-top:12px" data-act="openSearch">🔍 رسالة جديدة</button>
`:`
  <button class="btn block gold" data-act="createGroup">＋ إنشاء جروب</button>
  ${groups.length?groups.map(g=>`<button type="button" class="tk-row" data-act="openGroup" data-id="${g.id}" data-name="${esc(g.name||"")}">
    <div class="tk-av letter">👥</div>
    <div class="tk-meta"><b>${esc(g.name||"جروب")}</b><div class="preview">${esc(g.lastText||(g.members||[]).length+" عضو")}</div></div>
    <div class="tk-time">${g.updatedAt?fmt(g.updatedAt):""}</div>
  </button>`).join(""):`<div class="card mut" style="text-align:center">مفيش جروبات — أنشئ واحد وادعُ أصحابك</div>`}
`}
</div>${studentNav()}`;
}


const REACT_EMOJI=["❤️","😂","🔥","👍","👏","😮","😢","🙏","⭐","🎉","💯","🤔"];
function reactsHtml(col, id, reacts, mine){
  const r=reacts||{};
  const chips=Object.keys(r).filter(k=>(r[k]||[]).length).map(k=>{
    const n=(r[k]||[]).length, on=(r[k]||[]).includes(S.user&&S.user.uid);
    return `<button type="button" class="${on?"on":""}" data-act="toggleReact" data-col="${col}" data-id="${id}" data-emoji="${encodeURIComponent(k)}">${k} ${n}</button>`;
  }).join("");
  return chips?`<div class="msg-reacts">${chips}</div>`:"";
}

function dmBubbleHtml(m){
  if(m.deleted){
    const mine=m.fromUid===S.user.uid;
    return `<div class="tk-bubble ${mine?"me":"them"} deleted" data-mid="${m.id}"><div class="mut" style="font-style:italic">تم حذف الرسالة</div><span class="when">${m.createdAt?fmt(m.createdAt):""}</span></div>`;
  }
  const mine=m.fromUid===S.user.uid;
  const reply=m.replyTo?`<div class="tk-reply-q" dir="auto"><b>${esc(m.replyTo.name||"")}</b> ${esc((m.replyTo.text||"").slice(0,80))}</div>`:"";
  const acts=m._local?"":`<button type="button" class="tk-mini" data-act="pickReact" data-col="dm" data-id="${m.id}" aria-label="تفاعل">☺</button><button type="button" class="tk-mini" data-act="dmReply" data-id="${m.id}" data-text="${esc((m.text||"").slice(0,120))}" data-name="${esc(m.fromName||"")}" aria-label="رد">↩</button>${mine?`<button type="button" class="tk-mini" data-act="dmDelete" data-id="${m.id}" aria-label="حذف">🗑</button>`:""}`;
  return `<div class="tk-bubble ${mine?"me":"them"}${lfBub(m.fromUid)}" data-mid="${m.id}">
      ${!mine&&m.fromName?`<div style="font-size:11px;opacity:.8;margin-bottom:2px">${esc(m.fromName)}${lfTag(m.fromUid)}</div>`:""}
      ${reply}
      ${m.text&&m.kind!=="audio"?`<div dir="auto">${esc(m.text)}</div>`:""}
      ${m.img?mediaEmbed(m.img,m.kind):""}
      ${m.roomCode?`<button class="btn sm gold" style="margin-top:6px" data-act="qbJoinInvite" data-code="${esc(m.roomCode)}">دخول الغرفة</button>`:""}
      ${reactsHtml("dm",m.id,m.reacts,true)}
      <div class="tk-foot"><span class="when">${m.createdAt?fmt(m.createdAt):""}${m.read&&mine?" · ✓✓":(mine?" · ✓":"")}</span>${acts}</div>
    </div>`;
}
function chatThreadView(){
  const t=S.chatThread;if(!t)return chatListView();
  const msgs=S.chatMsgs||[];
  const typing=`<div id="dmTypingLine" class="mut" style="font-size:12px;margin-top:2px">${S.chatTyping?"يكتب الآن…":""}</div>`;
  const replyBar=S.replyTo?`<div class="tk-reply-bar"><div style="flex:1;min-width:0" dir="auto"><b>رد على ${esc(S.replyTo.name||"")}</b><div class="mut" style="font-size:12px">${esc((S.replyTo.text||"").slice(0,100))}</div></div><button type="button" class="btn ghost sm" data-act="dmCancelReply">✕</button></div>`:"";
  return `<div class="wrap chat-wrap">${header(NOHDR)}
<div class="tk-peer-row">
  <button class="btn ghost sm" data-act="openChats">رجوع</button>
  <button type="button" data-act="openProfile" data-uid="${t.uid}" style="background:none;border:0;padding:0;cursor:pointer">
    ${t.avatar?`<img class="tk-av" src="${t.avatar}" alt="" style="width:44px;height:44px">`:`<div class="tk-av letter" style="width:44px;height:44px;font-size:16px">${esc((t.name||"?")[0])}</div>`}
  </button>
  <div style="flex:1;min-width:0">
    <b data-act="openProfile" data-uid="${t.uid}" style="cursor:pointer">${esc(t.name||"زميل")}<i id="dmOnlineDot" class="online-dot${S.chatPeerOnline?"":" off"}"></i></b>
    <div id="dmOnlineTxt" class="mut" style="font-size:12px">${S.chatPeerOnline?"متصل":"غير متصل"}</div>
    ${typing}
  </div>
  <button class="btn ghost sm" data-act="startCall" data-uid="${t.uid}" data-name="${esc(t.name||"")}" aria-label="مكالمة">📞</button>
</div>
<div class="tk-thread">
  <div class="tk-log" id="dmChatLog">${msgs.length?msgs.map(dmBubbleHtml).join(""):`<div class="mut" style="text-align:center;margin:auto">قول سلام 👋</div>`}</div>
</div>
${replyBar}
<form class="tk-compose" data-submit="dmSend">
  <button type="button" class="btn ghost sm" data-act="dmVoice" title="تسجيل صوت">🎙</button>
  <label class="btn ghost sm" style="margin:0;cursor:pointer" title="صورة">🖼<input type="file" id="dmImg" accept="image/*" multiple hidden></label>
  <input id="dmIn" type="text" maxlength="2000" placeholder="${S.replyTo?"اكتب ردك…":"اكتب رسالة…"}" autocomplete="off">
  <button class="btn sm" type="submit">➤</button>
</form>
</div>${studentNav()}`;
}



function meView(){
  if(!S.profile)S.profile={name:"طالب",phone:""};

  const p=S.profile||{};
  const av=p.avatar?`<img src="${p.avatar}" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--pri)">`:`<div class="av" style="width:72px;height:72px;font-size:28px">${esc((p.name||"؟")[0]||"?")}</div>`;
  const xp=p.xp||0;
  const title=(typeof xpTitle==="function"?xpTitle(xp):{emoji:"🌱",name:p.title||"المبتدئ"});
  const lvl=typeof xpLevel==="function"?xpLevel(xp):1;
  const prog=typeof xpProgress==="function"?xpProgress(xp):0;
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>حسابي</h2>
${typeof installBanner==="function"?installBanner():""}
${S.life&&S.life.pet?`<div class="card" style="padding:12px"><div class="row" style="margin-bottom:8px"><b style="flex:1">🏠 غرفتي</b><button class="btn gold sm" data-act="openLife">المتجر والتعديل</button></div>${lfRoomHtml(S.life,xp,"me")}<div class="mut" style="font-size:12px;margin-top:6px;text-align:center">اضغط على الأرض يجيلك الحيوان · واضغط عليه يلعب معاك 💖</div></div>`:`<div class="card" style="text-align:center"><div style="font-size:42px">🥚</div><button class="btn gold block" data-act="openLife">اختار رفيقك وابدأ غرفتك</button></div>`}
<div class="card xp-card" style="text-align:center">${lfFr(av,S.life)}${lfChip()}
<div style="margin-top:8px"><b>${esc(p.name||"طالب")}</b></div>
<div class="mut">${esc(p.phone||"")}</div>
<div class="title-pill">${title.emoji||"🌱"} ${esc(title.name||p.title||"المبتدئ")}</div>
<div class="xp-lvl">المستوى ${lvl}</div>
<div class="mut">${xp} XP · 🔥 ${(p.streak||0)} يوم متتالي</div>
<div class="xp-bar"><i style="width:${prog}%"></i></div>
<div class="mut" style="font-size:12px">${50-(xp%50)} XP للمستوى التالي</div>
${(p.badges||[]).length?`<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center">${(p.badges||[]).map(b=>pill("🏅 "+b,"g")).join("")}</div>`:""}
<label class="btn ghost sm" style="margin-top:10px;cursor:pointer">📷 صورة شخصية<input type="file" id="meAvatar" accept="image/*" hidden></label>
</div>
<div class="card">
  <button class="btn block gold" data-act="openAI">🤖 么</button>
  <p class="mut" style="margin:8px 0 0;text-align:center">اسأل 么 عن الدروس والامتحانات والمنصة</p>
</div>
<div class="card"><b>الإشعارات</b>
<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm ghost" data-act="enablePush">🔔 تفعيل الإشعارات</button></div>
<p class="mut" style="font-size:12px;margin:8px 0 0">${pushStateText()}</p></div>
<div class="card"><b>تغيير الاسم</b>
<label class="f">الاسم</label>
<input id="meName" type="text" value="${esc(p.name||"")}" maxlength="40">
<button class="btn sm" style="margin-top:10px" data-act="meSaveName">حفظ الاسم</button>
</div>
<div class="card"><b>تغيير كلمة السر</b>
<p class="mut" style="margin:4px 0 8px">يُسمح مرة كل أسبوع، ومن جهاز سبق دخول الحساب منه. لو معاك كود استعادة من المدرس اكتبُه تحت.</p>
<label class="f">كلمة السر الجديدة</label>
<input id="mePw" class="ltr" type="password" autocomplete="new-password" minlength="6">
<label class="f">تأكيد</label>
<input id="mePw2" class="ltr" type="password" autocomplete="new-password" minlength="6">
<label class="f">كود الاستعادة (اختياري)</label>
<input id="meResetCode" class="ltr" type="text" maxlength="8" placeholder="من المدرس إن وُجد">
<button class="btn sm" style="margin-top:10px" data-act="meChangePw">تغيير كلمة السر</button>
</div>
<button class="btn ghost block" data-act="logout">تسجيل خروج</button>
</div>${studentNav()}`;
}


/* ===== v78-ai: كتب الـ AI + وكيل الأدمن ===== */
function bkUrl(){return ((S.site&&S.site.booksUrl)||"").trim().replace(/\/+$/,"")}
function bkKey(){return ((S.aiCfg&&S.aiCfg.booksKey)||"").trim()}
async function bkApi(path,body,needKey){
  const u=bkUrl();
  if(!u)throw new Error("وسيط الكتب مش مضبوط من الإعدادات");
  const h={"Content-Type":"application/json"};
  if(needKey){
    if(!bkKey())throw new Error("حط مفتاح ADMIN_KEY بتاع الكتب في الإعدادات");
    h["Authorization"]="Bearer "+bkKey();
  }
  const r=await fetch(u+path,{method:"POST",headers:h,body:JSON.stringify(body||{})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok)throw new Error((j&&j.error)||("خطأ "+r.status));
  return j;
}
function bkLoadList(){
  if(!bkUrl()||S.bkList||S.bkListLoading)return;
  S.bkListLoading=true;
  bkApi("/list",{},false).then(j=>{S.bkList=j.books||[];S.bkListLoading=false;scheduleRender()})
    .catch(()=>{S.bkListLoading=false;scheduleRender()});
}
async function ensurePdfjs(){
  if(window.pdfjsLib)return window.pdfjsLib;
  await new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.onload=res;s.onerror=()=>rej(new Error("فشل تحميل قارئ الـ PDF — شوف النت"));
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  return window.pdfjsLib;
}
async function aiChatEndpoint(message,system,history){
  const url=(S.site&&(S.site.aiProxy||S.site.aiUrl))||"";
  if(!url)throw new Error("مفيش وسيط AI مضبوط في الإعدادات");
  const headers={"Content-Type":"application/json"};
  if(S.site.aiProxy){try{headers["Authorization"]="Bearer "+await auth.currentUser.getIdToken()}catch(_){}}
  else if(S.site.aiKey)headers["Authorization"]="Bearer "+S.site.aiKey;
  const r=await fetch(url,{method:"POST",headers,body:JSON.stringify({message,uid:(S.user&&S.user.uid)||"admin",name:"admin",view:"admin",system,history:history||[]})});
  if(!r.ok)throw new Error("الـ AI مردش (حالة "+r.status+")");
  const j=await r.json().catch(()=>null);
  const reply=j&&(j.reply||j.text||j.message);
  if(!reply)throw new Error("الـ AI رجّع رد فاضي");
  return String(reply);
}
function agentExtractJson(txt){
  if(!txt)return null;
  let s=String(txt).replace(/```json|```/g,"").trim();
  const a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch(_){}}
  try{return JSON.parse(s)}catch(_){return null}
}
function agentActLabel(a){
  switch(a&&a.act){
    case "broadcast":return "📢 إشعار لكل الطلاب: "+(a.text||"");
    case "maintenance":return "🛠 "+(a.on?"تشغيل":"إيقاف")+" وضع الصيانة";
    case "addxp":return "⭐ إضافة "+(a.amount||0)+" XP للرقم "+(a.phone||"؟");
    case "publishexam":return "📝 نشر امتحان: "+(a.title||"");
    case "hideexam":return "🙈 إخفاء امتحان: "+(a.title||"");
    case "genexam":return "🎲 توليد امتحان "+(a.count||10)+" سؤال من «"+(a.book||"")+"»";
    default:return JSON.stringify(a);
  }
}
function bagView(){
  const msgs=(S.bagMsgs&&S.bagMsgs.length)?S.bagMsgs:[{role:"bot",text:"أهلاً بك في «اسأل من الكتب» 📚🤖\nاكتب أي سؤال من المنهق — أدوّر في الكتب وأجاوبك وأقولك اسم الكتاب ورقم الصفحة."}];
  return `<div class="wrap chat-wrap">${header(`<button class="btn ghost sm" data-act="openBooks">رجوع</button>`)}
<h2>📚🤖 اسأل من الكتب</h2>
<div class="card">
  <div class="ai-log" id="bagLog">${msgs.map(m=>`<div class="ai-bubble ${m.role==="me"?"me":"bot"}" dir="auto">${esc(m.text)}${m.cites&&m.cites.length?`<div style="margin-top:6px">${m.cites.map(c=>`<span class="pill i" style="margin:2px 0 0 4px">📖 «${esc(c.title)}» ص ${esc(String(c.page))}</span>`).join("")}</div>`:""}</div>`).join("")}</div>
  <form class="tk-compose" style="position:relative;bottom:auto;left:auto;right:auto;margin-top:12px;display:flex;gap:6px;align-items:center" data-submit="bagSend">
    <input id="bagIn" type="text" maxlength="800" placeholder="اكتب سؤالك من الكتاب…" autocomplete="off" style="flex:1">
    <button class="btn sm" type="submit">➤</button>
  </form>
  ${S.bagBusy?`<p class="mut" style="margin:6px 0 0">🤖 بدوّر في الكتب…</p>`:""}
</div>
</div>${studentNav()}`;
}
function adminAgent(){
  const msgs=(S.agentMsgs&&S.agentMsgs.length)?S.agentMsgs:[{role:"bot",text:"أنا وكيل الأدمن 🤖👑\nقولي بالعربي وأنا أنفّذ — أعرضلك الخطة الأول وتوافق:\n• «ابعت إشعار لكل الطلاب إن المراجعة بكرة»\n• «شغّل وضع الصيانة»\n• «ضيف 50 XP للطالب صاحب الرقم <رقم الطالب>»\n• «انشر امتحان الفلسفة» / «خبّي امتحان التاريخ»\n• «ولّد امتحان 10 أسئلة من كتاب التاريخ»\nواسألني برضه عن حالة المنصة وأجاوبك."}];
  const plan=S.agentPlan||[];
  const planCard=plan.length?`<div class="card" style="border-color:var(--gold)">
  <h3 style="margin-top:0">📋 خطة التنفيذ (${plan.length} خطوة)</h3>
  ${plan.map(a=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(agentActLabel(a))}</b></div>`).join("")}
  <div class="row" style="margin-top:10px"><button class="btn" data-act="agentRun">✅ تنفيذ</button><button class="btn ghost" data-act="agentClear">إلغاء</button></div></div>`:"";
  return `<div class="wrap chat-wrap">${header(`<button class="btn ghost sm" data-act="backAdmin">رجوع</button>`)}
<h2>🤖👑 وكيل الأدمن</h2>
${planCard}
<div class="card">
  <div class="ai-log" id="agLog">${msgs.map(m=>`<div class="ai-bubble ${m.role==="me"?"me":"bot"}" dir="auto">${esc(m.text)}</div>`).join("")}</div>
  <form class="tk-compose" style="position:relative;bottom:auto;left:auto;right:auto;margin-top:12px;display:flex;gap:6px;align-items:center" data-submit="agentSend">
    <input id="agentIn" type="text" maxlength="500" placeholder="قولي أنفّذ إيه…" autocomplete="off" style="flex:1">
    <button class="btn sm" type="submit">➤</button>
  </form>
  ${S.agentBusy?`<p class="mut" style="margin:6px 0 0">🤖 بفكّر…</p>`:""}
</div>
<p class="mut">الوكيل بيتصل بنفس وسيط الـ AI الموجود عندك، وبينفّذ الأفعال بحد أقصى 10 خطوات في الخطة، وانت اللي بيعتمد قبل أي تنفيذ.</p>
</div>`;
}
function aiView(){
  const msgs=S.aiMsgs||[{role:"bot",text:"أهلاً! أنا 么 🤖\nصاحبك على المنصة — اسأل عن أي درس أو امتحان أو خطوة.\nتقدر ترفع ملف ملخص (نص/PDF صغير) من الزر 📎 وأنا أراجعه معاك."}];
  return `<div class="wrap chat-wrap">${header(`<button class="btn ghost sm" data-act="openMe">رجوع</button>`)}
<h2>🤖 么</h2>
<p class="mut">محادثة طبيعية · رفع ملخصات · مراجعة إجابات · حفظ تلقائي</p>
<div class="card">
  <div class="ai-log" id="aiLog">${msgs.map(m=>`<div class="ai-bubble ${m.role==="me"?"me":"bot"}" dir="auto">${esc(m.text)}${m.fileName?`<div class="mut" style="margin-top:4px">📎 ${esc(m.fileName)}</div>`:""}</div>`).join("")}</div>
  <form class="tk-compose" style="position:relative;bottom:auto;left:auto;right:auto;margin-top:12px;display:flex;gap:6px;align-items:center" data-submit="aiSend">
    <label class="btn ghost sm" style="margin:0;cursor:pointer" title="رفع ملخص أو نص">📎
      <input type="file" id="aiFile" accept=".txt,.pdf,text/plain,application/pdf,image/*" style="display:none">
    </label>
    <input id="aiIn" type="text" maxlength="2000" placeholder="اكتب كإنك بتكلم صاحبك…" autocomplete="off" style="flex:1">
    <button class="btn sm" type="submit">➤</button>
  </form>
  <p class="mut" id="aiFileHint" style="margin:6px 0 0"></p>
</div>
</div>${studentNav()}`;
}
function aiLocalReply(q){
  const s=normalizeAr(q);
  const name=(S.profile&&S.profile.name)?S.profile.name.split(" ")[0]:"";
  const hi=name?("يا "+name+"، "):"";

  // —— حماية الخصوصية: أرقام/أسماء/من موجود ——
  if(/(كام|عدد|قد ايه|كام واحد|كام طالب|كام شخص|مين في|مين موجود|مين اونلاين|مين متصل|اسماء|أسماء|قائمة الطلاب|ليست الطلاب|ارقام|أرقام|تليفونات|موبايلات|ip|اي بي|مين داخل|who is online|how many|list (students|users)|ايميلات)/.test(s)
     && /(منصه|المنصه|طلاب|طالب|يوزر|مستخدم|حساب|متصل|اونلاين|موجود)/.test(s)){
    return hi+"مش هقدر أجاوب على أسئلة عن **أعداد أو أسماء أو أرقام** الموجودين على المنصة — دي بيانات خاصة.\nأقدر أساعدك في: شرح المنصة، الدروس، أسئلة الامتحانات، والكتب.";
  }
  if(/(مين|اسم|رقم|تليفون|موبايل).{0,20}(طالب|ادمن|مدرس|فلان)/.test(s) && !/امتحان|سؤال|درس|كتاب/.test(s))
    return hi+"ماينفعش أشارك أسماء أو أرقام حسابات. لو محتاج مساعدة في مذاكرة أو استخدام المنصة، اسأل براحتك.";

  if(/مين انت|انت مين|من انت|ايه اسمك|عرف نفسك|who are you|ما اسمك/.test(s)||s.trim()==="么")
    return "أنا **么** 🤖 صاحبك على منصة التفوق.\nبكلّمك عادي زي أي حد بذاكر معاك.\n\nبقدر:\n• أشرح أي جزء في المنصة (امتحانات، شات، ألعاب، تقييمات، XP…)\n• أراجع أسئلة من الامتحانات والكتب المسجّلة\n• أوضّح خطوات الاستخدام\n\n**مش بقدر** أقول أعداد أو أسماء الطلاب أو أرقامهم — خصوصية.\nاسأل بأي صيغة، ولو السؤال ناقص هطلب توضيح.";

  if(/سلام|اهلا|مرحبا|ازيك|صباح|مساء/.test(s))
    return "وعليكم السلام "+hi+"🙂 عامل إيه؟ تحب نراجع سؤال، نفتح ملخص، ولا أوريك خطوة في المنصة؟";

  // —— دليل المنصة الشامل ——
  if(/ازاي|كيف|فين|مش فاهم|ايه هو|يعني ايه|شرح|استخدام|استخدم/.test(s)){
    if(/امتحان|اختبار/.test(s))
      return hi+"**الامتحانات:**\n1) من الشريط تحت → **المواد**\n2) اختار المادة → اختار امتحان → **ابدأ**\n3) جاوب، والشريط فوق بيحسب الوقت\n4) **تسليم** في الآخر\n\n• غالبًا **محاولتين** لكل امتحان\n• تقدر **حفظ وخرج** وترجع تكمل من نفس الجهاز\n• الخروج من الصفحة أثناء الامتحان بيتسجّل عند المدرس\n• بعد التسليم: درجتك + مراجعة الإجابات";
    if(/تقييم|حل|نموذج/.test(s))
      return hi+"**التقييمات:** من الرئيسية → التقييمات. فيها ملفات/نماذج. الحل يظهر لما الأدمن يفتحه. مش زي الامتحان المتزمن — للتمرين والمراجعة.";
    if(/افتح غرف|انشئ غرف|اعمل غرف|عايز غرف|دخول غرف|كود الغرف|انضم/.test(s)||(/غرف/.test(s)&&/ازاي|فين|كيف|عايز/.test(s)))
      return hi+"**فتح غرفة ألعاب:**\n1) من الشريط تحت → **الألعاب**\n2) اختار اللعبة\n3) **إنشاء غرفة** → هياخد كود\n4) ابعت الكود لأصحابك → **انضمام** + الكود\nتقدروا تتكلموا جوّه الغرفة وتتنافسوا.";
    if(/لعبه|العاب|روبوت|كويز|battle|غرفة/.test(s))
      return hi+"**الألعاب:** تبويب **الألعاب** تحت.\n• ضد روبوت من اللعبة\n• غرفة مع أصحابك: إنشاء → كود → انضمام\n• عايز تفتح غرفة دلوقتي؟ روح تبويب الألعاب.";
    if(/شات|جروب|تواصل|رسايل|محادث|مكلمه|اتصال/.test(s))
      return hi+"**التواصل:** تبويب تواصل.\n• محادثات **خاصة** مع طالب أو المدرس\n• **جروبات**\n• نص / صورة / صوت\n• **مكالمة صوتية** 📞 من الشات\n• الاسم الظاهر في الشات ممكن يختلف عن اسم الحساب (والمدرس يشوف الاثنين)";
    if(/فضايح|كتب|xp|نقط|لفل|حسابي|ملف|صوره|ستريك|لقب/.test(s))
      return hi+"**حسابي:** صورتك، XP، الألقاب، الستريك، وتغيير كلمة السر.\n**الكتب:** من الرئيسية للتحميل/المراجعة.\n**فضايح:** لقطات بعد موافقة الأدمن.\n**XP:** بتجيب من الامتحانات والنشاط — كل ما زادت قربت للقب أعلى.";
    if(/نسيت|كلمة سر|باسورد|password|دخول|تسجيل|حساب جديد/.test(s))
      return hi+"**تسجيل الدخول:** رقم الموبايل + كلمة السر.\n**حساب جديد:** من شاشة الدخول → إنشاء حساب.\n**نسيت كلمة السر:** كلّم المدرس من واتساب/المنصة وهو يقدر يعيّن لك كلمة سر جديدة من لوحة التحكم.\nمن **حسابي** وأنت داخل تقدر تغيّر كلمة سرك بنفسك.";
    if(/وضع|ليلي|نهاري|ثيم|الوان/.test(s))
      return hi+"من زر القمر/الشمس فوق تغيّر الوضع الليلي والنهاري. الاختيار بيتخزن على جهازك.";
    if(/تنزيل|تطبيق|apk|تثبيت|pwa/.test(s))
      return hi+"تقدر تثبّت المنصة كتطبيق:\n• من زر التحميل لو ظهر\n• أو من قائمة المتصفح → **إضافة إلى الشاشة الرئيسية**\nهتشتغل زي التطبيق من غير متجر.";
    if(/ادمن|مدرس|لوحة/.test(s) && S.isAdmin)
      return hi+"**لوحة الأدمن:** إحصائيات، امتحانات، طلاب، نتائج، تنبيهات، شات، كتب، إعدادات، وربط المساعد.\nمن ملف الطالب: حظر، شات، وتعيين كلمة سر جديدة.";
    if(/منصه|التفوق|ساعد|مساعد|么/.test(s))
      return hi+"منصة **التفوق**: امتحانات متزمنة، تقييمات، ألعاب، شات، كتب، XP، ومساعد 么.\nاسأل عن أي تبويب أو خطوة بالتفصيل.";
  }

  // —— بحث في الامتحانات ——
  const exams=(S.exams||[]).filter(e=>vis(e)||S.isAdmin);
  const qTokens=s.split(/\s+/).filter(w=>w.length>2);
  let examHits=[];
  for(const e of exams){
    const list=Array.isArray(e.questions)?e.questions:[];
    for(let i=0;i<(list.length||0);i++){
      const qq=list[i];
      if(!qq||qq.fun)continue;
      const qt=normalizeAr(qq.q||qq.question||"");
      const opts=(qq.o||qq.options||[]).map(x=>normalizeAr(String(x))).join(" ");
      let score=0;
      for(const w of qTokens){if(qt.includes(w))score+=2;if(opts.includes(w))score+=1}
      if(score>=3){
        const ansIdx=typeof qq.a==="number"?qq.a:(typeof qq.answer==="number"?qq.answer:-1);
        const optsArr=qq.o||qq.options||[];
        const ansTxt=ansIdx>=0&&optsArr[ansIdx]!=null?String(optsArr[ansIdx]):(qq.model||"");
        examHits.push({score,exam:e.title||"",q:qq.q||qq.question||"",ans:ansTxt,opts:optsArr});
      }
    }
  }
  examHits.sort((a,b)=>b.score-a.score);
  if(examHits.length){
    let out=hi+"لقيت أسئلة قريبة من امتحانات المنصة:\n\n";
    examHits.slice(0,3).forEach((h,i)=>{
      out+="**"+(i+1)+". من «"+h.exam+"»:**\n"+String(h.q).slice(0,180)+"\n";
      if(h.ans)out+="✅ الإجابة: "+h.ans+"\n";
      out+="\n";
    });
    out+="لو مش ده اللي تقصده، صغّر السؤال أو اذكر عنوان الامتحان.";
    return out;
  }

  // —— بحث في الكتب ——
  const books=(S.books||[]).filter(b=>(b.content||"").trim().length>15);
  if(books.length){
    let best=null,bestScore=0,snippet="";
    for(const b of books){
      const c=normalizeAr(b.content), th=normalizeAr(b.title||"");
      let score=0;
      for(const w of qTokens){if(c.includes(w))score++;if(th.includes(w))score+=2}
      if(score>bestScore){
        bestScore=score;best=b;
        const raw=b.content||"";
        let idx=0;
        for(const w of qTokens){const p=normalizeAr(raw).indexOf(w);if(p>=0){idx=Math.max(0,p-50);break}}
        snippet=raw.slice(idx,idx+450).trim();
        if(idx>0)snippet="…"+snippet;
        if(raw.length>idx+450)snippet+="…";
      }
    }
    if(best&&bestScore>=2)
      return hi+"من كتاب **"+best.title+"**:\n\n"+snippet+"\n\nعايز تفصيل أكتر من نفس الكتاب؟";
  }

  // منهج أساسي مختصر
  if(/معلق/.test(s))
    return hi+"المعلقات: قصائد طوال من أجود الشعر الجاهلي (امرؤ القيس، زهير، طرفة، لبيد، عنترة، الحارث، عمرو بن كلثوم).";
  if(/جاهل|عصر جاهل/.test(s))
    return hi+"العصر الجاهلي قبل الإسلام ~قرن ونصف. أدب: شعر ونثر. الجهالة هنا بمعنى فعل القبيح بعلم.";
  if(/اذاكر|مذاكر/.test(s))
    return hi+"ذاكر جزء → حل أسئلة من المنصة → راجع الغلط → كرّر تاني يوم. استخدم الامتحانات كاختبار زمني.";
  if(/كتاب|كتب/.test(s)){
    const n=(S.books||[]).length;
    return n?hi+"الكتب المتاحة:\n"+(S.books||[]).map(b=>"• "+b.title).join("\n")+"\nاسأل عن عنوان معيّن لو النص متسجّل عندي.":hi+"لسه مفيش كتب بنص للمراجعة. الأدمن يضيف الكتاب + ملخصه من لوحة الكتب.";
  }
  if(/امتحان|امتحانات/.test(s)){
    const visEx=exams.filter(e=>vis(e));
    return visEx.length?hi+"في امتحانات متاحة زي:\n"+visEx.slice(0,8).map(e=>"• "+(e.title||"")+" ("+(e.subject||"")+")").join("\n")+"\nمن **المواد** تقدر تبدأ.":hi+"مفيش امتحانات ظاهرة لك دلوقتي. لو المدرس لسه ما نشرش، استنى أو كلّمه.";
  }

  return (function(){
    const exams=Array.isArray(S.exams)?S.exams:[];
    const words=s.split(/\s+/).filter(function(w){return w.length>2}).slice(0,10);
    var hits=[];
    for(var ei=0;ei<exams.length;ei++){
      var ex=exams[ei];
      var qs=ex.questions||[];
      for(var qi=0;qi<qs.length;qi++){
        var qq=qs[qi];
        var qt=normalizeAr(String(qq.q||""));
        var ok=false;
        for(var wi=0;wi<words.length;wi++){ if(qt.indexOf(words[wi])>=0){ok=true;break;} }
        if(ok){
          var ans=(typeof qq.a==="number"&&qq.o)?qq.o[qq.a]:"";
          hits.push("• "+(ex.title||"امتحان")+": "+String(qq.q||"").slice(0,140)+(ans?(" — الإجابة: "+ans):""));
          if(hits.length>=5)break;
        }
      }
      if(hits.length>=5)break;
    }
    if(hits.length) return hi+"لقيت أسئلة قريبة:\n"+hits.join("\n")+"\n\nلو مش المطلوب، انسخ السؤال كامل من الامتحان.";
    if(/امتحان|ذاكر|درس|شرح|معنى|قانون|اعرب|حل/.test(s))
      return hi+"مفيش نص مطابق في الامتحانات المحمّلة دلوقتي. اكتب السؤال كامل أو حدّد الدرس/المادة.";
    return hi+"وضّح أكتر: امتحان، شرح درس، ولا خطوة في المنصة؟ مثال: «ازاي أبدأ امتحان؟»";
  })();
}

/* v79: صفحة الكتب — كتب الأدمن + اسأل من الكتب */
function booksView(){
  const list=S.books||[];
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>📚 الكتب</h2>
<p class="mut">ملفات وكتب للتحميل أو الفتح</p>
${(S.site&&S.site.booksUrl)?`<button class="subj wide" style="background:linear-gradient(135deg,#6D28D9,#A78BFA);margin-bottom:12px" data-act="openBag"><span class="g">🤖</span><div><b>اسأل الذكاء من الكتب</b><br><small>اسأل أي سؤال من المنهج — يجاوبك ويقولك الكتاب ورقم الصفحة</small></div></button>`:""}
${list.length?list.map(b=>{
  const href=b.b64?("data:application/pdf;base64,"+b.b64):(b.url&&String(b.url).indexOf("data:")!==0?b.url:"");
  return `<div class="card book-card">
  <div class="ico">${b.kind==="pdf"?"📄":"📘"}</div>
  <div style="flex:1;min-width:0"><b>${esc(b.title||"كتاب")}</b>
  <div class="mut">${esc(b.subject||"")} ${b.name?("· "+esc(b.name)):""}</div></div>
  <div style="display:flex;flex-direction:column;gap:6px">
    ${href?`<a class="btn sm" href="${esc(href)}" target="_blank" rel="noopener">فتح</a>
    <a class="btn ghost sm" href="${esc(href)}" download="${esc(b.title||"book")}.pdf">⬇ تنزيل</a>`:`<span class="mut">مفيش ملف</span>`}
  </div>
</div>`;
}).join(""):`<div class="card mut">لسه مفيش كتب — الأدمن هيضيف قريب.</div>`}
</div>${studentNav()}`;
}
function adminBooks(){
  if(bkUrl())bkLoadList();
  const list=S.books||[];
  return `<div class="row" style="margin-bottom:12px"><div class="mut">${list.length} كتاب</div></div>
<div class="card" style="border-color:var(--gold)"><h3 style="margin-top:0">🤖 كتب الـ AI — «اسأل من الكتب» + توليد الامتحانات</h3>
<p class="mut" style="font-size:12px">ارفع PDF كتاب هنا — الوسيط بيقراه صفحة صفحة. الطالب بعدها يسأل من تبويب الكتب والـ AI يجاوبه بذكر الكتاب والصفحة، وانت تولّد امتحانات من الكتاب من تبويب الامتحانات.</p>
<div class="mut" style="margin-bottom:8px">${bkUrl()?("🔗 الوسيط متظبط: "+esc(bkUrl())):"⚠ وسط الكتب مش مضبوط — ظبّط الرابط + مفتاح ADMIN_KEY من الإعدادات"}</div>
<div id="bkList">${(S.bkList||[]).map(b=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><div style="flex:1"><b>${esc(b.title)}</b><div class="mut">${b.pages} صفحة</div></div><button class="btn danger sm" data-act="bkDel" data-id="${esc(b.id)}">حذف</button></div>`).join("")||(S.bkListLoading?`<div class="mut">⏳ جاري التحميل…</div>`:`<div class="mut">مفيش كتب مرفوعة للـ AI لسه.</div>`)}</div>
<label class="f" style="margin-top:10px">رفع كتاب PDF جديد للـ AI</label>
<input id="bkFile" type="file" accept="application/pdf,.pdf" data-change="bkUpload">
<p class="mut" id="bkProg" style="margin-top:6px">${esc(S.bkProg||"")}</p>
<div class="row" style="gap:8px;margin-top:6px"><button class="btn ghost sm" data-act="bkRefresh">🔄 تحديث القائمة</button><button class="btn ghost sm" data-act="openBag">🧪 جرّب سؤال زي الطالب</button></div>
<p class="mut" style="font-size:12px">لحد ~400 صفحة في الكتاب الواحد. الكتب اللي نصها سكان صور مش هتتنفع (محتاجة نص أصلي).</p>
</div>
<div class="card"><h3 style="margin-top:0">إضافة كتاب / ملف</h3>
<label class="f">العنوان</label>
<input id="bookTitle" type="text" maxlength="80" placeholder="مثال: ملخص الأدب الجاهلي">
<label class="f">المادة (اختياري)</label>
<input id="bookSub" type="text" maxlength="40" placeholder="عربي">
<label class="f">رفع PDF من الجهاز (بدون رابط)</label>
<input id="bookFile" type="file" accept="application/pdf,.pdf">
<p class="mut">حد أقصى ~700–900 كيلو · الأكبر ارفعه Drive وحط رابط</p>
<label class="f">أو رابط الملف (Drive / PDF)</label>
<input id="bookUrl" class="ltr" type="url" placeholder="https://…">
<label class="f">نص / ملخص الكتاب (مهم لـ 么)</label>
<textarea id="bookContent" rows="6" placeholder="الصق الملخص أو أهم النقاط…"></textarea>
<p class="mut" style="margin-top:6px">عنوان + (ملف أو رابط) · النص يخلّي المساعد يرد من الكتاب</p>
<button class="btn" style="margin-top:10px" data-act="addBook">إضافة</button>
</div>
${list.map(b=>`<div class="card row"><div style="flex:1"><b>${esc(b.title)}</b><div class="mut">${esc(b.url||"").slice(0,40)}…</div></div>
<button class="btn danger sm" data-act="delBook" data-id="${b.id}">حذف</button></div>`).join("")}`;
}


function tanaghaView(){
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>خاص لأولاد التناغه 😂💗</h2>
<p class="mut">ركن خاص — الصور بموافقة الأدمن</p>
<button class="subj wide" style="background:linear-gradient(135deg,#BE185D,#FB7185);margin-bottom:12px" data-act="openGallery" data-kind="shilla">
  <span class="g">💗</span><div><b>أجمل شلة</b><br><small>أجمل اللقطات — تظهر فوق بعد الموافقة</small></div>
</button>
<button class="subj wide" style="background:linear-gradient(135deg,#1D4ED8,#38BDF8)" data-act="openGallery" data-kind="sourna">
  <span class="g">📸</span><div><b>صورنا</b><br><small>هنا تقدر تحفظ صورك منغير ما تضيع 🥳</small></div>
</button>
</div>${studentNav()}`;
}
function galleryView(){
  const kind=S.galleryKind||"shilla";
  const title=kind==="shilla"?"أجمل شلة 💗":"صورنا 📸📹";
  const uid=S.user&&S.user.uid;
  const secKey="gal_"+kind;
  if(!S.isAdmin&&S.profile&&Array.isArray(S.profile.hiddenSections)&&S.profile.hiddenSections.includes(secKey)){
    return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openTanagha">رجوع</button>`)}<div class="card mut">القسم مش متاح ليك.</div></div>${studentNav()}`;
  }
  const all=(S.galleries||[]).filter(g=>g.kind===kind);
  const list=all.filter(g=>{
    if(g.status!=="approved"&&g.status!=="published")return false;
    if(uid&&Array.isArray(g.hideFrom)&&g.hideFrom.includes(uid))return false;
    return true;
  }).sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0) || (tsMs(b.createdAt)-tsMs(a.createdAt)));
  const mine=all.filter(g=>g.authorUid===uid);
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openTanagha">رجوع</button>`)}
<h2>${title}</h2>
${kind==="sourna"?`<p class="mut">هنا تقدر تحفظ صورك منغير ما تضيع 🥳</p>`:`<p class="mut">اللقطات المعتمدة تظهر هنا فوق</p>`}
<p class="gal-protect-banner">🔒 الصور محمية وعليها علامة مائية باسمك — ممنوع التصوير أو النشر</p>
<div class="card">
  <b>رفع صور ${S.isAdmin?"(أدمن)":"(بموافقة الأدمن)"}</b>
  <label class="f">وصف</label>
  <input id="galTitle" type="text" maxlength="100" placeholder="وصف قصير…">
  <label class="f">صور (أكتر من صورة)</label>
  <input id="galFiles" type="file" accept="image/*" multiple>
  <div id="galPrev" class="upprev"></div>
  <button class="btn" style="margin-top:10px" data-act="submitGallery">رفع</button>
  <div id="galProg">${upPanel("gal")}</div>
</div>
${list.length?list.map(g=>`<div class="card">
  <b>${esc(g.title||"")}</b>
  <div class="mut">${esc(g.authorName||"")} · ${fmt(g.createdAt)}${g.pinned?" · 📌":""}</div>
  ${(function(){
    const allow=S.isAdmin||(S.profile&&S.profile.tanaghaSave)||(S.site&&Array.isArray(S.site.tanaghaAllow)&&S.user&&S.site.tanaghaAllow.includes(S.user.uid));
    const imgs=(g.images||[g.url]).filter(Boolean);
    if(allow) return imgs.map(u=>mediaEmbed(u,"image")).join("");
    return `<div class="gal-lock no-save">${imgs.map(u=>mediaEmbed(u,"image")).join("")}</div>`;
  })()}
  ${commentsBlock("gallery",g.id)}
</div>`).join(""):`<div class="card mut">لسه مفيش صور معتمدة.</div>`}
${mine.length?`<h3>طلباتك</h3>${mine.map(g=>`<div class="card"><b>${esc(g.title||"")}</b> <span class="pill ${g.status==="approved"||g.status==="published"?"g":g.status==="rejected"?"r":"y"}">${g.status==="approved"||g.status==="published"?"تمت الموافقة":g.status==="rejected"?"مرفوض":"بانتظار الموافقة"}</span></div>`).join("")}`:""}
</div>${studentNav()}`;
}
function adminTanagha(){
  const kind=S.adminGalKind||"shilla";
  const all=(S.galleries||[]).filter(g=>g.kind===kind);
  const pend=all.filter(g=>g.status==="pending");
  const ok=all.filter(g=>g.status==="approved"||g.status==="published");
  const gall=(S.galleries||[]);
  const pendAll=gall.filter(g=>g.status==="pending").sort((a,b)=>tms(b.createdAt||0)-tms(a.createdAt||0));
  const pendShilla=gall.filter(g=>g.status==="pending"&&g.kind==="shilla").length;
  const pendSourna=gall.filter(g=>g.status==="pending"&&g.kind==="sourna").length;
  const galKindName=k=>k==="sourna"?"صورنا 📸":"أجمل شلة 💗";
  const tq=(S.tgq||"").trim().toLowerCase();
  const students=(S.students||[]).filter(s=>s.tanaghaSave||(tq&&((s.name||"").toLowerCase().includes(tq)||String(s.phone||"").includes(tq)))).slice(0,40);
  const secKey="gal_"+kind;
  return `<div class="card" style="background:linear-gradient(135deg,color-mix(in srgb,#BE185D 12%,var(--card)),var(--card))">
  <h3 style="margin-top:0">خاص لأولاد التناغه 😂💗</h3>
  <p class="mut" style="margin:0">إدارة أجمل شلة وصورنا · الصور محمية من الحفظ افتراضيًا</p>
</div>
${pendAll.length?`<div class="card" style="border-color:var(--gold);background:var(--ybg)"><b>📥 طلبات معلقة (${pendAll.length}) — من كل الأقسام</b>
${pendAll.slice(0,15).map(g=>`<div class="row" style="justify-content:space-between;margin-top:8px;gap:8px"><span>📌 ${galKindName(g.kind)} · <b>${esc(g.title||"بدون وصف")}</b> · ${esc(g.authorName||"طالب")} · ${fmt(g.createdAt)}</span><span style="display:flex;gap:6px"><button class="btn sm" data-act="approveGal" data-id="${g.id}">✓ موافقة</button><button class="btn ghost sm" data-act="rejectGal" data-id="${g.id}">✗ رفض</button></span></div>`).join("")}
${pendAll.length>15?`<div class="mut" style="margin-top:6px">وفيه ${pendAll.length-15} طلب كمان تحت في التاب بتاع كل قسم.</div>`:""}
</div>`:""}
<div class="tabs" style="margin:12px 0">
  <button class="tab ${kind==="shilla"?"on":""}" data-act="adminGalKind" data-kind="shilla">أجمل شلة 💗${pendShilla?` <span class="badge">${pendShilla}</span>`:""}</button>
  <button class="tab ${kind==="sourna"?"on":""}" data-act="adminGalKind" data-kind="sourna">صورنا 📸${pendSourna?` <span class="badge">${pendSourna}</span>`:""}</button>
</div>
<div class="card"><b>⬆ رفع صور (أدمن) — ${kind==="shilla"?"أجمل شلة 💗":"صورنا 📸"}</b>
  <p class="mut" style="margin:4px 0 0">بتتنشر فورًا من غير موافقة.</p>
  <label class="f">وصف</label>
  <input id="galTitle" type="text" maxlength="100" placeholder="وصف قصير…">
  <label class="f">صور (لحد 3 مرة واحدة)</label>
  <input id="galFiles" type="file" accept="image/*" multiple>
  <div id="galPrev" class="upprev"></div>
  <button class="btn" style="margin-top:10px" data-act="submitGallery">رفع ونشر</button>
  <div id="galProg">${upPanel("gal")}</div>
</div>
<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
  <div class="card" style="margin:0;text-align:center"><b style="font-size:22px">${pend.length}</b><div class="mut">بانتظار الموافقة</div></div>
  <div class="card" style="margin:0;text-align:center"><b style="font-size:22px">${ok.length}</b><div class="mut">منشور</div></div>
</div>
<div class="card"><h3 style="margin-top:0">⬆ طلبات موافقة</h3>
${pend.length?pend.map(g=>`<div style="padding:12px 0;border-bottom:1px solid var(--line)">
  <b>${esc(g.title||"")}</b>
  <div class="mut">من ${esc(g.authorName||"?")} · ${fmt(g.createdAt)}</div>
  <div class="gal-lock no-save" style="margin-top:8px">${(g.images||[]).map(u=>mediaEmbed(u,"image")).join("")}</div>
  <div class="row" style="margin-top:10px;gap:8px">
    <button class="btn sm" data-act="approveGal" data-id="${g.id}">موافقة ✓</button>
    <button class="btn danger sm" data-act="rejectGal" data-id="${g.id}">رفض</button>
  </div></div>`).join(""):`<div class="mut">مفيش طلبات جديدة</div>`}
</div>
<div class="card"><h3 style="margin-top:0">المنشور</h3>
${ok.length?ok.map(g=>`<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line);align-items:flex-start">
  <div style="flex:1;min-width:0"><b>${esc(g.title||"")}</b><div class="mut">${esc(g.authorName||"")} · ${g.pinned?"📌 ":""}${fmt(g.createdAt)}</div>
  <div class="gal-lock no-save" style="margin-top:8px;max-width:240px">${(g.images||[g.url]).filter(Boolean).slice(0,3).map(u=>mediaEmbed(u,"image")).join("")}</div></div>
  <button class="btn ghost sm" data-act="pinGal" data-id="${g.id}">${g.pinned?"إلغاء تثبيت":"تثبيت"}</button>
  <button class="btn danger sm" data-act="delGal" data-id="${g.id}">حذف</button>
</div>`).join(""):`<div class="mut">فاضي</div>`}
</div>
<div class="card"><h3 style="margin-top:0">🔓 استثناء الحفظ (مسموح ينزّل)</h3>
<p class="mut">افتراضيًا ممنوع الحفظ/السكرين على الكل — ابحث عن طالب وفعّل له لو حابب (بنعرض المسموح لهم + نتيجة البحث بس)</p>
<input id="tgq" type="text" placeholder="ابحث بالاسم أو الرقم" value="${esc(S.tgq||"")}" autocomplete="off" style="margin-bottom:8px">
${students.map(s=>`<div class="row" style="padding:6px 0"><span>${esc(s.name||s.phone||s.id)}</span>
<button class="btn ${s.tanaghaSave?"":"ghost "}sm" data-act="toggleTanaghaSave" data-uid="${s.id}">${s.tanaghaSave?"✓ مسموح يحفظ":"ممنوع الحفظ"}</button></div>`).join("")||`<div class="mut">${tq?"مفيش نتيجة":"مفيش طلاب مسموح لهم — ابحث لإضافة طالب"}</div>`}
</div>
<div class="card"><h3 style="margin-top:0">إخفاء القسم عن شخص</h3>
${students.map(s=>{const off=Array.isArray(s.hiddenSections)&&s.hiddenSections.includes(secKey);
  return `<div class="row" style="padding:6px 0"><span>${esc(s.name||s.phone||s.id)}</span>
  <button class="btn ${off?"":"ghost "}sm" data-act="toggleSecHide" data-uid="${s.id}" data-sec="${secKey}" data-on="${off?"0":"1"}">${off?"مخفي":"إخفاء"}</button></div>`}).join("")}
</div>`;
}

function fadaye7View(){
  const uid=S.user&&S.user.uid;
  if(!S.isAdmin&&S.profile&&Array.isArray(S.profile.hiddenSections)&&S.profile.hiddenSections.includes("fadaye7")){
    return `<div class="wrap screen">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}<div class="card mut">القسم ده مش متاح ليك دلوقتي.</div></div>${studentNav()}`;
  }
  const tab=S.fadTab||"all";
  const base=(S.fadaye7||[]).filter(f=>{
    if(f.published===false||f.status==="pending"||f.status==="rejected")return false;
    if(uid&&Array.isArray(f.hideFrom)&&f.hideFrom.includes(uid))return false;
    return true;
  });
  const list=tab==="mine"?base.filter(f=>f.authorUid===uid):base;
  const card=f=>{
    const by=f.fromAdmin?("من الأدمن"):(f.authorName?("من "+f.authorName):"");
    const imgs=(f.images&&f.images.length)?f.images:(f.url?[f.url]:[]);
    const media=fadLazy(imgs.map(u=>mediaEmbed(u,f.kind||"image")).join("")||(f.url?mediaEmbed(f.url,f.kind):""));
    const dl=imgs[0]&&(String(imgs[0]).startsWith("data:image")||/\.(jpe?g|png|gif|webp)(\?|$)/i.test(imgs[0]))
      ?`<a class="btn ghost sm" href="${esc(imgs[0])}" download="fadiha.jpg">⬇ تحميل</a>`:"";
    return `<div class="card fadc">
  <div class="row"><b>${esc(f.title||"فضيحة")}</b>${by?pill(by,f.fromAdmin?"i":"g"):""}</div>
  <div class="mut" style="margin:4px 0 8px">${fmt(f.createdAt)}</div>
  ${media}
  ${dl?`<div style="margin-top:8px">${dl}</div>`:""}
  ${commentsBlock("fadaye7",f.id)}
</div>`;
  };
  return `<div class="wrap screen">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>فضايح 😂</h2>
<p class="mut">انشر وشوف تعليقات الكل — الحذف للأدمن فقط</p>
<div class="tabs" style="margin-bottom:10px">
  <button type="button" class="tab ${tab==="all"?"on":""}" data-act="fadTab" data-tab="all">الكل</button>
  <button type="button" class="tab ${tab==="mine"?"on":""}" data-act="fadTab" data-tab="mine">منشوراتي</button>
</div>
<div class="card">
  <b>انشر فضيحة</b>
  <p class="mut" style="margin:4px 0 8px">بتنزل على طول · حتى 10 صور · للفيديو الصق رابطًا خارجيًا (بدون Firebase Storage)</p>
  <label class="f">وصف</label>
  <input id="stuFadTitle" type="text" maxlength="120" placeholder="وصف قصير…">
  <label class="f">صور من الجهاز (حتى 10)</label>
  <input id="stuFadFile" type="file" accept="image/*" multiple>
  <label class="f">أو رابط</label>
  <input id="stuFadLink" class="ltr" type="url" placeholder="https://…">
  <button class="btn sm" style="margin-top:10px" data-act="submitFadaye7">نشر</button>
  <div id="stuFadPrev" class="upprev"></div><div id="stuFadProg">${upPanel("stu")}</div>
</div>
${list.length?list.slice(0,S.fadShow||10).map(card).join("")+fadMoreBtn(list.length):(tab==="mine"?emptyBox("📝","مفيش منشورات ليك","انشر أول فضيحة من فوق"):(S.fadOffline?emptyBox("📡","مفيش اتصال بالسيرفر","اتأكد من الإنترنت — الفضايح هتظهر أول ما يرجع"):emptyBox("😂","لسه مفيش فضايح","كن أول من ينشر")))}
</div>${studentNav()}`;
}

function asmListView(){
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2 style="color:var(--ind)">التقييمات</h2>
${S.asms.length?(Array.isArray(S.asms)?S.asms:[]).map(a=>`<div class="card lift"><div class="row"><div><b>${esc(a.title)}</b><div>${pill(subName(a.subject))} ${a.showSolution?pill("محلول ✓","g"):pill("الحل لسه","y")}</div></div><button class="btn sm" data-act="openAsm" data-id="${a.id}">افتح</button></div></div>`).join(""):`<div class="card mut">مفيش تقييمات دلوقتي. ارجع تاني بعدين.</div>`}
</div>${studentNav()}`}
function asmView(){
  const x=S.asm,a=S.asms.find(q=>q.id===x.id);
  if(!a)return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openAsms">رجوع</button>`)}<div class="card mut">التقييم ده مش متاح دلوقتي.</div></div>`;
  const sol=a.showSolution?(x.loading?skel():((x.solText?`<div class="card" style="white-space:pre-wrap" dir="auto">${esc(x.solText)}</div>`:"")+filesHtml(x.s,"s",a.id)||`<div class="card mut">الحل هيتضاف قريب.</div>`)):`<div class="card mut">🔒 الحل هيتنزل قريب.</div>`;
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openAsms">رجوع</button>`)}
<h2>${esc(a.title)}</h2><div>${pill(subName(a.subject))} ${a.showSolution?pill("محلول ✓","g"):pill("الحل لسه","y")}</div>
${a.desc?`<div class="card" style="white-space:pre-wrap;margin-top:12px" dir="auto">${esc(a.desc)}</div>`:""}
${okUrl(a.link)?`<p><a class="btn ghost sm" href="${esc(a.link)}" target="_blank" rel="noopener">🔗 فتح الرابط</a></p>`:""}
<h3 style="margin-top:16px">التقييم</h3>${x.loading?skel():(filesHtml(x.q,"q",a.id)||(a.desc||okUrl(a.link)?"":`<div class="card mut">مفيش ملفات.</div>`))}
<h3 style="margin-top:16px">الحل</h3>${sol}</div>`}


/* ===== v42: نظام الترتيب الحي (نسبة × معامل ثقة، وحد أدنى للامتحانات) ===== */
const RANK_CONF=[0,.25,.40,.55,.65,.75,.80,.85,.90,.95,1];
function rankMin(){return Math.max(1,+(S.site&&S.site.rankMin)||2)}
function confOf(n){return n>=10?1:(RANK_CONF[n]||0)}
function rankScore(b){
  const n=b.examsDone||0;
  const pct=b.totalQ?(b.totalScore||0)/b.totalQ*100:(b.pct||0);
  return Math.round(pct*confOf(n)*100)/100;
}
function rankBoard(arr){
  const min=rankMin();
  const items=(arr||[]).map(b=>({...b,_n:b.examsDone||0,_s:rankScore(b)}));
  const ranked=items.filter(b=>b._n>=min).sort((a,b)=>b._s-a._s||(b.pct||0)-(a.pct||0)||b._n-a._n);
  const prov=items.filter(b=>b._n>0&&b._n<min).sort((a,b)=>(b.pct||0)-(a.pct||0)||b._n-a._n);
  return {ranked,prov};
}
function lbPayload(list){
  const examsDone=list.length,totalScore=list.reduce((s,r)=>s+(r.score||0),0),totalQ=list.reduce((s,r)=>s+(r.total||0),0);
  const ex={};list.forEach(r=>{if(r.examId)ex[r.examId]=[r.score||0,r.total||0]});
  const b={examsDone,totalScore,totalQ,pct:totalQ?Math.round(totalScore/totalQ*1000)/10:0,ex,v:2};
  b.score=rankScore(b);
  return b;
}
function h2hText(other){
  const me=(S.board||[]).find(b=>(b.uid||b.id)===S.user.uid);
  const mine=(me&&me.ex)||{},theirs=other.ex||{};
  const common=Object.keys(mine).filter(k=>theirs[k]);
  if(!common.length)return "مفيش امتحانات مشتركة بينكم لسه — المقارنة بتتم على الامتحانات اللي الاتنين امتحنوها بس.";
  let a=0,aq=0,o=0,oq=0;
  const lines=common.map(k=>{
    const e=(S.exams||[]).find(x=>x.id===k);
    const [ms,mt]=mine[k],[ts,tt]=theirs[k];
    a+=ms;aq+=mt;o+=ts;oq+=tt;
    return (e?e.title:"امتحان")+": أنت "+ms+"/"+mt+" · هو "+ts+"/"+tt;
  });
  const pa=aq?Math.round(a/aq*1000)/10:0,po=oq?Math.round(o/oq*1000)/10:0;
  const w=pa>po?"أنت متقدّم 👏":pa<po?"هو متقدّم عليك":"تعادل";
  return "الامتحانات المشتركة ("+common.length+"):\n"+lines.join("\n")+"\n\nمجموعك "+a+"/"+aq+" = "+pa+"%\nمجموعه "+o+"/"+oq+" = "+po+"%\n→ "+w;
}

async function rebuildBoardCore(silent){
  if(!S.isAdmin||window.__lbBuilding)return;
  window.__lbBuilding=true;
  try{
    if(!silent)toast("جاري بناء لوحة الشرف…");
    const sn=await getDocs(collection(db,"results"));
    const byUid={};
    sn.docs.forEach(d=>{
      const r=d.data();
      if(!r.uid||!r.examId)return;
      if(!byUid[r.uid])byUid[r.uid]={name:r.name,phone:r.phone,exams:{}};
      const prev=byUid[r.uid].exams[r.examId];
      if(!prev||(r.score/Math.max(r.total,1))>(prev.score/Math.max(prev.total,1)))byUid[r.uid].exams[r.examId]=r;
    });
    const uids=Object.keys(byUid);
    let n=0;
    for(let i=0;i<uids.length;i+=400){
      const batch=writeBatch(db);
      uids.slice(i,i+400).forEach(uid=>{
        const u=byUid[uid];
        batch.set(doc(db,"leaderboard",uid),{uid,name:u.name||"طالب",...lbPayload(Object.values(u.exams)),updatedAt:serverTimestamp()},{merge:true});
        n++;
      });
      await batch.commit();
    }
    try{localStorage.setItem("lb_auto_ts",String(Date.now()))}catch(_){}
    toast("اتبنيت لوحة الشرف لـ "+n+" طالب ✓",true);
  }catch(e){console.error("rebuildBoard",e);if(!silent)toast("فشل البناء: "+((e&&e.message)||"").slice(0,80),true)}
  finally{window.__lbBuilding=false}
}
function autoRebuildBoard(){
  if(!S.isAdmin)return;
  try{
    const last=+localStorage.getItem("lb_auto_ts")||0;
    if(Date.now()-last<3*86400000)return;
  }catch(_){}
  setTimeout(()=>rebuildBoardCore(true),8000);
}

function lbBoardCard(){
  const {ranked,prov}=rankBoard(S.board);
  const min=rankMin();
  const top3=ranked.slice(0,3),rest=ranked.slice(3,15);
  const podiumOrder=[];
  if(top3[1])podiumOrder.push({b:top3[1],rank:2,cls:"p2",medal:"🥈"});
  if(top3[0])podiumOrder.push({b:top3[0],rank:1,cls:"p1",medal:"🥇"});
  if(top3[2])podiumOrder.push({b:top3[2],rank:3,cls:"p3",medal:"🥉"});
  const row=(b,i,isProv)=>`<div class="row" data-act="h2h" data-uid="${b.uid||b.id}" style="cursor:pointer">
<span style="min-width:28px;font-weight:700;color:var(--mut)">${isProv?"–":i}</span>
<span style="flex:1"><b>${esc((b.name||"طالب").split(" ")[0])}</b>${lfTag(b.uid||b.id)}${(b.uid||b.id)===S.user.uid?` <span class="pill">أنت</span>`:""}${isProv?` <span class="pill y" style="font-size:10px">ترتيب مؤقت</span>`:""}
<div class="mut">${b.examsDone||0} امتحان · ${b.totalScore||0}/${b.totalQ||0} · <b style="color:var(--pri)">${b.pct||0}%</b>${isProv?"":` · نقاط ${b._s}`}</div></span></div>`;
  return `<div class="card" style="overflow:hidden">
<h3 style="text-align:center;margin:0 0 4px">🏆 لوحة الشرف</h3>
<p class="mut" style="text-align:center;margin:0 0 4px;font-size:12px">الترتيب = النسبة × ثقة عدد الامتحانات · لازم ${min} امتحان على الأقل · اضغط على أي طالب لمقارنته بيك</p>
${top3.length?`<div class="podium">${podiumOrder.map(({b,rank,cls,medal})=>`<div class="pod ${cls}" data-tilt data-act="h2h" data-uid="${b.uid||b.id}" style="cursor:pointer">
  <div class="avatar">${medal}</div>
  <div class="nm">${esc((b.name||"طالب").split(" ")[0])}${(b.uid||b.id)===S.user.uid?" · أنت":""}<br>${lfTag(b.uid||b.id)}</div>
  <div class="sc">${b.pct||0}% · ${b.examsDone||0} امتحان</div>
  <div class="bar">${rank}</div>
</div>`).join("")}</div>`:""}
${rest.length?`<div class="lb-rest">${rest.map((b,i)=>row(b,i+4,false)).join("")}</div>`:""}
${prov.length?`<div class="mut" style="margin:10px 0 4px;font-size:12px">ترتيب مؤقت — محتاجين امتحان إضافي للدخول في الترتيب الرسمي:</div><div class="lb-rest">${prov.slice(0,8).map(b=>row(b,0,true)).join("")}</div>`:""}
${!ranked.length&&!prov.length?`<div class="mut" style="text-align:center;padding:12px">لسه مفيش ترتيب. أول ما الطلاب يمتحنوا هتظهر المنصة هنا.</div>`:""}
</div>`;
}

function progressView(){
  const L=S.myList,avgP=L.length?Math.round(L.reduce((s,r)=>s+pctOf(r),0)/L.length):0;
  const best=L.length?Math.max(...L.map(pctOf)):0,exams=new Set(L.map(r=>r.examId)).size;
  const bySub=SUBJECTS.map(s=>{const rs=L.filter(r=>r.subject===s.id);return {s,n:rs.length,avg:rs.length?Math.round(rs.reduce((a,r)=>a+pctOf(r),0)/rs.length):0}}).filter(x=>x.n);
  const weak=bySub.length>1?bySub.slice().sort((a,b)=>a.avg-b.avg)[0]:null;
  const last=L.slice(-10);
  const notifs=S.notifs||[];
  const boardCard=lbBoardCard();

  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="logout">خروج</button>`)}
<h2>تقدمي</h2>
${boardCard}
${(S.unreadNotif||0)>0||notifs.length?`<div class="card"><div class="row"><h3 style="margin:0">الإشعارات ${(S.unreadNotif||0)?pill(String(S.unreadNotif),"y"):""}</h3>
${notifs.some(n=>!n.read)?`<button class="btn ghost sm" data-act="markNotifsRead">تعليم تحديد الكل كمقروء</button>`:""}</div>
${(()=>{
  if(!notifs.length)return `<div class="mut">مفيش إشعارات حالياً.</div>`;
  const kindOf=n=>{
    const k=(n.kind||n.type||"").toLowerCase();
    const tx=((n.title||"")+" "+(n.text||"")+" "+(n.body||"")).toLowerCase();
    if(k==="call"||tx.includes("مكالمة")||tx.includes("📞"))return "call";
    if(k==="dm"||k==="chat"||tx.includes("رسالة"))return "dm";
    if(k==="exam"||tx.includes("امتحان"))return "exam";
    if(k==="game"||tx.includes("لعبة")||tx.includes("غرفة"))return "game";
    if(k==="admin")return "admin";
    return "other";
  };
  const labels={call:"📞 مكالمات",dm:"💬 رسائل",exam:"📚 امتحانات",game:"🎮 ألعاب",admin:"👨‍🏫 الإدارة",other:"⭐ أخرى"};
  const groups={call:[],dm:[],exam:[],game:[],admin:[],other:[]};
  notifs.slice(0,40).forEach(n=>groups[kindOf(n)].push(n));
  return ["call","dm","exam","game","admin","other"].filter(k=>groups[k].length).map(k=>
    `<div style="margin-top:10px"><b style="font-size:13px">${labels[k]}</b>`+
    groups[k].slice(0,6).map(n=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line);opacity:${n.read?0.65:1}"><span>${n.read?"":"🔵 "}${esc(n.title||n.text||"إشعار")}<div class="mut">${esc(n.body||"")} · ${fmt(n.createdAt)}</div></span></div>`).join("")+
    `</div>`
  ).join("");
})()}
</div>`:""}
${L.length?`<div class="stats"><div class="card stat"><b>${L.length}</b><span class="mut">محاولة</span></div><div class="card stat"><b>${exams}</b><span class="mut">امتحان</span></div><div class="card stat"><b>${avgP}%</b><span class="mut">المتوسط</span></div><div class="card stat"><b>${best}%</b><span class="mut">أعلى نتيجة</span></div></div>
<div class="card"><h3>تطور درجاتك (آخر ${last.length})</h3><div class="bars">${last.map(r=>`<div>${pctOf(r)}<i class="${r.passMark>0&&!r.passed?"f":""}" style="height:${Math.max(3,pctOf(r))*0.9}%"></i></div>`).join("")}</div></div>
<div class="card"><h3>مستواك في كل مادة</h3>${bySub.map(x=>`<div style="margin-top:8px"><div class="row"><span>${x.s.name}</span><span class="mut">${x.avg}% · ${x.n} محاولة</span></div><div class="hb"><i style="width:${x.avg}%;background:${x.s.c}"></i></div></div>`).join("")}
${weak&&weak.avg<75?`<p class="mut" style="margin-top:12px">محتاج تركّز أكتر على <b>${weak.s.name}</b>. راجع أسئلتك الغلط فيها.</p>`:""}</div>`
:`<div class="card mut">لسه ما امتحنتش أي امتحان. أول ما تخلص امتحان هتلاقي تقدمك هنا.</div>`}
${L.length?`<div class="card"><h3>كل محاولاتك</h3>${L.slice().reverse().map(r=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(r.examTitle)} <span class="mut">· محاولة ${r.attempt||1} · ${subName(r.subject)}</span></span><span>${r.score}/${r.total} ${passPill(r)} <button class="btn ghost sm" data-act="reviewMine" data-id="${r.id}" data-back="progress">شوف حلّك</button></span></div>`).join("")}</div>`:""}
</div>${studentNav()}`}

/* ---------- لوحة الأدمن ---------- */
const NOW=()=>Date.now();
const liveActive=()=>S.starts.filter(x=>NOW()-(x.seen||x.t)<150000);

function adminPerfCard(){
  const nSubs=(typeof subs!=="undefined"&&subs)?subs.length:0;
  const mem=(performance&&performance.memory)?Math.round(performance.memory.usedJSHeapSize/1048576)+" MB":"—";
  const students=Array.isArray(S.students)?S.students.length:0;
  const online=Array.isArray(S.students)?S.students.filter(s=>{
    const ms=tsMs(s.lastSeenAt||s.lastClientAt);
    return ms&&(Date.now()-ms<660000);
  }).length:0;
  const exams=Array.isArray(S.exams)?S.exams.length:0;
  const results=Array.isArray(S.results)?S.results.length:0;
  const rooms=Array.isArray(S.rooms)?S.rooms.length:(S.openRooms||[]).length;
  return `<div class="card"><h3 style="margin-top:0">📊 لوحة الأداء</h3>
  <div class="row" style="flex-wrap:wrap;gap:8px">
    <span class="pill">Listeners: ${nSubs}</span>
    <span class="pill">ذاكرة تقريبية: ${mem}</span>
    <span class="pill">طلاب: ${students}</span>
    <span class="pill">متصلون (~2د): ${online}</span>
    <span class="pill">امتحانات: ${exams}</span>
    <span class="pill">نتائج محمّلة: ${results}</span>
    <span class="pill">غرف: ${rooms}</span>
    <span class="pill">View: ${esc(S.view||"")}/${esc(S.tab||"")}</span>
  </div>
  <p class="mut" style="margin-top:8px;font-size:12px">البيانات تقديرية من الجهاز الحالي — مش سيرفر مركزي. قلل الـ Listeners لو الرقم عالي.</p>
  <button class="btn sm ghost" data-act="adminRefreshPerf">تحديث الأرقام</button>
  </div>`;
}


/* ===== أوضاع التشغيل (v91): منصة / ألعاب / أوضاع مخصصة — واحد بس شغّال للطلاب ===== */
const MODE_BUILTIN=[
  {id:"platform",n:"وضع المنصة",ic:"🎓",kind:"platform",d:"المواد والامتحانات والتواصل والألعاب — كل حاجة زي ما هي."},
  {id:"games",n:"وضع الألعاب",ic:"🎮",kind:"games",d:"الطلاب يشوفوا الألعاب بس. الامتحانات والشات والتقدم مقفولين."}
];
const MODE_GAMEVIEWS=new Set(["games","mathg","xo","hang","spin","react","qbSetup","qbLobby","qbPlay","qbResult"]);
function modesAll(){return MODE_BUILTIN.concat(((S.site&&S.site.modes)||[]).filter(m=>m&&m.id).map(m=>({...m,custom:true})))}
function modeCur(){const id=(S.site&&S.site.appMode)||"platform";return modesAll().find(m=>m.id===id)||MODE_BUILTIN[0]}
function modeOn(){
  if(S.isAdmin||!S.user)return false;
  if(modeCur().kind==="platform")return false;
  if(S.view==="exam"&&S.cur&&!S.cur.done)return false; /* مفيش طرد من امتحان شغّال */
  return true;
}
function modeSafeUrl(u){
  u=String(u||"").trim();
  if(!u)return"";
  if(/^https:\/\/[^\s"'<>]+$/i.test(u))return u;
  if(/^(\.\/)?[\w\-\/]+\.html?(\?[\w=&%\-]*)?(#[\w\-]*)?$/i.test(u))return "./"+u.replace(/^\.\//,"");
  return"";
}
function modeNav(){
  const m=modeCur();
  return `<nav class="bot"><button class="on" data-act="home">${m.ic} ${esc(m.n)}</button><button data-act="logout">خروج</button></nav>`;
}
function modeView(m){
  m=m||modeCur();
  const exit=S.isAdmin?`<button class="btn ghost sm" data-act="modePreviewExit">رجوع للوحة</button>`:`<button class="btn ghost sm" data-act="logout">خروج</button>`;
  if(m.kind==="htmlFile"&&!S.isAdmin&&!featState("games"))return `<div class="wrap"><div class="card empty"><b>الوضع متوقف مؤقتًا</b>${exit}</div></div>`;
  if(m.kind==="htmlFile")return uploadedGameView(m,exit);
  if(m.kind==="url"){
    const u=modeSafeUrl(m.url);
    if(!u)return `<div class="wrap"><div class="card empty"><div class="ei">⚠️</div><b>رابط الوضع غير صالح</b><div class="mut">${S.isAdmin?"عدّل الرابط من تبويب الأوضاع.":"كلّم المدرس."}</div>${exit}</div></div>`;
    return `<div class="mode-full"><div class="mode-bar"><b>${esc(m.ic||"🎛")} ${esc(m.n)}</b><span style="flex:1"></span>${exit}</div><iframe class="mode-frame" sandbox="allow-scripts allow-forms" src="${esc(u)}" title="${esc(m.n)}" allow="fullscreen; autoplay; gamepad; accelerometer" referrerpolicy="no-referrer"></iframe></div>`;
  }
  /* رسالة / غير ذلك */
  return `<div class="wrap"><div class="center"><div style="font-size:64px;line-height:1">${esc(m.ic||"🎛")}</div><h1 style="margin-top:18px">${esc(m.n)}</h1><p class="mut" style="max-width:380px;margin:8px auto 22px;white-space:pre-wrap">${esc(m.msg||"الوضع ده شغّال دلوقتي.")}</p>${exit}</div></div>`;
}
function gameDocId(m){const id=String(m&&m.gameDoc||"");return /^gameMode_m[a-z0-9]+$/i.test(id)?id:""}
function loadGameModeDoc(id){
  if(!id||!S.user||S._gameDocLoading===id||S._gameDocs&&Object.prototype.hasOwnProperty.call(S._gameDocs,id))return;
  S._gameDocLoading=id;
  getDoc(doc(db,"config",id)).then(snap=>{
    S._gameDocs=S._gameDocs||{};S._gameDocs[id]=snap.exists()?String(snap.data().html||""):"";S._gameDocLoading=null;
    if((modeOn()&&gameDocId(modeCur())===id)||(S.view==="modePreview"&&gameDocId(modesAll().find(x=>x.id===S.modePrev))===id))render(true);
  }).catch(()=>{S._gameDocs=S._gameDocs||{};S._gameDocs[id]="";S._gameDocLoading=null;toast("تعذر تحميل ملف اللعبة",true);render(true)});
}
function isolatedGameHtml(raw){
  const policy=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'">`;
  const html=String(raw||"").replace(/^\uFEFF/,"");
  return /<head\b[^>]*>/i.test(html)?html.replace(/<head\b[^>]*>/i,m=>m+policy):'<!doctype html><html><head>'+policy+'</head><body>'+html+'</body></html>';
}
function uploadedGameView(m,exit){
  const id=gameDocId(m),docs=S._gameDocs||{};
  if(!id)return `<div class="wrap"><div class="card">ملف اللعبة غير مضبوط. ${exit}</div></div>`;
  if(!Object.prototype.hasOwnProperty.call(docs,id)){loadGameModeDoc(id);return `<div class="mode-full"><div class="mode-bar"><b>${esc(m.ic||"🎮")} ${esc(m.n)}</b><span style="flex:1"></span>${exit}</div><div class="card">جاري تحميل اللعبة…</div></div>`}
  const html=docs[id];if(!html)return `<div class="wrap"><div class="card err">ملف اللعبة غير متاح أو لم يتم رفعه. ${exit}</div></div>`;
  const srcdoc=isolatedGameHtml(html);
  return `<div class="mode-full"><div class="mode-bar"><b>${esc(m.ic||"🎮")} ${esc(m.n)}</b><span style="flex:1"></span>${exit}</div><iframe class="mode-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${esc(m.n)}" srcdoc="${esc(srcdoc)}"></iframe></div>`;
}

function adminModes(){
  const cur=modeCur(),list=modesAll();
  const card=m=>{
    const on=m.id===cur.id;
    return `<div class="card ${on?"":"lift"}" style="${on?"border-color:var(--pri);box-shadow:0 0 0 2px color-mix(in srgb,var(--pri) 30%,transparent)":""}">
  <div class="row" style="flex-wrap:nowrap;gap:12px;align-items:flex-start">
    <div class="av" style="border-radius:14px;font-size:26px;flex:none">${esc(m.ic||"🎛")}</div>
    <div style="flex:1;min-width:0"><b style="font-size:16px">${esc(m.n)}</b> ${on?pill("شغّال للطلاب","g"):""}
      <div class="mut" style="font-size:13px;margin-top:2px">${esc(m.d||(m.kind==="url"?"صفحة/لعبة/برنامج بيتفتح بملء الشاشة: "+(m.url||""):(m.msg||"رسالة للطلاب")))}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        ${on?`<button class="btn sm ghost" disabled>✓ الوضع الحالي</button>`:`<button class="btn sm gold" data-act="setMode" data-id="${esc(m.id)}">تفعيل للطلاب</button>`}
        ${(m.kind==="url"||m.kind==="htmlFile"||m.kind==="message")?`<button class="btn sm ghost" data-act="previewMode" data-id="${esc(m.id)}">👁 معاينة</button>`:""}
        ${m.custom?`<button class="btn sm danger" data-act="delMode" data-id="${esc(m.id)}">🗑</button>`:""}
      </div></div></div></div>`;
  };
  return `<h2>🎛 أوضاع التشغيل</h2>
<p class="mut">اختار الوضع اللي الطلاب يشوفوه. وضع واحد بس شغّال: لما تفعّل وضع جديد، وضع المنصة بيتقفل عليهم تماماً، ولما ترجّع وضع المنصة، الوضع الجديد بيتقفل. إنت (الأدمن) بتفضل داخل لوحتك دايماً. الطالب اللي في نص امتحان بيكمّله الأول.</p>
${list.map(card).join("")}
<div class="card"><h3 style="margin-top:0">➕ وضع جديد</h3>
<label class="f" for="mdName">الاسم</label><input id="mdName" type="text" maxlength="30" placeholder="مثلاً: ليلة الاختبار / لعبة الأسبوع">
<label class="f" for="mdIc">أيقونة (إيموجي)</label><input id="mdIc" type="text" maxlength="4" value="🎮" style="max-width:100px">
<label class="f" for="mdKind">النوع</label>
<select id="mdKind"><option value="url">رابط HTTPS / صفحة داخلية</option><option value="htmlFile">رفع ملف لعبة HTML ذاتيّ الاحتواء</option><option value="message">رسالة للطلاب بس</option></select>
<label class="f" for="modeGameFile">ملف اللعبة (.html فقط، بحد أقصى 600KB، لا يعتمد على ملفات خارجية)</label><input id="modeGameFile" type="file" accept=".html,text/html">
<label class="f" for="mdUrl">الرابط (HTTPS أو اسم ملف محلي عند اختيار نوع الرابط)</label><input id="mdUrl" class="ltr" type="text" placeholder="https://example.com/game أو game.html">
<label class="f" for="mdMsg">الرسالة (للنوع "رسالة")</label><textarea id="mdMsg" rows="2" placeholder="مثلاً: المنصة مقفولة النهارده، شوفوا الإعلان في القروب"></textarea>
<div style="margin-top:12px"><button class="btn gold" data-act="addMode">إضافة الوضع</button></div>
<p class="mut" style="font-size:12px;margin:10px 0 0">ملف HTML الذاتي يُحفظ في Firestore وليس Firebase Storage، ويعمل داخل إطار معزول لا يستطيع الوصول لحساب الطالب، مع تقييد موارد الشبكة عبر CSP. ارفع ملفًا موثوقًا واحدًا مستقلًا فقط؛ الموارد الخارجية والصور/الأصوات المنفصلة لن تعمل. يخضع الملف لحصة Firestore المجانية وحد الوثيقة.</p></div>`;
}

function adminView(){
  const t=S.tab;
  const groups=[
    {title:"تشغيل", items:[["modes","🎛 الأوضاع"],["dash","الرئيسية"],["live","مباشر"],["status","حالة المنصة"],["activity","نشاط"]]},
    {title:"محتوى", items:[["exams","امتحانات"],["asm","تقييمات"],["books","كتب"]]},
    {title:"مجتمع", items:[["fadaye7","فضايح 😂"],["tanagha","التناغه 💗"],["tgreq","طلبات التناغه"],["students","طلاب"]]},
    {title:"رقابة", items:[["results","نتايج"],["alerts","تنبيهات"],["suspicious","احتيالي"]]},
    {title:"تشخيص", items:[["errors","🔴 الأخطاء"],["health","📊 صحة المنصة"],["perf","⚡ الأداء"],["devtools","🧰 أدوات المطور"]]},
    {title:"إدارة", items:[["managers","المسؤولين"],["security","🛡 الأمان"],["shopadm","🛒 المتجر"],["agent","🤖 الوكيل"],["settings","إعدادات"]]}
  ];
  const bd={tgreq:(Array.isArray(S.students)?S.students:[]).filter(x=>x.tanaghaAccess==="pending").length,results:S.unread,alerts:S.unreadAlerts,live:liveActive().length,suspicious:(S.suspicious||[]).filter(x=>!x.seen).length};
  return `<div class="wrap wide">${header(`${pill("أدمن","i")}<button class="btn ghost sm" data-act="logout">خروج</button>`)}
${modeCur().kind!=="platform"?`<div class="card" style="margin:0 0 12px;border-color:var(--gold);background:var(--ybg)"><div class="row"><span><b>🎛 الوضع الشغّال للطلاب: ${modeCur().ic} ${esc(modeCur().n)}</b><div class="mut" style="font-size:12px">وضع المنصة مقفول عليهم دلوقتي</div></span><button class="btn sm gold" data-act="setMode" data-id="platform">رجّع وضع المنصة</button></div></div>`:""}
${S.site.maintenance?`<div class="err" style="margin:0 0 12px">وضع الصيانة شغّال. الطلاب شايفين "المنصة تحت التعديل".</div>`:""}
${groups.map(g=>`<div style="margin-bottom:10px">
  <div class="mut" style="font-size:11px;font-weight:700;margin-bottom:4px;opacity:.75">${g.title}</div>
  <div class="tabs" style="margin-bottom:0">${g.items.map(([k,v])=>`<button class="tab ${t===k?"on":""}" data-act="tab" data-id="${k}">${v}${bd[k]?`<span class="badge">${bd[k]}</span>`:""}</button>`).join("")}</div>
</div>`).join("")}
${({dash:adminDash,live:adminLive,status:adminPlatformStatus,activity:adminActivity,exams:adminExams,asm:adminAsm,fadaye7:adminFadaye7,tanagha:adminTanagha,books:adminBooks,students:adminStudents,results:adminResults,alerts:adminAlerts,suspicious:adminSuspicious,managers:adminManagers,security:adminSecurity,tgreq:adminTgReq,settings:adminSettings,shopadm:adminShop,agent:adminAgent,modes:adminModes,errors:adminErrors,health:adminHealth,perf:adminPerf,devtools:adminDev}[t]||adminDash)()}
${t==="exams"?`<button class="fab" data-act="newExam" aria-label="امتحان جديد">+</button>`:""}

</div>`}
const chart=(days,vals,cls)=>{const mx=Math.max(1,...vals);return `<div class="bars">${vals.map((v,i)=>`<div>${v||""}<i class="${cls||""}" style="height:${Math.max(3,v/mx*68)}%"></i><span>${days[i].l}</span></div>`).join("")}</div>`};

function adminActivity(){
  const labels={
    login:"دخول للمنصة", exam_start:"بدأ امتحان", exam_submit:"سلّم امتحان",
    open_games:"فتح الألعاب", qb_create:"أنشأ غرفة", qb_join:"دخل غرفة",
    qb_leave:"خرج من غرفة", open_asm:"فتح تقييم", resume_exam:"استئناف امتحان", exam_pause:"إيقاف امتحان مؤقت"
  };
  const list=S.activity||[];
  const rooms=list.filter(a=>a.action==="qb_create"||a.action==="qb_join"||a.action==="qb_leave");
  const liveRooms=(S.adminRooms||[]).filter(r=>r.status==="lobby"||r.status==="playing");
  return `<div class="card"><h3>🎮 نشاط الغرف</h3>
  <p class="mut">آخر من عمل غرفة / انضم · والغرف الشغالة دلوقتي</p>
  ${liveRooms.length?`<div style="margin-bottom:12px"><b>غرف شغالة (${liveRooms.length})</b>${liveRooms.map(r=>{
    const pl=Object.values(r.players||{});
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><b dir="ltr">${esc(r.code||r.id)}</b> · ${esc(qbGameLabel(r.game||"qb"))} ${r.public?"🌐":"🔒"}
    <div class="mut">مضيف: ${esc(r.hostName||pl.find(p=>p.uid===r.host)?.name||"—")} · ${pl.length} لاعب · ${r.status==="playing"?"▶ شغالة":"لوبي"}</div>
    <div class="mut" style="font-size:12px">${pl.map(p=>esc(p.name)).join(" · ")}</div></div></div>`;
  }).join("")}</div>`:`<div class="mut" style="margin-bottom:10px">مفيش غرف مفتوحة دلوقتي.</div>`}
  ${rooms.length?`<b>سجل الغرف</b><div style="max-height:40vh;overflow:auto">${rooms.slice(0,80).map(a=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1"><b>${esc(a.name||"طالب")}</b> <span class="pill i">${esc(labels[a.action]||a.action)}</span> ${a.detail?`<span dir="ltr">${esc(a.detail)}</span>`:""}<div class="mut" style="font-size:11px">${fmt(a.createdAt)}</div></span></div>`).join("")}</div>`:`<div class="mut">لسه مفيش حركات غرف.</div>`}
  </div>
  <div class="card"><h3>📋 نشاط المنصة</h3>
  <p class="mut">كل حركة مهمة للطلاب بالتفصيل (دخول · امتحانات · ألعاب · …)</p>
  ${!S.activityLoaded?`<div class="mut">جاري التحميل…</div>`:
    list.length?`<div style="max-height:50vh;overflow:auto">${list.map(a=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);align-items:flex-start">
      <span style="flex:1"><b>${esc(a.name||"طالب")}</b> <span class="mut">${esc(a.phone||"")}</span>
      <div><span class="pill i">${esc(labels[a.action]||a.action||"—")}</span> ${a.detail?`<span dir="auto">${esc(a.detail)}</span>`:""}</div>
      <div class="mut" style="font-size:11px">${fmt(a.createdAt)}${a.device?" · "+esc(String(a.device).slice(0,40)):""}</div>
      </span></div>`).join("")}</div>`
    :`<div class="mut">لسه مفيش نشاط مسجّل. هيظهر هنا أول ما الطلاب يتحركوا على المنصة.</div>`}
  </div>`;
}

function adminPlatformStatus(){
  const st=S.students||[];
  const app=st.filter(s=>s.clientType==="app");
  const web=st.filter(s=>s.clientType==="web");
  const unk=st.filter(s=>!s.clientType);
  const row=(s)=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
    <span style="flex:1"><b>${esc(s.name||"?")}</b><div class="mut" dir="ltr">${esc(s.phone||"")}</div></span>
    <span>${s.clientType==="app"?pill("📱 تطبيق","g"):s.clientType==="web"?pill("🌐 موقع","i"):pill("؟","y")}</span>
    <span class="mut" style="font-size:11px">${s.lastClientAt||s.lastSeenAt?fmt(s.lastClientAt||s.lastSeenAt):"—"}</span>
  </div>`;
  return `<div class="card"><h3 style="margin-top:0">حالة المنصة</h3>
  <p class="mut">مين فاتح من التطبيق المثبت ومين من المتصفح/الموقع</p>
  <div class="stats" style="margin-top:12px">
    <div class="stat card"><b>${app.length}</b><span class="mut">من التطبيق 📱</span></div>
    <div class="stat card"><b>${web.length}</b><span class="mut">من الموقع 🌐</span></div>
    <div class="stat card"><b>${unk.length}</b><span class="mut">غير محدد</span></div>
    <div class="stat card"><b>${st.length}</b><span class="mut">كل الطلاب</span></div>
  </div></div>
  <div class="card"><h3>من التطبيق</h3>${app.length?app.map(row).join(""):`<div class="mut">لسه محدش فتح من التطبيق</div>`}</div>
  <div class="card"><h3>من الموقع</h3>${web.length?web.map(row).join(""):`<div class="mut">مفيش</div>`}</div>
  <div class="card"><h3>كل الطلاب (آخر ظهور)</h3>
  ${[...st].sort((a,b)=>tsMs(b.lastClientAt||b.lastSeenAt)-tsMs(a.lastClientAt||a.lastSeenAt)).map(row).join("")||`<div class="mut">مفيش طلاب</div>`}
  </div>`;
}

function adminDash(){
  const st=stats(),days=lastDays(14),tk=todayKey();
  const regs=days.map(d=>(Array.isArray(S.students)?S.students:[]).filter(x=>x.createdAt&&x.createdAt.seconds&&dkey(x.createdAt.seconds)===d.k).length);
  const atts=days.map(d=>(Array.isArray(S.results)?S.results:[]).filter(x=>x.createdAt&&x.createdAt.seconds&&dkey(x.createdAt.seconds)===d.k).length);
  const today=(Array.isArray(S.results)?S.results:[]).filter(x=>x.createdAt&&x.createdAt.seconds&&dkey(x.createdAt.seconds)===tk);
  const act=new Set(today.map(x=>x.uid));S.students.forEach(x=>{if(x.lastLogin&&x.lastLogin.seconds&&dkey(x.lastLogin.seconds)===tk)act.add(x.id)});
  const ts=(Array.isArray(S.results)?S.results:[]).filter(r=>r.secs>0),avgT=ts.length?Math.round(ts.reduce((a,r)=>a+r.secs,0)/ts.length):null;
  const blocked=(Array.isArray(S.students)?S.students:[]).filter(x=>x.blocked).length;
  const sub=SUBJECTS.map(s=>{const rs=(Array.isArray(S.results)?S.results:[]).filter(r=>r.subject===s.id),w=rs.filter(r=>r.passMark>0);return {s,n:rs.length,pass:w.length?Math.round(w.filter(r=>r.passed).length/w.length*100):null}});
  const mxn=Math.max(1,...sub.map(x=>x.n));
  const bd=board();
  const wk=Date.now()/1000-7*86400;
  const need=(Array.isArray(S.students)?S.students:[]).filter(x=>!x.blocked).map(x=>{const r=(Array.isArray(S.results)?S.results:[]).filter(q=>q.uid===x.id);return {x,last:r.length?Math.max(...r.map(tms)):0}}).filter(y=>y.last<wk).sort((a,b)=>a.last-b.last).slice(0,8);
  const rec=S.results.slice(0,5);
  const ql=(a,t)=>a.length?a.map(m=>`<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span dir="auto" style="white-space:normal;flex:1">${esc(m.q.slice(0,90))}<div class="mut">${esc(m.exam)}</div></span>${pill(m.p+"% صح ("+m.n+")",t)}</div>`).join(""):`<div class="mut">محتاج 3 محاولات على الأقل على السؤال الواحد.</div>`;
  const li=(a,f)=>a.length?a.map((x,i)=>`<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${["🥇","🥈","🥉"][i]||(i+1)+"."} <a href="#" data-act="student" data-id="${x.uid}" style="color:var(--pri);font-weight:600">${esc(x.name)}</a></span><span>${f(x)}</span></div>`).join(""):`<div class="mut">لسه مفيش بيانات.</div>`;
  return `${adminPerfCard()}<div class="stats">
<div class="card stat"><b>${S.students.length}</b><span class="mut">طالب</span></div>
<div class="card stat"><b>${S.exams.length}</b><span class="mut">امتحان</span></div>
<div class="card stat"><b>${today.length}</b><span class="mut">اتحل النهاردة</span></div>
<div class="card stat"><b>${act.size}</b><span class="mut">نشيط النهاردة</span></div>
<div class="card stat"><b>${st.avg}%</b><span class="mut">متوسط الدرجات</span></div>
<div class="card stat"><b>${st.passRate==null?"-":st.passRate+"%"}</b><span class="mut">نسبة النجاح</span></div>
<div class="card stat"><b>${avgT==null?"-":dur(avgT)}</b><span class="mut">متوسط وقت الحل</span></div>
<div class="card stat"><b>${blocked}</b><span class="mut">محظور</span></div></div>
<div class="card"><h3>التسجيلات (آخر 14 يوم)</h3>${chart(days,regs)}</div>
<div class="card"><h3>المحاولات (آخر 14 يوم)</h3>${chart(days,atts)}</div>
<div class="card"><h3>المواد</h3>${sub.map(x=>`<div style="margin-top:8px"><div class="row"><span>${x.s.name}</span><span class="mut">${x.n} محاولة${x.pass==null?"":" · نجاح "+x.pass+"%"}</span></div><div class="hb"><i style="width:${x.n/mxn*100}%;background:linear-gradient(90deg,${x.s.c},${x.s.c2})"></i></div></div>`).join("")}</div>
<div class="card"><h3>🏆 أعلى متوسط</h3>${li(bd.top,x=>pill(x.avg+"%","g")+" <span class='mut'>"+x.n+" محاولة</span>")}</div>
<div class="card"><h3>🔥 الأكتر نشاطًا</h3>${li(bd.act,x=>pill(x.n+" محاولة"))}</div>
<div class="card"><h3>⚡ الأسرع (من اللي جابوا 50% فأكتر)</h3>${li(bd.fast,x=>pill(dur(x.fast)))}</div>
<div class="card"><h3>📌 محتاجين متابعة (ما امتحنوش من أسبوع)</h3>${need.length?need.map(y=>`<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span><a href="#" data-act="student" data-id="${y.x.id}" style="color:var(--pri);font-weight:600">${esc(y.x.name)}</a></span><span class="mut">${y.last?"آخر امتحان "+new Date(y.last*1000).toLocaleDateString("ar-EG"):"لسه ما امتحنش"}</span></div>`).join(""):`<div class="mut">كله ماشي كويس.</div>`}</div>
<div class="card"><h3>آخر النشاط</h3>${rec.length?rec.map(r=>`<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span><a href="#" data-act="student" data-id="${r.uid}" style="color:var(--pri);font-weight:600">${esc(r.name)}</a> <span class="mut">${esc(r.examTitle)} · م${r.attempt||1}</span></span><span>${r.score}/${r.total} ${passPill(r)}</span></div>`).join(""):`<div class="mut">لسه مفيش حد امتحن.</div>`}</div>
<div class="card"><h3>الامتحانات</h3><div class="tw"><table><tr><th>الامتحان</th><th>المادة</th><th>المحاولات</th><th>المتوسط</th><th>النجاح</th><th>الوقت</th></tr>
${st.per.map(p=>`<tr><td>${esc(p.e.title)}</td><td>${subName(p.e.subject)}</td><td>${p.n}</td><td>${p.n?p.avg+"%":"-"}</td><td>${p.pass==null?"-":p.pass+"%"}</td><td>${p.secs==null?"-":dur(p.secs)}</td></tr>`).join("")||`<tr><td colspan="6" class="mut">مفيش امتحانات</td></tr>`}</table></div></div>
<div class="card"><h3>أصعب الأسئلة</h3>${ql(st.hard,"r")}</div>
<div class="card"><h3>أسهل الأسئلة</h3>${ql(st.easy,"g")}</div>`}


function adminManagers(){
  const students=(S.students||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
  const asmMgrs=students.filter(s=>Array.isArray(s.roles)&&s.roles.includes("asm"));
  const q=(S.mgrQ||"").trim();
  const filtered=!q?students:students.filter(s=>((s.name||"")+" "+(s.phone||"")).includes(q));
  return `<div class="card" style="background:linear-gradient(135deg,color-mix(in srgb,var(--ind) 12%,var(--card)),var(--card))">
  <h3 style="margin-top:0">المسؤولين</h3>
  <p class="mut" style="margin:0">تعيين مسؤولين لأقسام المنصة — حاليًا: التقييمات</p>
</div>
<div class="card">
  <h3 style="margin-top:0">📋 مسؤولو التقييمات</h3>
  <p class="mut">يرفعوا ويعدّلوا التقييمات والحلول (قسم التقييمات فقط).</p>
  <div class="mut" style="margin:8px 0">الحاليون (${asmMgrs.length}): ${asmMgrs.map(s=>esc(s.name||s.phone||s.id)).join(" · ")||"مفيش لسه"}</div>
  <label class="f">بحث</label>
  <input id="mgrQ" type="search" value="${esc(S.mgrQ||"")}" placeholder="ابحث بالاسم…" data-change="mgrSearch">
  <div style="max-height:380px;overflow:auto;margin-top:10px">
  ${filtered.slice(0,100).map(s=>{
    const on=Array.isArray(s.roles)&&s.roles.includes("asm");
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1"><b>${esc(s.name||"طالب")}</b><div class="mut">${esc(s.phone||"")}</div></div>
      <button type="button" class="btn ${on?"":"ghost "}sm" data-act="grantAsmRole" data-uid="${s.id}">${on?"✓ مسؤول تقييمات":"تعيين"}</button>
    </div>`;
  }).join("")||`<div class="mut">مفيش طلاب</div>`}
  </div>
</div>
<div class="card mut"><b>قريبًا في نفس التبويب</b><div style="margin-top:6px">مسؤولو الكتب · الفضائح · الجروبات</div></div>`;
}

function adminAsm(){
  return `<div class="row" style="margin-bottom:12px"><div class="mut">${S.asms.length} تقييم</div><button class="btn" data-act="newAsm">تقييم جديد</button></div>
${S.asms.length?(Array.isArray(S.asms)?S.asms:[]).map(a=>`<div class="card"><div class="row"><div><b>${esc(a.title)}</b> ${pill(subName(a.subject))} ${pill(a.published?"ظاهر":"مخفي",a.published?"g":"y")} ${pill(a.showSolution?"الحل ظاهر":"الحل مقفول",a.showSolution?"g":"y")}
<div class="mut">${a.qn||0} ملف تقييم · ${a.sn||0} ملف حل${a.link?" · فيه رابط":""}</div></div>
<div class="row"><button class="btn ghost sm" data-act="editAsm" data-id="${a.id}">تعديل</button><button class="btn ghost sm" data-act="toggleSol" data-id="${a.id}">${a.showSolution?"اقفل الحل":"نزّل الحل"}</button><button class="btn ghost sm" data-act="toggleAsm" data-id="${a.id}">${a.published?"إخفاء":"إظهار"}</button><button class="btn danger sm" data-act="delAsm" data-id="${a.id}">حذف</button></div></div></div>`).join(""):`<div class="card mut">لسه مفيش تقييمات. دوس "تقييم جديد" وارفع صور أو ملفات PDF، أو اكتب التقييم وحله.</div>`}`}

function adminFadaye7(){
  const list=S.fadaye7||[];
  const students=(S.students||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
  const editId=S.fadHideEdit||null;
  const pend=(S.fadaye7||[]).filter(f=>f.status==="pending");
  const published=(S.fadaye7||[]).filter(f=>f.status!=="pending"&&f.status!=="rejected");
  return `<div class="row" style="margin-bottom:12px"><div class="mut">${published.length} منشورة · ${pend.length} معلّق · ${students.length} طالب</div></div>
${pend.length?`<div class="card" style="border:2px solid var(--gold);margin-bottom:12px">
  <h3 style="margin-top:0;color:var(--gold)">⬆ طلبات موافقة (${pend.length})</h3>
  ${pend.map(f=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)">
  <b>${esc(f.title||"")}</b>
  <div class="mut">من ${esc(f.authorName||"?")} · ${fmt(f.createdAt)}</div>
  ${f.url?mediaEmbed(f.url,f.kind):""}
  <div class="row" style="margin-top:10px;gap:8px">
    <button class="btn sm" data-act="approveFadaye7" data-id="${f.id}">موافقة ✓</button>
    <button class="btn danger sm" data-act="rejectFadaye7" data-id="${f.id}">رفض</button>
  </div></div>`).join("")}
</div>`:""}
<div class="card" style="margin-bottom:12px">
  <h3 style="margin-top:0">🙈 إخفاء كل الفضايح عن شخص</h3>
  <p class="mut" style="margin:0 0 8px">الطالب اللي تخفيه مش هيشوف قسم الفضايح خالص، وترجعه في أي وقت.</p>
  <div style="max-height:260px;overflow:auto">
  ${students.length?students.map(s=>{const off=Array.isArray(s.hiddenSections)&&s.hiddenSections.includes("fadaye7");
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:10px"><span style="flex:1"><b>${esc(s.name||"?")}</b><div class="mut" dir="ltr">${esc(s.phone||"")}</div></span>
    <button class="btn ${off?"":"ghost "}sm" data-act="toggleSecHide" data-uid="${s.id}" data-sec="fadaye7" data-on="${off?"0":"1"}">${off?"مخفي — إظهار":"إخفاء"}</button></div>`}).join(""):`<div class="mut">مفيش طلاب مسجّلين</div>`}
  </div>
</div>
<div class="card">
  <h3 style="margin-top:0">إضافة فضيحة جديدة</h3>
  <p class="mut">حتى 10 صور مضغوطة في Firestore · للفيديو استخدم رابطًا خارجيًا لتجنب Firebase Storage</p>
  <label class="f">عنوان / تعليق</label>
  <input id="fadTitle" type="text" placeholder="مثال: لما أحمد نسي الكود…" maxlength="120">
  <label class="f">صور من الجهاز (حتى 10)</label>
  <input id="fadFile" type="file" accept="image/*" multiple>
  <label class="f">أو رابط فيديو / صورة</label>
  <input id="fadLink" class="ltr" type="url" placeholder="https://…">
  <button class="btn" style="margin-top:12px" data-act="addFadaye7">نشر</button>
  <div id="fadPrev" class="upprev"></div><div id="fadProg">${upPanel("fad")}</div>
  <button class="btn ghost sm" style="margin-top:10px" data-act="fadDedupe">🧹 حذف المنشورات المكررة (من اللي ظاهر)</button>
</div>
${published.length?published.map(f=>{
  const hid=new Set(f.hideFrom||[]);
  const isEdit=editId===f.id;
  const panel=isEdit?`<div class="card" style="margin-top:10px;background:var(--sel)">
  <div class="row" style="margin-bottom:8px"><b style="flex:1">مين يشوف الفضيحة؟</b>
    <button class="btn ghost sm" data-act="closeFadHide">إغلاق</button></div>
  <p class="mut" style="margin:0 0 8px">✅ ظاهر · ☐ مخفي عن الطالب ده</p>
  <div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <button class="btn sm" data-act="fadHideNone" data-id="${f.id}">إظهار للجميع</button>
    <button class="btn ghost sm" data-act="fadHideAll" data-id="${f.id}">إخفاء عن الكل</button>
  </div>
  <div style="max-height:280px;overflow:auto">
  ${students.length?students.map(s=>{
    const on=!hid.has(s.id);
    return `<label class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:10px;cursor:pointer">
      <input type="checkbox" data-change="fadToggleStu" data-id="${f.id}" data-uid="${s.id}" data-name="${esc(s.name||"")}" ${on?"checked":""} style="width:18px;height:18px">
      <span style="flex:1"><b>${esc(s.name||"?")}</b><div class="mut" dir="ltr">${esc(s.phone||"")}</div></span>
      <span class="mut">${on?"يشوفها":"مخفية"}</span>
    </label>`;
  }).join(""):`<div class="mut">مفيش طلاب مسجّلين</div>`}
  </div>
  <button class="btn" style="margin-top:12px;width:100%" data-act="saveFadHide" data-id="${f.id}">حفظ من يشوف</button>
</div>`:"";
  const hideLine=(f.hideFrom||[]).length?`<div class="mut" style="margin-top:6px">مخفية عن ${(f.hideFrom||[]).length} طالب</div>`:`<div class="mut" style="margin-top:6px">ظاهرة للجميع</div>`;
  return `<div class="card"><div class="row" style="align-items:flex-start"><div style="flex:1"><b>${esc(f.title||"فضيحة")}</b>
<div class="mut">${fmt(f.createdAt)} · ${f.kind==="video"?"🎬 فيديو":"🖼 صورة"}</div>
${mediaEmbed(f.url,f.kind)}
${hideLine}
</div>
<div style="display:flex;flex-direction:column;gap:6px">
<button class="btn gold sm" data-act="openFadHide" data-id="${f.id}">👥 مين يشوف؟</button>
<button class="btn danger sm" data-act="delFadaye7" data-id="${f.id}">حذف</button>
</div></div>${panel}</div>`;
}).join(""):(S.fadOffline?`<div class="card mut">📡 مفيش اتصال بالسيرفر — اتأكد من الإنترنت.<br>الفضايح المنشورة هتظهر أول ما الاتصال يرجع.</div>`:`<div class="card mut">لسه مفيش فضايح — انشر أول واحدة 😂</div>`)}
`;
}

const fileList=(arr,part)=>arr.length?arr.map(f=>`<span class="thumb">${f.kind==="image"?`<img src="${f.data}" alt="">`:"📄"} ${esc((f.name||"").slice(0,22))} <button type="button" class="btn danger sm" style="min-height:28px;padding:0 8px" data-act="delFile" data-part="${part}" data-id="${f.id}" data-gid="${f.gid}" data-kind="${f.kind}">✕</button></span>`).join(""):`<span class="mut">مفيش ملفات مرفوعة.</span>`;
function asmEditor(){
  const e=S.editingAsm,a=e.asm||{subject:"arabic",title:"",desc:"",link:"",published:true,showSolution:false};
  return `<div class="wrap wide">${header(`<button class="btn ghost sm" data-act="cancelAsm">↩ رجوع</button>`)}
<form class="card" data-submit="saveAsm"><h2>${e.id?"تعديل التقييم":"تقييم جديد"}</h2>
<label class="f" for="asub">المادة</label><select id="asub">${SUBJECTS.map(s=>`<option value="${s.id}" ${a.subject===s.id?"selected":""}>${s.name}</option>`).join("")}<option value="general" ${a.subject==="general"?"selected":""}>عام</option></select>
<label class="f" for="atitle">اسم التقييم</label><input id="atitle" type="text" value="${esc(a.title)}" placeholder="مثال: تقييم الأسبوع الأول" required>
<label class="f" for="adesc">نص التقييم (اختياري، لو هتكتبه بدل الصور)</label><textarea id="adesc" style="min-height:130px" dir="auto">${esc(a.desc||"")}</textarea>
<label class="f" for="qf">ملفات التقييم: صور أو PDF (اختياري)</label><input id="qf" type="file" accept="image/*,application/pdf" multiple>
<div id="qlist" style="margin-top:6px">${fileList(e.q,"q")}</div>
<label class="f" for="alink">رابط خارجي (اختياري، مثلاً Google Drive)</label><input id="alink" class="ltr" type="text" value="${esc(a.link||"")}" placeholder="https://...">
<h3 style="margin-top:18px">الحل</h3>
<label class="f" for="asol">نص الحل (اختياري)</label><textarea id="asol" style="min-height:130px" dir="auto">${esc(e.solText||"")}</textarea>
<label class="f" for="sf">ملفات الحل: صور أو PDF (اختياري)</label><input id="sf" type="file" accept="image/*,application/pdf" multiple>
<div id="slist" style="margin-top:6px">${fileList(e.s,"s")}</div>
<label class="f" style="margin-top:14px"><input id="apub" type="checkbox" ${a.published?"checked":""}> يظهر للطلاب</label>
<label class="f" style="margin-top:4px"><input id="ashow" type="checkbox" ${a.showSolution?"checked":""}> نزّل الحل للطلاب (لو مش معلّم، الحل مقفول عنهم)</label>
<p class="mut">الصور بتتصغّر تلقائيًا قبل الرفع. حجم الـ PDF الأقصى 5MB. ملفات Word مش مدعومة: حوّلها لـ PDF أو صور.</p>
<div style="margin-top:12px"><button class="btn" id="sva">حفظ التقييم</button></div></form></div>`}


function presenceWhere(){
  const v=String(S.view||"");
  if(v==="exam")return "exam:"+((S.cur&&S.cur.exam&&S.cur.exam.title)||"").slice(0,60);
  if(v.indexOf("qb")===0&&S.qb&&S.qb.roomCode)return "room:"+S.qb.roomCode;
  if(v==="chatList"||v==="chatThread"||v==="groupThread")return "chat";
  if(v==="games"||v.indexOf("qb")===0)return "games";
  if(v==="me"||v==="profile"||v==="search")return "me";
  if(v==="fadaye7")return "fadaye7";
  if(v==="gallery"||v==="tanagha")return "tanagha";
  if(v==="books")return "books";
  if(v==="ai")return "ai";
  if(v==="asmList"||v==="asm")return "asm";
  if(v==="progress")return "progress";
  if(v==="home"||v==="subject"||v==="result"||v==="review")return "home";
  return "other";
}
function whereLabel(w){
  w=String(w||"");
  if(w.indexOf("exam:")===0)return "📝 بيمتحن: "+(w.slice(5)||"امتحان");
  if(w.indexOf("room:")===0)return "🎮 في غرفة "+w.slice(5);
  return ({chat:"💬 في التواصل",games:"🎮 في الألعاب",me:"👤 في «أنا»",fadaye7:"😂 في الفضايح",tanagha:"💗 في التناغه",books:"📚 في الكتب",ai:"🤖 مع المساعد",asm:"📝 في التقييمات",progress:"📈 في «تقدمي»",home:"🏠 في المواد"})[w]||"🟢 فاتح المنصة";
}
function adminOnlineNow(){
  const n=Date.now();
  const pres=S.presence||{};
  const names={};(Array.isArray(S.students)?S.students:[]).forEach(x=>{names[x.id]=x});
  const rows=Object.keys(pres).map(uid=>({uid,p:pres[uid],ms:tsMs(pres[uid].lastSeenAt),st:names[uid]||{}}))
    .filter(r=>r.ms&&(n-r.ms)<660000&&r.p.online!==false)
    .sort((a,b)=>b.ms-a.ms);
  const ago=ms=>{const s=Math.max(0,Math.round((n-ms)/1000));return s<60?"دلوقتي":"من "+Math.round(s/60)+" د"};
  return `<h3>🟢 أونلاين دلوقتي (${rows.length})</h3>
${rows.length?`<div class="card" style="padding:4px 14px">${rows.map(r=>`<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line);gap:8px"><div style="flex:1;min-width:0"><b><a href="#" data-act="student" data-id="${r.uid}" style="color:var(--pri)">${esc(r.st.name||"طالب")}</a></b><div class="mut" style="font-size:13px">${r.p.away?"⏸ في الخلفية (فاتح المنصة بس) · ":""}${esc(whereLabel(r.p.where))}</div></div><span class="mut" style="font-size:12px;white-space:nowrap">${ago(r.ms)}</span></div>`).join("")}</div>`:`<div class="card mut">مفيش حد أونلاين دلوقتي.</div>`}
`;
}

function adminLive(){
  const n=NOW();
  const rows=(Array.isArray(S.starts)?S.starts:[]).map(x=>{const e=S.exams.find(q=>q.id===x.examId);
    return {...x,e,left:e&&e.minutes?Math.max(0,Math.round((x.t+e.minutes*60000-n)/1000)):null,active:n-(x.seen||x.t)<150000}}).sort((a,b)=>b.t-a.t);
  const act=rows.filter(r=>r.active),old=rows.filter(r=>!r.active&&n-(r.seen||r.t)<6*3600000);
  const row=r=>`<div class="card"><div class="row"><b><a href="#" data-act="student" data-id="${r.uid}" style="color:var(--pri)">${esc(r.name||"طالب")}</a></b><span>${r.active?(r.away?pill("🔴 خرج من الامتحان","r"):pill("🟢 بيحل","g")):pill("⚪ انقطع الاتصال","y")}</span></div>
<div class="mut">${esc(r.examTitle||"")} · محاولة ${r.n}${r.left!=null?" · باقي "+dur(r.left):""}</div>
<div class="hb" style="margin:6px 0"><i style="width:${r.total?Math.round((r.answered||0)/r.total*100):0}%;background:var(--pri)"></i></div>
<div class="mut">جاوب ${r.answered||0} من ${r.total||"؟"} · 📱 ${esc(r.device||"؟")} · IP ${esc(r.ip||"؟")} · آخر ظهور ${Math.max(0,Math.round((n-(r.seen||r.t))/1000))} ث</div></div>`;
  const rooms=(S.adminRooms||[]).filter(r=>r.status==="lobby"||r.status==="playing");
  // آخر 10 دقايق — tsMs بيرجّع ميلي ثانية
  const chats=(S.adminConvs||[])
    .map(c=>({...c,_ms:tsMs(c.updatedAt||c.lastAt)}))
    .filter(c=>c._ms && (n-c._ms)<10*60000)
    .sort((a,b)=>b._ms-a._ms);
  // كل المحادثات الأخيرة (لو مفيش في 10 دق)
  const recentAll=(S.adminConvs||[])
    .map(c=>({...c,_ms:tsMs(c.updatedAt||c.lastAt)}))
    .filter(c=>c._ms)
    .sort((a,b)=>b._ms-a._ms)
    .slice(0,15);
  return `<p class="mut">صورة حية للمنصة: امتحانات · غرف · محادثات. (${(S.adminConvs||[]).length} محادثة مسجّلة)</p>
${adminOnlineNow()}
<h3 style="margin-top:18px">📝 بيمتحنوا دلوقتي (${act.length})</h3>${act.length?act.map(row).join(""):`<div class="card mut">مفيش حد بيمتحن دلوقتي.</div>`}
<h3 style="margin-top:18px">🎮 غرف شغالة (${rooms.length})</h3>
${rooms.length?rooms.map(r=>{
  const pl=Object.values(r.players||{});
  return `<div class="card"><div class="row"><div><b dir="ltr">${esc(r.code||r.id)}</b> · ${esc(qbGameLabel(r.game||"qb"))} ${r.public?"🌐 عام":"🔒 خاص"}
  <div class="mut">${r.status==="playing"?"▶ المباراة شغالة":"لوبي"} · مضيف: ${esc(r.hostName||"—")}</div>
  <div class="mut" style="font-size:12px">${pl.map(p=>esc(p.name)+(p.away?" (برا)":"")).join(" · ")||"فاضي"}</div></div>
  <button class="btn danger sm" data-act="adminCloseRoom" data-code="${esc(r.code||r.id)}">اقفل الغرفة</button></div></div>`;
}).join(""):`<div class="card mut">مفيش غرف مفتوحة.</div>`}
<h3 style="margin-top:18px">💬 بيتكلموا دلوقتي — آخر 10 دقايق (${chats.length})</h3>
${chats.length?chats.map(c=>{
  const names=c.names||{};
  const ps=(c.participants||[]).map(u=>{
    const st=(S.students||[]).find(s=>s.id===u);
    return names[u]||(st&&st.name)||u.slice(0,8);
  }).join(" ↔ ");
  const ago=Math.max(0,Math.round((n-c._ms)/1000));
  return `<div class="card"><b>${esc(ps)}</b><div class="mut">${esc(c.lastText||"…")}</div><div class="mut" style="font-size:12px">منذ ${ago<60?ago+" ث":Math.round(ago/60)+" د"} · ${fmt(c.lastAt||c.updatedAt)}</div></div>`;
}).join(""):`<div class="card mut">مفيش محادثات في آخر 10 دقايق.${recentAll.length?` آخر نشاط:`:""}</div>`}
${chats.length?"":(recentAll.length?recentAll.map(c=>{
  const names=c.names||{};
  const ps=(c.participants||[]).map(u=>{
    const st=(S.students||[]).find(s=>s.id===u);
    return names[u]||(st&&st.name)||u.slice(0,8);
  }).join(" ↔ ");
  return `<div class="card" style="opacity:.85"><b>${esc(ps)}</b><div class="mut">${esc(c.lastText||"…")} · ${fmt(c.lastAt||c.updatedAt)}</div></div>`;
}).join(""):"")}
${old.length?`<h3 style="margin-top:18px">⚪ امتحان — انقطع الاتصال (${old.length})</h3>${old.map(row).join("")}`:""}`}
function adminExams(){
  if(bkUrl())bkLoadList();
  const bkOpts=(S.bkList&&S.bkList.length)?S.bkList:[{id:"",title:"⚠ مفيش كتب — ارفع كتاب من تبويب الكتب",pages:0}];
  const genCard=`<div class="card" style="border-color:var(--gold)">
  <h3 style="margin-top:0">🎲 توليد امتحان بالـ AI من الكتاب</h3>
  <p class="mut" style="font-size:12px">اختار الكتاب وعدد الأسئلة — الـ AI يقرأ صفحات الكتاب ويولّد أسئلة اختيار من متعدد (مع رقم صفحة كل سؤال). الامتحان بيتحفظ «مخفي» تراجعه بنفسك.</p>
  <div class="row" style="flex-wrap:wrap;gap:8px">
    <select id="geBook" style="flex:2;min-width:160px">${bkOpts.map(b=>`<option value="${esc(b.id)}" ${(S.genPrefill&&S.genPrefill.book===b.id)?"selected":""}>${esc(b.title)} (${b.pages} ص)</option>`).join("")}</select>
    <input id="geCount" type="number" min="3" max="30" value="${(S.genPrefill&&S.genPrefill.count)||10}" style="width:64px" title="عدد الأسئلة">
  </div>
  <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
    <select id="geSubj" style="flex:1;min-width:100px">${SUBJECTS.map(s=>`<option value="${s.id}">${s.name}</option>`).join("")}</select>
    <select id="geLevel" style="flex:1;min-width:90px"><option>سهل</option><option selected>متوسط</option><option>صعب</option></select>
  </div>
  <input id="geSubject" type="text" maxlength="30" placeholder="ملاحظة مادة (اختياري)" style="margin-top:8px" value="${esc((S.genPrefill&&S.genPrefill.subject)||"")}">
  <input id="geTitle" type="text" maxlength="60" placeholder="عنوان الامتحان (اختياري)" style="margin-top:6px" value="${esc((S.genPrefill&&S.genPrefill.title)||"")}">
  <button class="btn sm gold" style="margin-top:8px" data-act="genExam">${S.genBusy?"⏳ الـ AI بيولّد…":"🎲 ولّد الأسئلة"}</button>
  ${S.genErr?`<div class="err" style="margin-top:8px">${esc(S.genErr)}</div>`:""}
  </div>`;
  const genOut=S.genOut?`<div class="card"><h3 style="margin-top:0">👁 معاينة الأسئلة — ${esc(S.genOut.title)}</h3>
  ${S.genOut.questions.map((q,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${i+1}. ${esc(q.q)}</b> ${q.page?`<span class="pill i">📖 ص ${esc(String(q.page))}</span>`:""}<div class="mut">${(q.o||[]).map((o,oi)=>`${oi===q.a?"✅ ":"• "}${esc(o)}`).join(" · ")}</div></div>`).join("")}
  <div class="row" style="margin-top:10px"><button class="btn" data-act="genExamSave">💾 حفظ كامتحان (مخفي)</button><button class="btn ghost" data-act="genExamClear">إلغاء</button></div></div>`:"";
  return `<div class="row" style="margin-bottom:12px"><div class="mut">${S.exams.length} امتحان</div><button class="btn" data-act="newExam">امتحان جديد</button></div>
${genCard}
${genOut}
${S.exams.length?S.exams.map(e=>{const n=(Array.isArray(S.results)?S.results:[]).filter(r=>r.examId===e.id).length;return `<div class="card"><div class="row"><div><b>${esc(e.title)}</b> ${pill(subName(e.subject))} ${pill(e.published?(e.publishAt&&!vis(e)?"مجدول":"ظاهر للطلاب"):"مخفي",e.published?(e.publishAt&&!vis(e)?"i":"g"):"y")}
<div class="mut">${gcount(e)} سؤال${e.questions.length>gcount(e)?" + ألغاز":""} · ${e.minutes?e.minutes+" دقيقة":"بدون وقت"} · ${e.passMark>0?"النجاح من "+e.passMark:"بدون درجة نجاح"} · ${n} محاولة${e.publishAt?" · ينزل "+new Date(e.publishAt).toLocaleString("ar-EG",{dateStyle:"short",timeStyle:"short"}):""}</div></div>
<div class="row"><button class="btn ghost sm" data-act="editExam" data-id="${e.id}">تعديل</button><button class="btn ghost sm" data-act="dupExam" data-id="${e.id}">نسخ</button><button class="btn ghost sm" data-act="togglePub" data-id="${e.id}">${e.published?"إخفاء":"إظهار"}</button><button class="btn danger sm" data-act="delExam" data-id="${e.id}">حذف</button></div></div></div>`}).join(""):`<div class="card mut">لسه مفيش امتحانات. دوس "+" وابدأ.</div>`}`}
function studentRows(){
  const by={};
  (Array.isArray(S.results)?S.results:[]).forEach(r=>{(by[r.uid]||(by[r.uid]=[])).push(r)});
  return (Array.isArray(S.students)?S.students:[]).map(s=>{const rs=by[s.id]||[];
    const avg=rs.length?Math.round(rs.reduce((a,r)=>a+pctOf(r),0)/rs.length):null;
    return {s,rs,avg,tabs:rs.reduce((a,r)=>a+(r.tabs||0),0),last:rs.length?rs[0]:null}});
}
function studentsTable(){
  const q=(S.sq||"").trim().toLowerCase(),cnt={};
  S.students.forEach(x=>{if(x.ip)cnt[x.ip]=(cnt[x.ip]||0)+1});
  const allRows=studentRows().filter(x=>!q||(x.s.name||"").toLowerCase().includes(q)||(x.s.phone||"").includes(q));
  const lim=S.sLimit||STUDENTS_TABLE_PAGE;
  const rows=allRows.slice(0,lim);
  const moreBtn=allRows.length>lim?`<div style="text-align:center;margin:10px"><button class="btn ghost sm" data-act="moreStudents">عرض المزيد (${allRows.length-lim} طالب متبقي) — أو استخدم البحث</button></div>`:"";
  return rows.length?`<div class="tw card" style="padding:0"><table><tr><th>الاسم</th><th>التليفون</th><th>آخر دخول</th><th>آخر IP</th><th>الجهاز</th><th>المحاولات</th><th>المتوسط</th><th>خروج</th><th></th></tr>
${rows.map(x=>`<tr><td>${esc(x.s.name)} ${x.s.blocked?pill("موقوف","r"):""}</td><td dir="ltr">${esc(x.s.phone)}</td><td>${fmt(x.s.lastLogin)||"-"}</td><td dir="ltr">${esc(x.s.ip||"-")} ${x.s.ip&&cnt[x.s.ip]>1?pill("مشترك","y"):""}</td><td>${esc(x.s.device||"-")}</td><td>${x.rs.length}</td><td>${x.avg==null?"-":x.avg+"%"}</td><td>${x.tabs?pill(x.tabs,"r"):0}</td><td><button class="btn sm" data-act="student" data-id="${x.s.id}">فتح الملف</button> <button class="btn ${x.s.blocked?"ghost":"danger"} sm" data-act="${x.s.blocked?"unblock":"block"}" data-id="${x.s.id}">${x.s.blocked?"فك الحظر":"حظر نهائي"}</button></td></tr>`).join("")}</table></div>${moreBtn}`:`<div class="card mut">مفيش طلاب بالمواصفات دي.</div>`;
}
function adminStudents(){
  return `<div class="stats"><div class="card stat"><b>${S.students.length}</b><span class="mut">طالب مسجّل</span></div></div>
<input id="sq" type="text" placeholder="ابحث بالاسم أو رقم التليفون" value="${esc(S.sq||"")}" style="margin-bottom:12px">
<div id="stbl">${studentsTable()}</div>
<p class="mut">علامة "مشترك" معناها إن نفس الـ IP استخدمه أكتر من حساب (ممكن أخوات في نفس البيت، أو حساب واحد بيتشارك). الـ IP ممكن يبقى فاضي أو غير دقيق مع VPN أو مانع إعلانات. لمسح حساب أو تغيير كلمة سر: Firebase Console ← Authentication.</p>`}
function studentDetail(){
  const s=S.students.find(x=>x.id===S.studentId)||{id:"",name:"؟",phone:""};
  const rs=(Array.isArray(S.results)?S.results:[]).filter(r=>r.uid===s.id),avg=rs.length?Math.round(rs.reduce((a,r)=>a+pctOf(r),0)/rs.length):null;
  const w=rs.filter(r=>r.passMark>0),lg=S.logins[s.id],al=S.alerts.filter(a=>a.uid===s.id),lv=S.starts.filter(x=>x.uid===s.id);
  const ips=new Set([s.ip,...(lg||[]).map(x=>x.ip)].filter(Boolean));
  const shared=(Array.isArray(S.students)?S.students:[]).filter(x=>x.id!==s.id&&((x.ip&&ips.has(x.ip))));
  const ev=[];
  if(s.createdAt&&s.createdAt.seconds)ev.push({t:s.createdAt.seconds,i:"🆕",x:"سجّل الحساب"+(s.regIp?` · IP ${s.regIp}`:"")+(s.regDevice?` · ${s.regDevice}`:"")});
  (lg||[]).forEach(x=>{if(x.createdAt&&x.createdAt.seconds)ev.push({t:x.createdAt.seconds,i:"🔑",x:`دخل من ${x.device||"؟"} · IP ${x.ip||"؟"}`})});
  rs.forEach(r=>{if(r.createdAt&&r.createdAt.seconds)ev.push({t:r.createdAt.seconds,i:"📝",x:`سلّم ${r.examTitle} (م${r.attempt||1}): ${r.score}/${r.total}${r.passMark>0?(r.passed?" · ناجح":" · راسب"):""}${r.tabs?` · خرج ${r.tabs} مرة`:""}`})});
  al.forEach(a=>{if(a.createdAt&&a.createdAt.seconds)ev.push({t:a.createdAt.seconds,i:"⚠",x:`خرج من الامتحان ${a.examTitle} (المرة ${a.count})`})});
  lv.forEach(x=>ev.push({t:Math.floor(x.t/1000),i:"▶",x:`بدأ ${x.examTitle||""} (م${x.n}) وجاوب ${x.answered||0} من ${x.total||"؟"}${x.away?" · خارج الصفحة دلوقتي":""}`}));
  ev.sort((a,b)=>b.t-a.t);
  const isAsm=Array.isArray(s.roles)&&s.roles.includes("asm");
  const roleBtns=`<div class="card"><b>صلاحيات خاصة</b><div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
    <button type="button" class="btn ${isAsm?"":"ghost "}sm" data-act="grantAsmRole" data-uid="${s.id}">${isAsm?"✓ مسؤول تقييمات":"تعيين مسؤول تقييمات"}</button>
    <button type="button" class="btn ${s.tanaghaSave?"":"ghost "}sm" data-act="toggleTanaghaSave" data-uid="${s.id}">${s.tanaghaSave?"✓ حفظ التناغه":"سماح حفظ التناغه"}</button>
    ${S.testerUid&&S.testerUid!==s.id?`<button type="button" class="btn ghost sm" disabled>🔒 وضع التجربة محجوز لحساب تاني</button>`:`<button type="button" class="btn ${S.testerUid===s.id?"":"ghost "}sm" data-act="adminLifeAll" data-uid="${s.id}">${S.testerUid===s.id?"✓ حساب التجربة (ثابت)":"🎁 اختيار حساب التجربة (مرة واحدة)"}</button>`}
  </div></div>`;
  const wa=s.phone&&/^01\d{9}$/.test(s.phone)?`https://wa.me/20${s.phone.slice(1)}`:"";
  return `<div class="wrap wide">${header(`<button class="btn ghost sm" data-act="backAdmin">رجوع</button>`)}
${roleBtns}
<div class="card"><div class="row" style="flex-wrap:nowrap;gap:14px;justify-content:flex-start"><div class="av">${esc((s.name||"؟").trim().charAt(0))}</div>
<div style="flex:1"><h2 style="margin:0">${esc(s.name)} ${s.blocked?pill("موقوف","r"):pill("نشط","g")}</h2><div class="mut" dir="auto">${esc(s.phone)}</div></div></div>
<div class="row" style="margin-top:12px;justify-content:flex-start">${s.phone?`<a class="btn ghost sm" href="tel:${esc(s.phone)}">📞 اتصال</a>`:""}${wa?`<a class="btn ghost sm" href="${wa}" target="_blank" rel="noopener">💬 واتساب</a>`:""}${s.blocked?pill("⛔ موقوف — مش هيقدر يدخل المنصة","r"):""}${(s.hiddenSections&&s.hiddenSections.length)?pill("🙈 مخفي عنه "+s.hiddenSections.length+" قسم (يدخل بس مش بيشوف القسم)","y"):""}
<button class="btn ${s.blocked?"":"danger"} sm" data-act="${s.blocked?"unblock":"block"}" data-id="${s.id}">${s.blocked?"✅ فك الحظر (يرجع يستخدم المنصة)":"⛔ حظر نهائي (يقفل الحساب)"}</button>
<button class="btn ghost sm" data-act="adminResetPass" data-id="${s.id}" data-phone="${esc(s.phone||"")}">🔑 كلمة سر جديدة</button>
<button class="btn gold sm" data-act="adminRecoverCode" data-id="${s.id}" data-phone="${esc(s.phone||"")}">🔑 إصدار كود استعادة للطالب</button></div></div>
<div class="card" id="resetPassBox" style="display:none"><h3>تعيين كلمة سر جديدة</h3>
<p class="mut">للإيميل في Firebase: <b dir="ltr">${esc((s.phone||"")+"@eltafawoq.app")}</b></p>
<label class="f">كلمة السر الجديدة (6+)</label>
<input id="adminNewPw" class="ltr" type="text" minlength="6" placeholder="استخدم كلمة مرور قوية" autocomplete="off">
<div class="row" style="margin-top:10px;justify-content:flex-start;gap:8px">
<button class="btn sm" data-act="adminResetPassGo" data-id="${s.id}" data-phone="${esc(s.phone||"")}">حفظ كلمة السر</button>
<button class="btn ghost sm" type="button" onclick="document.getElementById('resetPassBox').style.display='none'">إلغاء</button>
</div>
<p class="mut" style="margin-top:8px">لو ظهرت رسالة إن التغيير من الكونسول: Firebase → Authentication → Users → دور على الإيميل فوق → Reset password / Edit.</p>
</div>
${(S.recoverShown&&S.recoverShown.uid===s.id&&(Date.now()-(S.recoverShown.at||0)<14*60*1000))?`<div class="card" style="border-color:var(--gold);background:var(--ybg)"><h3 style="margin-top:0">🔑 كود الاستعادة — ${esc(S.recoverShown.phone||"")}</h3>
<div style="font-size:34px;font-weight:900;letter-spacing:8px;text-align:center;margin:8px 0" dir="ltr">${esc(String(S.recoverShown.code))}</div>
<div class="mut" style="text-align:center">صالح 15 دقيقة من الإصدار — ابعته للطالب وهو يدخله من صفحة الدخول → «نسيت كلمة السر؟»</div>
<div style="text-align:center;margin-top:8px"><button class="btn sm" data-act="copyRecoverCode">📋 نسخ الكود</button></div>
</div>`:""}
<div class="card"><h3>بيانات الحساب</h3>
<div class="tl"><span>🆕</span><span>تاريخ التسجيل: <b>${fmt(s.createdAt)||"-"}</b></span></div>
<div class="tl"><span>🔑</span><span>آخر دخول: <b>${fmt(s.lastLogin)||"-"}</b></span></div>
<div class="tl"><span>🌐</span><span>آخر IP: <b dir="ltr">${esc(s.ip||"-")}</b></span></div>
<div class="tl"><span>📱</span><span>آخر جهاز ومتصفح: <b>${esc(s.device||"-")}</b></span></div>
<div class="tl"><span>📍</span><span>IP وجهاز التسجيل: <b dir="ltr">${esc(s.regIp||"-")}</b> · ${esc(s.regDevice||"-")}</span></div>
${shared.length?`<div class="err" style="margin-top:10px">نفس الـ IP اتستخدم في حسابات تانية: ${shared.map(x=>`<a href="#" data-act="student" data-id="${x.id}" style="color:inherit;font-weight:700">${esc(x.name)}</a>`).join("، ")}</div>`:""}</div>
<div class="stats"><div class="card stat"><b>${rs.length}</b><span class="mut">محاولة</span></div><div class="card stat"><b>${avg==null?"-":avg+"%"}</b><span class="mut">المتوسط</span></div><div class="card stat"><b>${w.length?w.filter(r=>r.passed).length+"/"+w.length:"-"}</b><span class="mut">نجاح</span></div><div class="card stat"><b>${rs.reduce((a,r)=>a+(r.tabs||0),0)}</b><span class="mut">مرات خروج</span></div></div>
<div class="card"><h3>ملاحظاتك الخاصة (مش بتظهر للطالب)</h3><textarea id="note" style="min-height:80px" placeholder="مثال: بيذاكر بالليل، محتاج متابعة في الرياضيات">${esc(s.note||"")}</textarea><div style="margin-top:10px"><button class="btn sm" data-act="saveNote" data-id="${s.id}">حفظ الملاحظة</button></div></div>
<div class="card" style="border-color:var(--gold)"><h3>🔒 الأمان — إعادة تعيين كلمة السر</h3>
<p class="mut">لو الطالب نسي كلمة السر ومش عارف يدخل: افتح <b>Firebase Console → Authentication → Users</b> وابحث عن <span dir="ltr">${esc(s.phone||"")}@eltafawoq.app</span> واضغط Reset password أو غيّرها يدوياً.</p>
<p class="mut">أو أنشئ <b>كود استعادة</b> للطالب وهو داخل حسابه (من صفحة «أنا») عشان يتجاوز قيود الـ IP والأسبوع:</p>
${s.pwResetCode?`<div class="err" style="background:var(--ybg);color:var(--yfg)">كود حالي: <b dir="ltr">${esc(s.pwResetCode)}</b> ${s.pwResetUntil?`· صالح لحد ${fmt(s.pwResetUntil)}`:""}</div>`:""}
<button class="btn sm gold" data-act="adminGenReset" data-id="${s.id}">توليد كود استعادة</button>
<button class="btn ghost sm" data-act="adminClearReset" data-id="${s.id}">مسح الكود</button>
</div>
<div class="card"><h3>كل نشاط الطالب</h3>${ev.length?ev.slice(0,60).map(e=>`<div class="tl"><span>${e.i}</span><span style="flex:1">${esc(e.x)}</span><span class="mut" style="white-space:nowrap">${new Date(e.t*1000).toLocaleString("ar-EG",{dateStyle:"short",timeStyle:"short"})}</span></div>`).join(""):`<div class="mut">لسه مفيش نشاط.</div>`}</div>
<div class="card"><h3>سجل الدخول (آخر 30 مرة)</h3>${lg===null||lg===undefined?`<div class="sk" style="min-height:60px"></div>`:lg.length?`<div class="tw"><table><tr><th>الوقت</th><th>IP</th><th>الجهاز والمتصفح</th><th>الشاشة</th><th>المنطقة</th></tr>${lg.map(x=>`<tr><td>${fmt(x.createdAt)}</td><td dir="ltr">${esc(x.ip||"-")}</td><td>${esc(x.device||"-")}</td><td dir="ltr">${esc(x.screen||"-")}</td><td dir="ltr">${esc(x.tz||"-")}</td></tr>`).join("")}</table></div>`:`<div class="mut">مفيش سجل دخول لسه (بيتسجل من الإصدار ده).</div>`}</div>
<div class="card"><h3>المحاولات</h3>${rs.length?`<div class="tw"><table><tr><th>الامتحان</th><th>المادة</th><th>م</th><th>الدرجة</th><th>%</th><th>النتيجة</th><th>الوقت</th><th>خروج</th><th>التاريخ</th><th></th></tr>
${rs.map(r=>`<tr><td>${esc(r.examTitle)}</td><td>${subName(r.subject)}</td><td>${r.attempt||1}</td><td><b>${r.score}/${r.total}</b></td><td>${pctOf(r)}%</td><td>${passPill(r)||"-"}</td><td>${dur(r.secs)}</td><td>${r.tabs?pill(r.tabs,"r"):0}</td><td>${fmt(r.createdAt)}</td><td><button class="btn ghost sm" data-act="reviewAdmin" data-id="${r.id}" data-back="studentDetail">شوف الحل</button> <button class="btn ghost sm" data-act="delResult" data-id="${r.id}">حذف</button></td></tr>`).join("")}</table></div>`:`<div class="mut">الطالب ده لسه ما امتحنش.</div>`}</div></div>`}
function adminResults(){
  const exs=[...new Map((Array.isArray(S.results)?S.results:[]).map(r=>[r.examId,r.examTitle]))];
  const rows=(Array.isArray(S.results)?S.results:[]).filter(r=>!S.filter||r.examId===S.filter);
  return `<div class="row" style="margin-bottom:12px"><select data-change="filter" style="max-width:260px"><option value="">كل الامتحانات</option>${exs.map(([id,t])=>`<option value="${id}" ${S.filter===id?"selected":""}>${esc(t)}</option>`).join("")}</select>
<button class="btn gold sm" data-act="xlsx">📊 تصدير Excel (xlsx)</button> <button class="btn ghost sm" data-act="csv">CSV</button></div>
${rows.length?`<div class="tw card" style="padding:0"><table><tr><th>الاسم</th><th>التليفون</th><th>الامتحان</th><th>م</th><th>الدرجة</th><th>%</th><th>النتيجة</th><th>الوقت</th><th>خروج</th><th>التاريخ</th><th></th></tr>
${rows.map(r=>`<tr><td><a href="#" data-act="student" data-id="${r.uid}" style="color:var(--pri);font-weight:600">${esc(r.name)}</a></td><td dir="ltr">${esc(r.phone)}</td><td>${esc(r.examTitle)}</td><td>${r.attempt||1}</td><td><b>${r.score}/${r.total}</b></td><td>${pctOf(r)}%</td><td>${passPill(r)||"-"}</td><td>${dur(r.secs)}</td><td>${r.tabs?pill(r.tabs,"r"):0}</td><td>${fmt(r.createdAt)}</td><td><button class="btn ghost sm" data-act="reviewAdmin" data-id="${r.id}" data-back="admin">الحل</button> <button class="btn ghost sm" data-act="delResult" data-id="${r.id}">حذف</button></td></tr>`).join("")}</table></div>
<p class="mut">زرار "حذف" بيمسح المحاولة دي ويرجّع للطالب محاولة.</p>`:`<div class="card mut">لسه مفيش حد امتحن.</div>`}`}



/* ===== موافقة الدخول لأقسام أولاد التناغه (فضايح + خاص) ===== */
function tanaghaState(p){return (p&&p.tanaghaAccess)||"approved"}
function isTgView(v){v=String(v||"");return v==="fadaye7"||v==="gallery"||v==="tanagha"}
function tanaghaLockedView(){
  const st=tanaghaState(S.profile);
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">الرئيسية</button>`)}<div class="card empty"><div class="ei">${st==="rejected"?"⛔":"⏳"}</div><b>${st==="rejected"?"القسم ده غير متاح لحسابك":"بنتأكد إنك من أولاد التناغه"}</b><div class="mut" style="margin:8px auto 14px">${st==="rejected"?"المدرس مش فاتح القسم ده لحسابك.":"اصبر شوية — طلبك وصل للمدرس، ولما يوافق القسم هيتفتح لوحده."}</div><button class="btn" data-act="home">الرجوع للرئيسية</button></div></div>${studentNav()}`;
}
function adminTgReq(){
  const all=(Array.isArray(S.students)?S.students:[]);
  const pend=all.filter(x=>x.tanaghaAccess==="pending").sort((a,b)=>tms(b)-tms(a));
  const rej=all.filter(x=>x.tanaghaAccess==="rejected");
  const row=(x,btns)=>`<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line);gap:8px;align-items:center"><div style="flex:1;min-width:0"><b>${esc(x.name||"طالب")}</b> <span class="mut" dir="ltr">${esc(x.phone||"")}</span><div class="mut" style="font-size:12px">سجّل: ${fmt(x.createdAt)||"-"}</div></div>${btns}</div>`;
  return `<div class="card"><h3 style="margin-top:0">💗 طلبات دخول أولاد التناغه</h3>
<p class="mut">كل طالب جديد بيستنى موافقتك قبل ما يفتحله قسم «الفضايح» و«خاص لأولاد التناغه». السؤال: <b>هل اسم الطالب في مدرسة التناغه؟</b></p>
${pend.length?pend.map(x=>row(x,`<button class="btn sm" data-act="tgDecide" data-id="${x.id}" data-v="approved">موافق ✓</button><button class="btn danger sm" data-act="tgDecide" data-id="${x.id}" data-v="rejected">رفض</button>`)).join(""):`<div class="mut">مفيش طلبات جديدة دلوقتي.</div>`}</div>
${rej.length?`<div class="card"><h3 style="margin-top:0">⛔ المرفوضين</h3>${rej.map(x=>row(x,`<button class="btn sm" data-act="tgDecide" data-id="${x.id}" data-v="approved">قبول</button>`)).join("")}</div>`:""}`;
}

function adminSecurity(){
  const raw=S.siteRaw||{};
  const aiLeak=!!(raw.aiKey);
  const students=Array.isArray(S.students)?S.students:[];
  const blocked=students.filter(x=>x.blocked);
  const newSusp=(S.suspicious||[]).filter(x=>!x.seen).length;
  const row=(ok,t,d)=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);align-items:flex-start;gap:10px"><span style="font-size:18px">${ok===true?"✅":ok===false?"⚠️":"ℹ️"}</span><div style="flex:1"><b>${t}</b><div class="mut" style="font-size:13px">${d}</div></div></div>`;
  const feats=FEATURES.map(([k,t])=>{const on=featState(k);return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:6px"><span style="flex:1">${t}</span><button class="btn sm ${on?"gold":"ghost"}" data-act="setFeature" data-id="${k}" data-on="1" aria-pressed="${on}">${on?"فتح 🔓":"فتح"}</button><button class="btn sm ${on?"ghost":"danger"}" data-act="setFeature" data-id="${k}" data-on="0" aria-pressed="${!on}">${on?"قفل":"قفل 🔐"}</button></div>`}).join("");
  const now=Date.now();
  const blk=blocked.map(x=>{
    const until=x.blockedUntil>0?x.blockedUntil:0;const expired=until&&until<now;
    return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:8px"><div style="flex:1"><b>${esc(x.name||"طالب")}</b> <span class="mut" dir="ltr">${esc(x.phone||"")}</span><div class="mut" style="font-size:12px">${until?(expired?"انتهى الحظر":"لحد "+new Date(until).toLocaleString("ar-EG")):"حظر نهائي"}${x.blockReason?" · "+esc(x.blockReason):""}</div></div><button class="btn sm" data-act="unblock" data-id="${x.id}">فك الحظر</button></div>`}).join("");
  const au=(S.audit||[]).map(a=>`<tr><td style="white-space:nowrap">${fmt(a.createdAt)||"-"}</td><td>${esc(a.byName||"")}</td><td>${esc(a.action||"")}</td><td>${esc(a.detail||"")}</td></tr>`).join("");
  return `<div class="card"><h3 style="margin-top:0">🛡 فحص الأمان</h3>
${row(!aiLeak,"مفتاح الـ AI",aiLeak?"لسه في الإعدادات العامة وأي حد على النت يقدر يقراه — هيتنقل تلقائياً لمكان للمسجّلين بس أول ما الأدمن يفتح بعد نشر القواعد الجديدة.":"مش متاح للعامة. لو عايزه يتخفي تماماً عن الطلاب كمان: اربط الوسيط الآمن (Cloudflare Worker) من الإعدادات وامسح المفتاح من هناك.")}
${row(!S.site.maintenance,"وضع الصيانة",S.site.maintenance?"شغّال دلوقتي — الطلاب مقفول عليهم.":"مقفول (المنصة شغالة عادي).")}
${row(blocked.length===0?true:null,"الطلاب المحظورين",blocked.length+" طالب")}
${row(newSusp===0?true:false,"محاولات احتيالية جديدة",newSusp?newSusp+" جديدة — شوفها في تبويب «احتيالي»":"مفيش")}
${row(false,"الإجابات الصحيحة للامتحانات","الطالب تقنياً يقدر يشوفها من أدوات المتصفح لأن التصحيح والألعاب بيحصلوا في الجهاز. سيبناها كده عشان الألعاب ما تتأثرش.")}
${row(false,"أرقام التليفونات","أي طالب مسجّل يقدر يقرأ بيانات الطلاب بما فيها الرقم (البحث بالرقم شغّال بسببها).")}
</div>
<div class="card"><h3 style="margin-top:0">🎛 تشغيل وإيقاف الأقسام</h3>
<p class="mut">أي قسم تقفله بيختفي من عند الطلاب فوراً (الأدمن بيفضل يشوفه). مش بيمسح أي بيانات.</p>${feats}</div>
<div class="card"><h3 style="margin-top:0">⛔ المحظورين</h3>${blk||`<div class="mut">مفيش محظورين.</div>`}
<p class="mut" style="font-size:12px;margin-top:8px">الحظر المؤقت بتحدده من صفحة الطالب (زر الحظر بيسأل عن المدة والسبب).</p></div>
<div class="card"><h3 style="margin-top:0">📜 سجل التدقيق (آخر 100)</h3>
<p class="mut">كل أمر حساس نفّذته: إيه، على مين، وإمتى.</p>
${au?`<div style="max-height:50vh;overflow:auto"><table class="tbl"><thead><tr><th>الوقت</th><th>المنفّذ</th><th>الأمر</th><th>على</th></tr></thead><tbody>${au}</tbody></table></div>`:`<div class="mut">مفيش سجل لسه.</div>`}</div>
<div class="card" style="border-color:var(--gold)"><b>🔑 تذكير:</b> <span class="mut">غيّر كلمة سر الأدمن بعد أي مرة اتكتبت فيها في محادثة أو رسالة.</span></div>`;
}

function adminSuspicious(){
  const list=S.suspicious||[];
  return `<div class="card"><h3>⚠ احتيالي</h3>
<p class="mut">رسائل الطلاب لـ 么 اللي بتحاول تطلب صلاحيات أدمن أو تلاعب (درجات، حظر، مفاتيح…)</p>
</div>
${list.length?list.map(a=>`<div class="card">
<div class="row"><b>${esc(a.name||"؟")}</b> ${pill(a.seen?"اتقرت":"جديد",a.seen?"g":"r")}</div>
<div class="mut" dir="auto">${esc(a.phone||"")} · ${fmt(a.createdAt)}</div>
<div style="margin-top:8px;white-space:pre-wrap">${esc(a.text||"")}</div>
</div>`).join(""):`<div class="card mut">مفيش بلاغات لسه — ده كويس 🙂</div>`}`;
}
function adminAlerts(){
  /* إشعار جماعي من الإعدادات أيضًا */

  return `<p class="mut">بتظهر هنا كل مرة طالب يخرج من صفحة الامتحان (يغيّر التبويب أو يفتح تطبيق تاني). ممكن تظهر تنبيه بالغلط لو نزّل شريط الإشعارات أو جاله اتصال.</p>
${S.alerts.length?`<div class="tw card" style="padding:0"><table><tr><th>الطالب</th><th>التليفون</th><th>الامتحان</th><th>م</th><th>المرة</th><th>الوقت</th></tr>
${(Array.isArray(S.alerts)?S.alerts:[]).map(a=>`<tr><td><a href="#" data-act="student" data-id="${a.uid}" style="color:var(--pri);font-weight:600">${esc(a.name)}</a></td><td dir="ltr">${esc(a.phone)}</td><td>${esc(a.examTitle)}</td><td>${a.attempt||1}</td><td>${pill(a.count,"r")}</td><td>${fmt(a.createdAt)}</td></tr>`).join("")}</table></div>`:`<div class="card mut">مفيش تنبيهات.</div>`}`}

function adminSettings(){
  const extra=`<div class="card"><h3 style="margin-top:0">إشعار لكل الطلاب</h3>
  <p class="mut">يبعت إشعار يظهر في «تقدمي»</p>
  <button class="btn gold" data-act="broadcastNotif">📢 إرسال إشعار جماعي</button></div>
<div class="card" style="border-color:var(--pri)"><h3 style="margin-top:0">🤖 ربط الذكاء الاصطناعي (么)</h3>
<p class="mut">اربط أي سيرفر يرد JSON: <code dir="ltr">{"reply":"..."}</code><br>
المنصة تبعت: message, system, history, books, exams, name, view</p>
<label class="f">رابط الـ API / Webhook</label>
<input id="aiUrlIn" name="ai_endpoint_x" class="ltr" type="text" inputmode="url" placeholder="https://your-server.com/ai" value="${esc(/^https?:\/\//i.test(S.site.aiUrl||"")?S.site.aiUrl:"")}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<label class="f">مفتاح API (اختياري — لو سيرفرك يحتاجه في الهيدر)</label>
<input id="aiKeyIn" name="ai_secret_x" class="ltr" type="text" style="-webkit-text-security:disc" placeholder="sk-… أو Bearer token" value="${esc(S.site.aiKey||"")}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<label class="f">🛡 رابط الوسيط الآمن (Cloudflare Worker) — اختياري</label>
<input id="aiProxyIn" name="ai_proxy_x" class="ltr" type="text" inputmode="url" placeholder="https://xxxx.workers.dev" value="${esc(/^https?:\/\//i.test(S.site.aiProxy||"")?S.site.aiProxy:"")}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<p class="mut" style="font-size:12px;margin:4px 0 0">لو حطّيته: المنصة بتكلّم الوسيط بدل السيرفر، والمفتاح والرابط الحقيقيين بيتخزنوا جوّه الوسيط بس (محدش من الطلاب يقدر يشوفهم). في الحالة دي سيب الخانتين اللي فوق فاضيين. لو سبته فاضي، كل حاجة شغالة زي ما هي.</p>
<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
<button class="btn sm" data-act="saveAiUrl">💾 حفظ الربط</button>
<button class="btn sm gold" data-act="testAiUrl">اختبار الاتصال</button>
</div>
<p class="mut" style="margin-top:10px;font-size:12px">أمثلة للربط: n8n / Make / Cloud Function / سيرفر Node يستدعي OpenAI أو Gemini أو Claude.<br>
لو الرابط فاضي → المساعد المحلي (么) يشتغل من غير إنترنت خارجي.</p>
</div>
<div class="card"><h3 style="margin-top:0">إشعارات المكالمات (FCM)</h3>
<p class="mut">Firebase → Project settings → Cloud Messaging → Web Push certificates</p>
<input id="vapidIn" name="fcm_vapid_x" class="ltr" type="text" placeholder="VAPID key (يبدأ بـ B)" value="${esc(S.site.vapidKey||"")}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="saveVapid">حفظ مفتاح الإشعارات</button><button class="btn sm gold" data-act="enablePush">🔔 تفعيل وتجربة على جهازي</button></div>
<label class="f" style="margin-top:12px">🔔 رابط وسيط الإشعارات (Cloudflare Worker)</label>
<input id="pushUrlIn" name="push_worker_x" class="ltr" type="text" inputmode="url" placeholder="https://mora-push.xxxx.workers.dev" value="${esc(/^https?:\/\//i.test(S.site.pushUrl||"")?S.site.pushUrl:"")}" autocomplete="off" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="savePushUrl">💾 حفظ الوسيط</button><button class="btn sm gold" data-act="testPushUrl">اختبار الوسيط</button></div>
<label class="f" style="margin-top:12px">🔗 وسيط استعادة كلمة السر (Cloudflare Worker) — لخاصية «نسيت كلمة السر»</label>
<input id="resetUrlIn" name="reset_worker_x" class="ltr" type="text" inputmode="url" placeholder="https://mora-reset.xxxx.workers.dev/reset-pass" value="${esc(/^https?:\/\//i.test(S.site.resetPassUrl||"")?S.site.resetPassUrl:"")}" autocomplete="off" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="saveResetUrl">💾 حفظ وسيط الاستعادة</button></div>
<div class="mut" style="margin-top:6px">لو حظيته: الطالب اللي نسي كلمة السر يفتح صفحة الدخول → «نسيت كلمة السر؟» → يدخل رقمه + الكود اللي انت أصدرته من ملف الطالب + كلمة سر جديدة. (الكود بيتولّد من زرار «🔑 كود استعادة» في ملف الطالب عندك).</div>
<label class="f" style="margin-top:12px">📚 رابط وسيط كتب الـ AI (Cloudflare Worker)</label>
<input id="booksUrlIn" name="books_worker_x" class="ltr" type="text" inputmode="url" placeholder="https://mora-books.xxxx.workers.dev" value="${esc(/^https?:\/\//i.test(S.site.booksUrl||"")?S.site.booksUrl:"")}" autocomplete="off" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<label class="f" style="margin-top:6px">🔑 مفتاح أدمن الكتب (ADMIN_KEY بتاع الوسيط)</label>
<input id="booksKeyIn" name="books_secret_x" class="ltr" type="text" style="-webkit-text-security:disc" placeholder="نفس الـ ADMIN_KEY اللي حطيته في Cloudflare" value="${esc((S.aiCfg&&S.aiCfg.booksKey)||"")}" autocomplete="off" data-1p-ignore readonly onfocus="this.removeAttribute('readonly')">
<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="saveBooksUrl">💾 حفظ الرابط</button><button class="btn sm" data-act="saveBooksKey">🔑 حفظ المفتاح</button><button class="btn sm gold" data-act="testBooksUrl">اختبار الوسيط</button></div>
<div class="mut" style="margin-top:6px">ده اللي بيشغّل «اسأل من الكتب» للطلاب + توليد الامتحانات بالـ AI من الكتاب. ارفع books-worker.js على Cloudflare مع KV binding اسمه <b>KV</b> وحط سر <b>ADMIN_KEY</b> — الخطوات كاملة جوّه الملف.</div>
<p id="pushStatus" class="mut" style="font-size:12px;margin:8px 0 0">حالة الإشعارات: ${typeof pushStateText==="function"?pushStateText():""}</p></div>
<div class="card"><h3 style="margin-top:0">📞 تحسين وصول المكالمات (TURN — اختياري)</h3>
<p class="mut" style="font-size:12px">لا تضع اسم مستخدم أو كلمة مرور TURN ثابتة في مستند يقرأه المتصفح. حُذفت بيانات TURN القديمة تلقائياً بعد تسجيل دخول الأدمن؛ المكالمات تستخدم STUN حالياً. TURN يحتاج وسيطاً يصدر اعتماداً مؤقتاً، وليس مفتاحاً ثابتاً في الواجهة.</p></div>`;
  // ---
  
  return extra+`<div class="card"><h3>وضع الصيانة</h3>
<p class="mut">لما تشغّله، الطلاب بيشوفوا "المنصة تحت التعديل". وإنت تدخل بحساب الأدمن بالضغط 3 مرات على كلمة "التفوق" اللي في نص الشاشة.</p>
<label class="f" for="mmsg">الرسالة اللي هتظهر للطلاب</label><textarea id="mmsg" style="min-height:90px">${esc(S.site.message||"بنحدّث المنصة دلوقتي. ارجع بعد شوية.")}</textarea>
<div class="row" style="margin-top:14px"><button class="btn ghost" data-act="rebuildBoard">🏆 بناء لوحة الشرف</button><button class="btn ${S.site.maintenance?"gold":"danger"}" data-act="toggleMaint">${S.site.maintenance?"إيقاف وضع الصيانة":"تشغيل وضع الصيانة"}</button><button class="btn ghost" data-act="saveMsg">حفظ الرسالة بس</button>
<button class="btn gold" style="margin-top:10px;width:100%" data-act="adminSpeedAll">⚡ تسريع المنصة لكل الأجهزة</button>
<button class="btn ghost" style="margin-top:8px;width:100%" data-act="adminMigrateAvatars">🖼 تحسين صور الطلاب (مرة واحدة)</button>
<p class="mut" style="font-size:12px;margin-top:6px">يبعت أمر مسح كاش لكل الطلاب أول ما يفتحوا المنصة — مش بيمسح امتحانات ولا حسابات.</p></div></div>
<div class="card" style="border-color:var(--bad)"><h3 style="color:var(--bad)">⚠ ابدأ من الصفر</h3>
<p class="mut">بيمسح <b>كل الامتحانات</b> و<b>كل نتايج الطلاب وتقدمهم</b> وسجل التنبيهات والمتابعة المباشرة. حسابات الطلاب نفسها (الاسم والرقم وكلمة السر) بتفضل زي ما هي. مفيش رجوع بعد المسح.</p>
<button class="btn danger" data-act="wipe">مسح الامتحانات والنتايج</button></div>
<div class="card"><h3>📢 إعلان للطلاب</h3>
<p class="mut">بيظهر في الصفحة الرئيسية للطالب أول ما يدخل. مناسب لمواعيد الامتحانات والتنبيهات.</p>
<textarea id="ann" style="min-height:90px" placeholder="مثال: امتحان الفلسفة يوم الخميس الساعة 5">${esc(S.site.announce||"")}</textarea>
<div class="row" style="margin-top:14px"><button class="btn" data-act="saveAnn" data-on="1">نشر الإعلان</button><button class="btn ghost" data-act="saveAnn" data-on="0">إخفاء الإعلان</button></div>
<div class="mut" style="margin-top:6px">${S.site.announceOn&&S.site.announce?"الإعلان ظاهر دلوقتي.":"مفيش إعلان ظاهر."}</div></div>`}
function editor(){
  const e=S.editing.exam||{subject:"arabic",title:"",minutes:30,passMark:0,shuffle:true,published:true,showAnswers:true,questions:[]};
  const has=S.editing.id&&S.results.some(r=>r.examId===S.editing.id);
  return `<div class="wrap wide">${header(`<button class="btn ghost sm" data-act="cancelEdit">إلغاء</button>`)}
<form class="card" data-submit="saveExam"><h2>${S.editing.id?"تعديل الامتحان":"امتحان جديد"}</h2>
${has?`<div class="err" style="margin:0 0 8px">الامتحان ده فيه محاولات سابقة. لو غيّرت الأسئلة أو ترتيب الاختيارات، مراجعة الطلاب القديمة هتبقى غلط. تغيير العنوان والمدة آمن.</div>`:""}
<label class="f" for="esub">المادة</label><select id="esub">${SUBJECTS.map(s=>`<option value="${s.id}" ${e.subject===s.id?"selected":""}>${s.name}</option>`).join("")}</select>
<label class="f" for="etitle">اسم الامتحان</label><input id="etitle" type="text" value="${esc(e.title)}" placeholder="مثال: امتحان الوحدة الأولى" required>
<label class="f" for="emin">المدة بالدقايق (0 = من غير وقت)</label><input id="emin" type="number" min="0" value="${e.minutes}">
<label class="f" for="epass">درجة النجاح: عدد الإجابات الصح المطلوبة (0 = بدون)</label><input id="epass" type="number" min="0" value="${e.passMark||0}">
<label class="f" for="eat">نشر تلقائي في موعد (اختياري)</label><input id="eat" type="datetime-local" value="${e.publishAt?new Date(e.publishAt-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):""}">
<label class="f"><input id="eshuf" type="checkbox" ${e.shuffle!==false?"checked":""}> ترتيب عشوائي للأسئلة والاختيارات لكل طالب</label>
<label class="f" style="margin-top:4px"><input id="epub" type="checkbox" ${e.published?"checked":""}> يظهر للطلاب</label>
<label class="f" style="margin-top:4px"><input id="eshow" type="checkbox" ${e.showAnswers!==false?"checked":""}> يشوف الطالب الإجابات الصحيحة بعد التسليم</label>
<label class="f" for="qtext">الأسئلة</label>
<div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">
<button type="button" class="btn ghost sm" data-act="insMcq">+ اختياري</button>
<button type="button" class="btn ghost sm" data-act="insEssay">+ مقالي</button>
<button type="button" class="btn ghost sm" data-act="insMath">+ رياضي (حلول متعددة)</button>
<button type="button" class="btn ghost sm" data-act="sample">مثال كامل</button>
<button type="button" class="btn ghost sm" data-act="previewQs">معاينة</button>
</div>
<p class="mut" style="margin:0 0 6px">اختياري: سؤال + أ ب ج د + <b>الإجابة: ب</b>. مقالي: سؤال + <b>[مقالي]</b> + <b>الحل: ...</b>. للرياضة حط أكتر من حل وافصل بـ <b>|||</b>. سيب سطر فاضي بين الأسئلة.</p>
<textarea id="qtext" dir="auto">${esc(serialize(e.questions))}</textarea>
<div id="qinfo" class="mut" style="margin:6px 0"></div>
<div id="qpreview" style="display:none;margin-top:10px"></div>
<div class="row" style="margin-top:12px"><button class="btn" id="sv">حفظ الامتحان</button><button type="button" class="btn ghost" data-act="sample">حط مثال</button></div></form></div>`}

/* ---------- الأفعال ---------- */
const readB64=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(f)});
const byOrder=(a,b)=>(a.order||0)-(b.order||0);
const isFile=f=>f.kind==="image"||f.kind==="pdf";
async function loadAsm(id){
  const x=S.asm;if(!x||x.id!==id)return;
  const a=S.asms.find(q=>q.id===id);
  try{
    if(!x.qDone){
      const sn=await getDocs(query(collection(db,"assessments",id,"files"),where("part","==","q")));
      x.q=sn.docs.map(d=>({id:d.id,...d.data()})).filter(isFile).sort(byOrder);x.qDone=true;
    }
    if(a&&a.showSolution&&!x.solDone){
      const sn=await getDocs(query(collection(db,"assessments",id,"files"),where("part","==","s")));
      const all=sn.docs.map(d=>({id:d.id,...d.data()}));
      x.s=all.filter(isFile).sort(byOrder);const t=all.find(f=>f.kind==="text");x.solText=t?t.text:"";x.solDone=true;
    }
  }catch(e){x.err=true;x.qDone=true;if(a&&a.showSolution)x.solDone=true}
  x.loading=false;if(S.view==="asm"&&S.asm===x)scheduleRender();
}
function ensureSol(){
  const x=S.asm;if(S.view!=="asm"||!x||S.isAdmin)return;
  const a=S.asms.find(q=>q.id===x.id);
  if(a&&a.showSolution&&!x.solDone&&!x.loading){x.loading=true;loadAsm(x.id)}
}
async function wipeFiles(id,part,gid){
  const sn=await getDocs(query(collection(db,"assessments",id,"chunks"),where("part","==",part),where("gid","==",gid)));
  for(const d of sn.docs)await deleteDoc(d.ref);
}


/* ===== نوافذ حوار داخل المنصة (بدل رسائل المتصفح) ===== */
let __dlgQ=Promise.resolve();
function uiDialog(o){
  return new Promise(res=>{
    const run=()=>new Promise(done=>{
      const hasIn=!!o.input;
      const msg=String(o.msg||"");
      const danger=o.danger!==undefined?o.danger:/حذف|تمسح|مسح|طرد|تقفل|حظر|تحذف|نهائي/.test(msg);
      const okTxt=o.ok||(danger?"نعم، نفّذ":(/خروج/.test(msg)?"خروج":"تأكيد"));
      const ov=document.createElement("div");ov.className="dlg-ov";ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");
      ov.innerHTML=`<div class="dlg"><div class="dlg-ic">${o.icon||(danger?"⚠️":hasIn?"✏️":"❔")}</div>${o.title?`<h3 class="dlg-t">${esc(o.title)}</h3>`:""}<div class="dlg-m">${esc(msg)}</div>${hasIn?`<input class="dlg-in" type="text" dir="auto" placeholder="${esc(o.placeholder||"")}" value="${esc(o.def||"")}">`:""}<div class="dlg-b"><button type="button" class="btn ${danger?"danger":""}" data-k="ok">${esc(okTxt)}</button>${o.cancel===false?"":`<button type="button" class="btn ghost" data-k="no">${esc(o.cancel||"إلغاء")}</button>`}</div></div>`;
      const inp=ov.querySelector(".dlg-in");
      let fin=false;
      const close=v=>{if(fin)return;fin=true;document.removeEventListener("keydown",kd,true);ov.remove();res(v);done()};
      const okv=()=>close(hasIn?inp.value:true);
      const nov=()=>{window.__cancel=true;close(hasIn?null:false)};
      function kd(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();nov()}else if(e.key==="Enter"&&(hasIn||document.activeElement===ov.querySelector('[data-k="ok"]'))){e.preventDefault();e.stopPropagation();okv()}}
      ov.addEventListener("click",e=>{const k=e.target.dataset&&e.target.dataset.k;if(k==="ok")okv();else if(k==="no"||e.target===ov)nov()});
      document.addEventListener("keydown",kd,true);
      document.body.appendChild(ov);
      setTimeout(()=>{try{(inp||ov.querySelector('[data-k="ok"]')).focus()}catch(_){}},30);
    });
    __dlgQ=__dlgQ.then(run);
  });
}
const uiConfirm=(msg,o)=>uiDialog(Object.assign({msg},o||{}));
const uiPrompt=(msg,def,o)=>uiDialog(Object.assign({msg,input:true,def:def||""},o||{}));

/* ===== مرحلة 2: مفاتيح الأقسام + سجل تدقيق + حظر مؤقت + إعدادات AI محمية ===== */

const FEAT_ACT={openChats:"chat",openChat:"chat",startChat:"chat",startCall:"calls",openGames:"games",qbCreateRoom:"games",qbStartBot:"games",qbBot:"games",qbJoinRoom:"games",qbFriends:"games",openGameFriends:"games",openMath:"games",openXo:"games",openHang:"games",openSpin:"games",openReact:"games",openMemory:"games",openDraw:"games",openTanagha:"tanagha",openGallery:"tanagha",openFadaye7:"fadaye7",openBooks:"books",openBag:"books",openAsms:"asms",openAI:"ai",openLife:"life",openProgress:"progress",openSubject:"subjects"};
function featState(k){return !(S.features&&S.features[k]===false)}
function featOn(k){return S.isAdmin||featState(k)}
function clientFeatureAllowed(k){
  if(S.isAdmin)return true;
  if(!featState(k))return false;
  const m=modeCur();
  return m.kind==="platform"||(k==="games"&&m.kind==="games");
}
function callsAllowed(){return clientFeatureAllowed("calls")}
function syncFeatureAvailability(){
  if(!S.user||S.isAdmin)return;
  const off=k=>!clientFeatureAllowed(k);
  if(off("books")&&window.__bookUnsub){window.__bookUnsub();window.__bookUnsub=null}
  if(off("chat")){
    ["__chatsUnsub","__dmUnsub","__dmMetaUnsub","__grpUnsub","__grpListUnsub"].forEach(k=>{try{if(window[k]){window[k]();window[k]=null}}catch(_){}});
    try{clearInterval(window.__peerPres)}catch(_){}
  }
  if(off("fadaye7")&&typeof __fadUnsub==="function"){__fadUnsub();__fadUnsub=null}
  if(off("tanagha")&&typeof __galUnsub==="function"){__galUnsub();__galUnsub=null}
  if(off("asms")&&window.__asmUnsub){window.__asmUnsub();window.__asmUnsub=null}
  if(off("games")){
    ["__openRoomsUnsub"].forEach(k=>{try{if(window[k]){window[k]();window[k]=null}}catch(_){}});
    try{if(S.qbSub){S.qbSub();S.qbSub=null}}catch(_){}
    try{if(S.qbChatSub){S.qbChatSub();S.qbChatSub=null}}catch(_){}
  }
  if(!featState("games")||modeCur().kind==="platform")S._gameDocs={};
  syncCallAvailability();
}
function featOfView(v){
  v=String(v||"");
  if(v==="chatList"||v==="chatThread"||v==="groupThread")return "chat";
  if(v==="games"||v.indexOf("qb")===0||v==="mathg"||v==="xo"||v==="hang"||v==="spin"||v==="react")return "games";
  if(v==="gallery"||v==="tanagha")return "tanagha";
  if(v==="fadaye7")return "fadaye7";
  if(v==="books")return "books";
  if(v==="asmList"||v==="asm")return "asms";
  if(v==="ai")return "ai";
  if(v==="life")return "life";
  if(v==="progress"||v==="profile")return "progress";
  if(v==="subject"||v==="exam"||v==="result"||v==="review")return "subjects";
  return "";
}
function featOffView(){return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">الرئيسية</button>`)}<div class="card empty"><div class="ei">⛔</div><b>القسم ده متوقف مؤقتاً</b><div class="mut" style="margin:8px auto 14px">المدرس قفله دلوقتي. جرّب بعدين.</div><button class="btn" data-act="home">الرجوع للرئيسية</button></div></div>${studentNav()}`}
function isBlockedP(p){return !!(p&&p.blocked&&!(p.blockedUntil>0&&p.blockedUntil<Date.now()))}
function applyAiCfg(){
  try{
    if(!S.site)return;
    const c=S.aiCfg||{},r=S.siteRaw||{};
    // Endpoints may be public; provider credentials are admin-only and never copied into student state.
    S.site.aiUrl=S.isAdmin?(c.aiUrl||r.aiUrl||""):"";
    S.site.aiKey=S.isAdmin?(c.aiKey||r.aiKey||""):"";
    S.site.aiProxy=r.aiProxy||c.proxyUrl||"";
    if(S.isAdmin&&!window.__aiMig&&(r.aiKey||r.aiUrl)){
      window.__aiMig=1;
      setDoc(doc(db,"config","ai"),{aiUrl:r.aiUrl||"",aiKey:r.aiKey||""},{merge:true})
        .then(()=>updateDoc(doc(db,"config","site"),{aiUrl:deleteField(),aiKey:deleteField()}))
        .catch(e=>{window.__aiMig=0;console.warn("aiMig",e)});
    }
    // Static TURN credentials cannot be kept secret in a browser client. Remove legacy copies;
    // calls continue with the app's STUN fallback until short-lived TURN credentials are added server-side.
    if(S.isAdmin&&c.proxyUrl&&!r.aiProxy&&!window.__proxyMig){
      window.__proxyMig=1;
      setDoc(doc(db,"config","site"),{aiProxy:c.proxyUrl},{merge:true}).catch(e=>{window.__proxyMig=0;console.warn("proxyMig",e)});
    }
    if(S.isAdmin&&!window.__turnScrub&&(r.turnUser||r.turnCred)){
      window.__turnScrub=1;
      S.site.turnUser="";S.site.turnCred="";
      updateDoc(doc(db,"config","site"),{turnUser:deleteField(),turnCred:deleteField()})
        .catch(e=>{window.__turnScrub=0;console.warn("turnScrub",e)});
    }
  }catch(_){}
}
const AUDIT_ACTS={setMode:"تغيير وضع التشغيل",addMode:"إضافة وضع تشغيل",delMode:"مسح وضع تشغيل",block:"حظر طالب",unblock:"فك حظر طالب",delExam:"مسح امتحان",togglePub:"نشر/إخفاء امتحان",delResult:"مسح محاولة",delBook:"مسح كتاب",delAsm:"مسح تقييم",toggleAsm:"نشر/إخفاء تقييم",delFadaye7:"مسح فضيحة",approveFadaye7:"قبول فضيحة",rejectFadaye7:"رفض فضيحة",toggleMaint:"تغيير وضع الصيانة",adminSpeedAll:"تسريع لكل الأجهزة",adminResetPassGo:"تغيير كلمة سر طالب",broadcastNotif:"إشعار جماعي",saveAiUrl:"تعديل ربط الـ AI",grantAsmRole:"تغيير صلاحية مسؤول تقييمات",wipe:"ابدأ من الصفر",rebuildBoard:"بناء لوحة الشرف",setFeature:"فتح/قفل قسم",tgDecide:"قرار طلب التناغه",adminMigrateAvatars:"تحسين صور الطلاب"};
function auditName(id){
  if(!id)return "";
  try{
    const st=(S.students||[]).find(x=>x.id===id);if(st)return (st.name||"")+(st.phone?" · "+st.phone:"");
    const ex=(S.exams||[]).find(x=>x.id===id);if(ex)return ex.title||id;
    const bk=(S.books||[]).find(x=>x.id===id);if(bk)return bk.title||id;
    const am=(S.asms||[]).find(x=>x.id===id);if(am)return am.title||id;
    const ft=FEATURES.find(x=>x[0]===id);if(ft)return ft[1];
  }catch(_){}
  return String(id).slice(0,40);
}
function auditLog(label,id){
  try{
    if(!S.isAdmin||!S.user)return;
    addDoc(collection(db,"audit"),{by:S.user.uid,byName:(S.profile&&S.profile.name)||"أدمن",action:label,detail:auditName(id),createdAt:serverTimestamp()}).catch(()=>{});
  }catch(_){}
}
let __auditUnsub=null;
function ensureAuditListen(){
  if(__auditUnsub||!db)return;
  __auditUnsub=onSnapshot(query(collection(db,"audit"),orderBy("createdAt","desc"),limit(100)),sn=>{
    S.audit=sn.docs.map(d=>({id:d.id,...d.data()}));
    if(S.view==="admin"&&S.tab==="security")scheduleRender();
  },e=>console.warn("audit",e));
}


const A={
  async markNotifsRead(){for(const n of (Array.isArray(S.notifs)?S.notifs:[]).filter(x=>!x.read)){try{await updateDoc(doc(db,"notifications",n.id),{read:true})}catch(e){}}},
  adminRefreshPerf(){render(true);toast("اتحدّثت أرقام الأداء")},
  async saveVapid(){
    const v=($("#vapidIn")&&$("#vapidIn").value||"").trim().replace(/\s+/g,"");
    if(!v){toast("الصق مفتاح VAPID الأول");return}
    if(v.length<60||!/^[A-Za-z0-9_\-]+$/.test(v)){toast("المفتاح شكله غلط — لازم يكون سطر طويل (حوالي 87 حرف) يبدأ بـ B",true);return}
    try{
      await setDoc(doc(db,"config","site"),{vapidKey:v},{merge:true});
      if(S.site)S.site.vapidKey=v;
      toast("تم حفظ المفتاح ✓",true);
      const r=await registerFcmToken(true);
      toast(r.ok?"الإشعارات اشتغلت على جهازك ✓":"اتحفظ المفتاح، لكن: "+r.msg,true);
      const el=$("#pushStatus");if(el)el.textContent="حالة الإشعارات: "+pushStateText();
    }catch(e){toast((e&&e.code==="permission-denied")?"مفيش صلاحية — انشر firestore.rules":"فشل الحفظ: "+((e&&e.message)||"").slice(0,80),true)}
  },
  async h2h(d){
    const b=(S.board||[]).find(x=>(x.uid||x.id)===d.uid);if(!b)return;
    if(d.uid===S.user.uid){await uiDialog({title:"أنت",icon:"🏆",ok:"تمام",msg:"ترتيبك بيتحسب من نسبتك العامة × ثقة عدد الامتحانات اللي دخلتها ("+(b.examsDone||0)+" امتحان، "+(b.pct||0)+"%). كل ما تمتحن أكتر وتحافظ على مستواك، ترتيبك بيطلع."});return}
    await uiDialog({title:"مقارنة مع "+((b.name||"زميل").split(" ")[0]),icon:"⚔️",ok:"تمام",msg:h2hText(b)});
  },
  async savePushUrl(){
    const u=($("#pushUrlIn")&&$("#pushUrlIn").value||"").trim().replace(/\/+$/,"");
    if(u&&!/^https:\/\/[^\s]+\.[^\s]+$/i.test(u)){toast("الرابط لازم يبدأ بـ https://",true);return}
    try{await setDoc(doc(db,"config","site"),{pushUrl:u},{merge:true});if(S.site)S.site.pushUrl=u;toast(u?"اتحفظ وسيط الإشعارات ✓":"اتشال الوسيط",true)}
    catch(e){toast("فشل الحفظ",true)}
  },
  async saveResetUrl(){
    if(!S.isAdmin)return;
    const u=($("#resetUrlIn")&&$("#resetUrlIn").value||"").trim().replace(/\/+$/,"");
    if(u&&!/^https:\/\/[^\s]+\.[^\s]+$/i.test(u)){toast("الرابط لازم يبدأ بـ https://",true);return}
    try{await setDoc(doc(db,"config","site"),{resetPassUrl:u},{merge:true});if(S.site)S.site.resetPassUrl=u;toast(u?"اتحفظ وسيط الاستعادة ✓":"اتشال وسيط الاستعادة",true)}
    catch(e){toast("فشل الحفظ",true)}
  },
  async saveBooksUrl(){
    if(!S.isAdmin)return;
    const u=($("#booksUrlIn")&&$("#booksUrlIn").value||"").trim().replace(/\/+$/,"");
    if(u&&!/^https:\/\/[^\s]+\.[^\s]+$/i.test(u)){toast("الرابط لازم يبدأ بـ https://",true);return}
    try{await setDoc(doc(db,"config","site"),{booksUrl:u},{merge:true});if(S.site)S.site.booksUrl=u;toast(u?"اتحفظ وسيط كتب الـ AI ✓":"اتشال وسيط الكتب",true)}
    catch(e){toast("فشل الحفظ",true)}
  },
  async saveBooksKey(){
    if(!S.isAdmin)return;
    const k=($("#booksKeyIn")&&$("#booksKeyIn").value||"").trim();
    try{await setDoc(doc(db,"config","ai"),{booksKey:k},{merge:true});S.aiCfg={...(S.aiCfg||{}),booksKey:k};toast(k?"اتحفظ مفتاح الكتب ✓":"اتشال المفتاح",true)}
    catch(e){toast("فشل حفظ المفتاح",true)}
  },
  async testBooksUrl(){
    const u=(($("#booksUrlIn")&&$("#booksUrlIn").value)||(S.site&&S.site.booksUrl)||"").trim().replace(/\/+$/,"");
    if(!/^https:\/\//i.test(u)){toast("الصق رابط وسيط الكتب الأول",true);return}
    toast("جاري اختبار الوسيط…");
    try{
      const r=await fetch(u,{method:"GET"});
      const j=await r.json().catch(()=>({}));
      if(r.ok&&j.service==="books")toast("الوسيط شغّال ✓ "+(j.kv?"KV مربوط":"⚠ KV مش مربوط — راجع Bindings")+" · "+(j.llm?"الـ AI مربوط ✓":"⚠ الـ AI مش مربوط — راجع CHAT_URL"),true);
      else toast("الرد غريب (حالة "+r.status+") — اتأكد إن ده وسيط الكتب",true);
    }catch(e){toast("فشل الاتصال — اتأكد من الرابط",true)}
  },
  async testPushUrl(){
    const u=(($("#pushUrlIn")&&$("#pushUrlIn").value)||(S.site&&S.site.pushUrl)||"").trim().replace(/\/+$/,"");
    if(!/^https:\/\//i.test(u)){toast("الصق رابط الوسيط الأول",true);return}
    toast("جاري اختبار الوسيط…");
    try{
      const r=await fetch(u,{method:"GET"});const j=await r.json().catch(()=>({}));
      if(r.ok&&j.service==="push")toast(j.configured?"الوسيط شغّال ومفتاح الخدمة متضبوط ✓":"الوسيط شغّال لكن مفتاح الخدمة (SA_PRIVATE_KEY / SA_CLIENT_EMAIL) ناقص",true);
      else toast("الرابط ده مش وسيط الإشعارات (رد: "+r.status+")",true);
    }catch(e){toast("فشل الاتصال — اتأكد من الرابط وإن ALLOWED_ORIGIN صح",true)}
  },
  async saveTurn(){
    const g=id=>($(id)&&$(id).value||"").trim();
    toast("لا تحفظ بيانات TURN ثابتة في إعدادات عامة؛ يلزم وسيط يصدر بيانات مؤقتة. المكالمات تستخدم STUN المجاني حالياً.",true);
  },
  async enablePush(){
    toast("جاري تفعيل الإشعارات…");
    const r=await registerFcmToken(true);
    if(r.ok){
      try{
        const reg=await navigator.serviceWorker.ready;
        await reg.showNotification("منصة التفوق",{body:"الإشعارات شغالة على جهازك ✓",icon:"./icons/icon-192.png",tag:"push-test"});
      }catch(_){}
    }
    toast(r.ok?"الإشعارات اشتغلت ✓":r.msg,true);
    const el=$("#pushStatus");if(el)el.textContent="حالة الإشعارات: "+pushStateText();
  },
  async saveAiUrl(){
    const url=($("#aiUrlIn")&&$("#aiUrlIn").value||"").trim();
    const key=($("#aiKeyIn")&&$("#aiKeyIn").value||"").trim();
    const proxy=($("#aiProxyIn")&&$("#aiProxyIn").value||"").trim();
    if(url&&!/^https:\/\/[^\s]+\.[^\s]+/i.test(url)){toast("رابط الـ API لازم يبدأ بـ https://",true);return}
    if(proxy&&!/^https:\/\/[^\s]+\.[^\s]+/i.test(proxy)){toast("رابط الوسيط لازم يبدأ بـ https://",true);return}
    try{
      await setDoc(doc(db,"config","ai"),{aiUrl:url,aiKey:key,proxyUrl:proxy},{merge:true});
      await setDoc(doc(db,"config","site"),{aiProxy:proxy,aiUrl:deleteField(),aiKey:deleteField()},{merge:true});
      S.aiCfg={aiUrl:url,aiKey:key,proxyUrl:proxy,booksKey:(S.aiCfg&&S.aiCfg.booksKey)||""};
      if(S.site){S.site.aiUrl=S.isAdmin?url:"";S.site.aiKey=S.isAdmin?key:"";S.site.aiProxy=proxy}
      toast((url||proxy)?"اتربط المساعد ✓":"اتشال الرابط — المحلي شغال",true);
    }catch(e){toast("فشل الحفظ")}
  },
  async testAiUrl(){
    const proxy=($("#aiProxyIn")&&$("#aiProxyIn").value||"").trim()||(S.site&&S.site.aiProxy)||"";
    const url=proxy||(S.site&&S.site.aiUrl)||($("#aiUrlIn")&&$("#aiUrlIn").value||"").trim();
    if(!url){toast("حط رابط الأول");return}
    if(!/^https:\/\//i.test(url)){toast("الرابط لازم يبدأ بـ https:// — شكل اللي مكتوب غلط",true);return}
    toast("جاري اختبار 么…");
    try{
      const headers={"Content-Type":"application/json"};
      if(proxy){try{headers["Authorization"]="Bearer "+await auth.currentUser.getIdToken()}catch(_){}}
      else{
        const key=(S.site&&S.site.aiKey)||($("#aiKeyIn")&&$("#aiKeyIn").value||"");
        if(key)headers["Authorization"]="Bearer "+key;
      }
      const r=await fetch(url,{method:"POST",headers,body:JSON.stringify({
        message:"قل مرحبا في جملة قصيرة",
        system:"اختبار اتصال. رد بجملة عربية قصيرة.",
        history:[],books:[],exams:[]
      })});
      const j=await r.json().catch(()=>({}));
      const reply=j.reply||j.text||j.message||"";
      if(r.ok&&reply)toast("نجح ✓: "+String(reply).slice(0,80),true);
      else toast("الرد: "+r.status+" "+String(reply||j.error||"مفيش reply"),true);
    }catch(e){toast("فشل الاتصال بالرابط — اتأكد إنه كامل وبيبدأ بـ https:// وإن ALLOWED_ORIGIN في الوسيط = https://phdgxt4-coder.github.io",true)}
  },
  theme(d,el){document.querySelectorAll('.tg[data-act="theme"]').forEach(b=>{b.classList.add("spin");setTimeout(()=>b.classList.remove("spin"),500)});cycleTheme();},
  mode(){S.mode=S.mode==="login"?"register":"login";S.error="";render(true)},
  logoTap(){const n=Date.now();S.taps=S.taps.filter(t=>n-t<2500);S.taps.push(n);if(S.taps.length>=3){S.taps=[];S.adminLogin=true;S.error="";render(true)}},
  studentLink(){S.adminLogin=false;S.error="";render(true)},
  async logout(){
    if(!await uiConfirm("تسجيل خروج من التفوق؟\nهتحتاج تسجّل تاني لما ترجع."))return;
    try{
      await signOut(auth);
    }catch(e){toast("فشل الخروج");return}
    stopSubs();S.user=null;S.isAdmin=false;S.profile=null;S._gameDocs={};S.modePrev=null;window.__pendingModeHtml=null;S.view="auth";render(true);
  },
  home(){S.view="home";render(true)},
  async rebuildBoard(){
    if(!S.isAdmin)return;
    if(!await uiConfirm("هبني لوحة الشرف من كل نتايج الطلاب (بقرأ كل النتايج مرة واحدة). متابعة؟",{ok:"ابني دلوقتي",icon:"🏆"}))return;
    await rebuildBoardCore(false);
  },
  progress(){S.view="progress";render(true)},
  async pauseExam(){
    const c=S.cur;if(!c||c.done||c.pausing)return;
    if(!await uiConfirm("هتحفظ إجاباتك وتخرج.\nتقدر ترجع تكمل من «استئناف الامتحان» بعدين.\nالمؤقت هيفضل شغّال لو في وقت محدد.")) return;
    pauseExamNow(false);
  },
  async resumeExam(){
    if(S.site&&S.site.maintenance&&!S.isAdmin){toast("المنصة تحت الصيانة");return}
    const meta=peekExamSession();
    if(!meta){toast("مفيش امتحان معلّق");return}
    await tryResumeExam();
    if(S.cur) logActivity("resume_exam", S.cur.exam.title||"");
    else {
      // try once more after exams load
      if(!S.examsLoaded){toast("استنى التحميل…");return}
      toast("مقدرتش أستأنف — ممكن الوقت خلص أو الامتحان اتسجّل بالفعل");
    }
  },
  openSubject(d){S.subject=d.id;S.view="subject";render(true)},
  reviewMine(d){const r=S.myList.find(x=>x.id===d.id);if(!r)return;S.review={r,back:d.back||"subject"};S.view="review";render(true)},
  reviewLast(){S.review={r:S.last,back:"result"};S.view="review";render(true)},
  reviewAdmin(d){const r=S.results.find(x=>x.id===d.id);if(!r)return;S.review={r,back:d.back||"admin"};S.view="review";render(true)},
  backReview(){S.view=S.review.back;render(true)},
  async student(d){
    S.studentId=d.id;S.logins[d.id]=null;S.view="studentDetail";render(true);
    try{const sn=await getDocs(query(collection(db,"students",d.id,"logins"),orderBy("createdAt","desc"),limit(30)));S.logins[d.id]=sn.docs.map(x=>({id:x.id,...x.data()}))}catch(e){S.logins[d.id]=[]}
    if(S.view==="studentDetail"&&S.studentId===d.id)scheduleRender();
  },
  openGames(){
    if(S.qb&&S.qb.roomCode&&(S.view==="qbPlay"||S.view==="qbLobby"||S.view==="qbResult")){
      A.qbLeaveRoom();return;
    }
    S.qb=null;S.view="games";logActivity("open_games","");
    loadOpenRooms();
    render(true);
  },
  openGameFriends(d){const g=(d&&d.game)||"qb";S.qbCreateGame=g;S.qb={mode:"friends",wantGame:g};S.view="qbSetup";render(true);toast("الغرفة · "+qbGameLabel(g))},
  openMath(){if(S.mathG&&S.mathG._iv)clearTimeout(S.mathG._iv);mathInit();S.view="mathg";render(true);const tick=()=>{if(S.view!=="mathg"||!S.mathG||S.mathG.over)return;S.mathG.left--;if(Math.random()<.35)S.mathG.botScore++;if(S.mathG.left<=0)S.mathG.over=true;render(true);if(!S.mathG.over)S.mathG._iv=setTimeout(tick,1000)};S.mathG._iv=setTimeout(tick,1000)},
  mathRestart(){if(S.mathG&&S.mathG._iv)clearTimeout(S.mathG._iv);A.openMath()},
  mathPick(d){const g=S.mathG;if(!g||g.over)return;if(+d.v===g.item.ans){g.score+=1+Math.min(4,g.streak);g.streak++;toast("صح",true)}else g.streak=0;g.item=mathMake();render(true)},
  openXo(){xoInit("medium");S.view="xo";render(true)},
  xoDiff(d){xoInit(d.d||"medium");render(true)},
  xoRestart(){xoInit(S.xo&&S.xo.diff||"medium");render(true)},
  xoPlay(d){const g=S.xo;if(!g||g.over||g.turn!=="X")return;const i=+d.i;if(g.board[i])return;g.board[i]="X";let w=xoWins(g.board,"X");if(w){g.win=w;g.over=true;g.msg="فزت!";try{if(typeof lfAdd==="function")lfAdd(12,"XO",true)}catch(_){}render(true);return}if(!xoEmpty(g.board).length){g.over=true;g.msg="تعادل";render(true);return}g.turn="O";g.msg="الروبوت…";render(true);setTimeout(()=>{if(S.view!=="xo"||!S.xo)return;const j=xoBest(g.board,g.diff);if(j==null)return;g.board[j]="O";w=xoWins(g.board,"O");if(w){g.win=w;g.over=true;g.msg="الروبوت فاز";render(true);return}if(!xoEmpty(g.board).length){g.over=true;g.msg="تعادل";render(true);return}g.turn="X";g.msg="دورك";render(true)},360)},
  openHang(){hangInit();S.view="hang";render(true)},
  hangRestart(){hangInit();render(true)},
  hangKey(d){const h=S.hang;if(!h||h.over)return;const ch=d.ch;if(!ch||h.guessed[ch])return;if(h.word.includes(ch))h.guessed[ch]=1;else{h.guessed[ch]=2;h.left--}if([...h.word].every(c=>h.guessed[c])){h.over=true;h.won=true;try{if(typeof lfAdd==="function")lfAdd(20,"كلمة",true)}catch(_){}}else if(h.left<=0)h.over=true;render(true)},
  openSpin(){spinInit();S.view="spin";render(true)},
  spinGo(){const s=S.spin;if(!s||s.used||s.spinning)return;s.spinning=true;const prizes=[10,25,50,15,5,100],idx=Math.floor(Math.random()*6);s.rot=(s.rot||0)%360+360*6+(360-idx*60-30);s.result=idx;render(true);setTimeout(()=>{S.spin.spinning=false;S.spin.used=true;try{localStorage.setItem("spin_day",S.spin.today)}catch(_){}try{if(typeof lfAdd==="function")lfAdd(prizes[idx],"عجلة",true)}catch(_){}toast("+"+prizes[idx]+" 🪙",true);render(true)},4200)},
  openReact(){reactInit();S.view="react";render(true)},
  reactStart(){const r=S.reactG;if(!r)return;if(r._tm)clearTimeout(r._tm);r.phase="armed";r.ms=null;r.msg="استنى…";render(true);r._tm=setTimeout(()=>{if(S.view!=="react")return;r.phase="ready";r.t0=performance.now();r.msg="اضغط!";render(true)},1200+Math.random()*2500)},
  reactTap(){const r=S.reactG;if(!r)return;if(r.phase==="armed"){if(r._tm)clearTimeout(r._tm);r.phase="fail";r.msg="بدري";render(true);return}if(r.phase==="ready"){const ms=Math.round(performance.now()-r.t0);r.phase="result";r.ms=ms;r.msg=ms<250?"صاروخ":"كويس";if(r.best==null||ms<r.best){r.best=ms;try{localStorage.setItem("react_best",String(ms))}catch(_){}}render(true)}},
  audSpeed(d){const el=document.getElementById(d.id);if(el){el.playbackRate=parseFloat(d.r)||1;toast("السرعة ×"+(d.r||1))}},
  async startCall(d){if(!d.uid)return;await startVoiceCall(d.uid,d.name||"زميل")},
  
  pickReact(d){
    const old=document.getElementById("reactPicker");
    const same=old&&old.dataset.id===d.id;
    if(old)old.remove();
    if(same)return;
    const box=document.createElement("div");
    box.id="reactPicker";box.className="react-sheet";box.dataset.id=d.id;
    box.innerHTML=REACT_EMOJI.map(e=>`<button type="button" data-e="${e}">${e}</button>`).join("")+`<button type="button" data-e="__more" style="font-size:13px;width:auto;padding:0 10px">غيره</button>`;
    document.body.appendChild(box);
    box.onclick=async ev=>{
      const b=ev.target.closest("button");if(!b)return;
      let emoji=b.getAttribute("data-e");
      if(emoji==="__more"){box.remove();emoji=await uiPrompt("اكتب إيموجي");if(!emoji)return}
      box.remove();
      A.toggleReact({col:d.col,id:d.id,emoji:String(emoji).trim().slice(0,8)});
    };
    setTimeout(()=>{
      const close=e=>{if(!document.body.contains(box)){document.removeEventListener("pointerdown",close,true);return}if(!box.contains(e.target)){box.remove();document.removeEventListener("pointerdown",close,true)}};
      document.addEventListener("pointerdown",close,true);
    },0);
  },
  async toggleReact(d){
    if(!S.user||!d.id||!d.emoji)return;
    try{d.emoji=decodeURIComponent(d.emoji)}catch(_){}
    let ref,list,rerender;
    if(d.col==="dm"&&S.chatThread){
      ref=doc(db,"conversations",convIdFor(S.user.uid,S.chatThread.uid),"msgs",d.id);list=S.chatMsgs;
      rerender=()=>{const log=$("#dmChatLog");if(log&&S.view==="chatThread")patchChatLog(log,S.chatMsgs||[],dmBubbleHtml,EMPTY_DM)};
    }else if(d.col==="grp"&&S.groupId){
      ref=doc(db,"groups",S.groupId,"msgs",d.id);list=S.groupMsgs;
      rerender=()=>{const log=$("#grpLog");if(log&&S.view==="groupThread")patchChatLog(log,S.groupMsgs||[],grpBubbleHtml,EMPTY_GRP)};
    }else if(d.col==="qb"&&S.qb&&S.qb.roomCode){
      ref=doc(db,"qb_rooms",S.qb.roomCode,"chat",d.id);list=null;rerender=()=>{};
    }else{toast("مفيش محادثة مفتوحة");return}
    // تحديث فوري محلياً (بدون انتظار السيرفر)
    const m=list&&list.find(x=>x.id===d.id);
    let had=false;
    if(m){
      m.reacts=m.reacts||{};
      const arr=[...(m.reacts[d.emoji]||[])];
      const ix=arr.indexOf(S.user.uid);
      if(ix>=0){arr.splice(ix,1);had=true}else arr.push(S.user.uid);
      if(arr.length)m.reacts[d.emoji]=arr;else delete m.reacts[d.emoji];
      window.__dmSig=null;
      try{rerender()}catch(_){}
    }else{
      try{const sn=await getDoc(ref);had=!!(sn.exists()&&((sn.data().reacts||{})[d.emoji]||[]).includes(S.user.uid))}catch(_){}
    }
    try{
      await updateDoc(ref,new FieldPath("reacts",d.emoji),had?arrayRemove(S.user.uid):arrayUnion(S.user.uid));
    }catch(e){console.error("toggleReact",e);toast((e&&e.code==="permission-denied")?"مفيش صلاحية للتفاعل — انشر قواعد Firestore":"فشل التفاعل")}
  },

  
  openAsmAdmin(){S.view="asmAdmin";S.tab="asm";render(true)},
  openBooks(){ensureBooksListen();S.view="books";render(true)},
  async addBook(){
    if(!S.isAdmin)return;
    const title=($("#bookTitle")?.value||"").trim();
    const url=($("#bookUrl")?.value||"").trim();
    const subject=($("#bookSub")?.value||"").trim();
    const content=($("#bookContent")?.value||"").trim();
    const fileInput=$("#bookFile");
    const file=fileInput&&fileInput.files&&fileInput.files[0];
    if(!title){toast("العنوان مطلوب");return}
    if(!url&&!file){toast("ارفع PDF أو حط رابط");return}
    if(url&&!/^https?:\/\//i.test(url)){toast("رابط غير صالح");return}
    if(content.length>900000){toast("النص طويل أوي");return}
    try{
      toast("جاري الإضافة…");
      const payload={title,subject,content:content.slice(0,100000),kind:"pdf",createdAt:serverTimestamp()};
      if(url)payload.url=url;
      if(file){
        if(file.type!=="application/pdf"&&!/\.pdf$/i.test(file.name)){toast("PDF فقط");return}
        if(file.size>BOOKS_PDF_MAX_BYTES){toast("الملف أكبر من ~900KB — استخدم رابط Drive");return}
        const b64=await readB64(file);
        if(b64.length>950000){toast("كبير بعد التحويل — استخدم رابط");return}
        payload.b64=b64;payload.name=file.name;
      }
      await addDoc(collection(db,"books"),payload);
      toast("اتضاف الكتاب ✓",true);
      if($("#bookTitle"))$("#bookTitle").value="";
      if($("#bookUrl"))$("#bookUrl").value="";
      if($("#bookContent"))$("#bookContent").value="";
      if(fileInput)fileInput.value="";
    }catch(e){console.error(e);toast("فشل الإضافة — جرّب ملف أصغر أو رابط")}
  },

  async delBook(d){
    if(!S.isAdmin||!d.id)return;
    if(!await uiConfirm("حذف الكتاب؟"))return;
    const prev=S.books;S.books=(S.books||[]).filter(x=>x.id!==d.id);render(true);toast("🗑 تم حذف الكتاب",true);
    try{await deleteDoc(doc(db,"books",d.id))}catch(e){S.books=prev;render(true);window.__cancel=true;toast("فشل الحذف",true)}
  },
  openBag(){
    if(!bkUrl()){toast("خاصية الكتب لسه مش متظبطة من الأدمن",true);return}
    if(!S.bagMsgs){try{S.bagMsgs=JSON.parse(localStorage.getItem("bag_msgs")||"null")||[]}catch(_){S.bagMsgs=[]}}
    S.view="bag";render(true);
  },
  bagClear(){S.bagMsgs=[];try{localStorage.removeItem("bag_msgs")}catch(_){};render(true)},
  async bagSend(){
    const inp=$("#bagIn");if(!inp)return;
    const q=(inp.value||"").trim();if(!q||S.bagBusy)return;
    S.bagMsgs=(S.bagMsgs||[]);S.bagMsgs.push({role:"me",text:q,at:Date.now()});
    S.bagBusy=true;render(true);
    try{
      const j=await bkApi("/ask",{q,uid:(S.user&&S.user.uid)||"anon"});
      S.bagMsgs.push({role:"bot",text:j.reply||"…",cites:j.cites||[],at:Date.now()});
    }catch(e){S.bagMsgs.push({role:"bot",text:"⚠ "+((e&&e.message)||"حصلت مشكلة — جرّب تاني"),at:Date.now()})}
    S.bagBusy=false;
    try{localStorage.setItem("bag_msgs",JSON.stringify(S.bagMsgs.slice(-40)))}catch(_){}
    render(true);
    requestAnimationFrame(()=>{const el=$("#bagLog");if(el)el.scrollTop=el.scrollHeight});
  },
  async bkUpload(d,el){
    if(!S.isAdmin)return;
    const f=el&&el.files&&el.files[0];if(!f)return;
    if(!bkUrl()){toast("ظبّط وسيط الكتب من الإعدادات الأول",true);return}
    S.bkProg="⏳ جاري تحميل قارئ الـ PDF…";render(true);
    try{
      const pdfjs=await ensurePdfjs();
      S.bkProg="⏳ جاري قراءة الـ PDF…";render(true);
      const buf=await f.arrayBuffer();
      const pdf=await pdfjs.getDocument({data:buf}).promise;
      const n=Math.min(pdf.numPages,400),pages=[];
      for(let i=1;i<=n;i++){
        const pg=await pdf.getPage(i);
        const tc=await pg.getTextContent();
        const t=tc.items.map(it=>it.str).join(" ").replace(/\s+/g," ").trim();
        if(t.length>8)pages.push({p:i,t});
        if(i%20===0){try{const pe=$("#bkProg");if(pe)pe.textContent="⏳ قرأت "+i+" من "+n+" صفحة…"}catch(_){}}
      }
      if(!pages.length)throw new Error("الـ PDF مافيهوش نص مقروء (غالبًا سكان صور) — جرّب كتاب نصه أصلي");
      const id="bk"+Date.now().toString(36);
      const title=(f.name||"كتاب").replace(/\.pdf$/i,"").replace(/[_-]+/g," ").trim().slice(0,80);
      try{const pe=$("#bkProg");if(pe)pe.textContent="⏳ رافع "+pages.length+" صفحة للوسيط…"}catch(_){}
      const j=await bkApi("/ingest",{id,title,pages},true);
      S.bkProg="✓ اتحفظ «"+title+"» — "+j.pages+" صفحة · "+j.chunks+" مقطع للـ AI";
      S.bkList=null;bkLoadList();
      toast("الكتاب اتحفظ في وسيط الكتب ✓",true);
    }catch(e){S.bkProg="⚠ "+((e&&e.message)||"فشل رفع الكتاب");toast("فشل رفع الكتاب",true)}
    render(true);
  },
  bkRefresh(){S.bkList=null;bkLoadList();scheduleRender()},
  async bkDel(d){
    if(!S.isAdmin||!d.id)return;
    if(!await uiConfirm("مسح الكتاب من الـ AI؟ (الملف الأصلي مش بيتمسح)"))return;
    try{await bkApi("/del",{id:d.id},true);S.bkList=null;bkLoadList();toast("اتمسح من الوسيط ✓",true)}
    catch(e){toast((e&&e.message)||"فشل المسح",true)}
  },
  async genExam(){
    if(!S.isAdmin||S.genBusy)return;
    const bookSel=$("#geBook"),id=bookSel&&bookSel.value;
    if(!id){toast("ارفع كتاب للـ AI الأول من تبويب الكتب",true);return}
    const count=Math.min(30,Math.max(3,+($("#geCount")&&$("#geCount").value)||10));
    const level=($("#geLevel")&&$("#geLevel").value)||"متوسط";
    const subjectKey=($("#geSubj")&&$("#geSubj").value)||"arabic";
    const subject=($("#geSubject")&&$("#geSubject").value||"").trim();
    const title=($("#geTitle")&&$("#geTitle").value||"").trim();
    S.genBusy=true;S.genErr="";render(true);
    try{
      const j=await bkApi("/gen-exam",{id,count,level,subject,title},true);
      S.genOut={questions:j.questions||[],title:title||("امتحان AI — "+(j.book||"كتاب")),subjectId:subjectKey};
    }catch(e){S.genErr=(e&&e.message)||"فشل التوليد — جرّب تاني"}
    S.genBusy=false;render(true);
  },
  async genExamSave(){
    if(!S.isAdmin||!S.genOut)return;
    try{
      const qs=S.genOut.questions.map(q=>({q:q.q,o:q.o,a:q.a,page:q.page}));
      await addDoc(collection(db,"exams"),{subject:S.genOut.subjectId||"arabic",title:S.genOut.title,minutes:Math.max(5,qs.length*2),passMark:0,shuffle:true,published:false,showAnswers:true,questions:qs,createdAt:serverTimestamp()});
      toast("اتحفظ الامتحان (مخفي) — راجعه من القائمة وعدّله براحتك ✓",true);
      S.genOut=null;S.genPrefill=null;S.tab="exams";render(true);
    }catch(e){toast("فشل الحفظ",true)}
  },
  genExamClear(){S.genOut=null;S.genErr="";render(true)},
  async agentSend(){
    if(!S.isAdmin)return;
    const inp=$("#agentIn");if(!inp)return;
    const q=(inp.value||"").trim();if(!q||S.agentBusy)return;
    S.agentMsgs=(S.agentMsgs||[]);S.agentMsgs.push({role:"me",text:q,at:Date.now()});
    S.agentBusy=true;render(true);
    try{
      const ctx={
        maintenance:!!(S.site&&S.site.maintenance),
        students:(S.students||[]).slice(0,150).map(s=>({name:s.name,phone:s.phone,xp:s.xp||0})),
        exams:(S.exams||[]).map(e=>({title:e.title,published:!!e.published})),
        books:(S.bkList||[]).map(b=>({title:b.title,pages:b.pages}))
      };
      const sys=["أنت وكيل أدمن لمنصة تعليمية اسمها التفوق. مهمتك تحويل كلام الأدمن لخطة تنفيذ.",
        'رجّع JSON فقط بدون أي كلام إضافي بالشكل: {"actions":[{"act":"..."}]}',
        "الأفعال المتاحة حصريًا:",
        '- broadcast: {"act":"broadcast","text":"نص الإشعار"}',
        '- maintenance: {"act":"maintenance","on":true أو false}',
        '- addxp: {"act":"addxp","phone":"01xxxxxxxxx","amount":رقم}',
        '- publishexam: {"act":"publishexam","title":"عنوان الامتحان من القائمة"}',
        '- hideexam: {"act":"hideexam","title":"..."}',
        '- genexam: {"act":"genexam","book":"عنوان كتاب من القائمة","count":رقم,"subject":"اسم المادة"}',
        '- answer: {"act":"answer","text":"رد نصي"} — للأسئلة اللي مش أوامر تنفيذ',
        "بيانات المنصة دلوقتي:",JSON.stringify(ctx).slice(0,4000)].join("\n");
      const hist=S.agentMsgs.slice(-8).map(m=>({role:m.role==="me"?"user":"assistant",content:String(m.text).slice(0,500)}));
      const reply=await aiChatEndpoint(q,sys,hist);
      const j=agentExtractJson(reply);
      if(j&&Array.isArray(j.actions)&&j.actions.length){
        S.agentPlan=j.actions.filter(a=>a&&typeof a.act==="string").slice(0,10);
        S.agentMsgs.push({role:"bot",text:"جهزت خطة بـ "+S.agentPlan.length+" خطوة 👇 اقراها فوق واعتمد التنفيذ.",at:Date.now()});
      }else if(j&&typeof j.act==="string"){
        S.agentPlan=[j].slice(0,10);S.agentMsgs.push({role:"bot",text:"جهزت خطة بـ خطوة واحدة 👇",at:Date.now()});
      }else{
        S.agentMsgs.push({role:"bot",text:reply,at:Date.now()});
      }
    }catch(e){S.agentMsgs.push({role:"bot",text:"⚠ "+((e&&e.message)||"حصلت مشكلة — جرّب تاني"),at:Date.now()})}
    S.agentBusy=false;render(true);
    requestAnimationFrame(()=>{const el=$("#agLog");if(el)el.scrollTop=el.scrollHeight});
  },
  async agentRun(){
    if(!S.isAdmin||!S.agentPlan)return;
    const plan=S.agentPlan.slice(0,10);S.agentPlan=null;
    const log=[];
    for(const a of plan){
      try{
        if(a.act==="broadcast"){
          const txt=String(a.text||"").slice(0,300);
          await addDoc(collection(db,"notifications"),{uid:"__all__",broadcast:true,text:txt,createdAt:serverTimestamp(),fromAdmin:true});
          const st=(S.students||[]).slice(0,80);
          await Promise.all(st.map(s=>addDoc(collection(db,"notifications"),{uid:s.id,text:txt,createdAt:serverTimestamp(),fromAdmin:true,read:false})));
          sendPush({type:"broadcast",title:"📢 التفوق",body:txt});
          log.push("✓ اتبعت الإشعار لكل الطلاب");
        }else if(a.act==="maintenance"){
          await updateDoc(doc(db,"config","site"),{maintenance:!!a.on});
          log.push("✓ وضع الصيانة: "+(a.on?"اتشغّل":"اتقف"));
        }else if(a.act==="addxp"){
          const ph=String(a.phone||"").replace(/\D/g,"");
          const st=(S.students||[]).find(s=>String(s.phone||"")===ph);
          if(!st)log.push("✗ مفيش طالب بالرقم "+ph);
          else{await updateDoc(doc(db,"students",st.id),{xp:(st.xp||0)+(Number(a.amount)||0)});log.push("✓ اتضاف "+(Number(a.amount)||0)+" XP لـ "+(st.name||ph))}
        }else if(a.act==="publishexam"||a.act==="hideexam"){
          const want=String(a.title||"").trim();
          if(!want){log.push("✗ عنوان الامتحان فاضي");continue}
          const ex=(S.exams||[]).find(e=>(e.title||"").trim()===want)||(S.exams||[]).find(e=>(e.title||"").includes(want));
          if(!ex)log.push("✗ ملقتش امتحان اسمه «"+want+"»");
          else{await updateDoc(doc(db,"exams",ex.id),{published:a.act==="publishexam"});log.push("✓ "+(a.act==="publishexam"?"اتنشر":"اتخبّي")+": "+ex.title)}
        }else if(a.act==="genexam"){
          const pref={count:Math.min(30,Math.max(3,Number(a.count)||10)),subject:String(a.subject||"").slice(0,30),book:""};
          const b=(S.bkList||[]).find(x=>(x.title||"").includes(String(a.book||"").trim()));
          if(b)pref.book=b.id;
          S.genPrefill=pref;S.tab="exams";
          log.push("🎲 فتحتلك تبويب الامتحانات مع مولّد الأسئلة جاهز"+(b?" على «"+b.title+"»":"")+" — دوس «ولّد الأسئلة» هناك");
        }else if(a.act==="answer"){
          log.push("ℹ️ "+String(a.text||"").slice(0,400));
        }else log.push("✗ فعل مش معروف: "+a.act);
      }catch(e){log.push("✗ خطأ في خطوة: "+((e&&e.message)||e))}
    }
    S.agentMsgs=(S.agentMsgs||[]);
    S.agentMsgs.push({role:"bot",text:log.join("\n"),at:Date.now()});
    render(true);
    requestAnimationFrame(()=>{const el=$("#agLog");if(el)el.scrollTop=el.scrollHeight});
  },
  agentClear(){S.agentPlan=null;render(true)},
  async broadcastNotif(){
    if(!S.isAdmin)return;
    const msg=await uiPrompt("نص الإشعار لكل الطلاب:");
    if(!msg||!msg.trim())return;
    try{
      const st=S.students||[];
      // إشعار جماعي كمستند واحد + نسخة activity
      await addDoc(collection(db,"notifications"),{
        uid:"__all__", broadcast:true, text:msg.trim(),
        createdAt:serverTimestamp(), fromAdmin:true
      });
      // لكل طالب (حد أقصى 50 مرة واحدة لتفادي الضغط)
      const batch=st.slice(0,80);
      await Promise.all(batch.map(s=>addDoc(collection(db,"notifications"),{
        uid:s.id, text:msg.trim(), createdAt:serverTimestamp(), fromAdmin:true, read:false
      })));
      sendPush({type:"broadcast",title:"📢 التفوق",body:msg.trim()});
      toast(pushBase()?"اتبعت الإشعار ✓ (داخل المنصة + إشعار للأجهزة)":"اتبعت داخل المنصة ✓ — لتوصيله كإشعار للأجهزة اربط وسيط الإشعارات من الإعدادات",true);
    }catch(e){toast("فشل الإرسال")}
  },

  async blockUser(d){
    if(!d.uid||d.uid===S.user.uid)return;
    if(!await uiConfirm("حظر الطالب ده؟ مش هيقدر يبعتلك"))return;
    try{
      const blocked=[...((S.profile&&S.profile.blockedUsers)||[])];
      if(!blocked.includes(d.uid))blocked.push(d.uid);
      await setDoc(doc(db,"students",S.user.uid),{blockedUsers:blocked},{merge:true});
      if(S.profile)S.profile.blockedUsers=blocked;
      toast("اتحظر ✓",true);
    }catch(e){toast("فشل الحظر")}
  },
  async toggleTanaghaSave(d){
    if(!S.isAdmin||!d.uid)return;
    const st=(S.students||[]).find(x=>x.id===d.uid);
    const prev=!!(st&&st.tanaghaSave);
    const next=!prev;
    // فوري على الشاشة
    if(st)st.tanaghaSave=next;
    if(S.view==="admin"&&S.tab==="tanagha")render(true);
    toast(next?"✓ مسموح له يحفظ":"✓ اتمنع من الحفظ",true);
    try{
      await updateDoc(doc(db,"students",d.uid),{tanaghaSave:next});
    }catch(e){
      if(st)st.tanaghaSave=prev;
      if(S.view==="admin"&&S.tab==="tanagha")render(true);
      toast("فشل: "+(e.code||e.message||""));
    }
  },
  async grantAsmRole(d){
    if(!S.isAdmin||!d.uid)return;
    const st=(S.students||[]).find(x=>x.id===d.uid);
    const had=Array.isArray(st&&st.roles)&&st.roles.includes("asm");
    const prev=st&&st.roles;
    const roles=new Set((st&&st.roles)||[]);
    if(had)roles.delete("asm");else roles.add("asm");
    if(st)st.roles=[...roles];
    render(true);toast(!had?"✅ بقى مسؤول تقييمات":"↩ اتشال من مسؤولي التقييمات",true);
    try{await updateDoc(doc(db,"students",d.uid),{roles:[...roles]})}
    catch(e){if(st)st.roles=prev;render(true);window.__cancel=true;toast("فشل — حدّث rules",true)}
  },
  openMe(){S.view="me";render(true)},
  async adminRecoverCode(d){
    if(!S.isAdmin||!d.id)return;
    const s=(S.students||[]).find(x=>x.id===d.id)||{};
    const phone=(s.phone||d.phone||"").trim();
    if(!/^01[0-9]{9}$/.test(phone)){toast("رقم الطالب مش موجود أو غلط");return}
    if(!await uiConfirm("إصدار كود استعادة كلمة السر لـ "+phone+"؟\\n\\nالكود صالح 15 دقيقة والطالب بيدخله من صفحة الدخول → «نسيت كلمة السر؟».\\nملاحظة: لازم وسيط الاستعادة يكون متظبط في الإعدادات عشان يشتغل."))return;
    const code=String(Math.floor(100000+Math.random()*900000));
    try{
      await updateDoc(doc(db,"students",d.id),{resetCode:code,resetExp:Date.now()+15*60*1000,resetPhone:phone,resetAt:serverTimestamp()});
      S.recoverShown={uid:d.id,phone,code,at:Date.now()};
      try{await navigator.clipboard.writeText(code);toast("الكود اتنسخ ✓",true)}catch(_){toast("الكود صدر ✓",true)}
      render(true);
    }catch(e){toast("فشل إصدار الكود: "+((e&&e.code)||""),true)}
  },
  async copyRecoverCode(){
    const c=S.recoverShown&&S.recoverShown.code;
    if(!c)return;
    try{await navigator.clipboard.writeText(String(c));toast("الكود اتنسخ ✓",true)}catch(_){toast("انسخه يدوي: "+c)}
  },
  adminResetPass(d){
    const box=document.getElementById("resetPassBox");
    if(box){box.style.display=box.style.display==="none"?"block":"none";const inp=$("#adminNewPw");if(inp){inp.value="";inp.focus()}}
  },
  async adminResetPassGo(d){
    if(!S.isAdmin)return;
    const pw=($("#adminNewPw")&&$("#adminNewPw").value||"").trim();
    const phone=(d.phone||"").trim();
    const uid=d.id;
    if(!pw||pw.length<6){toast("كلمة السر 6 حروف أو أرقام على الأقل");return}
    if(!phone){toast("مفيش رقم للطالب");return}
    const email=phone+"@eltafawoq.app";
    // 1) لو في Cloud Function / endpoint مخصص
    const url=(S.site&&(S.site.resetPassUrl||S.site.aiUrl))||"";
    if(url&&S.site&&S.site.resetPassUrl){
      try{
        toast("جاري التعيين…");
        const r=await fetch(S.site.resetPassUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uid,email,password:pw,adminEmail:(S.user&&S.user.email)||""})});
        if(r.ok){toast("اتعيّنت كلمة السر الجديدة ✓",true);const box=document.getElementById("resetPassBox");if(box)box.style.display="none";return}
        const t=await r.text();console.warn(t);
      }catch(e){console.error(e)}
    }
    // 2) محاولة عبر Identity Toolkit (بتحتاج صلاحيات محدودة — غالبًا هتفشل من المتصفح)
    try{
      const apiKey=(typeof firebaseConfig!=="undefined"&&firebaseConfig.apiKey)||"";
      // حفظ ملاحظة للأدمن في ملف الطالب
      await updateDoc(doc(db,"students",uid),{passNote:"طُلب تعيين كلمة سر في "+new Date().toLocaleString("ar-EG"),passNoteAt:serverTimestamp()});
    }catch(e){}
    // 3) تعليمات Firebase Console + نسخ الإيميل
    try{await navigator.clipboard.writeText(email)}catch(e){}
    toast("اتنسخ الإيميل. افتح Firebase Authentication وعيّن كلمة السر هناك",true);
    const go=await uiConfirm("فتح Firebase Console الآن؟\\nUsers → ابحث عن:\\n"+email);
    if(go) window.open("https://console.firebase.google.com/project/eltafawoq-8b700/authentication/users","_blank");
  },
  async saveAiChat(){
    if(!S.user||!db)return;
    try{
      const msgs=(S.aiMsgs||[]).slice(-40);
      await setDoc(doc(db,"aiChats",S.user.uid),{msgs,updatedAt:serverTimestamp()},{merge:true});
    }catch(e){console.warn("ai save",e)}
  },
  async speedBoost(){
    if(!await uiConfirm("ده زرار مخصص لتسريع المنصة على الهواتف الضعيفة أو لما تحس إنها بتهنّج.\nبيمسح الملفات المؤقتة ويحدّث المنصة.\nمش بيمسح حسابك ولا نتايجك.",{title:"تسريع المنصة للهواتف الضعيفة",icon:"⚡",ok:"تسريع الآن",danger:false}))return;
    toast("جاري تسريع المنصة…");
    try{
      await clearLocalSpeedCache("manual");
      try{localStorage.setItem("lite_mode","1")}catch(_){}
      toast("تم مسح الكاش + تفعيل الوضع الخفيف — هتحدث ✓",true);
      setTimeout(function(){location.reload()},500);
    }catch(e){toast("تعذر المسح — حدّث الصفحة يدويًا")}
  },
  async adminSpeedAll(){
    if(!S.isAdmin)return;
    if(!await uiConfirm("إرسال تنبيه بوجود تحديث للأجهزة؟\nلن تُعاد تحميل الصفحات تلقائيًا؛ كل مستخدم يحدّثها في الوقت المناسب."))return;
    try{
      const bust=Date.now();
      await updateDoc(doc(db,"config","site"),{cacheBust:bust});
      S.site.cacheBust=bust;
      try{localStorage.setItem("cache_bust_done",String(bust))}catch(_){}
      toast("تم إرسال تنبيه التحديث للأجهزة ✓",true);
    }catch(e){
      try{
        const bust=Date.now();
        await setDoc(doc(db,"config","site"),{cacheBust:bust},{merge:true});
        S.site.cacheBust=bust;
        try{localStorage.setItem("cache_bust_done",String(bust))}catch(_){}
        toast("تم إرسال تنبيه التحديث للأجهزة ✓",true);
      }catch(e2){toast("فشل: "+(e2.message||""))}
    }
  },
  openAI(){
    S.view="ai";
    S.aiMsgs=S.aiMsgs||[{role:"bot",text:"أهلاً! أنا 么 🤖\nأقدر أوجّهك لأي جزء في المنصة وأراجع الامتحانات والكتب.\nاسأل بأي صيغة."}];
    render(true);
    if(S.user&&db){
      getDoc(doc(db,"aiChats",S.user.uid)).then(s=>{
        if(s.exists()){
          const d=s.data();
          if(Array.isArray(d.msgs)&&d.msgs.length){S.aiMsgs=d.msgs;if(S.view==="ai")render(true)}
        }
      }).catch(()=>{});
    }
  },
  async aiSend(){
    const inp=$("#aiIn");let q=(inp&&inp.value||"").trim();
    const fileEl=$("#aiFile");
    const file=fileEl&&fileEl.files&&fileEl.files[0];
    let fileNote="", fileName="";
    if(file){
      fileName=file.name||"ملف";
      try{
        if(/^text\/|\.txt$/i.test(file.type+file.name)){
          fileNote=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||"").slice(0,30000));r.onerror=rej;r.readAsText(file)});
        }else if(/pdf/i.test(file.type+file.name)){
          // PDF ثنائي: نقرأ كنص للمحاولة + نطلب من الطالب يلصق المهم
          const raw=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||"").slice(0,5000));r.onerror=rej;r.readAsText(file)});
          fileNote=raw.replace(/[^\x20-\x7E\u0600-\u06FF\n\r\t]/g," ").replace(/\s+/g," ").trim().slice(0,8000);
          if(fileNote.length<40) fileNote="[ملف PDF: "+fileName+" — مش قادر أقرأ النص تلقائي كويس. الصق الجزء المهم من الملخص هنا وأراجعه معاك.]";
        }else if(/^image\//.test(file.type)){
          fileNote="[صورة مرفقة: "+fileName+" — وصف اللي فيها أو اكتب السؤال اللي ظاهر فيها.]";
        }else{
          fileNote="[ملف: "+fileName+"]";
        }
      }catch(e){fileNote="[تعذر قراءة الملف]";}
      if(fileEl)fileEl.value="";
      const hint=$("#aiFileHint");if(hint)hint.textContent="";
    }
    if(!q&&!fileNote)return;
    if(!q&&fileNote)q="راجعلي الملف ده";
    const fullQ=fileNote?(q+"\n\n--- محتوى الملف ("+fileName+") ---\n"+fileNote):q;
    if(inp)inp.value="";
    S.aiMsgs=(S.aiMsgs||[]).concat([{role:"me",text:q,fileName:fileName||undefined,at:Date.now()},{role:"bot",text:"بفكر… ثواني 🧠"}]);
    render();
    requestAnimationFrame(()=>{const el=$("#aiLog");if(el)el.scrollTop=el.scrollHeight});
    // تأخير بسيط للواقعية
    await new Promise(r=>setTimeout(r,80));

    try{
      const sn=normalizeAr(fullQ);
      const adminProbe=/(ادمن|المدرس|لوحة التحكم|غير درجة|زوّد درجة|امسح نتيجة|احذف طالب|فك حظر|كلمة سر ادمن|باسورد الادمن|firebase|قواعد|rules|api key|مفتاح|استولي|اختراق|هاك|hack|admin panel|غيّر نتيجة|مسح نتائج)/.test(sn)
        && !/(ازاي استخدم|شرح المنصه|امتحان طالب|حسابي|ازاي اكلم المدرس)/.test(sn);
      if(adminProbe && S.user){
        await addDoc(collection(db,"suspicious"),{
          uid:S.user.uid,
          name:(S.profile&&S.profile.name)||"",
          phone:(S.profile&&S.profile.phone)||"",
          text:fullQ.slice(0,1000),
          source:"ai",
          createdAt:serverTimestamp(),
          seen:false
        });
      }
    }catch(e){console.warn("suspicious",e)}
    let reply=null;
    try{
      if(S.site&&(S.site.aiProxy||S.site.aiUrl)){
        const books=(S.books||[]).map(b=>({title:b.title,subject:b.subject,url:b.url,content:(b.content||"").slice(0,8000)}));
        const examsCtx=(S.exams||[]).slice(0,15).map(e=>{
          const qs=(e.questions||[]).slice(0,30).map((qq,i)=>({
            q:qq.q, options:qq.o, answer:typeof qq.a==="number"&&qq.o?qq.o[qq.a]:null
          }));
          return {title:e.title,subject:e.subject,questions:qs};
        });
        const history=(S.aiMsgs||[]).filter(m=>m.role==="me"||m.role==="bot").slice(-12).map(m=>({
          role:m.role==="me"?"user":"assistant",
          content:String(m.text||"").slice(0,800)
        }));
        const sysPrompt=[
          "اسمك 么 — بتكلم الطالب كصديق بيذاكر معاه، مش روبوت رسمي.",
          "عربية مصرية طبيعية وودودة، جمل قصيرة.",
          "وجّه الطالب لخطوات المنصة بدقة (الألعاب→إنشاء غرفة، تواصل→شات، المواد→امتحان).",
          "لا تكشف أعداد/أسماء/أرقام طلاب أو من المتصل.",
          "لا تساعد في اختراق أو تغيير درجات أو صلاحيات أدمن.",
          "الطالب: "+((S.profile&&S.profile.name)||"طالب")
        ].join("\n");
        const headers={"Content-Type":"application/json"};
        let __aiEp=S.site.aiUrl;
        if(S.site.aiProxy){__aiEp=S.site.aiProxy;try{headers["Authorization"]="Bearer "+await auth.currentUser.getIdToken()}catch(_){}}
        else if(S.site.aiKey)headers["Authorization"]="Bearer "+S.site.aiKey;
        const r=await fetch(__aiEp,{
          method:"POST",headers,
          body:JSON.stringify({message:fullQ,uid:S.user&&S.user.uid,name:S.profile&&S.profile.name,view:S.view,system:sysPrompt,history,books,exams:examsCtx})
        });
        if(r.ok){const j=await r.json();reply=j.reply||j.text||j.message||null}
      }
    }catch(e){console.warn("aiUrl",e)}
    if(!reply){
      const sn=normalizeAr(fullQ);
      if(/(ادمن|لوحة التحكم|غير درجة|امسح نتيجة|كلمة سر ادمن|اختراق|هاك|firebase rules|api key)/.test(sn)
         && !/(ازاي اكلم المدرس|تواصل مع المدرس)/.test(sn))
        reply=((S.profile&&S.profile.name)?("يا "+S.profile.name.split(" ")[0]+"، "):"")+"الطلب ده خاص بالمدرس ومش هقدر أنفّذه من هنا.\\nلو محتاج مساعدة كطالب في المذاكرة أو استخدام المنصة، أقدر أساعدك.";
      else reply=aiLocalReply(fullQ);
    }
    S.aiMsgs=(S.aiMsgs||[]).slice(0,-1);
    S.aiMsgs.push({role:"bot",text:reply,at:Date.now()});
    try{
      if(S.user){
        await setDoc(doc(db,"aiChats",S.user.uid),{
          uid:S.user.uid,
          name:(S.profile&&S.profile.name)||"",
          phone:(S.profile&&S.profile.phone)||"",
          msgs:(S.aiMsgs||[]).slice(-80),
          updatedAt:serverTimestamp()
        },{merge:true});
      }
    }catch(e){console.warn("aiChat save",e)}
    render();
    requestAnimationFrame(()=>{const el=$("#aiLog");if(el)el.scrollTop=el.scrollHeight});
  },

  openSearch(){
    S.view="search";S.friendHits=S.friendHits||[];
    S.globalHits=typeof runGlobalSearch==="function"?runGlobalSearch(S.friendQ||""):{};
    render(true);
    setTimeout(()=>{
      const i=$("#friendQ");
      if(!i)return;
      i.focus();
      if(i._liveBound)return;
      i._liveBound=true;
      i.addEventListener("input",()=>{
        S.friendQ=i.value;
        S.globalHits=runGlobalSearch(i.value);
        if(S.view!=="search")return;
        const pos=i.selectionStart;
        render(true);
        const n=$("#friendQ");
        if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}
      });
    },100);
  },
  openChats(){
    try{if("Notification" in window&&Notification.permission==="default")Notification.requestPermission()}catch(_){}

    S.view="chatList";S.chatTab=S.chatTab||"dms";
    listenMyChats();loadMyGroups();
    render(true);
  },
  chatTab(d){S.chatTab=d.id||"dms";if(S.chatTab==="groups")loadMyGroups();render(true)},
    async installApp(){
    if(window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone){
      toast("التطبيق شغال بالفعل ✓");return;
    }
    const ua=navigator.userAgent||"";
    if(window.__deferredPrompt){
      try{
        window.__deferredPrompt.prompt();
        const r=await window.__deferredPrompt.userChoice;
        window.__deferredPrompt=null;
        if(r&&r.outcome==="accepted"){toast("تم تثبيت التطبيق ✓",true);return}
      }catch(_){}
    }
    if(/iPad|iPhone|iPod/.test(ua)){
      toast("آيفون: شارك ⬆ ثم «إضافة إلى الشاشة الرئيسية»",true);return;
    }
    // روابط مباشرة مؤكدة (raw GitHub + صفحات الموقع)
    const candidates=[
      "https://raw.githubusercontent.com/phdgxt4-coder/crispy-bassoon/main/"+encodeURIComponent("التفوق.apk"),
      "https://github.com/phdgxt4-coder/crispy-bassoon/raw/main/"+encodeURIComponent("التفوق.apk"),
      location.origin+"/crispy-bassoon/"+encodeURIComponent("التفوق.apk"),
      location.origin+"/crispy-bassoon/eltafawoq.apk",
      location.origin+"/crispy-bassoon/app/eltafawoq.apk"
    ];
    toast("جاري تحضير التحميل…");
    for(const apkUrl of candidates){
      try{
        const head=await fetch(apkUrl,{method:"HEAD",cache:"no-store"});
        const len=Number(head.headers.get("content-length")||0);
        if(head.ok && (len>10000 || head.status===200)){
          const a=document.createElement("a");
          a.href=apkUrl;
          a.download="التفوق.apk";
          a.target="_blank";
          a.rel="noopener";
          document.body.appendChild(a);a.click();a.remove();
          toast("بدأ التحميل ✓ افتح الملف من التنزيلات وثبّته",true);
          return;
        }
      }catch(_){}
    }
    // فتح مباشر كحل أخير
    window.open("https://raw.githubusercontent.com/phdgxt4-coder/crispy-bassoon/main/"+encodeURIComponent("التفوق.apk"),"_blank","noopener");
    toast("اتفتح رابط التحميل — لو مالحملش احفظ الصفحة كملف APK",true);
  },
  async startChat(d){
    const uid=d.uid;if(!uid||uid===S.user.uid){toast("مش هتكلم نفسك");return}
    const name=d.name||"زميل";
    await openDmThread(uid,name);
  },
  async openChat(d){
    await openDmThread(d.uid,d.name||"زميل");
  },
  async dmSend(){
    const t=S.chatThread;if(!t||!S.user)return;
    const inp=$("#dmIn");const text=(inp&&inp.value||"").trim();
    if(!text)return;
    try{
      await sendDm(t.uid,text,null);
      if(inp)inp.value="";
      S.replyTo=null;
      clearDmTyping();
    }catch(e){toast("مقدرتش أبعت")}
  },
  dmReply(d){
    S.replyTo={id:d.id,text:d.text||"",name:d.name||""};
    render(true);
    setTimeout(()=>{const i=$("#dmIn");if(i)i.focus()},50);
  },
  dmCancelReply(){S.replyTo=null;render(true)},
  async dmDelete(d){
    if(!d.id||!S.chatThread||!S.user)return;
    if(!await uiConfirm("تحذف الرسالة؟"))return;
    try{
      const cid=convIdFor(S.user.uid,S.chatThread.uid);
      await updateDoc(doc(db,"conversations",cid,"msgs",d.id),{deleted:true,text:"",img:null});
      const m=(S.chatMsgs||[]).find(x=>x.id===d.id);
      if(m){m.deleted=true;m.text="";m.img=null}
      if(S.view==="chatThread")scheduleRender(true);
      toast("اتمسحت");
    }catch(e){console.error(e);toast("مقدرش أحذف — تأكد من القواعد")}
  },
  backProfile(){
    S.view=S.profileBack||"me";
    render(true);
  },
  async openProfile(d){
    const uid=d.uid;if(!uid)return;
    S.profileBack=S.view==="profile"? (S.profileBack||"me") : S.view;
    S.viewProfile={loading:true,id:uid};
    S.view="profile";render(true);
    try{
      const canReadPrivate=!!(S.isAdmin||uid===S.user.uid);
      const [stSnap,pubSnap,lbSnap,resSnap]=await Promise.all([
        canReadPrivate?getDoc(doc(db,"students",uid)):Promise.resolve(null),
        getDoc(doc(db,"publicProfiles",uid)).catch(()=>null),
        getDoc(doc(db,"leaderboard",uid)).catch(()=>null),
        canReadPrivate?getDocs(query(collection(db,"results"),where("uid","==",uid),limit(12))).catch(()=>null):Promise.resolve(null)
      ]);
      const st=stSnap&&stSnap.exists()?stSnap.data():{};
      const pub=(pubSnap&&pubSnap.exists())?pubSnap.data():{};
      const lb=(lbSnap&&typeof lbSnap.exists==="function"&&lbSnap.exists())?lbSnap.data():{};
      let rank=null;
      try{
        let board=S.board||[];
        if(!board.length){
          const sn=await getDocs(query(collection(db,"leaderboard"),orderBy("score","desc"),limit(80)));
          board=sn.docs.map(x=>({id:x.id,...x.data()}));S.board=board;
        }
        const ranked=rankBoard(board).ranked;
        const idx=ranked.findIndex(b=>(b.uid||b.id)===uid);
        if(idx>=0)rank=idx+1;
      }catch(_){}
      let recent=resSnap?resSnap.docs.map(x=>({id:x.id,...x.data()})):[];
      recent.sort((a,b)=>tms(b)-tms(a));
      recent=recent.slice(0,8);
      S.viewProfile={
        id:uid,name:st.name||pub.name||lb.name||"طالب",phone:canReadPrivate?(st.phone||""):"",
        avatar:canReadPrivate?(st.avatar||null):null,xp:canReadPrivate?(st.xp||0):0,blocked:canReadPrivate&&!!st.blocked,
        examsDone:lb.examsDone,totalScore:lb.totalScore,pct:lb.pct,rank,recent
      };
    }catch(e){
      console.error(e);
      S.viewProfile={id:uid,name:"طالب",loading:false,recent:[]};
      toast("مقدرتش أحمّل الملف");
    }
    if(S.view==="profile")scheduleRender();
  },
  async searchFriend(){
    const q=($("#friendQ")?.value||"").trim();
    S.friendQ=q;
    if(q.length<2){toast("اكتب حرفين على الأقل");return}
    S.friendSearching=true;render();
    try{
      const sn=await getDocs(query(collection(db,"publicProfiles"),limit(200)));
      const profiles=sn.docs.map(d=>({id:d.id,...d.data()}));
      let board=S.board||[];
      if((S.isAdmin||featState("progress"))&&!board.length){
        try{const b=await getDocs(query(collection(db,"leaderboard"),orderBy("score","desc"),limit(80)));board=b.docs.map(d=>({id:d.id,...d.data()}));S.board=board}catch(_){}
      }
      const ql=q.toLowerCase();
      const matched=profiles.filter(p=>p.id!==S.user.uid&&(p.name||"").toLowerCase().includes(ql)).slice(0,20);
      const ranked=rankBoard(board).ranked;
      S.friendHits=matched.map(p=>{
        const lb=board.find(b=>(b.uid||b.id)===p.id)||{};
        const rankIdx=ranked.findIndex(b=>(b.uid||b.id)===p.id);
        return {id:p.id,name:p.name,phone:"",avatar:null,examsDone:lb.examsDone,totalScore:lb.totalScore,pct:lb.pct,rank:rankIdx>=0?rankIdx+1:null};
      });
      try{S.globalHits=runGlobalSearch(S.friendQ||"")}catch(_){}
    }catch(e){toast("فشل البحث");S.friendHits=[]}
    S.friendSearching=false;render();
  },
  async meSaveName(){
    const name=($("#meName")?.value||"").trim();
    if(name.length<2||name.length>80){toast("الاسم لازم يكون بين حرفين و80 حرفًا");return}
    try{
      await updateDoc(doc(db,"students",S.user.uid),{name,chatName:name.split(" ")[0]});
      try{await setDoc(doc(db,"publicProfiles",S.user.uid),{name,updatedAt:serverTimestamp()},{merge:true})}catch(_){}
      S.profile={...S.profile,name};
      toast("اتحفظ الاسم ✓");
      render();
    }catch(e){toast("مقدرتش أحفظ الاسم")}
  },
  async meChangePw(){
    const pw=$("#mePw")?.value||"",pw2=$("#mePw2")?.value||"";
    const code=($("#meResetCode")?.value||"").trim();
    if(pw.length<6){toast("كلمة السر لازم 6 على الأقل");return}
    if(pw!==pw2){toast("التأكيد مش مطابق");return}
    let bypass=false;
    if(code){
      const p=S.profile||{};
      const until=p.pwResetUntil&&p.pwResetUntil.toMillis?p.pwResetUntil.toMillis():(typeof p.pwResetUntil==="number"?p.pwResetUntil:0);
      if(p.pwResetCode&&String(p.pwResetCode)===code&&(!until||Date.now()<until))bypass=true;
      else{toast("كود الاستعادة غلط أو منتهي");return}
    }
    if(!bypass){
      const last=S.profile&&S.profile.pwChangedAt;
      const lastMs=last&&last.toMillis?last.toMillis():(typeof last==="number"?last:0);
      if(lastMs&&Date.now()-lastMs<7*24*3600*1000){
        toast("تقدر تغيّر كلمة السر مرة كل أسبوع بس — أو اطلب كود من المدرس");return;
      }
      try{
        const sn=await getDocs(query(collection(db,"students",S.user.uid,"logins"),orderBy("createdAt","desc"),limit(40)));
        const ips=new Set(sn.docs.map(d=>(d.data().ip||"").trim()).filter(Boolean));
        const cur=(myIp||"").trim();
        if(cur&&ips.size&&![...ips].some(ip=>ip===cur||ip.startsWith(cur.split(".").slice(0,3).join(".")))){
          toast("الجهاز ده مش معروف للحساب — غيّر من جهاز سبق دخوله، أو اطلب كود من المدرس");
          return;
        }
      }catch(_){}
    }
    try{
      await updatePassword(auth.currentUser,pw);
      const patch={pwChangedAt:serverTimestamp()};
      if(bypass){patch.pwResetCode=deleteField();patch.pwResetUntil=deleteField()}
      await updateDoc(doc(db,"students",S.user.uid),patch).catch(()=>{});
      toast("اتغيّرت كلمة السر ✓");
      if($("#mePw"))$("#mePw").value="";
      if($("#mePw2"))$("#mePw2").value="";
      if($("#meResetCode"))$("#meResetCode").value="";
    }catch(e){
      const msg=(e&&e.code)||"";
      if(msg.includes("requires-recent-login"))toast("سجّل خروج وادخل تاني عشان تغيّر كلمة السر");
      else toast("فشل التغيير: "+(e.message||""));
    }
  },
  async qbRequestJoin(d){
    const code=(d.code||"").toUpperCase();
    if(!code)return;
    try{
      const snap=await getDoc(doc(db,"qb_rooms",code));
      if(!snap.exists()){toast("الغرفة مش موجودة");return}
      const room=snap.data();
      if(room.players&&room.players[S.user.uid]){S.qb={mode:"friends",roomCode:code};qbListenRoom(code);return}
      if(room.status!=="lobby"){toast("المباراة شغالة — استنى تخلص");return}
      // طلب دخول للغرف العامة
      await updateDoc(doc(db,"qb_rooms",code),{
        [`joinRequests.${S.user.uid}`]:{uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],at:Date.now()}
      });
      toast("اتبعت طلب الدخول — استنى موافقة المضيف");
      S.qb={mode:"friends",roomCode:code,waitingJoin:true};
      qbListenRoom(code);
    }catch(e){toast("فشل الطلب")}
  },

  qbBot(){S.qb={mode:"bot"};S.view="qbSetup";render(true)},
  qbFriends(){S.qb={mode:"friends"};S.view="qbSetup";render(true)},
  qbStartBot(){
    const subject=$("#qbSub").value, n=+$("#qbN").value||10, sec=+$("#qbT").value||0, diff=$("#qbDiff")?$("#qbDiff").value:"medium";
    const raw=qbPool(subject,n);
    if(raw.length<3){toast("مفيش أسئلة كفاية في المادة دي. انشر امتحانات أول");return}
    const seed=Date.now()^ (Math.random()*1e9|0);
    const qs=raw.map((it,i)=>qbShuffleQ(it, seed+i*9973));
    const me={uid:S.user.uid,name:S.profile.name.split(" ")[0],score:0,correct:0,wrong:0,streak:0,bestStreak:0};
    const bot={uid:"bot",name:"الروبوت 🤖",score:0,correct:0,wrong:0,streak:0,bestStreak:0};
    S.qb={mode:"bot",diff,match:{qs,idx:0,sec,deadline:sec?Date.now()+sec*1000:0,players:[me,bot],answered:false,pick:null,seed}};
    S.view="qbPlay";render(true);qbStartRound();
  },
  async qbCreateRoom(){
    const game=$("#qbCreateGame")?.value||S.qbCreateGame||"qb";
    let maxPlayers=+$("#qbMax")?.value||6;
    if(maxPlayers<1)maxPlayers=1;if(maxPlayers>16)maxPlayers=16;
    const isPublic=($("#qbPublicCreate")?.value==="1");
    const subject=($("#qbSub")?.value)||"random";
    const n=+$("#qbN")?.value||10, sec=+$("#qbT")?.value||0;
    let qs=[],seed=Date.now()^(Math.random()*1e9|0);
    if(game==="qb"){
      const raw=qbPool(subject,n);
      if(raw.length<3){toast("مفيش أسئلة كفاية. انشر امتحانات أول");return}
      qs=raw.map((it,i)=>qbShuffleQ(it, seed+i*9973));
    }
    const code=qbCode();
    const av=await packTinyAvatar(S.profile&&S.profile.avatar);
    const room={code,host:S.user.uid,hostName:(S.profile.name||"طالب").split(" ")[0],subject,qCount:n,sec,maxPlayers,status:"lobby",seed,qs,game,color:"teal",public:isPublic,
      players:{[S.user.uid]:{uid:S.user.uid,name:S.profile.name.split(" ")[0],ready:true,score:0,correct:0,wrong:0,streak:0,bestStreak:0,away:false,seen:Date.now(),avatar:(S.profile.avatar&&String(S.profile.avatar).startsWith("http")?S.profile.avatar:av)||null}},
      createdAt:serverTimestamp()};
    try{
      await setDoc(doc(db,"qb_rooms",code),room);
      S.qb={mode:"friends",roomCode:code,room};
      qbListenRoom(code);
      logActivity("qb_create", code+" · "+qbGameLabel(game)+(isPublic?" · عام":" · خاص"));
      S.view="qbLobby";render(true);
    }catch(e){toast("مقدرتش أعمل الغرفة: "+(e.code||e.message||"تأكد من قواعد qb_rooms"))}
  },
  async qbJoinRoom(){
    const code=($("#qbJoinCode").value||"").trim().toUpperCase();
    if(code.length<4){toast("اكتب كود الغرفة");return}
    try{
      const snap=await getDoc(doc(db,"qb_rooms",code));
      if(!snap.exists()){toast("الكود غلط أو الغرفة اتقفلت");return}
      const room=snap.data();
      if(room.status==="playing"){toast("المباراة شغالة دلوقتي — استنى تخلص أو اطلب كود جديد");return}
      if(room.status==="done"){
        // allow rejoin for rematch lobby conversion - treat as lobby join
      } else if(room.status!=="lobby"){toast("الغرفة مش متاحة");return}
      if(Object.keys(room.players||{}).length>=(room.maxPlayers||2) && !room.players[S.user.uid]){toast("الغرفة ممتلئة");return}
      const av=await packTinyAvatar(S.profile&&S.profile.avatar);
      await updateDoc(doc(db,"qb_rooms",code),{[`players.${S.user.uid}`]:{uid:S.user.uid,name:S.profile.name.split(" ")[0],ready:false,score:0,correct:0,wrong:0,streak:0,bestStreak:0,away:false,seen:Date.now(),avatar:av||null}});
      S.qb={mode:"friends",roomCode:code,room:{...room,id:code}};
      qbListenRoom(code);
      logActivity("qb_join", code+" · مضيف: "+(room.hostName||""));
      S.view="qbLobby";render(true);
    }catch(e){toast("مقدرتش أدخل: "+(e.code||e.message||"تحقق من الكود والقواعد"))}
  },
  async qbReady(){
    const code=S.qb.roomCode;if(!code)return;
    const cur=(S.qb.room.players||{})[S.user.uid];
    try{await updateDoc(doc(db,"qb_rooms",code),{[`players.${S.user.uid}.ready`]:!cur.ready})}catch(e){toast("خطأ")}
  },
  async qbBeginMatch(){
    const code=S.qb.roomCode;if(!code)return;
    const game=(S.qb.room&&S.qb.room.game)||"qb";
    if(game==="los"){toast("آخر واحد واقف — قريب داخل الغرف. اختار تحدي الأوائل دلوقتي");return}
    try{await updateDoc(doc(db,"qb_rooms",code),{status:"playing",startedAt:Date.now(),idx:0})}catch(e){toast("مقدرتش أبدأ")}
  },
  qbCopyCode(){
    const c=S.qb&&S.qb.room&&S.qb.room.code;if(!c)return;
    navigator.clipboard.writeText(c).then(()=>toast("اتنسخ الكود ✓")).catch(()=>toast(c));
  },
  async qbRoomSettings(){
    const code=S.qb&&S.qb.roomCode;if(!code||!S.qb.room)return;
    if(S.qb.room.host!==S.user.uid){toast("المضيف بس يقدر يغيّر");return}
    const game=$("#qbGameSel")?.value||"qb";
    const color=$("#qbColorSel")?.value||"teal";
    try{
      await updateDoc(doc(db,"qb_rooms",code),{game,color});
      toast("اتحدّثت إعدادات الغرفة");
    }catch(e){toast("فشل الحفظ")}
  },
  qbCreateGameChange(d,el){
    S.qbCreateGame=el.value||"qb";
    if(S.qb)S.qb.createGame=S.qbCreateGame;
    render();
  },
  qbToggleViewers(){
    if(!S.qb)return;
    S.qb.showViewers=!S.qb.showViewers;
    render();
  },
  async adminCloseRoom(d){
    const code=d.code;if(!code||!S.isAdmin)return;
    if(!await uiConfirm("تقفل الغرفة "+code+" وتطرد الكل؟"))return;
    try{
      await deleteDoc(doc(db,"qb_rooms",code));
      toast("اتقفلت الغرفة "+code);
    }catch(e){toast("فشل القفل: "+(e.code||e.message||""))}
  },
  async qbKick(d){
    const code=S.qb&&S.qb.roomCode;if(!code||!S.qb.room)return;
    if(S.qb.room.host!==S.user.uid){toast("المضيف بس يقدر يطرد");return}
    const uid=d.uid;if(!uid||uid===S.user.uid)return;
    if(!await uiConfirm("تطرد اللاعب ده من الغرفة؟"))return;
    try{
      const snap=await getDoc(doc(db,"qb_rooms",code));
      if(!snap.exists())return;
      const players={...(snap.data().players||{})};
      delete players[uid];
      const left=Object.keys(players).filter(k=>k!=="bot");
      if(left.length===0){
        await deleteDoc(doc(db,"qb_rooms",code));
        toast("اتطرد واتلقت الغرفة");
        qbStopSub();S.qb=null;S.view="games";render(true);
      }else{
        await updateDoc(doc(db,"qb_rooms",code),{[`players.${uid}`]:deleteField()});
        toast("اتطرد اللاعب");
      }
    }catch(e){toast("فشل الطرد")}
  },
  qbCopyLink(){
    const c=S.qb&&S.qb.room&&S.qb.room.code;if(!c)return;
    const url=location.origin+location.pathname+"#room="+c;
    navigator.clipboard.writeText(url).then(()=>toast("اتنسخ رابط الغرفة ✓")).catch(()=>toast(url));
  },
  async qbAcceptJoin(d){
    const code=S.qb&&S.qb.roomCode;if(!code||!S.qb.room)return;
    if(S.qb.room.host!==S.user.uid)return;
    const uid=d.uid;const req=(S.qb.room.joinRequests||{})[uid];
    if(!req)return;
    try{
      await updateDoc(doc(db,"qb_rooms",code),{
        [`players.${uid}`]:{uid,name:req.name||"طالب",ready:false,score:0,correct:0,wrong:0,streak:0,bestStreak:0,away:false,seen:Date.now()},
        [`joinRequests.${uid}`]:deleteField()
      });
      toast("وافقت على الدخول");
    }catch(e){toast("فشل")}
  },
  async qbRejectJoin(d){
    const code=S.qb&&S.qb.roomCode;if(!code||!S.qb.room)return;
    if(S.qb.room.host!==S.user.uid)return;
    try{await updateDoc(doc(db,"qb_rooms",code),{[`joinRequests.${d.uid}`]:deleteField()});toast("اترفض الطلب")}catch(e){toast("فشل")}
  },
  async qbChatSend(){
    const code=S.qb&&S.qb.roomCode;if(!code)return;
    const inp=$("#qbChatIn");const text=(inp&&inp.value||"").trim();
    if(!text)return;
    if(text.length>300){toast("الرسالة طويلة");return}
    try{
      const av=S.profile&&S.profile.avatar&&String(S.profile.avatar).startsWith("http")?S.profile.avatar:null;
      await addDoc(collection(db,"qb_rooms",code,"chat"),{
        uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],
        avatar:av||null,
        text,createdAt:serverTimestamp()
      });
      if(inp)inp.value="";
    }catch(e){toast("مقدرتش أبعت الرسالة")}
  },
  async qbLeaveRoom(){
    const inPlay=S.view==="qbPlay"||S.view==="qbResult"||(S.qb&&S.qb.match);
    if(inPlay||(S.qb&&S.qb.roomCode)){
      if(!await uiConfirm("متأكد عايز تخرج من الغرفة؟\nلو انت آخر واحد الغرفة هتتقفل.")) return;
    }
    const code=S.qb&&S.qb.roomCode;
    qbStopSub();
    if(code&&S.user){
      try{
        // اقرأ أحدث نسخة من الغرفة
        const snap=await getDoc(doc(db,"qb_rooms",code));
        if(snap.exists()){
          const room=snap.data();
          const players={...(room.players||{})};
          delete players[S.user.uid];
          const left=Object.keys(players).filter(k=>k!=="bot");
          if(left.length===0){
            await deleteDoc(doc(db,"qb_rooms",code));
          } else {
            const patch={[`players.${S.user.uid}`]:deleteField()};
            if(room.host===S.user.uid) patch.host=left[0];
            // لو المباراة شغالة ومفيش حد جاهز — رجّع للوبي لو بقي لاعب واحد بس اختياري
            await updateDoc(doc(db,"qb_rooms",code),patch);
          }
        }
      }catch(e){console.warn("leave room",e)}
    }
    logActivity("qb_leave", code||"");
    S.qb=null;S.view="games";render(true);
  },
  async qbRematchRoom(){
    const code=S.qb&&S.qb.roomCode;if(!code||!S.qb.room)return;
    if(S.qb.room.host!==S.user.uid){toast("المضيف بس يقدر يعيد اللعب في نفس الغرفة");return}
    try{
      const players=S.qb.room.players||{};
      const reset={};
      Object.keys(players).forEach(uid=>{
        const p=players[uid];
        reset[uid]={uid:p.uid,name:p.name,ready:uid===S.user.uid,score:0,correct:0,wrong:0,streak:0,bestStreak:0,ans:null};
      });
      // new questions same settings
      const subject=S.qb.room.subject, n=S.qb.room.qCount||10, sec=S.qb.room.sec||0;
      const raw=qbPool(subject,n);
      if(raw.length<3){toast("مفيش أسئلة كفاية");return}
      const seed=Date.now()^(Math.random()*1e9|0);
      const qs=raw.map((it,i)=>qbShuffleQ(it, seed+i*9973));
      await updateDoc(doc(db,"qb_rooms",code),{status:"lobby",players:reset,qs,seed,idx:0,startedAt:null});
      S.qb.match=null;
      toast("الغرفة جاهزة للجولة الجاية — استنوا الجاهزية");
    }catch(e){toast("مقدرتش أعيد: "+(e.message||""))}
  },
  qbAnswer(d){qbOnAnswer(+d.i)},

  openAsms(){ensureAsmsListen();S.view="asmList";render(true)},
  
  openGallery(d){
    if(typeof ensureGalleriesListen==="function")ensureGalleriesListen();
    if(typeof ensureCommentsListen==="function")ensureCommentsListen();
    S.galleryKind=d.kind||"shilla";
    S.view="gallery";
    document.body.classList.add("gal-secure");
    render(true);
  },
  openTanagha(){
    if(typeof ensureGalleriesListen==="function")ensureGalleriesListen();
    S.view="tanagha";
    document.body.classList.add("gal-secure");
    render(true);
  },
  adminGalKind(d){S.adminGalKind=d.kind||"shilla";render(true)},
  async submitGallery(){
    if(!S.user){toast("سجّل دخول الأول");return}
    if(typeof ensureGalleriesListen==="function")ensureGalleriesListen();
    const kind=(S.isAdmin?S.adminGalKind:S.galleryKind)||"shilla";
    const title=($("#galTitle")&&$("#galTitle").value||"").trim()||"بدون وصف";
    const inp=$("#galFiles");
    const files=inp&&inp.files?[...inp.files].slice(0,1500):[];
    if(!files.length){toast("اختار صورة واحدة على الأقل");return}
    try{
      const __gv=upValidate(files,1500);if(__gv.bad.length)toast(__gv.bad.slice(0,2).join(" · "),false,4500);
      const gfiles=__gv.good;
      if(!gfiles.length){toast("مفيش صور صالحة");return}
      let lastErr=null;
      const gworker=async (f,i)=>{
        const img=await withTimeout(packImage(f,1400,0.82,620000),30000,"img");
        const payload={
          kind, title: gfiles.length>1?(title+" ("+(i+1)+")"):title,
          images:[img],
          authorUid:S.user.uid,
          authorName:(S.profile&&S.profile.name||(S.isAdmin?"أدمن":"طالب")).split(" ")[0],
          status:S.isAdmin?"approved":"pending",
          fromAdmin:!!S.isAdmin,
          pinned:false,
          hideFrom:[],
          createdAt:serverTimestamp()
        };
        try{
          const ref=await withTimeout(addDoc(collection(db,"galleries"),payload),45000,"net");
          S.galleries=(S.galleries||[]).concat([{id:ref.id,...payload,createdAt:Date.now()}]);
        }catch(err){lastErr=err;throw err}
        return {bytes:img.length};
      };
      const __gr=await upPool("gal",gfiles,3,gworker);const ok=__gr.ok;
      if(__gr.cancelled)toast("اتلغى الرفع");
      if(ok){
        if(!S.isAdmin)sendPush({type:"admin_event",event:"gallery"},"adm_gallery",60000);
        toast(S.isAdmin?("اتنشر "+ok+" ✓"):("اتبعت "+ok+" للموافقة ✓"),true);
        if($("#galTitle"))$("#galTitle").value="";
        if(inp)inp.value="";
        if(S.view==="gallery"||S.view==="tanagha"||(S.view==="admin"&&S.tab==="tanagha"))render(true);
      }else{
        const msg=(lastErr&&(lastErr.code||lastErr.message))||"";
        if(String(msg).includes("permission"))toast("مرفوض — انشر firestore.rules من Firebase");
        else if(String(msg).includes("size")||String(msg).includes("too large"))toast("الصورة كبيرة — اختار صورة أصغر");
        else toast("فشل الرفع: "+String(msg).slice(0,80));
      }
    }catch(e){
      console.error(e);
      toast("فشل الرفع: "+((e&&e.message)||"خطأ").slice(0,80));
    }
  },

  async approveGal(d){
    if(!S.isAdmin||!d.id)return;
    const g=(S.galleries||[]).find(x=>x.id===d.id);
    if(g)g.status="approved";
    if(S.view==="admin")render(true);
    try{await updateDoc(doc(db,"galleries",d.id),{status:"approved"});toast("موافق ✓",true)}
    catch(e){if(g)g.status="pending";render(true);toast("فشل الموافقة: "+(e.code||e.message||""))}
  },
  async rejectGal(d){
    if(!S.isAdmin||!d.id)return;
    try{await updateDoc(doc(db,"galleries",d.id),{status:"rejected"});
      S.galleries=(S.galleries||[]).filter(x=>x.id!==d.id);
      render(true);toast("اترفض")}catch(e){toast("فشل: "+(e.code||""))}
  },
  async delGal(d){
    if(!S.isAdmin||!d.id)return;
    if(!await uiConfirm("حذف؟"))return;
    const prev=S.galleries;S.galleries=(S.galleries||[]).filter(x=>x.id!==d.id);render(true);try{await deleteDoc(doc(db,"galleries",d.id));toast("اتحذف",true)}catch(e){S.galleries=prev;render(true);toast("فشل")}
  },
  async pinGal(d){
    if(!S.isAdmin||!d.id)return;
    const g=(S.galleries||[]).find(x=>x.id===d.id);if(!g)return;
    const next=!g.pinned;g.pinned=next;render(true);
    toast(next?"📌 تم التثبيت":"تم إلغاء التثبيت",true);
    try{await updateDoc(doc(db,"galleries",d.id),{pinned:next})}catch(e){g.pinned=!next;render(true);window.__cancel=true;toast("فشل",true)}
  },

  
  fadTab(d){S.fadTab=d.tab||"all";S.fadShow=10;render(true)},
  cancelReply(){S.commentReply=null;render(true)},
  replyComment(d){
    S.commentReply={targetType:d.type,targetId:d.id,parentId:d.parent};
    render(true);
    setTimeout(()=>{const el=document.getElementById("cmt_"+d.type+"_"+d.id);if(el)el.focus()},50);
  },
  async postComment(d){
    if(!S.user||!d.type||!d.id)return;
    if(d.type==="avatar"||d.type==="profile"){toast("مينفعش التعليق على صورة الملف الشخصي");return}
    const el=document.getElementById("cmt_"+d.type+"_"+d.id);
    const text=(el&&el.value||"").trim();
    if(!text){toast("اكتب تعليق");return}
    if(text.length>400){toast("التعليق طويل");return}
    const parent=(S.commentReply&&S.commentReply.targetId===d.id&&S.commentReply.targetType===d.type)?S.commentReply.parentId:null;
    const tempId="local_"+Date.now();
    const local={id:tempId,targetType:d.type,targetId:d.id,parentId:parent||null,uid:S.user.uid,name:(S.profile&&S.profile.name||"طالب").split(" ")[0],text,createdAt:Date.now()};
    S.comments=(S.comments||[]).concat([local]);
    if(el)el.value="";
    S.commentReply=null;
    render(true); // يظهر فورًا
    try{
      ensureCommentsListen();
      await addDoc(collection(db,"comments"),{
        targetType:d.type, targetId:d.id, parentId:parent||null,
        uid:S.user.uid, name:local.name, text, createdAt:serverTimestamp()
      });
      // السnapshot هينظف النسخة المحلية
    }catch(e){
      console.error(e);
      S.comments=(S.comments||[]).filter(c=>c.id!==tempId);
      render(true);
      toast("فشل التعليق — تأكد من نشر Rules");
    }
  },
  async delComment(d){
    if(!d.cid)return;
    const c=(S.comments||[]).find(x=>x.id===d.cid);
    if(!c)return;
    if(!S.isAdmin&&c.uid!==(S.user&&S.user.uid)){toast("مش مسموح");return}
    if(!await uiConfirm("حذف التعليق؟"))return;
    try{await deleteDoc(doc(db,"comments",d.cid));toast("اتحذف")}catch(e){toast("فشل")}
  },

  openFadaye7(){S.fadShow=10;ensureFadaye7Listen();ensureCommentsListen();S.view="fadaye7";render(true)},
  async addFadaye7(){
    if(!S.isAdmin)return;
    const title=($("#fadTitle")?.value||"").trim()||"فضيحة";
    const link=($("#fadLink")?.value||"").trim();
    const selectedFiles=[...($("#fadFile")?.files||[])].slice(0,10);
    const __v=upValidate(selectedFiles,10);const files=__v.good;if(__v.bad.length&&!selectedFiles.some(f=>/^video\//.test(f.type)))toast(__v.bad.slice(0,2).join(" · "),false,4500);
    const videosSkipped=selectedFiles.some(f=>/^video\//.test(f.type));
    if(!files.length&&!link){toast(videosSkipped?"رفع الفيديو المباشر غير متاح بدون Firebase Storage — استخدم رابط فيديو خارجي.":"ارفع صورة أو الصق رابط فيديو/صورة");return}
    if(videosSkipped)toast("تم تخطي الفيديوهات؛ استخدم رابطًا خارجيًا للفيديو لتجنب Firebase Storage.",true);
    try{
      if(!await dbServerOk()){toast("⚠️ مفيش اتصال بسيرفر التطبيق — اتأكد من الإنترنت (واي فاي/بيانات) وجرب تاني",false,4200);upSet("fad",null);return}
      const batchId="b"+Date.now();
      const base={title,status:"approved",published:true,fromAdmin:true,authorName:"الأدمن",authorUid:S.user.uid,batchId};
      let linkAdded=false;
      if(link){
        if(!/^https?:\/\//i.test(link)){toast("الرابط لازم يبدأ بـ http");return}
        const ex=await getDocs(query(collection(db,"fadaye7"),where("fp","==","u:"+link),limit(1)));
        if(!ex.empty){toast("الرابط ده منشور قبل كده ⏭️");return}
        const kind=(ytId(link)||/\.(mp4|webm|mov)(\?|$)/i.test(link)||/youtube|youtu\.be|vimeo|drive\.google/i.test(link))?"video":"image";
        await addDoc(collection(db,"fadaye7"),{...base,fp:"u:"+link,url:link,kind,createdAt:serverTimestamp()});
        linkAdded=true;
      }
      let n=0,fail=0,dup=0;
      const prog=$("#fadProg");
      const fps=await Promise.all(files.map(f=>fileFingerprint(f)));
      const seen=new Set(),dupIdx=new Set(),dupSrv=new Set();
      files.forEach((f,i)=>{const k=fps[i];if(!k)return;if(seen.has(k))dupIdx.add(i);else seen.add(k)});
      const __worker=async (f,i)=>{
        if(dupIdx.has(i))throw new Error("dup");
        const fp=fps[i];
        if(fp){
          const ex=await getDocs(query(collection(db,"fadaye7"),where("fp","==",fp),limit(1)));
          if(!ex.empty){dupSrv.add(i);throw new Error("dup")}
        }
        if(!/^image\//.test(f.type))throw new Error("skip");
        const url=await withTimeout(packImage(f,1200,0.8,600000),30000,"img");
        await withTimeout(addDoc(collection(db,"fadaye7"),{...base,seq:i,fp,url,kind:"image",createdAt:serverTimestamp()}),45000,"net");
      return {bytes:url.length}};
      const __r=await upPool("fad",files,3,__worker);
      n=__r.ok;dup=__r.dup;fail=__r.fail;if(__r.cancelled)toast("اتلغى الرفع");
      if($("#fadTitle"))$("#fadTitle").value="";
      if($("#fadFile"))$("#fadFile").value="";
      if($("#fadLink"))$("#fadLink").value="";
      if(n>0&&(S.fadLimit||60)<n+10){S.fadLimit=n+10;if(__fadUnsub){try{__fadUnsub()}catch(_){}__fadUnsub=null}try{ensureFadaye7Listen()}catch(_){}}
      if(!n){toast(dup?"مكرر — منشور قبل كده، مفيش حاجة جديدة ⏭️":(fail?"فشل رفع الملفات — جرّب تاني":"فشل النشر"))}
      else toast(fail?("اتنشرت "+n+(dup?("+ مكرر اتجاهل "+dup):"")+"، وفشلت "+fail+" ⚠️"):("اتنشرت "+n+(dup?("+ مكرر اتجاهل "+dup):"")+" ✓"),true);
    }catch(e){console.error(e);const c=e.code||"";toast(c.includes("permission")?"صلاحيات الفضائح — انشر firestore.rules من Firebase":c.includes("size")||String(e.message||"").includes("longer")?"الصورة كبيرة أوي — صغّرها":("فشل النشر: "+(c||e.message||"")))}
  },
  async dmSendLink(){
    const t=S.chatThread;if(!t)return;
    const link=await uiPrompt("الصق رابط الفيديو أو الصورة (يوتيوب / Drive / رابط مباشر):");
    if(!link||!link.trim())return;
    const u=link.trim();
    if(!/^https?:\/\//i.test(u)){toast("رابط غير صالح");return}
    try{
      const kind=(ytId(u)||/\.(mp4|webm|mov)(\?|$)/i.test(u)||/youtube|youtu\.be|vimeo/i.test(u))?"video":"image";
      await sendDm(t.uid, kind==="video"?"🎬 فيديو":"🔗 رابط", u, {kind, isLink:true});
      toast("اتبعت الرابط ✓");
    }catch(e){toast("فشل الإرسال")}
  },
  async qbSendLink(){
    const code=S.qb&&S.qb.roomCode;if(!code)return;
    const link=await uiPrompt("الصق رابط الفيديو أو الصورة:");
    if(!link||!link.trim())return;
    const u=link.trim();
    if(!/^https?:\/\//i.test(u)){toast("رابط غير صالح");return}
    try{
      const kind=(ytId(u)||/\.(mp4|webm|mov)(\?|$)/i.test(u)||/youtube|youtu\.be|vimeo/i.test(u))?"video":"image";
      await addDoc(collection(db,"qb_rooms",code,"chat"),{
        uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],
        text:kind==="video"?"🎬 فيديو":"🔗 رابط",
        img:u, kind, isLink:true,
        createdAt:serverTimestamp()
      });
      toast("اتبعت الرابط ✓");
    }catch(e){toast("فشل الإرسال")}
  },
  async delFadaye7(d){
    if(!S.isAdmin||!d.id)return;
    if(!await uiConfirm("تمسح الفضيحة دي؟"))return;
    const prev=S.fadaye7;S.fadaye7=(S.fadaye7||[]).filter(x=>x.id!==d.id);render(true);try{await deleteDoc(doc(db,"fadaye7",d.id));toast("اتمسحت",true)}catch(e){S.fadaye7=prev;render(true);toast("فشل الحذف")}
  },
  async fadDedupe(){
    if(!S.isAdmin)return;
    const list=S.fadaye7All||S.fadaye7||[];
    const keep={};
    list.forEach(f=>{const k=f.fp||f.url;if(!k)return;if(!keep[k]||tsMs(f.createdAt)>tsMs(keep[k].createdAt))keep[k]=f});
    const dups=list.filter(f=>{const k=f.fp||f.url;return k&&keep[k]&&f.id!==keep[k].id});
    if(!dups.length){toast("مفيش مكرر في اللي محمّل 🎉",true);return}
    if(!await uiConfirm("تمام — حذف "+dups.length+" منشور مكرر؟"))return;
    let ok=0,bad=0;
    for(const d of dups){try{await deleteDoc(doc(db,"fadaye7",d.id));ok++}catch(e){bad++}}
    toast(bad?("اتحذف "+ok+"، وفشل "+bad+" ⚠️"):("اتحذف "+ok+" منشور مكرر ✓"),!bad);
  },
  async submitFadaye7(){
    if(!S.user||S.isAdmin)return;
    const title=($("#stuFadTitle")?.value||"").trim()||"فضيحة";
    const link=($("#stuFadLink")?.value||"").trim();
    const selectedFiles=[...($("#stuFadFile")?.files||[])].slice(0,10);
    const __v=upValidate(selectedFiles,10);const files=__v.good;if(__v.bad.length&&!selectedFiles.some(f=>/^video\//.test(f.type)))toast(__v.bad.slice(0,2).join(" · "),false,4500);
    const videosSkipped=selectedFiles.some(f=>/^video\//.test(f.type));
    if(!files.length&&!link){toast(videosSkipped?"رفع الفيديو المباشر غير متاح بدون Firebase Storage — استخدم رابط فيديو خارجي.":"ارفع صورة أو الصق رابط");return}
    if(videosSkipped)toast("تم تخطي الفيديوهات؛ استخدم رابطًا خارجيًا للفيديو لتجنب Firebase Storage.",true);
    try{
      if(!await dbServerOk()){toast("⚠️ مفيش اتصال بسيرفر التطبيق — اتأكد من الإنترنت (واي فاي/بيانات) وجرب تاني",false,4200);upSet("stu",null);return}
      const batchId="b"+Date.now();
      const base={title,status:"approved",published:true,fromAdmin:false,authorUid:S.user.uid,authorName:S.profile.name||"طالب",batchId};
      let linkAdded=false;
      if(link){
        if(!/^https?:\/\//i.test(link)){toast("رابط غير صالح");return}
        const ex=await getDocs(query(collection(db,"fadaye7"),where("fp","==","u:"+link),limit(1)));
        if(!ex.empty){toast("الرابط ده منشور قبل كده ⏭️");return}
        const kind=(ytId(link)||/\.(mp4|webm|mov)(\?|$)/i.test(link)||/youtube|youtu\.be/i.test(link))?"video":"image";
        await addDoc(collection(db,"fadaye7"),{...base,fp:"u:"+link,url:link,kind,createdAt:serverTimestamp()});
        linkAdded=true;
      }
      let n=0,fail=0,dup=0;
      const prog=$("#stuFadProg");
      const fps=await Promise.all(files.map(f=>fileFingerprint(f)));
      const seen=new Set(),dupIdx=new Set(),dupSrv=new Set();
      files.forEach((f,i)=>{const k=fps[i];if(!k)return;if(seen.has(k))dupIdx.add(i);else seen.add(k)});
      const __worker=async (f,i)=>{
        if(dupIdx.has(i))throw new Error("dup");
        const fp=fps[i];
        if(fp){
          const ex=await getDocs(query(collection(db,"fadaye7"),where("fp","==",fp),limit(1)));
          if(!ex.empty){dupSrv.add(i);throw new Error("dup")}
        }
        if(!/^image\//.test(f.type))throw new Error("skip");
        const url=await withTimeout(packImage(f,1200,0.8,600000),30000,"img");
        await withTimeout(addDoc(collection(db,"fadaye7"),{...base,seq:i,fp,url,kind:"image",createdAt:serverTimestamp()}),45000,"net");
      return {bytes:url.length}};
      const __r=await upPool("stu",files,3,__worker);
      n=__r.ok;dup=__r.dup;fail=__r.fail;if(__r.cancelled)toast("اتلغى الرفع");
      if(n>0)sendPush({type:"admin_event",event:"fadaye7"},"adm_fad",60000);
      if(n>0&&(S.fadLimit||60)<n+10){S.fadLimit=n+10;if(__fadUnsub){try{__fadUnsub()}catch(_){}__fadUnsub=null}try{ensureFadaye7Listen()}catch(_){}}
      if(!n&&linkAdded)toast("تم نشر الرابط ✓",true);
      else if(!n){toast(dup?"مكرر — منشور قبل كده، مفيش حاجة جديدة ⏭️":(fail?"فشل رفع الملفات — جرّب تاني":"فشل النشر"))}
      else toast(fail?("اتنشرت "+n+(dup?("+ مكرر اتجاهل "+dup):"")+"، وفشلت "+fail+" ⚠️"):("اتنشرت "+n+(dup?("+ مكرر اتجاهل "+dup):"")+" ✓"),true);
      if($("#stuFadTitle"))$("#stuFadTitle").value="";
      if($("#stuFadFile"))$("#stuFadFile").value="";
      if($("#stuFadLink"))$("#stuFadLink").value="";
    }catch(e){console.error(e);toast((e.code||"").includes("permission")?"انشر firestore.rules الجديدة من Firebase":"فشل النشر")}
  },
  async delMyFadaye7(d){
    toast("الحذف للأدمن فقط");
  },
  async toggleSecHide(d){
    if(!S.isAdmin||!d.uid||!d.sec)return;
    try{
      await updateDoc(doc(db,"students",d.uid),{hiddenSections:d.on==="1"?arrayUnion(d.sec):arrayRemove(d.sec)});
      toast(d.on==="1"?"اتخفى عنه ✓":"اترجع له ✓",true);
    }catch(e){console.error(e);toast("فشل — انشر firestore.rules")}
  },
  async approveFadaye7(d){
    if(!S.isAdmin||!d.id)return;
    const f=(S.fadaye7||[]).find(x=>x.id===d.id);const prev=f&&{status:f.status,published:f.published};
    if(f){f.status="approved";f.published=true}
    render(true);toast("✅ تمت الموافقة والنشر",true);
    try{await updateDoc(doc(db,"fadaye7",d.id),{status:"approved",published:true,approvedAt:serverTimestamp()})}
    catch(e){if(f&&prev)Object.assign(f,prev);render(true);window.__cancel=true;toast("فشل",true)}
  },
  async rejectFadaye7(d){
    if(!S.isAdmin||!d.id)return;
    const f=(S.fadaye7||[]).find(x=>x.id===d.id);const prev=f&&{status:f.status,published:f.published};
    if(f){f.status="rejected";f.published=false}
    render(true);toast("⛔ تم الرفض",true);
    try{await updateDoc(doc(db,"fadaye7",d.id),{status:"rejected",published:false})}
    catch(e){if(f&&prev)Object.assign(f,prev);render(true);window.__cancel=true;toast("فشل",true)}
  },
  openFadHide(d){
    if(!S.isAdmin||!d.id)return;
    S.fadHideEdit=d.id;
    // حالة محلية للتعديل قبل الحفظ
    const f=(S.fadaye7||[]).find(x=>x.id===d.id);
    S.fadHideDraft=new Set(f&&f.hideFrom?f.hideFrom:[]);
    render();
  },
  closeFadHide(){S.fadHideEdit=null;S.fadHideDraft=null;render()},
  fadToggleStu(d,el){
    if(!S.fadHideDraft)S.fadHideDraft=new Set();
    const uid=d.uid;if(!uid)return;
    const checked=el?el.checked:false;
    if(checked)S.fadHideDraft.delete(uid);
    else S.fadHideDraft.add(uid);
  },
  fadHideNone(d){
    S.fadHideDraft=new Set();
    document.querySelectorAll(`input[data-change="fadToggleStu"][data-id="${d.id}"]`).forEach(el=>{el.checked=true});
  },
  fadHideAll(d){
    S.fadHideDraft=new Set((S.students||[]).map(s=>s.id));
    document.querySelectorAll(`input[data-change="fadToggleStu"][data-id="${d.id}"]`).forEach(el=>{el.checked=false});
  },
  async saveFadHide(d){
    if(!S.isAdmin||!d.id)return;
    try{
      const hideFrom=[...(S.fadHideDraft||[])];
      const hideNames={};
      (S.students||[]).forEach(s=>{if(hideFrom.includes(s.id))hideNames[s.id]=s.name||s.phone||""});
      await updateDoc(doc(db,"fadaye7",d.id),{hideFrom,hideNames});
      S.fadHideEdit=null;S.fadHideDraft=null;
      toast(hideFrom.length?("مخفية عن "+hideFrom.length+" طالب ✓"):"ظاهرة للجميع ✓",true);
    }catch(e){console.error(e);toast("فشل الحفظ — انشر firestore.rules")}
  },

  async dmVoice(){
    if(!S.chatThread)return;
    await recordVoice(async(dataUrl)=>{
      await sendDm(S.chatThread.uid,"🎙 رسالة صوتية",dataUrl,{kind:"audio"});
      toast("اتبعت التسجيل ✓");
    });
  },
  async qbVoice(){
    if(!S.qb||!S.qb.roomCode)return;
    await recordVoice(async(dataUrl)=>{
      await addDoc(collection(db,"qb_rooms",S.qb.roomCode,"chat"),{
        uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],
        text:"🎙 رسالة صوتية",img:dataUrl,kind:"audio",createdAt:serverTimestamp()
      });
      toast("اتبعت التسجيل ✓");
    });
  },
  openGroups(){S.view="chatList";S.chatTab="groups";loadMyGroups();render(true)},
  async createGroup(){
    const name=await uiPrompt("اسم الجروب:");
    if(!name||!name.trim())return;
    try{
      const ref=await addDoc(collection(db,"groups"),{
        name:name.trim(),owner:S.user.uid,ownerName:S.profile.name||"طالب",
        members:[S.user.uid],memberNames:{[S.user.uid]:S.profile.name||"طالب"},
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      toast("اتعمل الجروب ✓");
      S.view="groupThread";S.groupId=ref.id;S.groupName=name.trim();
      S.chatStickBottom=true;S.groupMsgs=[];
      listenGroup(ref.id);render(true);
      setTimeout(()=>scrollChatBottom(true),100);
    }catch(e){console.error(e);toast("فشل الجروب: "+(e.code||e.message||"انشر rules الجديدة"))}
  },
  addToGroup(){
    if(!S.groupId)return;
    S.grpAddOpen=true;S.grpAddQ="";S.grpAddHits=[];
    render(true);
  },
  async searchGrpAdd(){
    const q=($("#grpAddQ")?.value||"").trim();
    S.grpAddQ=q;
    if(q.length<2){S.grpAddHits=[];render();return}
    try{
      const sn=await getDocs(query(collection(db,"publicProfiles"),limit(200)));
      const ql=q.toLowerCase();
      // لو مش حافظين الأعضاء نجيب الجروب
      try{
        const g=await getDoc(doc(db,"groups",S.groupId));
        if(g.exists())S.groupMembers=g.data().members||[];
      }catch(_){}
      const mem=new Set(S.groupMembers||[]);
      S.grpAddHits=sn.docs.map(d=>({id:d.id,...d.data()}))
        .filter(s=>s.id!==S.user.uid && !mem.has(s.id) && (s.name||"").toLowerCase().includes(ql))
        .slice(0,20);
      render();
    }catch(e){toast("فشل البحث")}
  },
  async pickGrpAdd(d){
    if(!S.groupId||!d.uid)return;
    try{
      const g=await getDoc(doc(db,"groups",S.groupId));
      if(!g.exists())return;
      if(g.data().owner!==S.user.uid){toast("مالك الجروب فقط يقدر يضيف أعضاء");return}
      const members=[...(g.data().members||[])];
      if(members.includes(d.uid)){toast("موجود بالفعل");return}
      members.push(d.uid);
      const memberNames={...(g.data().memberNames||{}),[d.uid]:d.name||"طالب"};
      await updateDoc(doc(db,"groups",S.groupId),{members,memberNames,updatedAt:serverTimestamp()});
      S.groupMembers=members;
      S.grpAddHits=(S.grpAddHits||[]).filter(x=>x.id!==d.uid);
      toast("اتضاف "+(d.name||"")+" ✓",true);
      render();
    }catch(e){toast("فشل الإضافة")}
  },
  closeGrpAdd(){S.grpAddOpen=false;S.grpAddHits=[];render()},

  async groupSend(){
    const inp=$("#grpIn");const text=(inp&&inp.value||"").trim();
    if(!text||!S.groupId)return;
    if(inp)inp.value="";
    // تفاؤل: أظهر الرسالة فورًا
    const local={id:"local_"+Date.now(),fromUid:S.user.uid,fromName:(S.profile.name||"طالب").split(" ")[0],text,createdAt:{seconds:Date.now()/1000},_local:true};
    S.groupMsgs=(S.groupMsgs||[]).concat([local]);
    S.chatStickBottom=true;
    if(S.view==="groupThread"){
      const log=$("#grpLog");
      if(log)patchChatLog(log,S.groupMsgs,grpBubbleHtml,EMPTY_GRP);else render();
      scrollChatBottom(true);
    }
    try{
      try{
        const g=(S.groups||[]).find(x=>x.id===S.groupId);
        const to=((g&&g.members)||[]).filter(u=>u!==S.user.uid);
        if(to.length)sendPush({type:"group",toUids:to,groupId:S.groupId,groupName:S.groupName||"جروب",text},"grp_"+S.groupId,15000);
      }catch(_){}
      await Promise.all([
        addDoc(collection(db,"groups",S.groupId,"msgs"),{
          fromUid:S.user.uid,fromName:(S.profile.name||"طالب").split(" ")[0],
          text,createdAt:serverTimestamp()
        }),
        updateDoc(doc(db,"groups",S.groupId),{lastText:text.slice(0,80),updatedAt:serverTimestamp()})
      ]);
    }catch(e){
      console.error(e);
      toast(String(e.code||"").includes("permission")?"صلاحيات الجروب — انشر rules":"فشل الإرسال");
    }
  },
  async groupVoice(){
    if(!S.groupId)return;
    await recordVoice(async(dataUrl)=>{
      await addDoc(collection(db,"groups",S.groupId,"msgs"),{
        fromUid:S.user.uid,fromName:(S.profile.name||"طالب").split(" ")[0],
        text:"🎙",img:dataUrl,kind:"audio",createdAt:serverTimestamp()
      });
      toast("اتبعت ✓");
    });
  },
  openGroup(d){
    S.groupId=d.id;S.groupName=d.name||"جروب";
    S.chatStickBottom=true;S.chatNewBelow=0;S.groupMsgs=[];
    S.view="groupThread";listenGroup(d.id);render(true);
    setTimeout(()=>scrollChatBottom(true),100);
  },
  qbInviteFromLobby(){
    if(!S.qb)return;
    S.qb.inviteOpen=!S.qb.inviteOpen;
    S.inviteHits=S.inviteHits||[];
    render();
  },
  async searchInviteFriend(){
    const q=($("#inviteFriendQ")?.value||"").trim();
    S.inviteQ=q;
    if(q.length<2){toast("اكتب حرفين على الأقل");return}
    try{
      const sn=await getDocs(query(collection(db,"publicProfiles"),limit(200)));
      const ql=q.toLowerCase();
      S.inviteHits=sn.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.id!==S.user.uid&&(s.name||"").toLowerCase().includes(ql)).slice(0,12);
      render();
    }catch(e){toast("فشل البحث")}
  },
  async inviteRoomFriend(d){
    const code=S.qb&&S.qb.roomCode;if(!code){toast("مفيش غرفة");return}
    const uid=d.uid;if(!uid)return;
    try{
      await sendDm(uid,`🎮 انضم لغرفتي «${code}» — دوس الزر تحت`,null,{roomCode:code,roomInvite:true});
      toast("اتبعتت الدعوة لـ "+(d.name||"صاحبك")+" ✓",true);
    }catch(e){toast("مقدرتش أبعت الدعوة")}
  },
  async qbJoinInvite(d){
    const code=(d.code||"").trim().toUpperCase();
    if(code.length<4){toast("كود غلط");return}
    try{
      const snap=await getDoc(doc(db,"qb_rooms",code));
      if(!snap.exists()){toast("الغرفة اتقفلت أو الكود غلط");return}
      const room=snap.data();
      if(room.status==="playing"&&!(room.players||{})[S.user.uid]){
        toast("المباراة شغالة — استنى تخلص");return;
      }
      if(Object.keys(room.players||{}).length>=(room.maxPlayers||8) && !(room.players||{})[S.user.uid]){
        toast("الغرفة ممتلئة");return;
      }
      if(!(room.players||{})[S.user.uid]){
        const av=await packTinyAvatar(S.profile&&S.profile.avatar);
        await updateDoc(doc(db,"qb_rooms",code),{
          [`players.${S.user.uid}`]:{uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],ready:false,score:0,correct:0,wrong:0,streak:0,bestStreak:0,away:false,seen:Date.now(),avatar:av||null,invited:true}
        });
      }
      S.qb={mode:"friends",roomCode:code,room:{...room,code}};
      qbListenRoom(code);
      logActivity("qb_join_invite",code);
      S.view="qbLobby";render(true);
      toast("دخلت الغرفة ✓",true);
    }catch(e){toast("مقدرتش أدخل: "+(e.code||e.message||""))}
  },
  openAsm(d){ensureAsmsListen();S.asm={id:d.id,loading:true,q:[],s:[],solText:""};S.view="asm";render(true);loadAsm(d.id)},
  zoom(d,el){
    const o=document.createElement("div");o.className="lb";
    o.innerHTML=`<button class="btn sm" type="button">إغلاق ✕</button><img src="${el.src}" alt="">`;
    o.onclick=()=>o.remove();document.body.appendChild(o);
    const zu=el.dataset&&el.dataset.uid;
    if(zu){getDoc(doc(db,"avatars",zu)).then(sn=>{if(sn.exists()&&sn.data().data){const im=o.querySelector("img");if(im)im.src=sn.data().data}}).catch(()=>{})}
  },
  async adminMigrateAvatars(){
    if(!S.isAdmin)return;
    const list=(S.students||[]).filter(x=>x.avatar&&String(x.avatar).length>30000);
    if(!list.length){toast("كل الصور متحسّنة ✓",true);return}
    if(!await uiConfirm("هتتحسّن صور "+list.length+" طالب (بتفضل زي ما هي عند الضغط على الصورة). تكمل؟"))return;
    let ok=0;
    for(const x of list){try{if(await migrateAvatar(x.id,x.avatar))ok++}catch(_){}}
    toast("اتحسّنت "+ok+" من "+list.length+" صورة ✓",true);
  },
  async dlpdf(d,el){
    el.disabled=true;toast("جاري تجهيز الملف…");
    try{
      const sn=await getDocs(query(collection(db,"assessments",d.aid,"chunks"),where("part","==",d.part),where("gid","==",d.gid)));
      const b64=sn.docs.map(x=>x.data()).sort((p,q)=>p.seq-q.seq).map(x=>x.data).join("");
      if(!b64)throw new Error("empty");
      const blob=await (await fetch("data:application/pdf;base64,"+b64)).blob();
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(d.name||"file").replace(/\.pdf$/i,"")+".pdf";a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    }catch(e){toast("مقدرتش أحمّل الملف. جرّب تاني.")}
    el.disabled=false;
  },
  newAsm(){S.editingAsm={id:null,asm:null,q:[],s:[],solText:"",solId:null,rm:[]};S.view="editAsm";render(true)},
  async editAsm(d){
    const a=S.asms.find(q=>q.id===d.id);if(!a)return;
    try{
      const sn=await getDocs(collection(db,"assessments",d.id,"files"));
      const all=sn.docs.map(x=>({id:x.id,...x.data()}));
      const t=all.find(f=>f.kind==="text"&&f.part==="s");
      S.editingAsm={id:d.id,asm:a,q:all.filter(f=>f.part==="q"&&isFile(f)).sort(byOrder),s:all.filter(f=>f.part==="s"&&isFile(f)).sort(byOrder),solText:t?t.text:"",solId:t?t.id:null,rm:[]};
    }catch(e){toast("مقدرتش أحمّل ملفات التقييم");return}
    S.view="editAsm";render(true);
  },
  cancelAsm(){S.view=S.isAdmin?"admin":"asmAdmin";render(true)},
  delFile(d){
    const e=S.editingAsm,arr=e[d.part],i=arr.findIndex(f=>String(f.id)===d.id);if(i<0)return;
    const f=arr[i];if(!f.pend)e.rm.push({id:f.id,gid:f.gid,kind:f.kind,part:d.part});
    arr.splice(i,1);$("#qlist").innerHTML=fileList(e.q,"q");$("#slist").innerHTML=fileList(e.s,"s");
  },
  async saveAsm(){
    const e=S.editingAsm,title=$("#atitle").value.trim();
    if(!title){toast("اكتب اسم التقييم");return}
    const link=$("#alink").value.trim();if(link&&!okUrl(link)){toast("الرابط لازم يبدأ بـ https://");return}
    const solText=$("#asol").value.trim();
    const data={title,subject:$("#asub").value,desc:$("#adesc").value,link,published:$("#apub").checked,showSolution:$("#ashow").checked,qn:e.q.length,sn:e.s.length};
    const b=$("#sva");b.disabled=true;b.textContent="جاري الحفظ والرفع… متقفلش الصفحة";
    try{
      let id=e.id;
      if(id)await updateDoc(doc(db,"assessments",id),data);
      else{const r=await addDoc(collection(db,"assessments"),{...data,createdAt:serverTimestamp()});id=r.id}
      for(const r of e.rm){if(r.kind==="pdf")await wipeFiles(id,r.part,r.gid);await deleteDoc(doc(db,"assessments",id,"files",r.id))}
      let k=0;
      for(const part of ["q","s"])for(const f of e[part]){
        if(!f.pend)continue;
        const order=Date.now()+(k++);
        if(f.kind==="image")await addDoc(collection(db,"assessments",id,"files"),{part,kind:"image",name:f.name,order,data:f.data,createdAt:serverTimestamp()});
        else{
          const CH=700000;let n=0;
          for(let i=0;i<f.b64.length;i+=CH,n++)await addDoc(collection(db,"assessments",id,"chunks"),{part,gid:f.gid,seq:n,data:f.b64.slice(i,i+CH),createdAt:serverTimestamp()});
          await addDoc(collection(db,"assessments",id,"files"),{part,kind:"pdf",name:f.name,order,gid:f.gid,n,createdAt:serverTimestamp()});
        }
      }
      if(solText){if(e.solId)await updateDoc(doc(db,"assessments",id,"files",e.solId),{text:solText});else await addDoc(collection(db,"assessments",id,"files"),{part:"s",kind:"text",text:solText,createdAt:serverTimestamp()})}
      else if(e.solId)await deleteDoc(doc(db,"assessments",id,"files",e.solId));
      S.view=S.isAdmin?"admin":"asmAdmin";S.tab="asm";render(true);toast("اتحفظ التقييم");
    }catch(err){b.disabled=false;b.textContent="حفظ التقييم";toast("مقدرتش أحفظ. اتأكد من النت ومن إن الـ Rules الجديدة اتنشرت.")}
  },
  async toggleAsm(d){
    const a=S.asms.find(q=>q.id===d.id);if(!a)return;
    const next=!a.published;a.published=next;render(true);
    toast(next?"✅ تم الإظهار — التقييم ظاهر للطلاب":"🙈 تم الإخفاء — التقييم مخفي عن الطلاب",true);
    try{await updateDoc(doc(db,"assessments",d.id),{published:next})}catch(err){a.published=!next;render(true);window.__cancel=true;toast("فشل التغيير",true)}
  },
  async toggleSol(d){
    const a=S.asms.find(q=>q.id===d.id);if(!a)return;
    const next=!a.showSolution;a.showSolution=next;render(true);
    toast(next?"✅ تم إنزال الحل للطلاب":"🔒 تم قفل الحل",true);
    try{await updateDoc(doc(db,"assessments",d.id),{showSolution:next})}catch(err){a.showSolution=!next;render(true);window.__cancel=true;toast("فشل التغيير",true)}
  },
  async delAsm(d){
    if(!await uiConfirm("تمسح التقييم ده بكل ملفاته؟ مفيش رجوع."))return;
    try{
      for(const c of ["files","chunks"]){const sn=await getDocs(collection(db,"assessments",d.id,c));for(const x of sn.docs)await deleteDoc(x.ref)}
      await deleteDoc(doc(db,"assessments",d.id));toast("اتمسح التقييم");
    }catch(e){toast("مقدرتش أمسح")}
  },
  async saveNote(d){try{await updateDoc(doc(db,"students",d.id),{note:$("#note").value.trim()});toast("اتحفظت الملاحظة")}catch(e){toast("مقدرتش أحفظ")}},
  async adminGenReset(d){
    const until=Date.now()+24*3600*1000;
    try{
      const rand=new Uint32Array(1);crypto.getRandomValues(rand);
      const code=String(100000+(rand[0]%900000));
      await updateDoc(doc(db,"students",d.id),{pwResetCode:code,pwResetUntil:until});
      toast("الكود: "+code+" (صالح 24 ساعة)");
      // refresh local
      const st=S.students.find(x=>x.id===d.id);if(st){st.pwResetCode=code;st.pwResetUntil=until}
      if(S.view==="studentDetail")scheduleRender();
    }catch(e){toast("فشل توليد الكود")}
  },
  async adminClearReset(d){
    try{
      await updateDoc(doc(db,"students",d.id),{pwResetCode:deleteField(),pwResetUntil:deleteField()});
      const st=S.students.find(x=>x.id===d.id);if(st){delete st.pwResetCode;delete st.pwResetUntil}
      toast("اتمسح الكود");if(S.view==="studentDetail")scheduleRender();
    }catch(e){toast("فشل")}
  },
  backAdmin(){S.view="admin";render(true)},
  async start(d){
    if(S.site&&S.site.maintenance&&!S.isAdmin){toast("المنصة تحت الصيانة");return}
    const e=S.exams.find(x=>x.id===d.id),at=S.attempts[d.id]||[];
    if(!e||!vis(e))return;
    if(isBlockedP(S.profile)){toast("حسابك موقوف");return}
    if(at.length>=MAX_ATTEMPTS){toast("خلصت محاولاتك على الامتحان ده");return}
    const n=at.length+1,sid=`${S.user.uid}_${e.id}_${n}`;
    let st;
    try{
      const g=await getDoc(doc(db,"starts",sid));
      if(g.exists())st=g.data();
      else{st={uid:S.user.uid,examId:e.id,n,t:Date.now(),seed:Math.floor(Math.random()*2147483647),name:S.profile.name,phone:S.profile.phone,examTitle:e.title,total:gcount(e),answered:0,away:false,seen:Date.now(),device:device(),ip:myIp||""};await setDoc(doc(db,"starts",sid),st)}
    }catch(err){toast("مقدرتش أبدأ الامتحان. اتأكد من النت وجرّب تاني.");return}
    const endAt=e.minutes?st.t+e.minutes*60000:0;
    S.cur={exam:e,n,sid,st,endAt,done:false,busy:false,away:false,tabs:0,answered:0,order:buildOrder(e,st.seed)};
    persistExamSession(S.cur);
    logActivity("exam_start", (e.title||"")+" · محاولة "+n);
    S.view="exam";render(true);
    setTimeout(loadExamDraft, 50);
    clearInterval(timer);clearInterval(hb);
    hb=setInterval(()=>liveUpdate({answered:S.cur?S.cur.answered:0,away:S.cur?S.cur.away:false}),60000);
    liveUpdate({away:false});
    if(endAt){tick();timer=setInterval(tick,1000)}
    if(endAt&&Date.now()>=endAt){toast("وقت الامتحان كان خلص.");submitExam(true)}
  },
  submit(){submitExam(false)},
  tab(d){
    S.tab=d.id;
    if(d.id==="results")S.unread=0;
    if(d.id==="alerts")S.unreadAlerts=0;
    if(d.id==="suspicious"){S.unreadSuspicious=0;(S.suspicious||[]).forEach(x=>{if(!x.seen&&x.id)updateDoc(doc(db,"suspicious",x.id),{seen:true}).catch(()=>{})});}
    // lazy: حمّل بيانات التبويب عند فتحه فقط
    if(d.id==="tanagha"&&typeof ensureGalleriesListen==="function")ensureGalleriesListen();
    if(d.id==="fadaye7"&&typeof ensureFadaye7Listen==="function")ensureFadaye7Listen();
    if(d.id==="books"&&typeof ensureBooksListen==="function")ensureBooksListen();
    if(d.id==="security")ensureAuditListen();
    if((d.id==="asms"||d.id==="assessments")&&typeof ensureAsmsListen==="function")ensureAsmsListen();
    updTitle();render(true)
  },
  filter(d,el){S.filter=el.value;render()},
  newExam(){S.editing={id:null,exam:null};S.view="editExam";render(true)},
  editExam(d){S.editing={id:d.id,exam:S.exams.find(e=>e.id===d.id)};S.view="editExam";render(true)},
  cancelEdit(){S.view="admin";render(true)},
  sample(){$("#qtext").value=SAMPLE;checkQs()},
  insMcq(){
    const t=$("#qtext");if(!t)return;
    const block="\n\nالسؤال هنا؟\nأ) اختيار 1\nب) اختيار 2\nج) اختيار 3\nد) اختيار 4\nالإجابة: ب";
    t.value=(t.value.trim()?t.value.trim()+"\n":"")+block.trim()+"\n";
    t.focus();checkQs();toast("اتضاف قالب اختياري");
  },
  insEssay(){
    const t=$("#qtext");if(!t)return;
    const block="\n\nاكتب السؤال المقالي هنا\n[مقالي]\nالحل: اكتب الحل النموذجي هنا";
    t.value=(t.value.trim()?t.value.trim()+"\n":"")+block.trim()+"\n";
    t.focus();checkQs();toast("اتضاف قالب مقالي");
  },
  insMath(){
    const t=$("#qtext");if(!t)return;
    const block="\n\nأوجد قيمة س إذا كان 2س + 6 = 14\n[مقالي]\nالحل: 2س + 6 = 14\n2س = 8\nس = 4\n|||\nس = (14 - 6) / 2 = 4\n|||\nالناتج: 4";
    t.value=(t.value.trim()?t.value.trim()+"\n":"")+block.trim()+"\n";
    t.focus();checkQs();toast("اتضاف قالب رياضي بحلول متعددة");
  },
  previewQs(){
    const box=$("#qpreview");if(!box)return;
    const {qs,errors}=parseQs($("#qtext").value);
    if(!qs.length){box.style.display="block";box.innerHTML=`<div class="err">مفيش أسئلة للمعاينة${errors[0]?" · "+esc(errors[0]):""}</div>`;return}
    box.style.display="block";
    box.innerHTML=`<div class="card" style="background:var(--sel)"><b>معاينة (${qs.length} سؤال)</b>${errors.length?`<div class="err" style="margin-top:6px">${esc(errors[0])}</div>`:""}</div>`+
      qs.map((q,i)=>{
        if(q.essay) return `<div class="q"><p dir="auto"><span class="n">${i+1}</span>${esc(q.q)} ${pill("مقالي","i")}</p><textarea disabled placeholder="مكان إجابة الطالب" style="min-height:70px"></textarea><div class="mut" style="margin-top:4px">الحل: ${esc((q.model||"").slice(0,120))}${(q.model||"").length>120?"…":""}</div></div>`;
        return `<div class="q"><p dir="auto"><span class="n">${i+1}</span>${esc(q.q)}</p>${(q.o||[]).map((t,j)=>`<div class="opt"><span dir="auto">${LETTERS[j]}) ${esc(t)}${j===q.a?` <b class="tk">✓</b>`:""}</span></div>`).join("")}</div>`;
      }).join("");
    toast("المعاينة جاهزة");
  },
  async setEssayScore(d){
    if(!S.isAdmin||!S.review||!S.review.r)return;
    const r=S.review.r, idx=+d.i, raw=await uiPrompt("درجة السؤال من 0 إلى 1 (مثال 0.75):", d.cur||"1");
    if(raw==null)return;
    const v=Math.max(0,Math.min(1,parseFloat(raw)));
    if(isNaN(v)){toast("رقم غير صالح");return}
    try{
      const e=S.exams.find(x=>x.id===r.examId);
      if(!e){toast("الامتحان مش موجود");return}
      // recompute total with override
      const overrides={...(r.essayOverrides||{}),[idx]:v};
      let scoreRaw=0;
      e.questions.forEach((q,i)=>{
        if(q.fun)return;
        if(q.essay){
          if(overrides[i]!=null) scoreRaw+=overrides[i];
          else scoreRaw+=essayScore((r.ans||[])[i], q.model);
        } else if((r.ans||[])[i]===q.a) scoreRaw+=1;
      });
      const score=Math.round(scoreRaw*100)/100;
      const passed=r.passMark>0?score>=r.passMark:null;
      await updateDoc(doc(db,"results",r.id),{score,passed,essayOverrides:overrides});
      r.score=score;r.passed=passed;r.essayOverrides=overrides;
      render(true);toast("اتعدّلت الدرجة → "+score+"/"+r.total);
    }catch(err){toast("مقدرتش أعدّل: "+(err.code||err.message||""))}
  },
  async saveExam(){
    if(!S.isAdmin){toast("غير مسموح");return}
    const qEl=$("#qtext");if(!qEl){toast("تعذّر قراءة نموذج الامتحان");return}
    const {qs,errors}=parseQs(qEl.value);
    if(errors.length||!qs.length){toast(errors[0]||"اكتب سؤال واحد على الأقل");return}
    const at=$("#eat").value?new Date($("#eat").value).getTime():null;
    const data={subject:$("#esub").value,title:$("#etitle").value.trim(),publishAt:at,minutes:Math.max(0,+$("#emin").value||0),passMark:Math.max(0,+$("#epass").value||0),shuffle:$("#eshuf").checked,published:$("#epub").checked,showAnswers:$("#eshow").checked,questions:qs};
    if(!data.title){toast("اكتب اسم الامتحان");return}
    if(data.passMark>qs.filter(q=>!q.fun).length){toast("درجة النجاح أكبر من عدد الأسئلة");return}
    $("#sv").disabled=true;
    try{
      const __was=S.editing.id?!!((S.exams||[]).find(x=>x.id===S.editing.id)||{}).published:false;
      if(S.editing.id)await updateDoc(doc(db,"exams",S.editing.id),data);
      else await addDoc(collection(db,"exams"),{...data,createdAt:serverTimestamp()});
      if(data.published&&!__was&&!data.publishAt)sendPush({type:"broadcast",title:"📝 امتحان جديد",body:data.title});
      S.view="admin";S.tab="exams";render(true);toast("اتحفظ الامتحان");
    }catch(e){$("#sv").disabled=false;toast("مقدرتش أحفظ. اتأكد من الاتصال والـ rules.")}
  },
  async togglePub(d){
    if(!S.isAdmin)return;
    const e=S.exams.find(x=>x.id===d.id);if(!e)return;
    const next=!e.published;e.published=next;
    render(true);
    toast(next?"✅ تم الإظهار — الامتحان ظاهر للطلاب":"🙈 تم الإخفاء — الامتحان مخفي عن الطلاب",true);
    try{await updateDoc(doc(db,"exams",d.id),{published:next});if(next&&!e.publishAt)sendPush({type:"broadcast",title:"📝 امتحان جديد",body:e.title||""})}
    catch(err){e.published=!next;render(true);window.__cancel=true;toast("فشل التغيير — اتأكد من الإنترنت",true)}
  },
  async delExam(d){
    if(!S.isAdmin)return;
    if(!await uiConfirm("تمسح الامتحان ده؟ مش هتقدر ترجعه."))return;
    const prev=S.exams;S.exams=S.exams.filter(x=>x.id!==d.id);render(true);toast("🗑 تم مسح الامتحان",true);
    try{await deleteDoc(doc(db,"exams",d.id))}catch(err){S.exams=prev;render(true);window.__cancel=true;toast("فشل المسح",true)}
  },
  async delResult(d){
    if(!S.isAdmin)return;
    if(!await uiConfirm("تمسح المحاولة دي؟ الطالب هيرجعله محاولة."))return;
    const prev=S.results;S.results=(S.results||[]).filter(x=>x.id!==d.id);render(true);toast("🗑 تم مسح المحاولة",true);
    try{await deleteDoc(doc(db,"results",d.id))}catch(err){S.results=prev;render(true);window.__cancel=true;toast("فشل المسح",true)}
  },
  async xlsx(){
    if(!S.isAdmin)return;
    toast("جاري تجهيز ملف Excel…");
    try{
      if(!window.XLSX){
        await new Promise((ok,no)=>{const sc=document.createElement("script");sc.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";sc.onload=ok;sc.onerror=()=>no(new Error("lib"));document.head.appendChild(sc)});
      }
      let rows;
      try{
        const sn=await getDocs(S.filter?query(collection(db,"results"),where("examId","==",S.filter)):collection(db,"results"));
        rows=sn.docs.map(d=>({id:d.id,...d.data()}));
      }catch(e){rows=(Array.isArray(S.results)?S.results:[]).filter(r=>!S.filter||r.examId===S.filter)}
      rows.sort((a,b)=>tms(b)-tms(a));
      const passTxt=r=>r.passMark>0?(r.passed?"ناجح":"راسب"):"";
      const sheet1=rows.map(r=>({"الاسم":r.name||"","التليفون":r.phone||"","المادة":subName(r.subject)||"","الامتحان":r.examTitle||"","المحاولة":r.attempt||1,"الدرجة":Number(r.score)||0,"من":Number(r.total)||0,"النسبة %":pctOf(r),"النتيجة":passTxt(r),"الوقت (ثانية)":(r.secs==null?"":Number(r.secs)),"مرات الخروج":r.tabs||0,"التاريخ":fmt(r.createdAt)||""}));
      const st={};
      rows.forEach(r=>{
        const k=r.uid||r.phone||r.name;if(!k)return;
        const o=st[k]||(st[k]={name:r.name||"",phone:r.phone||"",exams:new Set(),n:0,sum:0,best:0,pass:0,fail:0,last:0});
        o.exams.add(r.examId);o.n++;const p=pctOf(r);o.sum+=p;if(p>o.best)o.best=p;
        if(r.passMark>0){if(r.passed)o.pass++;else o.fail++}
        const t=tms(r);if(t>o.last)o.last=t;
      });
      const sheet2=Object.values(st).sort((a,b)=>b.sum/b.n-a.sum/a.n).map(o=>({"الاسم":o.name,"التليفون":o.phone,"عدد الامتحانات":o.exams.size,"عدد المحاولات":o.n,"متوسط النسبة %":Math.round(o.sum/o.n),"أعلى نسبة %":o.best,"نجح":o.pass,"رسب":o.fail,"آخر نشاط":o.last?new Date(o.last).toLocaleString("ar-EG"):""}));
      const ex={};
      rows.forEach(r=>{
        const k=r.examId||r.examTitle;
        const o=ex[k]||(ex[k]={title:r.examTitle||"",subject:subName(r.subject)||"",stu:new Set(),n:0,sum:0,max:0,min:100,pass:0,graded:0});
        o.stu.add(r.uid||r.phone||r.name);o.n++;const p=pctOf(r);o.sum+=p;if(p>o.max)o.max=p;if(p<o.min)o.min=p;
        if(r.passMark>0){o.graded++;if(r.passed)o.pass++}
      });
      const sheet3=Object.values(ex).map(o=>({"الامتحان":o.title,"المادة":o.subject,"عدد الطلاب":o.stu.size,"عدد المحاولات":o.n,"متوسط النسبة %":Math.round(o.sum/o.n),"أعلى نسبة %":o.max,"أقل نسبة %":o.n?o.min:0,"نسبة النجاح %":o.graded?Math.round(o.pass/o.graded*100):""}));
      const wb=XLSX.utils.book_new();
      const add=(data,name,empty)=>{
        const ws=XLSX.utils.json_to_sheet(data.length?data:[empty]);
        const keys=Object.keys(data.length?data[0]:empty);
        ws["!cols"]=keys.map(k=>({wch:Math.min(40,Math.max(String(k).length+2,...data.slice(0,200).map(r=>String(r[k]??"").length+2)))}));
        XLSX.utils.book_append_sheet(wb,ws,name);
      };
      add(sheet1,"النتائج",{"الاسم":""});
      add(sheet2,"ملخص الطلاب",{"الاسم":""});
      add(sheet3,"ملخص الامتحانات",{"الامتحان":""});
      wb.Workbook={Views:[{RTL:true}]};
      const d=new Date();const ds=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
      XLSX.writeFile(wb,"eltafawoq-results-"+ds+".xlsx");
      toast("اتنزّل الملف ✓ ("+rows.length+" نتيجة)",true);
    }catch(e){
      console.warn("xlsx",e);
      toast("تعذّر تجهيز Excel — هنزّل CSV بدله");
      try{A.csv()}catch(_){}
    }
  },
  csv(){
    const rows=(Array.isArray(S.results)?S.results:[]).filter(r=>!S.filter||r.examId===S.filter);
    const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    const csv="\ufeff"+["الاسم,التليفون,المادة,الامتحان,المحاولة,الدرجة,من,النتيجة,الوقت بالثواني,مرات الخروج,التاريخ",
      ...rows.map(r=>[r.name,r.phone,subName(r.subject),r.examTitle,r.attempt||1,r.score,r.total,r.passMark>0?(r.passed?"ناجح":"راسب"):"",r.secs??"",r.tabs||0,fmt(r.createdAt)].map(q).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="results.csv";a.click();
  },
    async setMode(d){
    const id=d.id,m=modesAll().find(x=>x.id===id);if(!m)return;
    if(m.kind!=="platform"&&!await uiConfirm("تفعّل «"+m.n+"»؟ وضع المنصة هيتقفل على الطلاب تماماً لحد ما ترجّعه.",{title:"تغيير وضع التشغيل",icon:"🎛",ok:"فعّل",danger:false}))return;
    const prev=S.site.appMode||"platform";
    S.site.appMode=id;render(true);
    try{await setDoc(doc(db,"config","site"),{appMode:id},{merge:true});toast(m.kind==="platform"?"✅ رجع وضع المنصة":"🎛 شغّال دلوقتي: "+m.n,true)}
    catch(e){S.site.appMode=prev;render(true);window.__cancel=true;toast("مقدرتش أحفظ",true)}
  },
  async addMode(){
    if(!S.isAdmin){toast("إضافة الأوضاع للأدمن فقط",true);window.__cancel=true;return}
    const n=(($("#mdName")&&$("#mdName").value)||"").trim().slice(0,30),ic=(($("#mdIc")&&$("#mdIc").value)||"🎛").trim().slice(0,4)||"🎛";
    const kind=(($("#mdKind")&&$("#mdKind").value)||"url"),url=(($("#mdUrl")&&$("#mdUrl").value)||"").trim(),msg=(($("#mdMsg")&&$("#mdMsg").value)||"").trim().slice(0,300);
    if(!n){toast("اكتب اسم الوضع");window.__cancel=true;return}
    if(!["url","htmlFile","message"].includes(kind)){toast("نوع الوضع غير صالح",true);window.__cancel=true;return}
    if((S.site.modes||[]).length>=12){toast("وصلت للحد الأقصى للأوضاع المخصصة (12)",true);window.__cancel=true;return}
    if(kind==="url"&&!modeSafeUrl(url)){toast("الرابط لازم يبدأ بـ https:// أو يكون ملف HTML محليًا",true);window.__cancel=true;return}
    if(kind==="message"&&!msg){toast("اكتب الرسالة",true);window.__cancel=true;return}
    const id="m"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),nm={id,n,ic,kind,url:kind==="url"?modeSafeUrl(url):"",msg:kind==="message"?msg:""};
    let gameId="";
    if(kind==="htmlFile"){
      const pending=window.__pendingModeHtml;
      if(!pending||!pending.text){toast("اختر ملف HTML مستقل قبل الإضافة",true);window.__cancel=true;return}
      if(pending.bytes>MODE_FILE_MAX_BYTES){toast("حجم الملف أكبر من 600KB",true);window.__cancel=true;return}
      gameId="gameMode_"+id;
      try{await setDoc(doc(db,"config",gameId),{html:pending.text,fileName:pending.name,updatedAt:serverTimestamp()})}
      catch(e){toast("تعذر حفظ اللعبة في Firestore؛ راجع القواعد والحصة",true);window.__cancel=true;return}
      nm.gameDoc=gameId;window.__pendingModeHtml=null;
    }
    const list=(S.site.modes||[]).concat([nm]);S.site.modes=list;render(true);
    try{await setDoc(doc(db,"config","site"),{modes:list},{merge:true});toast("اتضاف الوضع ✓",true)}
    catch(e){S.site.modes=list.slice(0,-1);if(gameId)deleteDoc(doc(db,"config",gameId)).catch(()=>{});render(true);window.__cancel=true;toast("مقدرتش أحفظ الوضع",true)}
  },
  async delMode(d){
    const m=modesAll().find(x=>x.id===d.id);if(!m||!m.custom||!S.isAdmin)return;
    if(!await uiConfirm("تمسح الوضع «"+m.n+"»؟",{ok:"امسح"}))return;
    const list=(S.site.modes||[]).filter(x=>x.id!==d.id),wasOn=S.site.appMode===d.id,prevList=S.site.modes;
    S.site.modes=list;if(wasOn)S.site.appMode="platform";render(true);
    try{await setDoc(doc(db,"config","site"),wasOn?{modes:list,appMode:"platform"}:{modes:list},{merge:true});if(gameDocId(m))await deleteDoc(doc(db,"config",gameDocId(m))).catch(()=>{});toast("اتمسح ✓")}
    catch(e){S.site.modes=prevList;if(wasOn)S.site.appMode=d.id;render(true);window.__cancel=true;toast("مقدرتش أحفظ",true)}
  },
  previewMode(d){S.modePrev=d.id;S.view="modePreview";render(true)},
  modePreviewExit(){S.view="admin";S.tab="modes";render(true)},
  async toggleMaint(){
    const on=!S.site.maintenance;
    if(on&&!await uiConfirm("تشغّل وضع الصيانة؟ الطلاب مش هيقدروا يدخلوا."))return;
    const msg=($("#mmsg")&&$("#mmsg").value||"").trim();
    S.site.maintenance=on;S.site.message=msg;render(true);
    toast(on?"🛠 وضع الصيانة شغّال":"✅ المنصة رجعت للطلاب",true);
    try{await setDoc(doc(db,"config","site"),{maintenance:on,message:msg},{merge:true})}
    catch(e){S.site.maintenance=!on;render(true);window.__cancel=true;toast("مقدرتش أحفظ",true)}
  },
  async saveMsg(){try{await setDoc(doc(db,"config","site"),{message:$("#mmsg").value.trim()},{merge:true});toast("اتحفظت الرسالة")}catch(e){toast("مقدرتش أحفظ")}},
  async saveAnn(d){
    const text=($("#ann")&&$("#ann").value||"").trim();
    const on=d.on==="1"&&!!text;
    const prev={announce:S.site.announce,announceOn:S.site.announceOn};
    S.site.announce=text;S.site.announceOn=on;render(true);
    toast(d.on==="1"?"✅ تم نشر الإعلان":"🙈 تم إخفاء الإعلان",true);
    try{await setDoc(doc(db,"config","site"),{announce:text,announceOn:on},{merge:true})}
    catch(e){Object.assign(S.site,prev);render(true);window.__cancel=true;toast("مقدرتش أحفظ",true)}
  },
  async wipe(){
    if(await uiPrompt("ده هيمسح كل الامتحانات ونتايج وتقدم كل الطلاب نهائيًا. لو متأكد اكتب كلمة: مسح")!=="مسح"){toast("اتلغى المسح");return}
    try{
      for(const c of ["results","starts","alerts","exams"]){
        const sn=await getDocs(collection(db,c));
        for(let i=0;i<sn.docs.length;i+=400){const b=writeBatch(db);sn.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit()}
      }
      S.unread=0;S.unreadAlerts=0;updTitle();
      toast("اتمسح كل حاجة. دوس تبويب الامتحانات وضيف امتحان جديد.",true);
    }catch(e){toast("حصلت مشكلة في المسح ("+(e.code||"؟")+")")}
  },
  async dupExam(d){const e=S.exams.find(x=>x.id===d.id);if(!e)return;const {id,createdAt,...rest}=e;try{await addDoc(collection(db,"exams"),{...rest,title:e.title+" (نسخة)",published:false,createdAt:serverTimestamp()});toast("اتعملت نسخة مخفية")}catch(err){toast("مقدرتش أنسخ")}},
  async block(d){
    const days=await uiPrompt("مدة الحظر بالأيام (سيبها فاضية = حظر نهائي):","");
    if(days===null){window.__cancel=true;return}
    const n=Math.floor(Number(days));
    const reason=(await uiPrompt("سبب الحظر (بيظهر للطالب — اختياري):","")||"").trim();
    const st=(S.students||[]).find(x=>x.id===d.id);const prev=st?{blocked:st.blocked,blockedUntil:st.blockedUntil,blockReason:st.blockReason}:null;
    const until=(n>0?Date.now()+n*864e5:0);
    if(st){st.blocked=true;st.blockedUntil=until;st.blockReason=reason}
    render(true);toast(n>0?"⛔ تم حظر الطالب "+n+" يوم":"⛔ تم حظر الطالب نهائياً",true);
    try{await updateDoc(doc(db,"students",d.id),{blocked:true,blockReason:reason,blockedUntil:until,blockedAt:Date.now()})}
    catch(e){if(st&&prev)Object.assign(st,prev);render(true);window.__cancel=true;toast("مقدرتش أحظر",true)}
  },
  async tgDecide(d){
    if(!S.isAdmin||!d.id)return;
    const v=d.v==="approved"?"approved":"rejected";
    const st=(S.students||[]).find(x=>x.id===d.id);const prev=st&&st.tanaghaAccess;
    if(st)st.tanaghaAccess=v;
    render(true);toast(v==="approved"?"✅ تم فتح الأقسام للطالب":"⛔ تم قفل الأقسام عن الطالب",true);
    try{await updateDoc(doc(db,"students",d.id),{tanaghaAccess:v})}
    catch(e){if(st)st.tanaghaAccess=prev;render(true);window.__cancel=true;toast("مقدرتش: "+(e.code||e.message||""),true)}
  },
  moreStudents(){S.sLimit=(S.sLimit||STUDENTS_TABLE_PAGE)+60;const t=$("#stbl");if(t)t.innerHTML=studentsTable()},
  async setFeature(d){
    if(!S.isAdmin||!d.id)return;
    const want=d.on==="1";
    if(featState(d.id)===want){window.__cancel=true;return}
    const prev=S.features;
    // فوري: غيّر الحالة وارسم، وبعدين اكتب في السيرفر في الخلفية
    S.features={...(S.features||{}),[d.id]:want};
    toast(want?"🔓 اتفتح القسم":"🔐 اتقفل القسم",true);render(true);
    try{await setDoc(doc(db,"config","features"),{[d.id]:want},{merge:true})}
    catch(e){S.features=prev;render(true);window.__cancel=true;toast("مقدرتش أحفظ التغيير: "+(e.code||e.message||""),true)}
  },
  async unblock(d){
    const st=(S.students||[]).find(x=>x.id===d.id);const prev=st?{blocked:st.blocked,blockedUntil:st.blockedUntil,blockReason:st.blockReason}:null;
    if(st){st.blocked=false;st.blockedUntil=0;st.blockReason=""}
    render(true);toast("✅ تم فك الحظر — الطالب رجع يستخدم المنصة",true);
    try{await updateDoc(doc(db,"students",d.id),{blocked:false,blockedUntil:0,blockReason:""})}
    catch(e){if(st&&prev)Object.assign(st,prev);render(true);window.__cancel=true;toast("مقدرتش أفك الحظر",true)}
  },
  recoverToggle(){S.recoverMode=!S.recoverMode;S.error="";render(true)},
  async doRecover(){
    if(!configured){S.error="المنصة تحت التعديل.";render(true);return}
    const ridEl=$("#rid"),codeEl=$("#rcode"),pwEl=$("#rpw");
    if(!ridEl||!codeEl||!pwEl){S.error="تعذّر قراءة نموذج الاستعادة";render(true);return}
    const phone=norm(ridEl.value),code=String(codeEl.value||"").trim(),pw=pwEl.value;
    if(!/^01[0-9]{9}$/.test(phone))return fail("رقم التليفون لازم 11 رقم ويبدأ بـ 01.");
    if(!/^[0-9]{6}$/.test(code))return fail("الكود لازم 6 أرقام — خده من الأدمن.");
    if(pw.length<6)return fail("كلمة السر لازم 6 حروف أو أرقام على الأقل.");
    const base=((S.site&&S.site.resetPassUrl)||"").trim();
    if(!base||!/^https:\/\//i.test(base)){S.error="نظام الاستعادة لسه مش متظبط من الأدمن — كلّمه يفعّل وسيط الاستعادة.";render(true);return}
    const go=$("#go");if(go)go.disabled=true;S.error="";
    try{
      const r=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone,code,password:pw})});
      const j=await r.json().catch(()=>({}));
      if(r.ok&&j&&j.ok){
        S.recoverMode=false;S.error="";
        try{localStorage.setItem("last_phone",phone)}catch(_){}
        toast("كلمة السر اتغيرت ✓ سجّل دخول بالجديدة",true);
        render(true);return;
      }
      S.error=(j&&j.error)||(r.status===404?"الوسيط مش موجود — راجع الرابط مع الأدمن.":"الكود غلط أو انتهى صلاحيته — خد كود جديد من الأدمن.");
      if(go)go.disabled=false;
      render(true);
    }catch(e){
      S.error="الوسيط مش بيرد — جرب تاني أو كلّم الأدمن.";
      if(go)go.disabled=false;
      render(true);
    }
  },
  async doLogin(){
    if(!configured){S.error="المنصة تحت التعديل.";render(true);return}
    const idEl=$("#id"),pwEl=$("#pw");
    if(!idEl||!pwEl){S.error="تعذّر قراءة نموذج الدخول";render(true);return}
    const rawId=String(idEl.value||"").trim(),pw=pwEl.value;
    // الطلاب: رقم تليفون فقط. الأدمن (بعد 3 ضغطات على اللوجو): يقبل رقم أو بريد إن وُجد
    let email;
    if(S.adminLogin && rawId.includes("@")){
      email=rawId.toLowerCase();
    }else{
      const phone=norm(rawId);
      if(!/^01[0-9]{9}$/.test(phone)){S.error="رقم التليفون لازم يبقى 11 رقم ويبدأ بـ 01.";render(true);return}
      email=phone+DOMAIN;
      try{localStorage.setItem("last_phone",phone)}catch(_){}
    }
    const goEl=$("#go");if(goEl)goEl.disabled=true;S.error="";
    try{await signInWithEmailAndPassword(auth,email,pw)}catch(e){S.error=authErr(e);if(goEl)goEl.disabled=false;render(true)}
  },
  async doRegister(){
    if(!configured){S.error="المنصة تحت التعديل.";render(true);return}
    if(S.site&&S.site.maintenance){S.error="التسجيل مقفول أثناء الصيانة";render(true);return}
    const nmEl=$("#nm"),idEl=$("#id"),pwEl=$("#pw"),goEl=$("#go");
    if(!nmEl||!idEl||!pwEl){S.error="تعذّر قراءة نموذج التسجيل";render(true);return}
    const name=String(nmEl.value||"").trim().replace(/\s+/g," "),phone=norm(idEl.value),pw=pwEl.value;
    if(name.length<3||name.length>80)return fail("الاسم لازم يكون بين 3 و80 حرفًا.");
    if(!/^01[0-9]{9}$/.test(phone))return fail("رقم التليفون لازم يبقى 11 رقم ويبدأ بـ 01.");
    if(pw.length<6)return fail("كلمة السر لازم تبقى 6 حروف أو أرقام على الأقل.");
    if(goEl)goEl.disabled=true;S.error="";S.registering=true;
    try{
      const c=await createUserWithEmailAndPassword(auth,phone+DOMAIN,pw);
      try{await setDoc(doc(db,"students",c.user.uid),{name,tanaghaAccess:"pending",createdAt:serverTimestamp()});try{await setDoc(doc(db,"studentsPrivate",c.user.uid),{phone,regIp:myIp||"",regDevice:device(),updatedAt:serverTimestamp()})}catch(_){}sendPush({type:"admin_event",event:"signup"},"adm_signup",30000)}catch(_){}
      try{await setDoc(doc(db,"publicProfiles",c.user.uid),{name,updatedAt:serverTimestamp()})}catch(_){}
      S.registering=false;await startSession(c.user);
    }catch(e){S.registering=false;S.error=authErr(e);render(true)}
  }
};
function fail(m){S.error=m;render(true)}


/* ---- QB runtime ---- */
const QB_GAMES={qb:"تحدي الأوائل 👑",los:"آخر واحد واقف 🧍",math:"حساب سريع 🔢",xo:"إكس أو ❌⭕",memory:"تحدي الذاكرة 🧠",draw:"رسم وخمّن ✏️",hang:"كلمة مخفية 📝",words:"Words Crush 🔤",runner:"Endless Runner 🏃",space:"Space Shooter 🚀",doodle:"Doodle Jump 🪂",fishing:"صيد السمك 🎣",push:"Push Arena 🧊"};
const QB_COLORS={teal:"تركواز",purple:"بنفسجي",gold:"ذهبي",rose:"وردي",blue:"أزرق"};
function qbGameLabel(id){return QB_GAMES[id]||QB_GAMES.qb}
function convIdFor(a,b){return [a,b].sort().join("_")}
async function openDmThread(uid,name){
  if(!S.user||!uid)return;
  let avatar=null;
  try{
    const [pub,av]=await Promise.all([
      getDoc(doc(db,"publicProfiles",uid)).catch(()=>null),
      getDoc(doc(db,"avatars",uid)).catch(()=>null)
    ]);
    if(pub&&pub.exists())name=pub.data().name||name;
    if(av&&av.exists())avatar=av.data().data||null;
  }catch(_){}
  const cid=convIdFor(S.user.uid,uid);
  try{
    await setDoc(doc(db,"conversations",cid),{
      participants:[S.user.uid,uid],
      names:{[S.user.uid]:(S.profile.name||"طالب").split(" ")[0],[uid]:(name||"زميل").split(" ")[0]},
      updatedAt:serverTimestamp()
    },{merge:true});
  }catch(e){console.warn("conv",e);toast("تأكد من نشر قواعد Firestore الجديدة")}
  S.chatThread={uid,name:name||"زميل",avatar,convId:cid};
  S.chatMsgs=[];
  try{const raw=localStorage.getItem("dmcache_"+cid);if(raw){const arr=JSON.parse(raw);if(Array.isArray(arr))S.chatMsgs=arr}}catch(_){}
  S.chatStickBottom=true;S.chatNewBelow=0;
  S.view="chatThread";
  S.chatPeerOnline=false;
  (async()=>{
    try{
      const ps=await getDoc(doc(db,"presence",uid));
      if(ps.exists()){
        const ls=ps.data().lastSeenAt;
        const ms=tsMs(ls);
        S.chatPeerOnline=ms&&(Date.now()-ms<660000);
      }
    }catch(_){}
    if(S.view==="chatThread"){
      const d=document.getElementById("dmOnlineDot");
      if(d){d.className="online-dot"+(S.chatPeerOnline?"":" off")}
      const st=document.getElementById("dmOnlineTxt");
      if(st)st.textContent=S.chatPeerOnline?"متصل":"غير متصل";
    }
  })();
  clearInterval(window.__peerPres);
  window.__peerPres=setInterval(async()=>{
    if(S.view!=="chatThread"||!S.chatThread){clearInterval(window.__peerPres);return}
    try{
      const ps=await getDoc(doc(db,"presence",S.chatThread.uid));
      if(!ps.exists())return;
      const ls=ps.data().lastSeenAt;
      const on=tsMs(ls)&&(Date.now()-tsMs(ls)<660000);
      if(on!==S.chatPeerOnline){
        S.chatPeerOnline=on;
        const d=document.getElementById("dmOnlineDot");
        if(d)d.className="online-dot"+(on?"":" off");
        const st=document.getElementById("dmOnlineTxt");
        if(st)st.textContent=on?"متصل":"غير متصل";
      }
    }catch(_){}
  },60000);
  try{await updateDoc(doc(db,"conversations",cid),{[`readBy.${S.user.uid}`]:serverTimestamp()})}catch(_){}
  listenDmThread(cid,uid);
  render(true);
  logActivity("dm_open",(name||"")+" · "+uid.slice(0,6));
}

function clearDmTyping(){
  clearTimeout(window.__typingT);
  clearTimeout(window.__typingClear);
  if(!S.user||!S.chatThread)return;
  try{
    const cid=convIdFor(S.user.uid,S.chatThread.uid);
    setDoc(doc(db,"conversations",cid),{
      typingUid:null,typingAt:null,
      participants:[S.user.uid,S.chatThread.uid]
    },{merge:true}).catch(()=>{});
  }catch(_){}
}
function signalDmTyping(){
  if(!S.user||!S.chatThread)return;
  clearTimeout(window.__typingT);
  const __now=Date.now();
  if(__now-(window.__typingLast||0)<3000){clearTimeout(window.__typingClear);window.__typingClear=setTimeout(clearDmTyping,2500);return}
  window.__typingLast=__now;
  window.__typingT=setTimeout(()=>{
    try{
      const cid=convIdFor(S.user.uid,S.chatThread.uid);
      setDoc(doc(db,"conversations",cid),{
        typingUid:S.user.uid,
        typingAt:Date.now(),
        participants:[S.user.uid,S.chatThread.uid]
      },{merge:true}).catch(e=>console.warn("typing",e));
    }catch(_){}
  },250);
  clearTimeout(window.__typingClear);
  window.__typingClear=setTimeout(clearDmTyping,2500);
}

async function sendDm(toUid,text,img,extra){
  if(!S.user||!toUid)return;
  const cid=convIdFor(S.user.uid,toUid);
  const payload={
    fromUid:S.user.uid,
    fromName:(S.profile.name||"طالب").split(" ")[0],
    toUid,
    text:text||(img?"🖼 ميديا":""),
    createdAt:serverTimestamp(),
    read:false
  };
  if(img)payload.img=img;
  if(extra)Object.assign(payload,extra);
  if(S.replyTo&&S.replyTo.id){
    payload.replyTo={id:S.replyTo.id,text:(S.replyTo.text||"").slice(0,120),name:S.replyTo.name||""};
  }
  const local={...payload,id:"local_"+Date.now(),createdAt:{seconds:Date.now()/1000},_local:true};
  S.chatMsgs=(S.chatMsgs||[]).concat([local]);
  S.chatStickBottom=true;
  if(S.view==="chatThread"){
    const log=$("#dmChatLog");
    if(log&&typeof dmBubbleHtml==="function"){
      try{patchChatLog(log,S.chatMsgs,dmBubbleHtml,EMPTY_DM);scrollChatBottom(true)}catch(_){render(true);scrollChatBottom(true)}
    }else{render(true);scrollChatBottom(true)}
  }
  try{
    await Promise.all([
      addDoc(collection(db,"conversations",cid,"msgs"),payload),
      setDoc(doc(db,"conversations",cid),{
        participants:[S.user.uid,toUid],
        lastText:extra&&extra.roomCode?("🎮 دعوة غرفة "+extra.roomCode):(img?(extra&&extra.kind==="audio"?"🎙 صوت":"🖼 ميديا"):(text||"").slice(0,80)),
        lastAt:serverTimestamp(),
        lastFrom:S.user.uid,
        names:{
          [S.user.uid]:(S.profile.name||"طالب").split(" ")[0],
          [toUid]:(S.chatThread&&S.chatThread.uid===toUid?S.chatThread.name:"زميل")
        },
        updatedAt:serverTimestamp()
      },{merge:true})
    ]);
    S.replyTo=null;
    // إشعار داخل المنصة + طلب Push
    try{
      const preview=img?(extra&&extra.kind==="audio"?"🎙 رسالة صوتية":"🖼 صورة"):(text||"").slice(0,80);
      const fromN=(S.profile.name||"طالب").split(" ")[0];
      addDoc(collection(db,"notifications"),{
        uid:toUid, text:fromN+": "+preview, kind:"dm", fromUid:S.user.uid,
        createdAt:serverTimestamp(), read:false
      }).catch(()=>{});
      if(!(S.chatPeerOnline&&S.chatThread&&S.chatThread.uid===toUid))sendPush({type:"dm",toUid,text:preview},"dm_"+toUid,15000);
    }catch(_){}
  }catch(err){
    console.error("sendDm",err);
    const code=(err&&err.code)||"";
    if(String(code).includes("permission"))toast("الشات: مفيش صلاحية — انشر firestore.rules",true);
    else toast("فشل إرسال الرسالة — جرب تاني");
    throw err;
  }
}
/** رفع ملف على Firebase Storage — صور/فيديو بجودة كاملة */



let __ringAudio=null,__ringCtx=null,__ringTimer=null;
function startRingtone(){
  stopRingtone();
  try{if(navigator.vibrate)navigator.vibrate([200,100,200,100,200,100,400])}catch(_){}
  try{
    const a=new Audio("ringtone.mp3");
    a.loop=true;a.volume=1;__ringAudio=a;
    const pr=a.play();
    if(pr&&pr.catch)pr.catch(()=>{__ringAudio=null;startBeepRing()});
    return;
  }catch(_){}
  startBeepRing();
}
function startBeepRing(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    __ringCtx=ctx;
    const playOnce=()=>{
      if(!__ringCtx)return;
      const now=ctx.currentTime;
      [0,0.2].forEach((off,idx)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine";o.frequency.value=idx?520:440;
        g.gain.setValueAtTime(0.0001,now+off);
        g.gain.exponentialRampToValueAtTime(0.12,now+off+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001,now+off+0.18);
        o.connect(g);g.connect(ctx.destination);
        o.start(now+off);o.stop(now+off+0.2);
      });
    };
    playOnce();
    __ringTimer=setInterval(playOnce,1800);
    try{if(navigator.vibrate)navigator.vibrate([200,100,200,100,200])}catch(_){}
  }catch(e){console.warn("ring",e)}
}
function stopRingtone(){
  if(__ringTimer){clearInterval(__ringTimer);__ringTimer=null}
  try{if(__ringAudio){__ringAudio.pause();__ringAudio.currentTime=0}}catch(_){}
  __ringAudio=null;
  try{if(__ringCtx){__ringCtx.close()}}catch(_){}
  __ringCtx=null;
}
function iceServers(){
  const l=[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}];
  try{
    const t=S.site&&S.site.turnUrl;
    if(t&&S.site.turnUser&&S.site.turnCred)l.push({urls:t.split(",").map(x=>x.trim()).filter(Boolean),username:S.site.turnUser,credential:S.site.turnCred});
  }catch(_){}
  return {iceServers:l};
}
async function startVoiceCall(toUid,toName){
  if(!callsAllowed()){toast("المكالمات متوقفة حالياً");return}
  if(!S.user||!toUid)return;
  if(toUid===S.user.uid){toast("مش هتتصل بنفسك");return}
  if(window.__call){toast("في مكالمة شغّالة");return}
  toast("جاري الاتصال…");
  const callId="c_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7);
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
  catch(e){toast("اسمح بالميكروفون للمكالمة");return}
  const pc=new RTCPeerConnection(iceServers());
  stream.getTracks().forEach(tr=>pc.addTrack(tr,stream));
  const remoteAudio=new Audio();remoteAudio.autoplay=true;remoteAudio.playsInline=true;
  pc.ontrack=ev=>{try{remoteAudio.srcObject=ev.streams[0];remoteAudio.play().catch(()=>{})}catch(_){}};
  const callRef=doc(db,"calls",callId);
  const pendingIce=[];
  let callDocReady=false;
  pc.onicecandidate=e=>{
    if(!e.candidate)return;
    const c=e.candidate.toJSON();
    if(!callDocReady){pendingIce.push(c);return}
    updateDoc(callRef,{callerIce:arrayUnion(c)}).catch(()=>{});
  };
  let offer;
  try{offer=await pc.createOffer({offerToReceiveAudio:true});await pc.setLocalDescription(offer)}
  catch(e){toast("فشل تجهيز المكالمة");try{stream.getTracks().forEach(t=>t.stop());pc.close()}catch(_){}return}
  try{await setDoc(callRef,{
    from:S.user.uid,
    fromName:(S.profile&&S.profile.name||"طالب").split(" ")[0],
    to:toUid,
    toName:toName||"زميل",
    offer:{type:offer.type,sdp:offer.sdp},
    status:"ringing",
    callerIce:[],
    calleeIce:[],
    createdAt:serverTimestamp()
  })}catch(e){
    console.error("call create",e);
    try{stream.getTracks().forEach(t=>t.stop());pc.close()}catch(_){}
    toast((e&&e.code==="permission-denied")?"المكالمة مرفوضة — انشر firestore.rules الجديدة (أو حسابك محظور)":"مقدرتش أبدأ المكالمة — تأكد من الإنترنت",true);
    return;
  }
  callDocReady=true;
  if(pendingIce.length){try{await updateDoc(callRef,{callerIce:arrayUnion(...pendingIce)})}catch(_){}}
  try{
    await addDoc(collection(db,"notifications"),{
      uid:toUid, text:"📞 مكالمة واردة من "+((S.profile&&S.profile.name)||"زميل"),
      kind:"call", callId, createdAt:serverTimestamp(), read:false
    });
  }catch(_){}
  sendPush({type:"call",toUid,callId});
  startRingtone();
  showCallUI(toName||"زميل",true,()=>endVoiceCall("cancel"),null);
  let answered=false;
  const unsub=onSnapshot(callRef,async snap=>{
    if(!snap.exists()){endVoiceCall();return}
    const d=snap.data();
    if(d.status==="ended"||d.status==="rejected"||d.status==="missed"){
      endVoiceCall();return;
    }
    if(d.status==="active"&&d.answer&&!answered){
      answered=true;
      stopRingtone();
      try{
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
      }catch(e){console.error(e)}
      showCallUI(toName||"زميل",false,()=>endVoiceCall("hangup"),"متصل الآن");
    }
    if(Array.isArray(d.calleeIce)){
      for(const c of d.calleeIce){
        try{await pc.addIceCandidate(c)}catch(_){}
      }
    }
  });
  window.__call={pc,stream,callId,remoteAudio,unsub,role:"caller"};
  // لو محدش رد خلال 45 ثانية
  window.__call.timeout=setTimeout(()=>{
    if(window.__call&&window.__call.callId===callId){
      updateDoc(callRef,{status:"missed"}).catch(()=>{});
      endVoiceCall("missed");
      toast("مافيش رد");
    }
  },45000);
  const unsubStatus=onSnapshot(callRef,snap=>{
    if(!snap.exists()||!window.__call||window.__call.callId!==callId)return;
    const st=snap.data().status;
    if(st==="rejected")endVoiceCall("reject");
    else if(st==="ended"||st==="cancelled")endVoiceCall("remote");
  });
  window.__call.unsubStatus=unsubStatus;
}
function showCallUI(name,outgoing,onEnd,statusText){
  const old=document.getElementById("callBar");if(old)old.remove();
  const bar=document.createElement("div");
  bar.id="callBar";bar.className="call-bar";
  const st=statusText||(outgoing?"جاري الاتصال… اسمح بالميكروفون عند الطرف التاني":"مكالمة واردة");
  bar.innerHTML=`<div class="call-box"><div class="pulse"></div><b dir="auto">${esc(name)}</b>
    <p class="mut" id="callStatus">${esc(st)}</p>
    <div class="row" style="justify-content:center;gap:10px;margin-top:8px">
      <button class="btn danger" id="callHang">${outgoing?"إلغاء":"إنهاء"}</button>
    </div></div>`;
  document.body.appendChild(bar);
  document.getElementById("callHang").onclick=onEnd;
}
function showIncomingCallUI(name,onAccept,onReject){
  const old=document.getElementById("callBar");if(old)old.remove();
  const bar=document.createElement("div");
  bar.id="callBar";bar.className="call-bar";
  bar.innerHTML=`<div class="call-box"><div class="pulse"></div><b dir="auto">${esc(name)}</b>
    <p class="mut">مكالمة صوتية واردة…</p>
    <div class="row" style="justify-content:center;gap:12px;margin-top:12px">
      <button class="btn danger" id="callReject">رفض</button>
      <button class="btn gold" id="callAccept">رد</button>
    </div></div>`;
  document.body.appendChild(bar);
  document.getElementById("callAccept").onclick=onAccept;
  document.getElementById("callReject").onclick=onReject;
}
async function endVoiceCall(reason){
  stopRingtone();
  const c=window.__call;
  if(c&&c.timeout)clearTimeout(c.timeout);
  if(!c){const b=document.getElementById("callBar");if(b)b.remove();return}
  try{if(c.unsub)c.unsub()}catch(_){}
  try{if(c.unsubStatus)c.unsubStatus()}catch(_){}
  try{c.pc&&c.pc.close()}catch(_){}
  try{c.stream&&c.stream.getTracks().forEach(tr=>tr.stop())}catch(_){}
  try{
    if(c.callId){
      const st=reason==="reject"?"rejected":reason==="missed"?"missed":(reason==="remote"?"ended":"cancelled");
      await updateDoc(doc(db,"calls",c.callId),{status:st,endedAt:Date.now()}).catch(()=>{});
    }
  }catch(_){}
  window.__call=null;
  const b=document.getElementById("callBar");if(b)b.remove();
  if(reason==="missed")return;
  if(reason==="remote")toast("الطرف التاني أنهى المكالمة");else toast(reason==="reject"?"اترفضت المكالمة":"انتهت المكالمة");
}
async function answerVoiceCall(callId,d){
  if(!callsAllowed()){toast("المكالمات متوقفة حالياً");updateDoc(doc(db,"calls",callId),{status:"rejected"}).catch(()=>{});return}
  if(window.__call)return;
  stopRingtone();
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
  catch(e){toast("الميكروفون مرفوض");updateDoc(doc(db,"calls",callId),{status:"rejected"}).catch(()=>{});return}
  const pc=new RTCPeerConnection(iceServers());
  stream.getTracks().forEach(tr=>pc.addTrack(tr,stream));
  const remoteAudio=new Audio();remoteAudio.autoplay=true;remoteAudio.playsInline=true;
  pc.ontrack=ev=>{try{remoteAudio.srcObject=ev.streams[0];remoteAudio.play().catch(()=>{})}catch(_){}};
  const callRef=doc(db,"calls",callId);
  pc.onicecandidate=e=>{
    if(!e.candidate)return;
    updateDoc(callRef,{calleeIce:arrayUnion(e.candidate.toJSON())}).catch(()=>{});
  };
  try{
    await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
    // ICE من المتصل
    if(Array.isArray(d.callerIce)){
      for(const c of d.callerIce){try{await pc.addIceCandidate(c)}catch(_){}}
    }
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(callRef,{answer:{type:answer.type,sdp:answer.sdp},status:"active"});
  }catch(e){
    console.error(e);toast("فشل الاتصال");stream.getTracks().forEach(tr=>tr.stop());return;
  }
  showCallUI(d.fromName||"متصل",false,()=>endVoiceCall("hangup"),"متصل الآن");
  window.__call={pc,stream,callId,remoteAudio,role:"callee",unsub:onSnapshot(callRef,s=>{
    if(!s.exists()){endVoiceCall();return}
    const x=s.data();
    if(x.status==="ended"||x.status==="rejected")endVoiceCall();
    if(Array.isArray(x.callerIce)){
      x.callerIce.forEach(c=>{try{pc.addIceCandidate(c)}catch(_){}});
    }
  })};
}

async function handlePendingCall(){
  const id=S._pendingCall;
  if(!id||!S.user)return;
  S._pendingCall=null;
  try{
    const snap=await getDoc(doc(db,"calls",id));
    if(!snap.exists()){toast("المكالمة انتهت");return}
    const d=snap.data();
    if(d.to!==S.user.uid)return;
    if(d.status!=="ringing"){toast("المكالمة مش متاحة دلوقتي");return}
    // listenIncomingCalls will also pick it; force UI
    toast("مكالمة واردة…");
  }catch(e){console.warn(e)}
}

function syncCallAvailability(){
  if(!S.user||S.isAdmin)return;
  if(callsAllowed()){try{listenIncomingCalls()}catch(_){};return}
  try{if(window.__callListen){window.__callListen();window.__callListen=null}}catch(_){}
  try{clearTimeout(window.__incomingTimer)}catch(_){}
  window.__incomingCallId=null;
  stopRingtone();
  try{if(navigator.vibrate)navigator.vibrate(0)}catch(_){}
  const bar=document.getElementById("callBar");if(bar&&!window.__call)bar.remove();
  if(window.__call)endVoiceCall("feature-disabled");
}
async function listenIncomingCalls(){
  if(!S.user||S.isAdmin||!callsAllowed()||window.__callListen)return;
  // إشعارات المكالمات لا تطلب الإذن تلقائياً عند تسجيل الدخول.
  window.__callListen=onSnapshot(
    query(collection(db,"calls"),where("to","==",S.user.uid),where("status","==","ringing"),limit(10)),
    snap=>{
      snap.docChanges().forEach(ch=>{
        const id=ch.doc.id;
        if(ch.type==="removed"){
          // المكالمة خرجت من حالة الرنين (اتلغت / اترفضت / اتردّ عليها)
          if(window.__incomingCallId===id){
            window.__incomingCallId=null;
            try{clearTimeout(window.__incomingTimer)}catch(_){}
            if(!window.__call){
              stopRingtone();
              const b=document.getElementById("callBar");if(b)b.remove();
              try{if(navigator.vibrate)navigator.vibrate(0)}catch(_){}
              toast("المتصل ألغى المكالمة");
            }
          }
          return;
        }
        if(ch.type!=="added"&&ch.type!=="modified")return;
        const d=ch.doc.data();
        // تجاهل مكالمات قديمة عالقة
        const age=Date.now()-tsMs(d.createdAt||Date.now());
        if(age>55000){return}
        if(d.status&&d.status!=="ringing"){
          if(window.__incomingCallId===id){
            window.__incomingCallId=null;
            stopRingtone();
            const b=document.getElementById("callBar");
            if(b&&!window.__call)b.remove();
            try{if(navigator.vibrate)navigator.vibrate(0)}catch(_){}
            if(d.status==="ended"||d.status==="cancelled")toast("المتصل ألغى المكالمة");
            else if(d.status==="missed")toast("انتهت المكالمة بدون رد");
          }
          if(window.__call&&window.__call.callId===id&&d.status!=="answered"&&d.status!=="ringing"){
            endVoiceCall("remote");
          }
          return;
        }
        if(d.status!=="ringing")return;
        if(window.__call)return;
        if(window.__incomingCallId===id)return;
        window.__incomingCallId=id;
        startRingtone();
        try{
          if("Notification" in window&&Notification.permission==="granted"){
            const n=new Notification("📞 مكالمة من "+(d.fromName||"زميل"),{
              body:"اضغط للرد — افتح التفوق",
              tag:"call_"+id,renotify:true,requireInteraction:true,silent:false
            });
            n.onclick=()=>{try{window.focus();n.close()}catch(_){}};
          }
          try{if(navigator.vibrate)navigator.vibrate([300,120,300,120,300,120,500])}catch(_){}
        }catch(_){}
        try{clearTimeout(window.__incomingTimer)}catch(_){}
        window.__incomingTimer=setTimeout(()=>{
          if(window.__incomingCallId===id&&!window.__call){
            window.__incomingCallId=null;stopRingtone();
            const b=document.getElementById("callBar");if(b)b.remove();
          }
        },50000);
        showIncomingCallUI(d.fromName||"شخص",()=>{
          window.__incomingCallId=null;
          try{clearTimeout(window.__incomingTimer)}catch(_){}
          answerVoiceCall(id,d);
        },()=>{
          window.__incomingCallId=null;
          stopRingtone();
          updateDoc(ch.doc.ref,{status:"rejected"}).catch(()=>{});
          const b=document.getElementById("callBar");if(b)b.remove();
          toast("رفضت المكالمة");
        });
      });
    },
    err=>{console.warn("calls listen",err);window.__callListen=null;toast("المكالمات: انشر firestore.rules الجديدة")}
  );
}

async function recordVoice(onDone){
  if(window.__voiceBusy){toast("في تسجيل شغّال");return}
  if(!window.MediaRecorder){toast("المتصفح مش بيدعم التسجيل");return}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast("المتصفح مش بيدعم الميكروفون");return}
  let stream,rec,chunks=[],timer,sec=0,stopping=false;
  const mimeCandidates=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""];
  let mime="";
  for(const m of mimeCandidates){
    if(!m||(window.MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m))){mime=m;break}
  }
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    toast("اسمح بالميكروفون من إعدادات المتصفح/الموقع");
    return;
  }
  window.__voiceBusy=true;
  const bar=document.createElement("div");
  bar.className="voice-bar";
  bar.innerHTML=`<div><span class="rec-dot"></span><b id="voiceSec">جاري التسجيل 0 ث</b></div>
    <p class="mut" style="margin:8px 0">اتكلم — بعدين دوس «إيقاف وإرسال»</p>
    <div class="row" style="justify-content:center;gap:10px">
      <button type="button" class="btn danger sm" id="voiceCancel">إلغاء</button>
      <button type="button" class="btn gold sm" id="voiceSend">⏹ إيقاف وإرسال</button>
    </div>`;
  document.body.appendChild(bar);
  function cleanup(){
    window.__voiceBusy=false;
    try{bar.remove()}catch(_){}
    clearInterval(timer);
    try{stream&&stream.getTracks().forEach(tr=>tr.stop())}catch(_){}
  }
  try{
    rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
  }catch(_){
    try{rec=new MediaRecorder(stream)}catch(e2){cleanup();toast("فشل بدء التسجيل");return}
  }
  chunks=[];
  rec.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};
  const finished=new Promise(resolve=>{
    rec.onstop=()=>{
      const type=((rec.mimeType||mime)||"audio/webm").split(";")[0]||"audio/webm";
      resolve(new Blob(chunks,{type}));
    };
    rec.onerror=()=>resolve(new Blob([],{type:"audio/webm"}));
  });
  try{rec.start(250)}catch(e){cleanup();toast("فشل التسجيل");return}
  timer=setInterval(()=>{
    sec++;
    const el=document.getElementById("voiceSec");
    if(el)el.textContent="جاري التسجيل "+sec+" ث";
    if(sec>=40)stop(true);
  },1000);
  async function stop(send){
    if(stopping)return;
    stopping=true;
    if(!rec||rec.state==="inactive"){cleanup();return}
    try{rec.requestData()}catch(_){}
    try{rec.stop()}catch(_){}
    let blob;
    try{blob=await finished}catch(_){blob=null}
    cleanup();
    if(!send)return;
    if(!blob||blob.size<200){toast("التسجيل فاضي — اتكلم أقرب للمايك وجرب تاني");return}
    if(blob.size>700000){toast("التسجيل طويل — سجّل أقل من 30 ثانية");return}
    toast("جاري إرسال التسجيل…");
    try{
      const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob)});
      if(onDone)await onDone(dataUrl);
    }catch(err){
      console.error(err);
      toast("فشل إرسال التسجيل");
    }
  }
  document.getElementById("voiceCancel").onclick=()=>stop(false);
  document.getElementById("voiceSend").onclick=()=>stop(true);
}
function loadMyGroups(){
  if(!S.user)return;
  if(window.__grpListUnsub)return; // once
  try{
    window.__grpListUnsub=onSnapshot(query(collection(db,"groups"),where("members","array-contains",S.user.uid),limit(30)),snap=>{
      S.groups=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>tsMs(b.updatedAt)-tsMs(a.updatedAt));
      if(S.view==="chatList"||S.view==="groups")scheduleRender();
    },err=>console.warn("groups",err));
  }catch(e){console.warn(e)}
}
function listenGroup(gid){
  if(window.__grpUnsub){try{window.__grpUnsub()}catch(_){}}
  window.__grpUnsub=onSnapshot(query(collection(db,"groups",gid,"msgs"),limit(80)),snap=>{
    const prev=(S.groupMsgs||[]).length;
    let msgs=snap.docs.map(d=>({id:d.id,...d.data()}));
    msgs.sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
    S.groupMsgs=msgs;
    if(S.view==="groupThread"){
      const log=$("#grpLog");
      if(log&&prev>0){patchChatLog(log,msgs,grpBubbleHtml,EMPTY_GRP)}
      else render();
      bindChatScroll();
      onChatMsgsUpdate(prev,msgs.length);
    }
  },err=>console.warn("grp msgs",err));
}
function groupsView(){
  const list=S.groups||[];
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openChats">رجوع</button>`)}
<h2>الجروبات</h2>
<button class="btn block gold" data-act="createGroup">＋ جروب جديد</button>
${list.length?list.map(g=>`<button type="button" class="card row" data-act="openGroup" data-id="${g.id}" data-name="${esc(g.name||"")}" style="width:100%;text-align:start;cursor:pointer;font:inherit;color:inherit">
  <div style="flex:1"><b>${esc(g.name||"جروب")}</b><div class="mut">${esc(g.lastText||"…")} · ${(g.members||[]).length} عضو</div></div>
</button>`).join(""):`<div class="card mut">مفيش جروبات — اعمل واحد وادعُ أصحابك.</div>`}
</div>${studentNav()}`;
}
function grpBubbleHtml(m){
    const mine=m.fromUid===S.user.uid;
    return `<div class="tk-bubble ${mine?"me":"them"}${lfBub(m.fromUid)}" data-mid="${m.id}">
      ${!mine?`<div style="font-size:11px;opacity:.8">${esc(m.fromName||"?")}${lfTag(m.fromUid)}</div>`:""}
      ${m.text&&m.kind!=="audio"&&m.kind!=="image"?`<div dir="auto">${esc(m.text)}</div>`:""}
      ${m.img?mediaEmbed(m.img,m.kind):""}
      ${reactsHtml("grp",m.id,m.reacts,true)}
      <div class="tk-foot"><span class="when">${m.createdAt?fmt(m.createdAt):""}</span><button type="button" class="tk-mini" data-act="pickReact" data-col="grp" data-id="${m.id}" aria-label="تفاعل">☺</button></div>
    </div>`;
}
function groupThreadView(){
  const msgs=S.groupMsgs||[];
  const addPanel=S.grpAddOpen?`<div class="grp-add-panel">
  <div class="row" style="margin-bottom:8px"><b style="flex:1">إضافة عضو</b><button class="btn ghost sm" data-act="closeGrpAdd">إغلاق</button></div>
  <input id="grpAddQ" type="text" maxlength="40" placeholder="اكتب حرفين من الاسم…" value="${esc(S.grpAddQ||"")}" autocomplete="off">
  <button class="btn sm" style="margin-top:8px" data-act="searchGrpAdd">بحث</button>
  ${(S.grpAddHits||[]).length?(S.grpAddHits.map(s=>{
    const av=s.avatar?`<img class="tk-av" src="${s.avatar}" style="width:40px;height:40px">`:`<div class="tk-av letter" style="width:40px;height:40px;font-size:14px">${esc((s.name||"?")[0])}</div>`;
    return `<button type="button" class="hit" data-act="pickGrpAdd" data-uid="${s.id}" data-name="${esc(s.name||"")}">${av}<div style="flex:1;text-align:start"><b>${esc(s.name||"?")}</b><div class="mut">طالب في المنصة</div></div><span class="btn sm">إضافة</span></button>`;
  }).join("")):(S.grpAddQ&&S.grpAddQ.length>=2?`<div class="mut" style="margin-top:8px">مفيش نتائج</div>`:`<div class="mut" style="margin-top:8px">اكتب حرفين على الأقل</div>`)}
</div>`:"";
  return `<div class="wrap chat-wrap">${header(NOHDR)}
<div class="tk-peer-row">
  <button class="btn ghost sm" data-act="openChats">رجوع</button>
  <div style="flex:1"><b style="font-size:18px">${esc(S.groupName||"جروب")}</b></div>
  <button class="btn ghost sm" data-act="addToGroup">＋ عضو</button>
</div>
${addPanel}
<div class="tk-thread">
  <div class="tk-log" id="grpLog">${msgs.length?msgs.map(grpBubbleHtml).join(""):EMPTY_GRP}</div>
</div>
<form class="tk-compose" data-submit="groupSend">
  <button type="button" class="btn ghost sm" data-act="groupVoice" title="تسجيل صوت">🎙</button>
  <label class="btn ghost sm" style="margin:0;cursor:pointer" title="صورة">🖼<input type="file" id="grpImg" accept="image/*" multiple hidden></label>
  <input id="grpIn" type="text" maxlength="2000" placeholder="اكتب رسالة…" autocomplete="off">
  <button class="btn sm" type="submit">➤</button>
</form>
</div>${studentNav()}`;
}

const EMPTY_DM=`<div class="mut" style="text-align:center;margin:auto">قول سلام 👋</div>`;
const EMPTY_GRP=`<div class="mut" style="text-align:center;margin:auto">اول رسالة في الجروب… اكتب تحت 👇</div>`;
/* تحديث سجل الرسائل بدون إعادة رسمه كله (من غير وميض ولا قفز) */
function patchChatLog(log,msgs,fn,emptyHtml){
  if(!log)return;
  if(!msgs||!msgs.length){log.innerHTML=emptyHtml||"";return}
  [...log.children].forEach(c=>{if(!c.dataset||!c.dataset.mid)c.remove()});
  const old=new Map();
  [...log.children].forEach(c=>{if(c.dataset&&c.dataset.mid)old.set(c.dataset.mid,c)});
  const keep=new Set();
  let prev=null;
  const mk=h=>{const t=document.createElement("template");t.innerHTML=h.trim();return t.content.firstElementChild};
  msgs.forEach(m=>{
    const id=String(m.id);keep.add(id);
    const h=fn(m);
    let el=old.get(id);
    if(el){
      if(el._h!==h){const n=mk(h);if(n){n._h=h;log.replaceChild(n,el);el=n}}
    }else{
      el=mk(h);if(!el)return;el._h=h;
      log.insertBefore(el,prev?prev.nextSibling:log.firstChild);
    }
    // ترتيب صحيح لو العنصر القديم مش في مكانه
    if(prev&&el.previousElementSibling!==prev)log.insertBefore(el,prev.nextSibling);
    prev=el;
  });
  old.forEach((el,id)=>{if(!keep.has(id)&&el.parentNode===log)el.remove()});
}
function peersLoad(){try{return JSON.parse(localStorage.getItem("peers_v1")||"{}")||{}}catch(_){return {}}}
function peersSave(){try{const p=window.__peers||{};const o={};Object.keys(p).slice(-120).forEach(k=>{o[k]={name:p[k].name,avatar:(p[k].avatar&&String(p[k].avatar).length<5000)?p[k].avatar:null}});localStorage.setItem("peers_v1",JSON.stringify(o))}catch(_){}}
function chatsCacheKey(){return "chats_cache_"+(S.user?S.user.uid:"")}
function loadChatsCache(){
  if(!S.user||(S.chats&&S.chats.length))return;
  try{const r=JSON.parse(localStorage.getItem(chatsCacheKey())||"null");if(Array.isArray(r)){S.chats=r;S.unreadChat=r.reduce((a,c)=>a+(c.unread||0),0)}}catch(_){}
}
function listenMyChats(){
  if(!S.user||S.isAdmin)return;
  if(window.__chatsUnsub){try{window.__chatsUnsub()}catch(_){}}
  if(!window.__peers)window.__peers=peersLoad();
  loadChatsCache();
  S.chats=S.chats||[];
  window.__chatsUnsub=onSnapshot(query(collection(db,"conversations"),where("participants","array-contains",S.user.uid),limit(CHATS_LIST_LIMIT)),snap=>{
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    rows.sort((a,b)=>tms(b.updatedAt||b.lastAt)-tms(a.updatedAt||a.lastAt));
    const build=()=>rows.map(c=>{
      const otherUid=(c.participants||[]).find(u=>u!==S.user.uid);
      const pr=otherUid&&window.__peers[otherUid];
      const otherName=(pr&&pr.name)||(c.names&&c.names[otherUid])||"زميل";
      const otherAvatar=(pr&&pr.avatar)||null;
      const unread=(c.lastFrom&&c.lastFrom!==S.user.uid && !(c.readBy&&c.readBy[S.user.uid] && tsMs(c.readBy[S.user.uid])>=tsMs(c.lastAt||c.updatedAt)))?1:0;
      return {id:c.id,otherUid,otherName,otherAvatar,lastText:c.lastText,lastAt:c.lastAt||c.updatedAt,unread};
    });
    const apply=()=>{
      const __old=window.__chatSig;
      S.chats=build();
      S.unreadChat=S.chats.reduce((a,c)=>a+(c.unread||0),0);
      const __sig=S.chats.map(c=>c.id+"|"+(c.lastText||"")+"|"+tms(c.lastAt)+"|"+c.unread+"|"+c.otherName).join("~");
      window.__chatSig=__sig;
      if(__old===__sig)return;
      try{localStorage.setItem(chatsCacheKey(),JSON.stringify(S.chats.map(c=>({id:c.id,otherUid:c.otherUid,otherName:c.otherName,otherAvatar:(c.otherAvatar&&String(c.otherAvatar).length<5000)?c.otherAvatar:null,lastText:c.lastText,lastAt:c.lastAt&&c.lastAt.seconds?{seconds:c.lastAt.seconds}:(typeof c.lastAt==="number"?c.lastAt:null),unread:c.unread}))))}catch(_){}
      if(S.view==="chatList"||S.view==="home")scheduleRender();
      else{try{const b=document.querySelector('nav.bot [data-act="openChats"]');if(b){let sp=b.querySelector(".badge");if(S.unreadChat){if(!sp){sp=document.createElement("span");sp.className="badge";b.appendChild(sp);b.insertBefore(document.createTextNode(" "),sp)}sp.textContent=S.unreadChat}else if(sp)sp.remove()}}catch(_){}}
    };
    apply(); // فوري — من غير انتظار بيانات الزملاء
    // هات الزملاء الناقصين بالتوازي، وبعدها حدّث مرة واحدة
    const missing=[...new Set(rows.map(c=>(c.participants||[]).find(u=>u!==S.user.uid)).filter(u=>u&&!window.__peers[u]))];
    if(missing.length){
      Promise.all(missing.map(async u=>{
        try{
          const st=await getDoc(doc(db,"students",u));
          if(st.exists()){const d=st.data();window.__peers[u]={name:d.name||"زميل",avatar:d.avatarThumb||d.avatar||null}}
          else window.__peers[u]={name:"زميل",avatar:null};
        }catch(_){}
      })).then(()=>{peersSave();apply()});
    }
  },err=>{
    console.warn("chats",err);
    const code=(err&&err.code)||"";
    if(code==="permission-denied")
      toast("الشات: رفض صلاحيات — انشر firestore.rules الجديدة من Firebase ثم أعد تحميل الصفحة",true);
    else if(code==="failed-precondition")
      toast("الشات: محتاج Index — دوس اللينك في Console إن ظهر",true);
    else
      toast("الشات: "+(code||err.message||"خطأ اتصال"));
  });
}

function chatLogEl(){
  if(S.view==="chatThread")return $("#dmChatLog");
  if(S.view==="groupThread")return $("#grpLog");
  return null;
}
function isNearBottom(el,px){
  if(!el)return true;
  return (el.scrollHeight-el.scrollTop-el.clientHeight)<(px||80);
}
function scrollChatBottom(force){
  const el=chatLogEl();
  if(!el)return;
  const go=()=>{el.scrollTop=el.scrollHeight};
  requestAnimationFrame(()=>requestAnimationFrame(go));
  setTimeout(go,50);
  setTimeout(go,200);
  if(force){S.chatStickBottom=true;S.chatNewBelow=0}
}
function bindChatScroll(){
  const el=chatLogEl();
  if(!el||el._chatBound)return;
  el._chatBound=true;
  el.addEventListener("scroll",()=>{
    S.chatStickBottom=isNearBottom(el,100);
    if(S.chatStickBottom){S.chatNewBelow=0;const j=$("#chatJumpBtn");if(j)j.remove()}
  },{passive:true});
}
function showChatJump(n){
  if($("#chatJumpBtn")){
    const b=$("#chatJumpBtn .n");if(b&&n)b.textContent=String(n);
    return;
  }
  const btn=document.createElement("button");
  btn.type="button";btn.id="chatJumpBtn";btn.className="chat-jump";
  btn.innerHTML=`↓ رسائل جديدة${n?` <span class="n">${n}</span>`:""}`;
  btn.onclick=()=>{scrollChatBottom(true);btn.remove()};
  document.body.appendChild(btn);
}
function onChatMsgsUpdate(prevLen,newLen){
  const el=chatLogEl();
  const added=Math.max(0,(newLen||0)-(prevLen||0));
  // أول فتح أو لازق تحت → انزل
  if(S.chatStickBottom!==false || !el || (prevLen||0)===0){
    S.chatStickBottom=true;
    scrollChatBottom(true);
    const j=$("#chatJumpBtn");if(j)j.remove();
    return;
  }
  if(added>0 && !isNearBottom(el,100)){
    S.chatNewBelow=(S.chatNewBelow||0)+added;
    showChatJump(S.chatNewBelow);
  }else{
    scrollChatBottom(false);
  }
}

function listenDmThread(cid,otherUid){
  if(window.__dmUnsub){try{window.__dmUnsub()}catch(_){}}
  if(window.__dmMetaUnsub){try{window.__dmMetaUnsub()}catch(_){}}
  window.__dmMetaUnsub=onSnapshot(doc(db,"conversations",cid),snap=>{
    if(!snap.exists())return;
    const d=snap.data()||{};
    const typing=d.typingUid&&d.typingUid!==S.user.uid&&d.typingAt&&(Date.now()-(d.typingAt>1e12?d.typingAt:d.typingAt*1000)<5000);
    if(!!typing!==!!S.chatTyping){
      S.chatTyping=!!typing;
      if(S.view==="chatThread"){
        let el=document.getElementById("dmTypingLine");
        if(!el){
          const box=document.querySelector(".chat-wrap .row div[style*=\"flex:1\"]");
          if(box){el=document.createElement("div");el.id="dmTypingLine";el.className="mut";el.style.cssText="font-size:12px;margin-top:2px";box.appendChild(el)}
        }
        if(el)el.textContent=typing?"يكتب الآن…":"";
      }
    }
  },()=>{});
  window.__dmUnsub=onSnapshot(query(collection(db,"conversations",cid,"msgs"),orderBy("createdAt","desc"),limit(50)),snap=>{
    const prev=(S.chatMsgs||[]).length;
    let msgs=snap.docs.map(d=>({id:d.id,...d.data()})).reverse();
    // احتفظ بالرسائل المحلية لحد ما توصل من السيرفر (صور فورية)
    const locals=(S.chatMsgs||[]).filter(m=>m._local);
    if(locals.length){
      const ids=new Set(msgs.map(m=>m.id));
      const texts=new Set(msgs.map(m=>(m.text||"")+"|"+(m.img?1:0)));
      locals.forEach(l=>{
        const key=(l.text||"")+"|"+(l.img?1:0);
        if(!texts.has(key))msgs=msgs.concat([l]);
      });
      msgs.sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
    }
    const sig=msgs.map(m=>m.id+":"+(m.read?1:0)+":"+(m.deleted?1:0)+":"+Object.entries(m.reacts||{}).map(([k,v])=>k+"="+(Array.isArray(v)?v.length:0)+((Array.isArray(v)&&S.user&&v.includes(S.user.uid))?"*":"")).join(",")+":"+(m.img?1:0)+":"+String(m.text||"").length).join("|");
    if(sig===window.__dmSig&&S.view==="chatThread"){
      // مفيش تغيير حقيقي
      return;
    }
    window.__dmSig=sig;
    S.chatMsgs=msgs;
    try{localStorage.setItem("dmcache_"+cid,JSON.stringify(msgs.slice(-50).map(m=>({...m,img:(m.img&&String(m.img).length<4000)?m.img:null}))))}catch(_){}
    if(S.view==="chatThread"){
      const log=$("#dmChatLog");
      if(log&&prev>0&&msgs.length>=prev){
        // تحديث اللوج فقط بدون إعادة رسم الصفحة كلها
        try{
          patchChatLog(log,msgs,dmBubbleHtml,EMPTY_DM);
          bindChatScroll();
          onChatMsgsUpdate(prev,msgs.length);
        }catch(e){render();bindChatScroll();onChatMsgsUpdate(prev,msgs.length)}
      }else{
        render();
        bindChatScroll();
        onChatMsgsUpdate(prev,msgs.length);
      }
    }
    msgs.filter(m=>m.toUid===S.user.uid&&!m.read&&!m._local).forEach(m=>{
      updateDoc(doc(db,"conversations",cid,"msgs",m.id),{read:true}).catch(()=>{});
    });
    // لا render كامل هنا — التحديث الجزئي فوق يكفي
  },err=>{
    console.warn("dm",err);
    window.__dmUnsub=onSnapshot(collection(db,"conversations",cid,"msgs"),snap=>{
      const prev=(S.chatMsgs||[]).length;
      let msgs=snap.docs.map(d=>({id:d.id,...d.data()})).slice(-50);
      msgs.sort((a,b)=>tms(a.createdAt)-tms(b.createdAt));
      S.chatMsgs=msgs;
      if(S.view==="chatThread"){render();bindChatScroll();onChatMsgsUpdate(prev,msgs.length)}
    },e2=>console.warn("dm2",e2));
  });
}
function loadOpenRooms(){
  if(!db||S.isAdmin)return;
  try{
    if(window.__openRoomsUnsub){try{window.__openRoomsUnsub()}catch(_){}}
    // بدون composite index: نجيب الغرف ونفلتر محلياً
    window.__openRoomsUnsub=onSnapshot(query(collection(db,"qb_rooms"),limit(CHATS_LIST_LIMIT)),snap=>{
      S.openRooms=snap.docs.map(d=>({id:d.id,code:d.id,...d.data()})).filter(r=>{
        const n=Object.keys(r.players||{}).filter(k=>k!=="bot").length;
        if(n===0&&r.status!=="playing"){
          try{deleteDoc(doc(db,"qb_rooms",r.id||r.code)).catch(()=>{})}catch(_){}
          return false;
        }
        return r.public&&r.status==="lobby"&&n>0;
      });
      if(S.view==="games")scheduleRender();
    },err=>console.warn("openRooms",err));
  }catch(e){console.warn(e)}
}
function qbPresence(away){
  const code=S.qb&&S.qb.roomCode;if(!code||!S.user)return;
  updateDoc(doc(db,"qb_rooms",code),{
    [`players.${S.user.uid}.away`]:!!away,
    [`players.${S.user.uid}.seen`]:Date.now()
  }).catch(()=>{});
}
function qbStopChat(){if(S.qbChatSub){try{S.qbChatSub()}catch(_){} S.qbChatSub=null} S.qbChat=[]}
function qbListenChat(code){
  qbStopChat();
  S.qbChatSub=onSnapshot(query(collection(db,"qb_rooms",code,"chat"),orderBy("createdAt","asc"),limit(80)),s=>{
    S.qbChat=s.docs.map(d=>({id:d.id,...d.data()}));
    if(S.view==="qbLobby"||S.view==="qbPlay"||S.view==="qbResult"){
      const box=$("#qbChatLog");
      if(box){
        box.innerHTML=S.qbChat.map(m=>`<div class="qb-chat-msg"><div class="qb-chat-head">${qbChatAvatar(m)}<button type="button" class="who" data-act="openProfile" data-uid="${esc(m.uid||"")}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--pri);font-weight:700">${esc(m.name||"?")}</button><span class="when">${m.createdAt?fmt(m.createdAt):""}</span></div><div dir="auto" class="qb-chat-body">${esc(m.text||"")}</div>${m.img?mediaEmbed(m.img,m.kind):""}</div>`).join("")||`<div class="mut">اكتب رسالة للغرفة…</div>`;
        requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight});
      } else render();
    }
  },err=>console.warn("chat",err));
}

function ytId(url){
  const m=String(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,20})/);
  const id=m&&m[1]?m[1]:null;
  return id&&/^[A-Za-z0-9_-]{6,20}$/.test(id)?id:null;
}
/** عرض صورة / فيديو يوتيوب / رابط مباشر */
function mediaEmbed(url, kind){
  if(!url)return "";
  const u=String(url);
  if(kind==="audio"||u.startsWith("data:audio")){
    const id="aud_"+Math.random().toString(36).slice(2,8);
    return `<div style="margin-top:6px;max-width:300px"><audio id="${id}" controls src="${esc(u)}" style="width:100%"></audio>
    <div class="audio-speed">
      <button type="button" data-act="audSpeed" data-id="${id}" data-r="1">×1</button>
      <button type="button" data-act="audSpeed" data-id="${id}" data-r="1.5">×1.5</button>
      <button type="button" data-act="audSpeed" data-id="${id}" data-r="2">×2</button>
    </div></div>`;
  }
  const id=ytId(u);
  if(id){
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;margin-top:8px;background:#000"><iframe src="https://www.youtube.com/embed/${id}" title="video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if(kind==="video"||/\.(mp4|webm|mov)(\?|$)/i.test(u)){
    return `<video src="${esc(u)}" controls playsinline preload="none" style="width:100%;max-height:420px;border-radius:12px;margin-top:8px;background:#000"></video>`;
  }
  if(u.startsWith("data:image")||kind==="image"||/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(u)){
    return `<img src="${esc(u)}" alt="" class="asmimg" data-act="zoom" style="width:100%;max-height:480px;object-fit:contain;border-radius:12px;margin-top:8px;cursor:zoom-in" loading="lazy">`;
  }
  return `<p style="margin-top:8px"><a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">فتح الرابط ↗</a></p>`;
}

function resizeDataUrl(dataUrl,maxSide,q){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxSide||h>maxSide){const k=Math.min(maxSide/w,maxSide/h);w=Math.round(w*k);h=Math.round(h*k)}
      const c=document.createElement("canvas");c.width=Math.max(1,w);c.height=Math.max(1,h);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL("image/jpeg",q));
    };
    img.onerror=()=>reject(new Error("img"));
    img.src=dataUrl;
  });
}
/** ينقل الصورة الكبيرة لمستند avatars/{uid} ويسيب في مستند الطالب نسخة صغيرة */
async function migrateAvatar(uid,dataUrl){
  if(!uid||!dataUrl||String(dataUrl).indexOf("data:")!==0||String(dataUrl).length<=30000)return false;
  const av=await resizeDataUrl(dataUrl,160,0.7);
  const thumb=await resizeDataUrl(dataUrl,96,0.65);
  await setDoc(doc(db,"avatars",uid),{data:dataUrl,updatedAt:serverTimestamp()});
  await updateDoc(doc(db,"students",uid),{avatar:av,avatarThumb:thumb});
  return true;
}
function packImage(file,maxSide,quality,maxBytes){
  maxSide=maxSide||800;quality=quality==null?0.7:quality;maxBytes=maxBytes||400000;
  return drawPacked(file,maxSide).then(c=>{
    let q=quality,data=c.toDataURL("image/jpeg",q);
    // نقلّل الجودة تدريجي بس لو عدّينا الحد (Firestore ~1MB)
    while(data.length>maxBytes&&q>0.4){q-=0.05;data=c.toDataURL("image/jpeg",q)}
    if(data.length>maxBytes){
      // صغّر الأبعاد شوية كمان
      const c2=document.createElement("canvas");
      c2.width=Math.max(1,Math.round(c.width*0.75));c2.height=Math.max(1,Math.round(c.height*0.75));
      c2.getContext("2d").drawImage(c,0,0,c2.width,c2.height);
      data=c2.toDataURL("image/jpeg",Math.max(0.45,q));
    }
    return data;
  });
}
/* تحويل الصورة لكانفاس — مسار سريع بـ createImageBitmap (فك تشفير مباشر من غير base64 للملف الأصلي = أسرع بمرتين وأخف على الرام) */
function drawPacked(file,maxSide){
  if(window.createImageBitmap){
    return createImageBitmap(file).then(bmp=>{
      try{
        let w=bmp.width,h=bmp.height;
        if(w>maxSide||h>maxSide){const s=Math.min(maxSide/w,maxSide/h);w=Math.round(w*s);h=Math.round(h*s)}
        const c=document.createElement("canvas");c.width=Math.max(1,w);c.height=Math.max(1,h);
        const ctx=c.getContext("2d");ctx.imageSmoothingQuality="high";
        ctx.drawImage(bmp,0,0,w,h);
        return c;
      }finally{if(bmp.close)try{bmp.close()}catch(_){}}
    }).catch(()=>drawPackedFallback(file,maxSide));
  }
  return drawPackedFallback(file,maxSide);
}
function drawPackedFallback(file,maxSide){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error("read"));
    r.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.width,h=img.height;
        if(w>maxSide||h>maxSide){const s=Math.min(maxSide/w,maxSide/h);w=Math.round(w*s);h=Math.round(h*s)}
        const c=document.createElement("canvas");c.width=Math.max(1,w);c.height=Math.max(1,h);
        c.getContext("2d").drawImage(img,0,0,w,h);
        resolve(c);
      };
      img.onerror=()=>reject(new Error("img"));
      img.src=r.result;
    };
    r.readAsDataURL(file);
  });
}
function withTimeout(p,ms,msg){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg||"timeout")),ms))])}
/* رفع متوازي: كذا عنصر مع بعض في نفس الوقت بدل واحد ورا التاني */
async function runPool(items,concurrency,worker,onDone){
  const res=new Array(items.length).fill(false);
  let idx=0,done=0;
  const cnt=Math.max(1,Math.min(concurrency,items.length||1));
  const runners=[];
  for(let r=0;r<cnt;r++){
    runners.push((async()=>{
      while(idx<items.length){
        const i=idx++;
        try{await worker(items[i],i);res[i]=true}
        catch(e){console.error(e)}
        done++;
        if(onDone)try{onDone(done,items.length,res[i])}catch(_){}
      }
    })());
  }
  await Promise.all(runners);
  return res;
}
/* بصمة الملف — من غير ما نحمل الملف كله في الرام: الحجم + أول وآخر 256KB */
async function fileFingerprint(f){
  try{
    if(!f||!f.size||!window.crypto||!crypto.subtle)return null;
    const H=Math.min(f.size,262144);
    const parts=[new Uint8Array(await f.slice(0,H).arrayBuffer())];
    if(f.size>H*2)parts.push(new Uint8Array(await f.slice(f.size-H).arrayBuffer()));
    const enc=new TextEncoder().encode(String(f.size)+":");
    let len=enc.length;parts.forEach(p=>len+=p.length);
    const all=new Uint8Array(len);
    all.set(enc,0);let off=enc.length;
    parts.forEach(p=>{all.set(p,off);off+=p.length});
    const h=new Uint8Array(await crypto.subtle.digest("SHA-256",all));
    return Array.from(h).map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch(e){console.warn("fp",e);return null}
}
async function dbServerOk(){
  if(!db)return false;
  try{
    await Promise.race([
      getDocs(query(collection(db,"fadaye7"),limit(1)),{source:"server"}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),9000))
    ]);
    return true;
  }catch(e){return false}
}
/** صورة بروفايل مصغّرة للغرف (مش بنحط الأصلية عشان متتفخّش وثيقة الغرفة) */
function packTinyAvatar(dataUrl){
  return new Promise(resolve=>{
    if(!dataUrl||typeof dataUrl!=="string"||!dataUrl.startsWith("data:")){resolve("");return}
    const img=new Image();
    img.onload=()=>{
      const side=56;const c=document.createElement("canvas");c.width=side;c.height=side;
      const ctx=c.getContext("2d");
      const s=Math.min(img.width,img.height);const sx=(img.width-s)/2,sy=(img.height-s)/2;
      ctx.drawImage(img,sx,sy,s,s,0,0,side,side);
      resolve(c.toDataURL("image/jpeg",0.55));
    };
    img.onerror=()=>resolve("");
    img.src=dataUrl;
  });
}
function qbChatAvatar(m){
  if(m.avatar)return `<img class="qb-chat-av" src="${m.avatar}" alt="">`;
  const room=S.qb&&S.qb.room;
  const p=room&&room.players&&m.uid?room.players[m.uid]:null;
  if(p&&p.avatar)return `<img class="qb-chat-av" src="${p.avatar}" alt="">`;
  const letter=esc((m.name||"?")[0]||"?");
  return `<span class="qb-chat-av letter">${letter}</span>`;
}
function qbChatHtml(){
  const msgs=S.qbChat||[];
  return `<div class="qb-chat"><div class="qb-chat-log" id="qbChatLog">${msgs.length?msgs.map(m=>`<div class="qb-chat-msg"><div class="qb-chat-head">${qbChatAvatar(m)}<button type="button" class="who" data-act="openProfile" data-uid="${esc(m.uid||"")}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--pri);font-weight:700">${esc(m.name||"?")}</button><span class="when">${m.createdAt?fmt(m.createdAt):""}</span></div><div dir="auto" class="qb-chat-body">${esc(m.text||"")}</div>${m.img?mediaEmbed(m.img,m.kind):""}</div>`).join(""):`<div class="mut">الشات فوري — اكتب ورسالتك توصل للجميع حالاً</div>`}</div>
<form class="qb-chat-form" data-submit="qbChatSend"><input id="qbChatIn" type="text" maxlength="300" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn sm" type="submit">إرسال</button>
<label class="btn ghost sm" style="margin:0;cursor:pointer;flex-shrink:0" title="صورة من الجهاز">🖼<input type="file" id="qbChatImg" accept="image/*" multiple hidden></label>
<button type="button" class="btn ghost sm" style="margin:0;flex-shrink:0" data-act="qbSendLink" title="رابط فيديو">🔗</button>
<button type="button" class="btn ghost sm" style="margin:0;flex-shrink:0" data-act="qbVoice" title="تسجيل صوت">🎙</button>
</form></div>`;
}
function qbListenRoom(code){
  qbStopSub();
  qbListenChat(code);
  S.qbSub=onSnapshot(doc(db,"qb_rooms",code),snap=>{
    if(!snap.exists()){toast("الغرفة اتقفلت");S.qb=null;S.view="games";render(true);return}
    const room={...snap.data(),code};
    if(!S.qb)S.qb={mode:"friends"};
    S.qb.room=room;S.qb.roomCode=code;
    // لو مستني موافقة دخول
    if(S.qb.waitingJoin){
      if(room.players&&room.players[S.user.uid]){
        S.qb.waitingJoin=false;
        toast("اتقبلت في الغرفة ✓");
        S.view="qbLobby";render(true);return;
      }
      if(!(room.joinRequests&&room.joinRequests[S.user.uid])){
        S.qb.waitingJoin=false;S.qb=null;S.view="games";
        toast("اترفض طلب الدخول أو الغرفة اتقفلت");
        render(true);return;
      }
      // لسه مستني
      if(S.view!=="games"){S.view="games";render()}
      return;
    }
    // اتعملت طرد؟
    if(room.players&&!room.players[S.user.uid]&&!S.qb.waitingJoin){
      toast("اتطردت من الغرفة أو خرجت");
      qbStopSub();S.qb=null;S.view="games";render(true);return;
    }
    if(room.status==="lobby"){
      if(S.view!=="qbLobby"){S.view="qbLobby";render(true)}
      else render();
      return;
    }
    if(room.status==="done"){
      if(S.qb.match){
        // merge final scores
        const pls=Object.values(room.players||{});
        S.qb.match.players=pls.map(p=>({...p}));
      }
      S.view="qbResult";render(true);qbSaveBattle();
      return;
    }
    if(room.status==="playing"){
      const players=Object.values(room.players||{}).map(p=>({...p}));
      const idx=room.idx||0;
      if(!S.qb.match){
        S.qb.match={qs:room.qs,idx,sec:room.sec,deadline:room.sec?Date.now()+room.sec*1000:0,players,answered:false,pick:null,seed:room.seed};
        S.view="qbPlay";render(true);qbStartRound();
        return;
      }
      // sync scores from peers
      S.qb.match.players=players;
      // advance question if host bumped idx
      if(idx!==S.qb.match.idx){
        S.qb.match.idx=idx;
        S.qb.match.answered=false;
        S.qb.match.pick=null;
        players.forEach(p=>{p.ans=null});
        if(idx>=(room.qs||[]).length){
          S.view="qbResult";render(true);qbSaveBattle();return;
        }
        S.view="qbPlay";render(true);qbStartRound();
        return;
      }
      // just refresh HUD scores; host advances when all answered
      if(S.view==="qbPlay"){
        render();
        if(S.qb.room&&S.qb.room.host===S.user.uid){
          const humans=players.filter(p=>p.uid!=="bot");
          if(humans.length>=2 && humans.every(p=>p.ans!=null)){
            setTimeout(()=>qbTryAdvance(), 400);
          }
        }
      }
    }
  },err=>{console.error(err);toast("انقطع الاتصال بالغرفة — تأكد من قواعد Firebase")});
}
function qbStartRound(){
  clearInterval(window.__qbT);
  const m=S.qb&&S.qb.match;if(!m)return;
  m.answered=false;m.pick=null;
  if(m.sec)m.deadline=Date.now()+m.sec*1000;
  // bot schedules answer
  if(S.qb.mode==="bot"){
    const bot=m.players.find(p=>p.uid==="bot");
    const q=m.qs[m.idx];
    const {ms,willCorrect}=qbBotDelay(S.qb.diff);
    clearTimeout(window.__qbBot);
    window.__qbBot=setTimeout(()=>{
      if(!S.qb||!S.qb.match||S.qb.match.idx!==m.idx||m.answered)return;
      const choice=willCorrect?q.a:shuf(q.o.map((_,i)=>i).filter(i=>i!==q.a),mulberry(Date.now()))[0];
      qbApplyAnswer(bot, choice, false);
      render(true);
    },ms);
  }
  if(m.sec){
    window.__qbT=setInterval(()=>{
      if(!S.qb||!S.qb.match){clearInterval(window.__qbT);return}
      const left=Math.max(0,S.qb.match.deadline-Date.now());
      const el=$("#qbSec"),bar=$("#qbBar");
      if(el)el.textContent=Math.ceil(left/1000)+"ث";
      if(bar){bar.style.width=(left/(S.qb.match.sec*1000)*100)+"%";bar.parentElement.classList.toggle("low",left<=5000)}
      if(left<=0){clearInterval(window.__qbT);qbOnAnswer(-1)}
    },200);
  }
}
function qbOnAnswer(choice){
  const m=S.qb&&S.qb.match;if(!m||m.answered)return;
  const me=m.players.find(p=>p.uid===S.user.uid);if(!me)return;
  m.answered=true;m.pick=choice;
  qbApplyAnswer(me, choice, true);
  // friends mode: push answer to room so peer sees scores
  if(S.qb.mode==="friends"&&S.qb.roomCode){
    const code=S.qb.roomCode;
    const patch={
      [`players.${S.user.uid}.score`]:me.score,
      [`players.${S.user.uid}.correct`]:me.correct,
      [`players.${S.user.uid}.wrong`]:me.wrong,
      [`players.${S.user.uid}.streak`]:me.streak,
      [`players.${S.user.uid}.bestStreak`]:me.bestStreak||0,
      [`players.${S.user.uid}.ans`]:choice,
      [`players.${S.user.uid}.ansAt`]:Date.now()
    };
    updateDoc(doc(db,"qb_rooms",code),patch).catch(()=>{});
  }
  render(true);
  setTimeout(()=>{
    const opts=document.querySelectorAll(".qb-opt");
    const q=m.qs[m.idx];
    opts.forEach((el,j)=>{
      el.disabled=true;
      if(j===q.a)el.classList.add("right");
      else if(j===choice&&choice!==q.a)el.classList.add("wrong");
    });
  },30);
  if(S.qb.mode==="bot"){
    setTimeout(qbNext, choice===m.qs[m.idx].a?900:1200);
  } else {
    // friends: wait for both answers or timer, host advances
    setTimeout(()=>qbTryAdvance(), 600);
  }
}
function qbTryAdvance(){
  const g=S.qb;if(!g||!g.match||g.mode!=="friends")return;
  if(!g.room||g.room.host!==S.user.uid)return;
  const m=g.match;
  const humans=m.players.filter(p=>p.uid!=="bot");
  // need at least 2 players and all have answered this round
  if(humans.length<2)return;
  if(!humans.every(p=>p.ans!=null))return;
  if(m._advancing)return;
  m._advancing=true;
  const code=g.roomCode;
  const clear={idx:(m.idx+1)};
  humans.forEach(p=>{clear[`players.${p.uid}.ans`]=null});
  if(m.idx+1>=m.qs.length)clear.status="done";
  updateDoc(doc(db,"qb_rooms",code),clear)
    .then(()=>{m._advancing=false})
    .catch(e=>{m._advancing=false;toast("تعذر الانتقال للسؤال التالي");console.error(e)});
}
function qbApplyAnswer(player, choice, isHuman){
  const m=S.qb.match,q=m.qs[m.idx];
  const correct=choice===q.a;
  // speed bonus only for human first answer timing
  let pts=0;
  if(correct){
    pts=10;
    if(isHuman&&m.sec&&m.deadline){
      const remain=(m.deadline-Date.now())/(m.sec*1000);
      if(remain>0.66)pts+=3; else if(remain>0.33)pts+=2; else if(remain>0)pts+=1;
    }
    player.streak=(player.streak||0)+1;
    player.bestStreak=Math.max(player.bestStreak||0,player.streak);
    if(player.streak>=10)pts*=5; else if(player.streak>=5)pts*=3; else if(player.streak>=3)pts*=2;
    player.correct=(player.correct||0)+1;
    player.score=(player.score||0)+pts;
    if(isHuman&&navigator.vibrate)navigator.vibrate(12);
  }else{
    player.streak=0;
    player.wrong=(player.wrong||0)+1;
    if(isHuman&&navigator.vibrate)navigator.vibrate([30,40,30]);
  }
}
function qbNext(){
  const m=S.qb&&S.qb.match;if(!m)return;
  clearTimeout(window.__qbBot);
  m.idx++;
  if(m.idx>=m.qs.length){
    clearInterval(window.__qbT);
    S.view="qbResult";render(true);
    // confetti for winner
    const sorted=[...m.players].sort((a,b)=>b.score-a.score);
    if(sorted[0]&&sorted[0].uid===S.user.uid&&typeof confetti==="function")try{confetti()}catch(_){}
    qbSaveBattle();
    return;
  }
  m.answered=false;m.pick=null;
  render(true);qbStartRound();
}
async function qbSaveBattle(){
  const g=S.qb;if(!g||!g.match||!S.user)return;
  const m=g.match;
  const me=m.players.find(p=>p.uid===S.user.uid);if(!me)return;
  try{
    await addDoc(collection(db,"qb_battles"),{
      uid:S.user.uid,name:S.profile.name,
      mode:g.mode,diff:g.diff||null,subject:m.qs[0]&&m.qs[0].sub,
      score:me.score,correct:me.correct,wrong:me.wrong,total:m.qs.length,
      bestStreak:me.bestStreak||0,rank:[...m.players].sort((a,b)=>b.score-a.score).findIndex(p=>p.uid===S.user.uid)+1,
      players:m.players.map(p=>({uid:p.uid,name:p.name,score:p.score})),
      createdAt:serverTimestamp()
    });
  }catch(_){}
}

/* ---------- الامتحان ---------- */
function tick(){
  const el=$("#timer");if(!el||!S.cur||!S.cur.endAt)return;
  const left=Math.max(0,Math.round((S.cur.endAt-Date.now())/1000));
  el.textContent=dur(left);
  if(left<=0){
    clearInterval(timer);
    // avoid double-submit / flash
    if(S.cur&&!S.cur.done&&!S.cur.busy){
      toast("خلص الوقت — بنسلّم الإجابات…");
      submitExam(true);
    }
  }
}
function saveNavState(){
  if(!S.user||S.isAdmin)return;
  try{
    const st={view:S.view,subject:S.subject};
    // exam has own session; skip ephemeral edit screens
    if(["editExam","editAsm","loading","auth"].includes(st.view)) return;
    if(S.view==="exam"&&S.cur) return; // handled by exam session
    if(S.qb&&S.qb.roomCode){
      st.qbRoom=S.qb.roomCode; st.qbMode=S.qb.mode||"friends";
    }
    localStorage.setItem("nav_"+S.user.uid, JSON.stringify(st));
  }catch(_){}
}
function restoreNavState(){
  if(!S.user||S.isAdmin||S.cur)return;
  try{
    const raw=localStorage.getItem("nav_"+S.user.uid);if(!raw)return;
    const st=JSON.parse(raw);if(!st||!st.view)return;
    if(st.qbRoom){
      try{
        S.qb={mode:st.qbMode||"friends",roomCode:st.qbRoom};
        if(typeof qbListenRoom==="function")qbListenRoom(st.qbRoom);
        else S.view="home";
      }catch(_e){S.view="home"}
      return;
    }
    const ok=["home","subject","progress","games","asmList","me","fadaye7","books","ai"];
    if(ok.includes(st.view)){S.view=st.view;if(st.subject)S.subject=st.subject}
    else S.view="home";
  }catch(_e){S.view="home"}
}
function syncMyLeaderboard(){
  if(!S.user||S.isAdmin||!S.profile)return;
  try{
    const all=Object.values(S.attempts||{}).flat();
    if(!all.length)return;
    const byExam={};
    all.forEach(r=>{
      if(!r.examId)return;
      const prev=byExam[r.examId];
      if(!prev||(r.score/Math.max(r.total,1))>(prev.score/Math.max(prev.total,1))) byExam[r.examId]=r;
    });
    const list=Object.values(byExam);
    const __lb=lbPayload(list);
    const __sig=["v2",__lb.examsDone,__lb.totalScore,__lb.totalQ,S.profile.name||"",S.profile.phone||""].join("|");
    try{const k="lbsig_"+S.user.uid;if(localStorage.getItem(k)===__sig)return;localStorage.setItem(k,__sig)}catch(_){}
    setDoc(doc(db,"leaderboard",S.user.uid),{
      uid:S.user.uid,name:S.profile.name||"طالب",
      ...__lb,
      updatedAt:serverTimestamp()
    },{merge:true}).catch(()=>{});
  }catch(_){}
}
function logActivity(action, detail){
  if(!S.user||S.isAdmin)return;
  try{
    addDoc(collection(db,"activity"),{
      uid:S.user.uid,
      name:(S.profile&&S.profile.name)||"",
      phone:(S.profile&&S.profile.phone)||"",
      action, detail:detail||"",
      device:device(),
      createdAt:serverTimestamp()
    }).catch(()=>{});
  }catch(_){}
}
function examDraftKey(c){return c?("draft_"+c.sid):null}
function examSessionKey(uid){return "exam_session_"+uid}
function persistExamSession(c){
  if(!c||!S.user||c.done)return;
  try{
    localStorage.setItem(examSessionKey(S.user.uid), JSON.stringify({
      sid:c.sid, examId:c.exam.id, n:c.n, endAt:c.endAt||0, seed:c.st.seed, t:c.st.t, tabs:c.tabs||0
    }));
  }catch(_){}
}
function clearExamSession(){
  try{if(S.user)localStorage.removeItem(examSessionKey(S.user.uid))}catch(_){}
}
async function tryResumeExam(){
  if(!S.user||S.isAdmin||S.cur)return;
  let raw;try{raw=localStorage.getItem(examSessionKey(S.user.uid))}catch(_){return}
  if(!raw)return;
  let meta;try{meta=JSON.parse(raw)}catch(_){clearExamSession();return}
  if(!meta||!meta.sid||!meta.examId){clearExamSession();return}
  // already submitted?
  if((S.attempts[meta.examId]||[]).some(r=>(r.attempt||1)===meta.n||r.id===meta.sid)){
    clearExamSession();clearExamDraft({sid:meta.sid});return;
  }
  const e=S.exams.find(x=>x.id===meta.examId);
  if(!e||!vis(e)){clearExamSession();return}
  try{
    const g=await getDoc(doc(db,"starts",meta.sid));
    if(!g.exists()){clearExamSession();clearExamDraft({sid:meta.sid});return}
    const st=g.data();
    // always recompute endAt from original start time so pause doesn't freeze the clock
    const endAt=e.minutes?(st.t+e.minutes*60000):0;
    if(endAt&&Date.now()>=endAt+90000){ // grace 90 sec after official end
      clearExamSession();
      toast("وقت الامتحان خلص وما عادش ينفع استئناف");
      return;
    }
    S.cur={exam:e,n:meta.n,sid:meta.sid,st,endAt,done:false,busy:false,away:false,pausing:false,tabs:meta.tabs||0,answered:st.answered||0,order:buildOrder(e,st.seed||meta.seed)};
    S.view="exam";render(true);
    setTimeout(loadExamDraft, 100);
    clearInterval(timer);clearInterval(hb);timer=null;hb=null;
    hb=setInterval(()=>liveUpdate({answered:S.cur?S.cur.answered:0,away:S.cur?S.cur.away:false}),60000);
    liveUpdate({away:false});
    if(endAt){
      if(Date.now()>=endAt){
        // time already over — auto submit after short moment so draft loads first
        setTimeout(()=>{if(S.cur&&!S.cur.done){toast("خلص الوقت — بنسلّم…");submitExam(true)}},600);
      }else{
        tick();timer=setInterval(tick,1000);
      }
    }
    toast("كمّلنا الامتحان من حيث وقفت ✓");
    persistExamSession(S.cur);
  }catch(err){console.error(err);toast("فشل الاستئناف — جرّب تاني")}
}
function readExamAnsFromDOM(){
  const c=S.cur;if(!c)return[];
  return c.exam.questions.map((q,i)=>{
    if(q.essay){const ta=document.querySelector(`textarea[name=q${i}]`);return ta?ta.value:""}
    const r=document.querySelector(`input[name=q${i}]:checked`);return r?+r.value:-1;
  });
}
function pauseExamNow(auto){
  const c=S.cur;if(!c||c.done||c.pausing)return;
  c.pausing=true;
  try{saveExamDraft()}catch(_){}
  try{persistExamSession(c)}catch(_){}
  try{logActivity(auto?"exam_pause_auto":"exam_pause", c.exam.title||"")}catch(_){}
  clearInterval(timer);clearInterval(hb);timer=null;hb=null;
  S.cur=null;S.view="home";
  render(true);
  toast(auto?"خرجت من الامتحان — إجاباتك اتحفظت تلقائياً، كمّل من «استئناف الامتحان»":"اتحفظت إجاباتك — تقدر تستأنف من صفحة المادة",true);
}
function saveExamDraft(){
  const c=S.cur;if(!c||c.done)return;
  try{
    const ans=readExamAnsFromDOM();
    c.draftAns=ans;
    localStorage.setItem(examDraftKey(c), JSON.stringify({ans,t:Date.now(),examId:c.exam.id,n:c.n}));
    persistExamSession(c);
  }catch(_){}
}
function loadExamDraft(){
  const c=S.cur;if(!c)return;
  try{
    let ans=c.draftAns;
    if(!ans){
      const raw=localStorage.getItem(examDraftKey(c));if(!raw)return;
      const data=JSON.parse(raw);ans=data.ans;
    }
    if(!Array.isArray(ans))return;
    c.draftAns=ans;
    ans.forEach((a,i)=>{
      const q=c.exam.questions[i];if(!q)return;
      if(q.essay){const ta=document.querySelector(`textarea[name=q${i}]`);if(ta&&a)ta.value=a}
      else if(a!=null&&a>=0){const el=document.querySelector(`input[name=q${i}][value="${a}"]`);if(el)el.checked=true}
    });
    updProg();
    toast("تم استرجاع إجاباتك — كمّل من حيث وقفت ✓");
  }catch(_){}
}
function peekExamSession(){
  if(!S.user)return null;
  try{
    const raw=localStorage.getItem(examSessionKey(S.user.uid));if(!raw)return null;
    const meta=JSON.parse(raw);if(!meta||!meta.examId)return null;
    if((S.attempts[meta.examId]||[]).some(r=>(r.attempt||1)===meta.n||r.id===meta.sid))return null;
    return meta;
  }catch(_){return null}
}
function clearExamDraft(c){try{if(c)localStorage.removeItem(examDraftKey(c))}catch(_){}}
function updProg(){
  const c=S.cur;if(!c)return;
  const g=c.exam.questions.map((q,i)=>q.fun?null:i).filter(i=>i!==null);
  const done=g.filter(i=>{
    const q=c.exam.questions[i];
    if(q.essay){const ta=document.querySelector(`textarea[name=q${i}]`);return ta&&ta.value.trim()}
    return !!document.querySelector(`input[name=q${i}]:checked`);
  }).length;
  const el=$("#pg");if(el)el.style.width=(g.length?done/g.length*100:0)+"%";
  c.answered=done;clearTimeout(ansT);ansT=setTimeout(()=>{liveUpdate({answered:done});saveExamDraft()},4000);
  clearTimeout(window.__draftT);window.__draftT=setTimeout(saveExamDraft,1500);
}
function liveUpdate(extra){
  const c=S.cur;if(!c||c.done)return;
  updateDoc(doc(db,"starts",c.sid),{seen:Date.now(),...extra}).catch(()=>{});
}
async function submitExam(auto){
  const c=S.cur;if(!c||c.done)return;
  const e=c.exam;
  const ans=e.questions.map((q,i)=>{
    if(q.essay){const ta=document.querySelector(`textarea[name=q${i}]`);return ta?ta.value.trim():""}
    const r=document.querySelector(`input[name=q${i}]:checked`);return r?+r.value:-1
  });
  if(!auto&&ans.some((a,i)=>{
    const q=e.questions[i];if(q.fun)return false;
    if(q.essay)return !a||!String(a).trim();
    return a===-1;
  })){
    c.busy=true;const ok=await uiConfirm("في أسئلة لسه ما جاوبتش عليها. تسلّم برضه؟",{title:"تسليم الامتحان",ok:"سلّم",cancel:"كمّل امتحان",danger:false,icon:"📝"});c.busy=false;
    if(!ok)return;
  }
  c.done=true;clearInterval(timer);clearInterval(hb);clearTimeout(ansT);
  let scoreRaw=0;
  e.questions.forEach((q,i)=>{
    if(q.fun)return;
    if(q.essay) scoreRaw += essayScore(ans[i], q.model);
    else if(ans[i]===q.a) scoreRaw += 1;
  });
  const score=Math.round(scoreRaw*100)/100, total=gcount(e);
  const btn=$("#sub");if(btn)btn.disabled=true;
  const rec={uid:S.user.uid,examId:e.id,examTitle:e.title,subject:e.subject,name:S.profile.name,phone:S.profile.phone,attempt:c.n,
    score,total,passMark:e.passMark||0,passed:e.passMark>0?score>=e.passMark:null,ans,secs:Math.round((Date.now()-c.st.t)/1000),tabs:c.tabs};
  try{
    await setDoc(doc(db,"results",c.sid),{...rec,createdAt:serverTimestamp()});
  }catch(err){
    c.done=false;if(btn)btn.disabled=false;
    console.error("submitExam",err);
    const code=(err&&err.code)||"";
    if(code.includes("permission-denied"))toast("مفيش صلاحية لتسجيل النتيجة — تأكد إن قواعد Firestore محدّثة وإن المحاولة 1 أو 2");
    else if(code.includes("unavailable")||code.includes("network"))toast("مفيش نت كويس — دوس تسليم تاني");
    else toast("مقدرتش أسجّل النتيجة. اتأكد من النت ودوس تسليم تاني.");
    return;
  }
  deleteDoc(doc(db,"starts",c.sid)).catch(()=>{});
  clearExamDraft(c);
  clearExamSession();
  logActivity("exam_submit", (e.title||"")+" · "+score+"/"+total);
  // XP
  (async()=>{
    let amt=20;
    if(total&&score===total)amt+=15;
    else if(total&&score/total>=0.8)amt+=8;
    const first=!(S.attempts[e.id]&&S.attempts[e.id].length);
    await addXP(amt, score===total?"exam_full":(first?"first_exam":"exam"));
  })();
  S.attempts[e.id]=(S.attempts[e.id]||[]).concat([{...rec,id:c.sid}]);
  S.last={...rec,id:c.sid};S.cur=null;S.view="result";render(true);
  try{
    const all=[...Object.values(S.attempts).flat()];
    const byExam={};
    all.forEach(r=>{if(!r.examId)return;const prev=byExam[r.examId];if(!prev||(r.score/Math.max(r.total,1))>(prev.score/Math.max(prev.total,1)))byExam[r.examId]=r});
    const list=Object.values(byExam);
    setDoc(doc(db,"leaderboard",S.user.uid),{uid:S.user.uid,name:S.profile.name,...lbPayload(list),updatedAt:serverTimestamp()},{merge:true}).catch(()=>{});
  }catch(_){}
}
function runResult(){
  const r=S.last,fg=$("#fg"),sc=$("#sc");if(!fg||!sc)return;
  fg.style.strokeDashoffset=339.3;sc.textContent="0";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{fg.style.strokeDashoffset=339.3*(1-(r.total?r.score/r.total:0))}));
  const t0=performance.now();
  (function step(n){const p=Math.min(1,(n-t0)/1000);sc.textContent=Math.round(r.score*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step)})(t0);
  if(pctOf(r)>=90&&!matchMedia("(prefers-reduced-motion: reduce)").matches)confetti();
}
function confetti(){
  const cols=["#E3A81C","#2FB5A8","#4F46E5","#ef4444","#22c55e","#f97316"];
  const w=document.createElement("div");w.className="conf";
  for(let i=0;i<46;i++){const p=document.createElement("i");p.style.cssText=`left:${Math.random()*100}%;background:${cols[i%cols.length]};animation-duration:${2.4+Math.random()*2}s;animation-delay:${Math.random()*.8}s;transform:rotate(${Math.random()*360}deg)`;w.appendChild(p)}
  document.body.appendChild(w);setTimeout(()=>w.remove(),5200);
}

/* ---------- كشف الخروج من الامتحان ---------- */
function leave(){
  const c=S.cur;if(S.view!=="exam"||!c||c.done||c.busy||c.pausing)return;
  const n=Date.now();if(n-lastLeave<1500)return;lastLeave=n;
  c.tabs++;c.away=true;liveUpdate({away:true,awayAt:Date.now()});persistExamSession(c);
  // silent monitor — admin sees alerts; student sees nothing
  if(c.tabs<=10)addDoc(collection(db,"alerts"),{uid:S.user.uid,name:S.profile.name,phone:S.profile.phone,examId:c.exam.id,examTitle:c.exam.title,attempt:c.n,count:c.tabs,createdAt:serverTimestamp()}).catch(()=>{});
}
function back(){const c=S.cur;if(S.view==="exam"&&c&&!c.done&&c.away){c.away=false;liveUpdate({away:false})}}
/* v77: قفل النسخ واللصق والكليك يمين وقت الامتحان — بدون إزعاج الطالب */
document.addEventListener("copy",e=>{if(S.cur&&S.view==="exam"&&!S.isAdmin){e.preventDefault();toast("النسخ مقفول وقت الامتحان")}},true);
document.addEventListener("cut",e=>{if(S.cur&&S.view==="exam"&&!S.isAdmin)e.preventDefault()},true);
document.addEventListener("paste",e=>{if(S.cur&&S.view==="exam"&&!S.isAdmin){e.preventDefault();toast("اللصق مقفول وقت الامتحان")}},true);
document.addEventListener("contextmenu",e=>{if(S.cur&&S.view==="exam"&&!S.isAdmin)e.preventDefault()},true);
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    try{if(S.cur&&!S.cur.done&&S.view==="exam")saveExamDraft()}catch(_){}
    leave();
    if(S.qb&&S.qb.roomCode) qbPresence(true);
  }else{
    back();
    if(S.qb&&S.qb.roomCode) qbPresence(false);
  }
});
window.addEventListener("blur",()=>{leave();if(S.qb&&S.qb.roomCode)qbPresence(true)});
window.addEventListener("focus",()=>{back();if(S.qb&&S.qb.roomCode)qbPresence(false)});
// خروج كامل من المتصفح → حاول تطلع من الغرفة
window.addEventListener("pagehide",()=>{
  try{if(S.cur&&!S.cur.done&&S.view==="exam")saveExamDraft()}catch(_){}
  if(S.qb&&S.qb.roomCode&&S.user){
    try{
      const code=S.qb.roomCode;
      updateDoc(doc(db,"qb_rooms",code),{[`players.${S.user.uid}`]:deleteField()}).catch(()=>{});
    }catch(_){}
  }
});
document.addEventListener("visibilitychange",()=>{
  if(!S.qb||!S.qb.roomCode||!S.user)return;
  try{
    if(document.hidden) qbPresence(true);
    else qbPresence(false);
  }catch(_){}
});

/* ---------- المحرر ---------- */
function checkQs(){
  const el=$("#qinfo");if(!el)return;
  const {qs,errors}=parseQs($("#qtext").value);
  const f=qs.filter(q=>q.fun).length, es=qs.filter(q=>q.essay&&!q.fun).length, mc=qs.length-f-es;
  el.innerHTML=`${mc} اختياري${es?` + ${es} مقالي`:""}${f?` + ${f} للتسلية`:""}`+(errors.length?` <span style="color:var(--bad)">· ${esc(errors[0])}${errors.length>1?` (+${errors.length-1} أخطاء)`:""}</span>`:"");
}
function bindEditor(){const t=$("#qtext");if(t){t.addEventListener("input",checkQs);checkQs()}}

document.addEventListener("pointerdown",e=>{
  const b=e.target.closest(".btn,.subj,.tab");if(!b||b.disabled)return;
  const r=b.getBoundingClientRect(),z=Math.max(r.width,r.height),x=document.createElement("span");
  x.className="rip";x.style.cssText=`width:${z}px;height:${z}px;left:${e.clientX-r.left-z/2}px;top:${e.clientY-r.top-z/2}px`;
  b.appendChild(x);setTimeout(()=>x.remove(),600);
});
document.addEventListener("contextmenu",e=>{
  if(document.body.classList.contains("gal-secure")){
    const allow=S.isAdmin||(S.profile&&S.profile.tanaghaSave);
    if(!allow){e.preventDefault();toast("حفظ الصور مقفول في القسم ده")}
  }
},true);
document.addEventListener("dragstart",e=>{
  if(document.body.classList.contains("gal-secure")&&!S.isAdmin)e.preventDefault();
},true);
/* ===== v92 — المرحلة 1: مركز الأخطاء + صحة المنصة + أدوات المطور (للأدمن فقط) ===== */
__EC.page=()=>{try{return (S.view||"")+(S.view==="admin"?":"+(S.tab||""):"")}catch(_){return""}};
const ecDay=()=>new Date().toISOString().slice(0,10);
const EC_TYPES={js:["JS","r"],promise:["Promise","r"],firebase:["Firebase","y"],network:["شبكة","i"],upload:["رفع","y"],console:["Console","g"]};
/* إرسال الأخطاء لـ Firestore بحدود صارمة: بصمة واحدة لكل مستخدم/يوم، 12 حد أقصى للجلسة، ولا إعادة محاولة بعد الرفض */
const __ecSent=new Set();let __ecN=0;
function __ecSentLoad(){try{const o=JSON.parse(localStorage.getItem("ec_sent")||"{}");if(o.d===ecDay())o.i.forEach(x=>__ecSent.add(x))}catch(_){}}
function __ecSentSave(){try{localStorage.setItem("ec_sent",JSON.stringify({d:ecDay(),i:[...__ecSent].slice(-60)}))}catch(_){}}
__ecSentLoad();
function ecFlush(){
  try{
    if(!S.user||!db||!navigator.onLine||!__EC.buf.length)return;
    const b=__EC.buf.splice(0,10);
    for(const e of b){
      if(__ecN>=12)break;
      const id=ecDay()+"_"+e.sig+"_"+S.user.uid.slice(0,6);
      if(__ecSent.has(id))continue;
      __ecSent.add(id);__ecN++;
      _fbSetDoc(doc(db,"errorLogs",id),{sig:e.sig,type:e.type,msg:e.msg,stack:e.stack||"",fn:e.fn||"",page:e.page||"",uid:S.user.uid,dev:e.dev||"",ver:e.ver||"",day:ecDay(),status:"open",createdAt:serverTimestamp()}).catch(()=>{});
    }
    __ecSentSave();
    if(__EC.buf.length>40)__EC.buf.length=40;
  }catch(_){}
}
setInterval(ecFlush,5000);

async function ecLoad(){
  try{
    const s=await getDocs(query(collection(db,"errorLogs"),orderBy("createdAt","desc"),limit(100)));
    S.errLogs=s.docs.map(d=>({id:d.id,...d.data()}));S.errMsg="";
  }catch(e){S.errLogs=[];S.errMsg=(e&&e.code)||"error"}
  if(!S._errClean){S._errClean=1;ecCleanup()}
  if(S.isAdmin&&S.view==="admin"&&["errors","health"].includes(S.tab))render();
}
/* حذف السجلات الأقدم من 14 يوم تلقائياً (مرة واحدة لكل جلسة أدمن) */
async function ecCleanup(){
  try{
    const cut=new Date(Date.now()-EC_KEEP_DAYS*864e5);
    const s=await getDocs(query(collection(db,"errorLogs"),where("createdAt","<",cut),limit(50)));
    if(!s.size)return;
    const b=writeBatch(db);s.docs.forEach(d=>b.delete(d.ref));await b.commit();
    const gone=new Set(s.docs.map(d=>d.id));S.errLogs=(S.errLogs||[]).filter(x=>!gone.has(x.id));
  }catch(_){}
}
const csvCell=v=>{let s=String(v==null?"":v).replace(/\r?\n/g," ⏎ ");if(/^[=+\-@\t]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
function ecDownload(rows,fmt,name){
  const cols=["time","type","msg","fn","page","dev","ver","uid","status","stack"];
  const norm=rows.map(r=>({time:new Date(r.t||tsMs(r.createdAt)||0).toISOString(),type:r.type||"",msg:r.msg||"",fn:r.fn||"",page:r.page||"",dev:r.dev||"",ver:r.ver||"",uid:r.uid||"",status:r.status||"",stack:r.stack||""}));
  const body=fmt==="csv"?"﻿"+cols.join(",")+"\n"+norm.map(r=>cols.map(c=>csvCell(r[c])).join(",")).join("\n"):JSON.stringify(norm,null,2);
  const url=URL.createObjectURL(new Blob([body],{type:fmt==="csv"?"text/csv;charset=utf-8":"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=name+"-"+ecDay()+"."+fmt;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function adminErrors(){
  if(!S._errReq){S._errReq=1;ecLoad()}
  const all=Array.isArray(S.errLogs)?S.errLogs:null;
  if(!all)return `<div class="card"><div class="mut">جاري تحميل سجل الأخطاء…</div></div>`;
  const f=S.errF||"open",st=x=>x.status||"open";
  const list=all.filter(x=>f==="all"||st(x)===f);
  const today=all.filter(x=>x.day===ecDay()),users=new Set(today.map(x=>x.uid)).size;
  const cnt=k=>all.filter(x=>st(x)===k).length;
  const fb=[["open","مفتوح"],["fixed","تم الإصلاح"],["ignored","متجاهل"],["all","الكل"]];
  const row=x=>{const ty=EC_TYPES[x.type]||[x.type||"?","y"];
    return `<div class="card" style="margin:0 0 8px;padding:10px 12px">
    <div class="row" style="gap:6px;flex-wrap:wrap">${pill(ty[0],ty[1])}${st(x)!=="open"?pill(st(x)==="fixed"?"✔ تم الإصلاح":"متجاهل","g"):""}<span class="mut" style="font-size:11px;margin-inline-start:auto">${fmt(x.createdAt)}</span></div>
    <div style="margin:6px 0;font-weight:700;word-break:break-word" dir="auto">${esc(x.msg)}</div>
    <div class="mut" style="font-size:12px;word-break:break-word">الدالة: <b dir="ltr">${esc(x.fn||"—")}</b> · الصفحة: <b dir="ltr">${esc(x.page||"—")}</b> · ${esc(x.dev||"")} · ${esc(x.ver||"")} · UID: <span dir="ltr">${esc(String(x.uid||"").slice(0,8))}</span></div>
    ${x.stack?`<details style="margin-top:6px"><summary class="mut" style="cursor:pointer;font-size:12px">Stack Trace</summary><pre dir="ltr" style="white-space:pre-wrap;word-break:break-all;max-height:180px;overflow:auto;font-size:11px;margin:6px 0 0">${esc(x.stack)}</pre></details>`:""}
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">
      ${st(x)!=="fixed"?`<button class="btn sm" data-act="errFix" data-id="${esc(x.id)}">✔ تم الإصلاح</button>`:""}
      ${st(x)!=="ignored"?`<button class="btn ghost sm" data-act="errIgnore" data-id="${esc(x.id)}">تجاهل</button>`:""}
      <button class="btn ghost sm" data-act="errDel" data-id="${esc(x.id)}">🗑</button></div></div>`};
  return `<div class="card"><h3 style="margin-top:0">🔴 مركز الأخطاء</h3>
  <p class="mut" style="margin:0 0 10px">بيسجّل أخطاء JS / Firebase / الشبكة / الرفع / Promise وأخطاء الـ Console المهمة من أجهزة الطلاب. كل مستخدم بيبعت نفس الخطأ مرة واحدة في اليوم، والسجلات الأقدم من ${EC_KEEP_DAYS} يوم بتتمسح تلقائياً.</p>
  ${S.errMsg?`<div class="err" style="margin-bottom:10px">تعذّر قراءة السجل (${esc(S.errMsg)}). غالباً قواعد Firestore الجديدة لسه ماتنشرتش.</div>`:""}
  <div class="stats"><div class="stat card"><b>${today.length}</b><span class="mut">أخطاء النهارده</span></div><div class="stat card"><b>${users}</b><span class="mut">مستخدمين متأثرين</span></div><div class="stat card"><b>${cnt("open")}</b><span class="mut">مفتوح</span></div><div class="stat card"><b>${__EC.log.length}</b><span class="mut">على جهازك</span></div></div>
  <div class="tabs" style="margin-bottom:10px">${fb.map(([k,v])=>`<button class="tab ${f===k?"on":""}" data-act="errFilter" data-id="${k}">${v}${k!=="all"?` (${cnt(k)})`:""}</button>`).join("")}</div>
  <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn ghost sm" data-act="errRefresh">🔄 تحديث</button><button class="btn ghost sm" data-act="errExport" data-id="json">JSON ⬇</button><button class="btn ghost sm" data-act="errExport" data-id="csv">CSV ⬇</button><button class="btn ghost sm" data-act="errPurge">مسح المحلول والمتجاهل</button></div></div>
  ${list.length?list.map(row).join(""):`<div class="card"><div class="mut">مفيش أخطاء في الفلتر ده ✅</div></div>`}`;
}

/* ---------- صحة المنصة ---------- */
async function hlProbe(){
  const h=S._hl=S._hl||{};
  try{const t0=performance.now();await getDoc(doc(db,"config","site"));h.fbMs=Math.round(performance.now()-t0);h.fbOk=true}catch(e){h.fbOk=false;h.fbErr=(e&&e.code)||"error"}
  try{const r=await auth.currentUser.getIdTokenResult();h.authOk=true;h.tokenExp=r.expirationTime}catch(e){h.authOk=false}
  try{h.caches=(await caches.keys()).filter(k=>k.startsWith("eltafawoq-")).join(", ")}catch(_){}
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();h.store=Math.round((e.usage||0)/1048576)+" / "+Math.round((e.quota||0)/1048576)+" MB"}}catch(_){}
  h.at=Date.now();
  if(S.isAdmin&&S.view==="admin"&&S.tab==="health")render();
}
function adminHealth(){
  if(!S._errReq){S._errReq=1;ecLoad()}
  if(!S._hlReq){S._hlReq=1;hlProbe()}
  const h=S._hl||{},nav=(performance.getEntriesByType&&performance.getEntriesByType("navigation")[0])||{},cn=navigator.connection||{};
  const ops=__EC.ops,rd=ops.filter(o=>/^get/.test(o.op)).length,wr=ops.length-rd,failed=ops.filter(o=>!o.ok).length;
  const slow=ops.filter(o=>o.ms).map(o=>o.ms),avgQ=slow.length?Math.round(slow.reduce((a,b)=>a+b,0)/slow.length):null;
  const pres=S.presence||{},n=Date.now(),online=Object.keys(pres).filter(u=>{const ms=tsMs(pres[u].lastSeenAt);return ms&&(n-ms)<660000&&pres[u].online!==false}).length;
  const errToday=Array.isArray(S.errLogs)?S.errLogs.filter(x=>x.day===ecDay()).length:null;
  const load=nav.loadEventEnd?Math.round(nav.loadEventEnd):null;
  const lastBk=S.site&&S.site.lastBackupAt?fmt(S.site.lastBackupAt):"لسه مفيش (المرحلة 3)";
  const tile=(ic,t,v,sub,cls)=>`<div class="stat card"><b style="font-size:20px">${ic} ${v}</b><span class="mut">${t}</span>${sub?`<div class="mut" style="font-size:11px;margin-top:2px">${sub}</div>`:""}</div>`;
  const ok=(b,y,nn)=>b==null?pill("جاري الفحص…","y"):b?pill(y||"سليم","g"):pill(nn||"مشكلة","r");
  return `<div class="card"><h3 style="margin-top:0">📊 صحة المنصة</h3>
  <p class="mut" style="margin:0 0 10px">الأرقام دي من جهازك أنت (الأدمن) ومن الجلسة الحالية، مش من قياس خادمي شامل.</p>
  <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn ghost sm" data-act="hlRefresh">🔄 إعادة الفحص</button></div></div>
  <div class="stats">
  ${tile("🔥","Firebase",ok(h.fbOk,"شغال","مش شغال"),h.fbMs!=null?h.fbMs+" ms":(h.fbErr||""))}
  ${tile("🌐","الإنترنت",ok(navigator.onLine,"متصل","مقطوع"),cn.effectiveType?esc(cn.effectiveType)+(cn.downlink?" · "+cn.downlink+"Mbps":""):"")}
  ${tile("🔐","تسجيل الدخول",ok(h.authOk,"صالح","غير صالح"),h.tokenExp?"ينتهي "+fmt(h.tokenExp):"")}
  ${tile("🟢","أونلاين دلوقتي",online,"طلاب نشطين آخر 11 د")}
  ${tile("🔴","أخطاء النهارده",errToday==null?"…":errToday,"من سجل الأخطاء")}
  ${tile("⏱","تحميل الصفحة",load!=null?load+" ms":"—","آخر فتح لجهازك")}
  ${tile("📈","زمن الاستعلام",avgQ!=null?avgQ+" ms":"—","متوسط "+ops.length+" عملية")}
  ${tile("💾","عمليات الجلسة",rd+" قراءة / "+wr+" كتابة",failed?failed+" فاشلة":"تقدير للجلسة فقط")}
  ${tile("📦","تخزين الجهاز",esc(h.store||"—"),"")}
  ${tile("🗄","آخر نسخة احتياطية",lastBk,"")}
  ${tile("🎛","الوضع الحالي",esc(modeCur().ic+" "+modeCur().n),"")}
  ${tile("🏷","إصدار المنصة",esc(window.APP_BUILD||"?"),esc(h.caches||""))}
  </div>
  <p class="mut" style="font-size:12px">استهلاك قاعدة البيانات الحقيقي (قراءات/كتابات/تخزين) بيظهر في Firebase Console › Usage، مفيش طريقة يعرفه المتصفح بدقة.</p>`;
}

/* ---------- أدوات المطور ---------- */
const dtSet=(k,v)=>{S._dt=S._dt||{};S._dt[k]=v;if(S.isAdmin&&S.view==="admin"&&S.tab==="devtools")render()};
function adminDev(){
  const cn=navigator.connection||{},hm=performance.memory,u=navigator.userAgent||"";
  const kv=(k,v)=>`<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line);gap:8px"><span class="mut" style="min-width:110px">${k}</span><b dir="ltr" style="word-break:break-all;flex:1;text-align:left">${esc(v)}</b></div>`;
  let pwa=false;try{pwa=matchMedia("(display-mode: standalone)").matches}catch(_){}
  const dt=S._dt||{},res=k=>dt[k]?`<pre dir="auto" style="white-space:pre-wrap;font-size:12px;margin:6px 0 0">${esc(dt[k])}</pre>`:"";
  const errs=[...__EC.log].reverse(),ops=[...__EC.ops].reverse();
  return `<div class="card"><h3 style="margin-top:0">🧰 أدوات المطور</h3><p class="mut" style="margin:0">للأدمن فقط. مفيش حاجة هنا بتأثر على الطلاب.</p></div>
  <div class="card"><h3 style="margin-top:0">الجهاز والمتصفح</h3>
   ${kv("المتصفح/النظام",__EC.dev())}${kv("User-Agent",u)}${kv("اللغة",(navigator.languages||[navigator.language]).join(", "))}${kv("المنطقة الزمنية",Intl.DateTimeFormat().resolvedOptions().timeZone)}
   ${kv("الشاشة",screen.width+"×"+screen.height+" @"+(window.devicePixelRatio||1)+"x")}${kv("الإطار",innerWidth+"×"+innerHeight)}${kv("المعالج",(navigator.hardwareConcurrency||"?")+" أنوية")}${kv("الذاكرة",navigator.deviceMemory?navigator.deviceMemory+" GB (تقريبي)":"غير متاح")}
   ${kv("اللمس",(navigator.maxTouchPoints||0)+" نقاط")}${kv("تطبيق مثبت (PWA)",pwa?"نعم":"لا")}${kv("Service Worker",navigator.serviceWorker&&navigator.serviceWorker.controller?"شغال":"غير مفعّل")}${hm?kv("ذاكرة JS",Math.round(hm.usedJSHeapSize/1048576)+" / "+Math.round(hm.jsHeapSizeLimit/1048576)+" MB"):""}
   ${kv("سرعة الاتصال",cn.effectiveType?cn.effectiveType+" · "+(cn.downlink||"?")+" Mbps · RTT "+(cn.rtt||"?")+"ms"+(cn.saveData?" · توفير بيانات":""):"غير متاح")}${kv("الإصدار",window.APP_BUILD||"?")}</div>
  <div class="card"><h3 style="margin-top:0">اختبارات</h3><div class="row" style="gap:6px;flex-wrap:wrap">
   <button class="btn ghost sm" data-act="devNotif">🔔 اختبار الإشعارات</button><button class="btn ghost sm" data-act="devUpload">🖼 اختبار رفع الملفات</button><button class="btn ghost sm" data-act="devFb">🔥 اختبار Firebase</button><button class="btn ghost sm" data-act="devSpeed">⚡ اختبار سرعة المنصة</button></div>
   ${res("notif")}${res("upload")}${res("fb")}${res("speed")}</div>
  <div class="card"><div class="row" style="gap:6px;flex-wrap:wrap"><h3 style="margin:0;flex:1">آخر ${errs.length} خطأ (على الجهاز ده)</h3><button class="btn ghost sm" data-act="devExport" data-id="json">JSON ⬇</button><button class="btn ghost sm" data-act="devExport" data-id="csv">CSV ⬇</button><button class="btn ghost sm" data-act="devClear">مسح</button></div>
   ${errs.length?errs.slice(0,100).map(e=>`<div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:12px"><span class="mut">${new Date(e.t).toLocaleTimeString("ar-EG")} · ${esc(e.type)} · ${esc(e.page||"")}</span><div dir="auto" style="word-break:break-word">${esc(e.msg)}</div></div>`).join(""):`<div class="mut" style="margin-top:8px">مفيش ✅</div>`}</div>
  <div class="card"><h3 style="margin-top:0">آخر ${ops.length} عملية Firebase</h3>
   ${ops.length?ops.slice(0,100).map(o=>`<div class="row" style="padding:4px 0;border-bottom:1px solid var(--line);font-size:12px;gap:8px"><b dir="ltr">${esc(o.op)}</b><span dir="ltr" class="mut" style="flex:1;word-break:break-all">${esc(o.path)}</span><span>${o.ok?o.ms+"ms":pill(esc(o.err||"فشل"),"r")}</span></div>`).join(""):`<div class="mut">لسه مفيش</div>`}</div>`;
}
Object.assign(A,{
  errRefresh(){S.errLogs=null;S._errReq=0;render()},
  errFilter(d){S.errF=d.id;render()},
  async errMark(id,status){
    await updateDoc(doc(db,"errorLogs",id),{status});
    const x=(S.errLogs||[]).find(r=>r.id===id);if(x)x.status=status;render()
  },
  errFix(d){return A.errMark(d.id,"fixed")},
  errIgnore(d){return A.errMark(d.id,"ignored")},
  async errDel(d){await deleteDoc(doc(db,"errorLogs",d.id));S.errLogs=(S.errLogs||[]).filter(r=>r.id!==d.id);render()},
  async errPurge(){
    const ids=(S.errLogs||[]).filter(x=>x.status==="fixed"||x.status==="ignored").map(x=>x.id);
    if(!ids.length){toast("مفيش حاجة تتمسح");return}
    const b=writeBatch(db);ids.forEach(i=>b.delete(doc(db,"errorLogs",i)));await b.commit();
    const g=new Set(ids);S.errLogs=S.errLogs.filter(x=>!g.has(x.id));toast("اتمسح "+ids.length);render()
  },
  errExport(d){ecDownload(S.errLogs||[],d.id==="csv"?"csv":"json","errors")},
  devExport(d){ecDownload(__EC.log,d.id==="csv"?"csv":"json","device-errors")},
  devClear(){__EC.log.length=0;try{localStorage.removeItem("ec_log")}catch(_){}render()},
  hlRefresh(){S._hl={};S._hlReq=0;S._errReq=0;render()},
  async devNotif(){
    if(!("Notification" in window)){dtSet("notif","المتصفح مش بيدعم الإشعارات");return}
    let p=Notification.permission;if(p==="default")p=await Notification.requestPermission();
    if(p!=="granted"){dtSet("notif","الإذن: "+p+" — فعّله من إعدادات المتصفح");return}
    const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();
    if(reg&&reg.showNotification)await reg.showNotification("التفوق — اختبار",{body:"الإشعارات شغالة ✅",icon:"icons/icon-192.png"});else new Notification("التفوق — اختبار",{body:"الإشعارات شغالة ✅"});
    dtSet("notif","اتبعت إشعار تجريبي ✅"+(reg?" (عن طريق Service Worker)":""))
  },
  devUpload(){
    const i=document.createElement("input");i.type="file";i.accept="image/*";
    i.onchange=async()=>{const f=i.files&&i.files[0];if(!f)return;
      if(!/^image\/(jpeg|png|webp|gif)$/.test(f.type)){dtSet("upload","النوع غير مسموح: "+(f.type||"?"));return}
      if(f.size>8*1048576){dtSet("upload","الحجم أكبر من 8MB: "+(f.size/1048576).toFixed(1)+"MB");return}
      const t0=performance.now();
      try{
        const bmp=await createImageBitmap(f),sc=Math.min(1,1280/Math.max(bmp.width,bmp.height)),c=document.createElement("canvas");
        c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
        const out=await new Promise(r=>c.toBlob(r,"image/jpeg",.72));
        dtSet("upload","✅ "+f.name+"\nقبل: "+(f.size/1024).toFixed(0)+"KB "+bmp.width+"×"+bmp.height+"\nبعد: "+(out.size/1024).toFixed(0)+"KB "+c.width+"×"+c.height+"\nالضغط أخد "+Math.round(performance.now()-t0)+"ms\n(اختبار محلي فقط — ماتبعتش لأي سيرفر)")
      }catch(e){__EC.report("upload",e,{fn:"devUpload"});dtSet("upload","فشل: "+((e&&e.message)||e))}
    };i.click()
  },
  async devFb(){
    dtSet("fb","جاري الاختبار…");const r=[];
    for(let k=0;k<3;k++){try{const t0=performance.now();await getDoc(doc(db,"config","site"));r.push(Math.round(performance.now()-t0))}catch(e){r.push("فشل:"+((e&&e.code)||"?"))}}
    let tk="";try{const t0=performance.now();await auth.currentUser.getIdToken(true);tk=Math.round(performance.now()-t0)+"ms"}catch(e){tk="فشل"}
    dtSet("fb","قراءة config/site ×3: "+r.join(" / ")+" ms\nتجديد التوكن: "+tk+"\nمتصل: "+(navigator.onLine?"نعم":"لا"))
  },
  async devSpeed(){
    dtSet("speed","جاري القياس…");const L=[];
    L.push("عناصر DOM: "+document.querySelectorAll("*").length);
    let t0=performance.now(),x=0;for(let k=0;k<2e6;k++)x+=k%7;L.push("اختبار المعالج (2 مليون خطوة): "+Math.round(performance.now()-t0)+"ms");
    try{t0=performance.now();const r=await fetch("sw.js?_="+Date.now(),{cache:"no-store"}),b=await r.arrayBuffer(),ms=Math.max(1,performance.now()-t0);L.push("تحميل sw.js: "+Math.round(ms)+"ms · "+(b.byteLength/1024).toFixed(1)+"KB · ~"+Math.round(b.byteLength/1024/(ms/1000))+" KB/s")}catch(e){L.push("تحميل sw.js: فشل")}
    try{t0=performance.now();await getDoc(doc(db,"config","site"));L.push("Firebase: "+Math.round(performance.now()-t0)+"ms")}catch(e){L.push("Firebase: فشل")}
    const m=performance.memory;if(m)L.push("ذاكرة JS: "+Math.round(m.usedJSHeapSize/1048576)+"MB");
    dtSet("speed",L.join("\n"))
  }
});

/* ===== v93 — المرحلة 2: نظام رفع الصور (تحقق + معاينة + تقدم/سرعة/وقت متبقي + إلغاء + إعادة محاولة) ===== */
const UP_TYPES=/^image\/(jpeg|png|webp|gif)$/;
const UP_MAX_BYTES=15*1048576;
const UP_IDS={fad:"fadProg",stu:"stuFadProg",gal:"galProg"};
const UP={cancel:false,jobs:{},urls:[]};
function upValidate(files,max){
  const good=[],bad=[];
  for(const f of files){
    if(!UP_TYPES.test(f.type||""))bad.push(f.name+": النوع غير مسموح (jpg / png / webp / gif بس)");
    else if(!f.size)bad.push(f.name+": الملف فاضي");
    else if(f.size>UP_MAX_BYTES)bad.push(f.name+": أكبر من 15MB ("+(f.size/1048576).toFixed(1)+"MB)");
    else if(good.length>=max)bad.push(f.name+": زيادة عن الحد ("+max+")");
    else good.push(f);
  }
  return {good,bad};
}
function upPanel(key){
  const u=S.up&&S.up[key];if(!u)return"";
  const tm=s=>s==null?"…":(s>=60?Math.floor(s/60)+"د "+(s%60)+"ث":s+"ث");
  const bar=`<div class="upbar"><i style="width:${u.pct||0}%"></i></div>`;
  if(u.state==="run")return `<div class="upbox" role="status">${bar}<div class="row" style="margin-top:6px;font-size:12px;gap:10px;flex-wrap:wrap"><b>${u.pct}%</b><span class="mut">${u.done}/${u.total}</span><span class="mut">⚡ ${u.speed} KB/s</span><span class="mut">⏱ ${tm(u.eta)}</span><button type="button" class="btn ghost sm" style="margin-inline-start:auto" data-act="upCancel">إلغاء</button></div></div>`;
  if(u.state==="done")return `<div class="upbox" role="status">${bar}<div style="margin-top:6px;font-size:13px">${u.cancelled?"⛔ اتلغى":"✅ خلص"} — نجح ${u.ok}${u.dup?" · مكرر "+u.dup:""}${u.fail?" · فشل "+u.fail:""}</div>${u.fail?`<button type="button" class="btn sm" style="margin-top:6px" data-act="upRetry" data-id="${esc(key)}">🔁 إعادة محاولة (${u.fail})</button>`:""}</div>`;
  return"";
}
function upSet(key,patch){
  S.up=S.up||{};
  if(patch===null)delete S.up[key];else S.up[key]=Object.assign(S.up[key]||{},patch);
  const el=document.getElementById(UP_IDS[key]);if(el)el.innerHTML=upPanel(key);
}
/* worker(item,i) يرجّع {bytes} أو يرمي Error("dup"|"skip") للمتجاهَل؛ أي خطأ تاني = فشل قابل لإعادة المحاولة */
async function upPool(key,items,conc,worker,prev){
  UP.cancel=false;
  const job=prev||{items,worker,res:new Array(items.length).fill(false),dup:new Set()};
  job.retry=()=>upPool(key,job.items,conc,job.worker,job);
  UP.jobs[key]=job;
  const todo=items.map((_,i)=>i).filter(i=>!job.res[i]&&!job.dup.has(i));
  const total=todo.length,t0=performance.now();let k=0,done=0,bytes=0;
  const paint=()=>{const sec=Math.max(.3,(performance.now()-t0)/1000),rem=total-done;upSet(key,{state:"run",pct:total?Math.round(done/total*100):100,done,total,speed:Math.round(bytes/1024/sec),eta:done?Math.round(sec/done*rem):null})};
  paint();
  const runners=[];
  for(let r=0;r<Math.max(1,Math.min(conc,total));r++)runners.push((async()=>{
    while(k<todo.length&&!UP.cancel){
      const i=todo[k++];
      try{const out=await worker(items[i],i);job.res[i]=true;bytes+=(out&&out.bytes)||0}
      catch(e){if(e&&(e.message==="dup"||e.message==="skip"))job.dup.add(i);else __EC.report("upload",e,{fn:"upPool:"+key})}
      done++;paint();
    }
  })());
  await Promise.all(runners);
  const ok=job.res.filter(Boolean).length,dup=job.dup.size,fail=items.length-ok-dup,cancelled=UP.cancel&&done<total;
  upSet(key,{state:"done",pct:cancelled?Math.round(done/Math.max(1,total)*100):100,ok,dup,fail,cancelled});
  return {ok,dup,fail,cancelled};
}
document.addEventListener("change",e=>{
  const t=e.target;if(!t||!/^(fadFile|stuFadFile|galFiles)$/.test(t.id))return;
  const host=document.getElementById(t.id==="galFiles"?"galPrev":t.id==="fadFile"?"fadPrev":"stuFadPrev");if(!host)return;
  UP.urls.forEach(u=>URL.revokeObjectURL(u));UP.urls=[];
  const v=upValidate([...(t.files||[])],t.id==="galFiles"?1500:10);
  host.innerHTML=v.good.slice(0,12).map(f=>{const u=URL.createObjectURL(f);UP.urls.push(u);return `<img src="${u}" alt="" class="upth">`}).join("")
    +(v.good.length>12?`<span class="mut">+${v.good.length-12}</span>`:"")
    +(v.bad.length?`<div class="err" style="margin-top:6px;font-size:12px;flex-basis:100%">${v.bad.slice(0,3).map(esc).join("<br>")}${v.bad.length>3?"<br>…":""}</div>`:"");
});
Object.assign(A,{
  upCancel(){UP.cancel=true;toast("جاري الإلغاء…")},
  upRetry(d){const j=UP.jobs[d.id];if(j&&j.retry)return j.retry()}
});

/* ===== v93 — المرحلة 2: مراقب الأداء ===== */
const PF_VIEWS={home:"الرئيسية",games:"الألعاب",mathg:"لعبة الرياضيات",xo:"XO",hang:"هانج مان",spin:"عجلة الحظ",react:"رد الفعل",subject:"المادة",exam:"امتحان",result:"النتيجة",progress:"تقدمي",asmList:"التقييمات",asm:"تقييم",qbSetup:"تجهيز غرفة",qbLobby:"لوبي الغرفة",qbPlay:"لعب الغرفة",qbResult:"نتيجة الغرفة",me:"أنا",life:"حياتي",profile:"بروفايل",search:"بحث",chatList:"الشات",chatThread:"محادثة",fadaye7:"الفضايح",tanagha:"التناغه",gallery:"المعرض",groups:"الجروبات",books:"الكتب",admin:"لوحة الأدمن"};
const pfLabel=v=>PF_VIEWS[v]||String(v||"?");
const PF_GAME_VIEWS=new Set(["mathg","xo","hang","spin","react","qbPlay"]);
const PF_DAY=()=>new Date().toISOString().slice(0,10);
const PF={view:"",lt:[],fps:0,fpsLabel:"",mem:0,memPeak:0,start:Date.now(),pushT:0,agg:null};
function pfLoad(){
  let a=null;try{a=JSON.parse(localStorage.getItem("pf_agg")||"null")}catch(_){}
  if(!a||a.day!==PF_DAY())a={day:PF_DAY(),pages:{},games:{},mem:0,ltN:0,ltMs:0,secs:0};
  PF.agg=a;
}
pfLoad();
function pfSave(){try{localStorage.setItem("pf_agg",JSON.stringify(PF.agg))}catch(_){}}
function pfPage(v){const P=PF.agg.pages;if(!P[v]){if(Object.keys(P).length>40)return null;P[v]={n:0,ms:0,mx:0,lt:0}}return P[v]}
function pfCur(){try{return S.view==="admin"?"admin":S.view}catch(_){return""}}
/* زمن ظهور الصفحة = من أول استدعاء render لما الصفحة تتغير لحد ما المتصفح يرسمها فعلاً */
(function(){
  const r0=render;
  render=function(...a){
    const v=pfCur(),changed=v!==PF.view,t0=performance.now();
    PF.view=v;
    try{return r0.apply(this,a)}
    finally{
      if(changed&&v){requestAnimationFrame(()=>requestAnimationFrame(()=>{const ms=Math.round(performance.now()-t0),p=pfPage(v);if(p){p.n++;p.ms+=ms;if(ms>p.mx)p.mx=ms}}))}
    }
  };
})();
/* Long Tasks (تهنيج > 50ms) منسوبة للصفحة/اللعبة الحالية */
try{
  new PerformanceObserver(l=>{
    for(const e of l.getEntries()){
      const v=PF.view||"?",d=Math.round(e.duration);
      PF.lt.push({t:Date.now(),d,v});if(PF.lt.length>200)PF.lt.shift();
      PF.agg.ltN++;PF.agg.ltMs+=d;
      const p=pfPage(v);if(p)p.lt++;
      const g=PF.fpsLabel&&PF.agg.games[PF.fpsLabel];if(g)g.lt++;
    }
  }).observe({entryTypes:["longtask"]});
}catch(_){}
/* FPS: يشتغل بس وإحنا في لعبة (صفحة لعبة داخلية أو وضع لعبة مخصص) */
let __pfRaf=0;
function pfGameLabel(){
  try{
    if(PF_GAME_VIEWS.has(S.view))return S.view;
    if(document.querySelector(".mode-frame"))return "mode:"+(modeCur().n||"?");
  }catch(_){}
  return"";
}
function pfFpsLoop(){
  let frames=0,t0=performance.now();
  const tick=now=>{
    const lab=pfGameLabel();
    if(!lab||lab!==PF.fpsLabel||document.hidden){__pfRaf=0;PF.fps=0;if(!lab)PF.fpsLabel="";return}
    frames++;
    if(now-t0>=2000){
      const f=Math.round(frames*1000/(now-t0));PF.fps=f;frames=0;t0=now;
      const g=PF.agg.games[lab];if(g){g.fs+=f;g.fn++;if(g.min==null||f<g.min)g.min=f}
    }
    __pfRaf=requestAnimationFrame(tick);
  };
  __pfRaf=requestAnimationFrame(tick);
}
setInterval(()=>{
  const lab=pfGameLabel();
  if(lab&&!__pfRaf&&!document.hidden){
    if(!PF.agg.games[lab]&&Object.keys(PF.agg.games).length<8)PF.agg.games[lab]={fs:0,fn:0,min:null,lt:0};
    if(PF.agg.games[lab]){PF.fpsLabel=lab;pfFpsLoop()}
  }
},1500);
/* الذاكرة (Chrome فقط) + حفظ محلي + إرسال ملخص يومي صغير */
setInterval(()=>{
  if(document.hidden)return;
  PF.agg.secs+=15;
  const m=performance.memory;if(m){PF.mem=Math.round(m.usedJSHeapSize/1048576);if(PF.mem>PF.memPeak)PF.memPeak=PF.mem;if(PF.mem>PF.agg.mem)PF.agg.mem=PF.mem}
  pfSave();pfPush();
},15000);
function pfDoc(){
  const A_=PF.agg,nav=(performance.getEntriesByType("navigation")[0])||{};
  const pages={};
  Object.entries(A_.pages).filter(([,p])=>p.n).sort((a,b)=>(b[1].lt-a[1].lt)||(b[1].ms/b[1].n-a[1].ms/a[1].n)).slice(0,10)
    .forEach(([k,p])=>{pages[k.slice(0,24)]={n:p.n,avg:Math.round(p.ms/p.n),mx:p.mx,lt:p.lt}});
  const games={};
  Object.entries(A_.games).filter(([,g])=>g.fn).slice(0,6).forEach(([k,g])=>{games[k.slice(0,30)]={fps:Math.round(g.fs/g.fn),min:g.min==null?0:g.min,lt:g.lt,n:g.fn}});
  return {day:A_.day,uid:S.user.uid,dev:__EC.dev(),ver:window.APP_BUILD||"",pages,games,mem:A_.mem||0,ltN:A_.ltN,ltMs:A_.ltMs,secs:A_.secs,load:Math.round(nav.loadEventEnd||0),upd:serverTimestamp()};
}
/* مرة كل 20 دقيقة بحد أقصى، وبعد دقيقتين استخدام — كتابة واحدة في اليوم تقريباً لكل طالب */
function pfPush(){
  try{
    if(!S.user||!db||!navigator.onLine||PF.agg.secs<120)return;
    const now=Date.now();if(now-PF.pushT<20*60*1000)return;
    PF.pushT=now;
    _fbSetDoc(doc(db,"perfLogs",PF.agg.day+"_"+S.user.uid.slice(0,6)),pfDoc()).catch(()=>{});
  }catch(_){}
}
async function pfLoadRemote(day){
  S.pf=S.pf||{};S.pf.day=day;S.pf.rows=null;
  try{
    const s=await getDocs(query(collection(db,"perfLogs"),where("day","==",day),limit(300)));
    S.pf.rows=s.docs.map(d=>d.data());S.pf.err="";
  }catch(e){S.pf.rows=[];S.pf.err=(e&&e.code)||"error"}
  if(!S._pfClean){S._pfClean=1;pfCleanup()}
  if(S.isAdmin&&S.view==="admin"&&S.tab==="perf")render();
}
async function pfCleanup(){
  try{
    const cut=new Date(Date.now()-7*864e5).toISOString().slice(0,10);
    const s=await getDocs(query(collection(db,"perfLogs"),where("day","<",cut),limit(50)));
    if(!s.size)return;const b=writeBatch(db);s.docs.forEach(d=>b.delete(d.ref));await b.commit();
  }catch(_){}
}
function pfMerge(rows){
  const pages={},games={};let ltN=0,mem=0,loadS=0,loadN=0;
  rows.forEach(r=>{
    ltN+=r.ltN||0;mem=Math.max(mem,r.mem||0);if(r.load){loadS+=r.load;loadN++}
    Object.entries(r.pages||{}).forEach(([k,p])=>{const x=pages[k]||(pages[k]={n:0,ms:0,mx:0,lt:0});x.n+=p.n;x.ms+=p.avg*p.n;x.mx=Math.max(x.mx,p.mx);x.lt+=p.lt});
    Object.entries(r.games||{}).forEach(([k,g])=>{const x=games[k]||(games[k]={fs:0,n:0,min:999,lt:0});x.fs+=g.fps*g.n;x.n+=g.n;if(g.min&&g.min<x.min)x.min=g.min;x.lt+=g.lt});
  });
  return {pages,games,ltN,mem,load:loadN?Math.round(loadS/loadN):0,users:rows.length};
}
function adminPerf(){
  const day=(S.pf&&S.pf.day)||PF_DAY();
  if(!S.pf||S.pf.rows===undefined){S.pf=S.pf||{};S.pf.rows=null;pfLoadRemote(day)}
  const rows=S.pf.rows,m=rows?pfMerge(rows):null;
  /* قياسات جهازك الحالية */
  const L=PF.agg,busy=(()=>{const w=PF.lt.filter(x=>Date.now()-x.t<60000).reduce((a,x)=>a+x.d,0);return Math.min(100,Math.round(w/600))})();
  const ops=__EC.ops,byCol={};
  ops.forEach(o=>{const c=(o.path||"?").split("/")[0]||"?",x=byCol[c]||(byCol[c]={n:0,ms:0,mx:0,bad:0});x.n++;x.ms+=o.ms;x.mx=Math.max(x.mx,o.ms);if(!o.ok)x.bad++});
  const th=(a)=>`<tr>${a.map(x=>`<th style="text-align:start;padding:4px 6px;font-size:11px" class="mut">${x}</th>`).join("")}</tr>`;
  const tr=(a,hot)=>`<tr${hot?' style="color:var(--bad);font-weight:700"':""}>${a.map(x=>`<td style="padding:4px 6px;border-top:1px solid var(--line);font-size:12px">${x}</td>`).join("")}</tr>`;
  const pagesLocal=Object.entries(L.pages).filter(([,p])=>p.n).map(([k,p])=>({k,n:p.n,avg:Math.round(p.ms/p.n),mx:p.mx,lt:p.lt})).sort((a,b)=>b.lt-a.lt||b.avg-a.avg);
  const pagesAll=m?Object.entries(m.pages).map(([k,p])=>({k,n:p.n,avg:Math.round(p.ms/Math.max(1,p.n)),mx:p.mx,lt:p.lt})).sort((a,b)=>b.lt-a.lt||b.avg-a.avg):[];
  const gamesAll=m?Object.entries(m.games).map(([k,g])=>({k,fps:Math.round(g.fs/Math.max(1,g.n)),min:g.min===999?0:g.min,lt:g.lt})).sort((a,b)=>a.fps-b.fps):[];
  const gamesLocal=Object.entries(L.games).filter(([,g])=>g.fn).map(([k,g])=>({k,fps:Math.round(g.fs/g.fn),min:g.min==null?0:g.min,lt:g.lt}));
  const pt=(list)=>list.length?`<table style="width:100%;border-collapse:collapse">${th(["الصفحة","زيارات","متوسط ms","أقصى ms","تهنيج"])}${list.slice(0,12).map((p,i)=>tr([esc(pfLabel(p.k)),p.n,p.avg,p.mx,p.lt],i===0&&p.lt>0)).join("")}</table>`:`<div class="mut">مفيش بيانات لسه</div>`;
  const gt=(list)=>list.length?`<table style="width:100%;border-collapse:collapse">${th(["اللعبة","متوسط FPS","أقل FPS","تهنيج"])}${list.slice(0,10).map((g,i)=>tr([esc(g.k.startsWith("mode:")?"🎛 "+g.k.slice(5):pfLabel(g.k)),g.fps,g.min,g.lt],i===0&&g.fps<30)).join("")}</table>`:`<div class="mut">محدش لعب لعبة لسه (بيتقاس وإنت جوه اللعبة)</div>`;
  const dayBtn=(d,t)=>`<button class="tab ${day===d?"on":""}" data-act="pfDay" data-id="${d}">${t}</button>`;
  const yest=new Date(Date.now()-864e5).toISOString().slice(0,10);
  return `<div class="card"><h3 style="margin-top:0">⚡ مراقب الأداء</h3>
  <p class="mut" style="margin:0 0 10px">كل طالب جهازه بيبعت ملخص صغير (مرة كل 20 دقيقة بحد أقصى) فيه أبطأ الصفحات وFPS الألعاب. القياسات بتتحسب على جهاز الطالب نفسه.</p>
  <div class="tabs" style="margin-bottom:6px">${dayBtn(PF_DAY(),"النهارده")}${dayBtn(yest,"امبارح")}</div>
  ${S.pf&&S.pf.err?`<div class="err">تعذّر القراءة (${esc(S.pf.err)}) — غالباً قواعد Firestore الجديدة لسه ماتنشرتش.</div>`:""}</div>
  <div class="stats">
   <div class="stat card"><b>${m?m.users:"…"}</b><span class="mut">أجهزة بعتت قياسات</span></div>
   <div class="stat card"><b>${m?m.load+"ms":"…"}</b><span class="mut">متوسط تحميل الصفحة</span></div>
   <div class="stat card"><b>${m?m.ltN:"…"}</b><span class="mut">مرات تهنيج (&gt;50ms)</span></div>
   <div class="stat card"><b>${m?(m.mem?m.mem+"MB":"—"):"…"}</b><span class="mut">أعلى استهلاك رام</span></div></div>
  <div class="card"><h3 style="margin-top:0">🐢 أكتر صفحة بتهنّج (كل الطلاب)</h3>${rows?pt(pagesAll):`<div class="mut">جاري التحميل…</div>`}</div>
  <div class="card"><h3 style="margin-top:0">🎮 أكتر لعبة بتهنّج (أقل FPS)</h3>${rows?gt(gamesAll):`<div class="mut">جاري التحميل…</div>`}</div>
  <div class="card"><h3 style="margin-top:0">📱 جهازك دلوقتي</h3>
   <div class="stats"><div class="stat card"><b>${PF.fps||"—"}</b><span class="mut">FPS ${PF.fpsLabel?"("+esc(PF.fpsLabel.replace("mode:","🎛 "))+")":"(بيتقاس جوه اللعبة)"}</span></div>
   <div class="stat card"><b>${performance.memory?PF.mem+"MB":"—"}</b><span class="mut">رام JS${performance.memory?" · أعلى "+PF.memPeak+"MB":" (Chrome بس)"}</span></div>
   <div class="stat card"><b>~${busy}%</b><span class="mut">ضغط المعالج (تقريبي، آخر دقيقة)</span></div>
   <div class="stat card"><b>${L.ltN}</b><span class="mut">تهنيج النهارده</span></div></div>
   <p class="mut" style="font-size:12px;margin:0 0 8px">ضغط المعالج تقدير من مدة المهام الطويلة، مش قياس CPU حقيقي (المتصفح مابيعرضوش).</p>
   <b style="font-size:13px">صفحاتك</b>${pt(pagesLocal)}<b style="font-size:13px;display:block;margin-top:10px">ألعابك</b>${gt(gamesLocal)}</div>
  <div class="card"><h3 style="margin-top:0">🔥 زمن استعلامات Firebase (جلستك)</h3>
   ${Object.keys(byCol).length?`<table style="width:100%;border-collapse:collapse">${th(["المجموعة","عدد","متوسط ms","أقصى ms","فاشل"])}${Object.entries(byCol).sort((a,b)=>b[1].ms/b[1].n-a[1].ms/a[1].n).map(([c,x])=>tr([`<span dir="ltr">${esc(c)}</span>`,x.n,Math.round(x.ms/x.n),x.mx,x.bad],false)).join("")}</table>`:`<div class="mut">لسه مفيش</div>`}</div>
  <div class="card"><h3 style="margin-top:0">آخر المهام الطويلة (جهازك)</h3>
   ${PF.lt.length?[...PF.lt].reverse().slice(0,10).map(x=>`<div class="row" style="font-size:12px;padding:3px 0;gap:8px"><span class="mut">${new Date(x.t).toLocaleTimeString("ar-EG")}</span><b>${x.d}ms</b><span>${esc(pfLabel(x.v))}</span></div>`).join(""):`<div class="mut">مفيش ✅</div>`}</div>`;
}
Object.assign(A,{pfDay(d){S.pf={day:d.id,rows:null};pfLoadRemote(d.id);render()}});

// gal-secure-context
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");
  if(!b)return;
  const act=b.dataset.act;
  if(!act)return;
  const fn=A[act];
  if(typeof fn!=="function"){console.warn("Unknown act",act);return}
  e.preventDefault();
  if(!S.isAdmin&&FEAT_ACT[act]&&!featOn(FEAT_ACT[act])){toast("القسم ده متوقف مؤقتاً");return}
  if(!S.isAdmin&&(act==="openFadaye7"||act==="openTanagha"||act==="openGallery")&&tanaghaState(S.profile)!=="approved"){S.view="tanaghaLock";render(true);return}
  try{
    window.__cancel=false;
    const __done=()=>{if(S.isAdmin&&AUDIT_ACTS[act]&&!window.__cancel)auditLog(AUDIT_ACTS[act],b.dataset.id||"")};
    const r=fn(b.dataset,b);
    if(r&&typeof r.then==="function"){
      b.classList.add("busy");
      const __un=()=>{try{b.classList.remove("busy")}catch(_){}};
      r.then(__un,__un);
    }
    if(r&&typeof r.then==="function")r.then(__done).catch(err=>{console.error("act",act,err);try{toast("خطأ: "+((err&&err.message)||act))}catch(_){}});
    else __done();
  }catch(err){console.error("act",act,err);try{toast("خطأ: "+act)}catch(_){}}
});
document.addEventListener("change",e=>{
  if(e.target&&e.target.id==="modeGameFile"){
    const f=e.target.files&&e.target.files[0];window.__pendingModeHtml=null;
    if(!f)return;
    if(!S.isAdmin){e.target.value="";toast("رفع الأوضاع للأدمن فقط",true);return}
    if(!/\.html?$/i.test(f.name)||f.size>MODE_FILE_MAX_BYTES){e.target.value="";toast("اختر ملف HTML لا يتجاوز 600KB",true);return}
        f.text().then(text=>{
      text=String(text||"").replace(/^\uFEFF/,"");
      if(!/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(text)){e.target.value="";toast("الملف لا يبدو صفحة HTML صالحة",true);return}
      // عزل إضافي: منع توجيه الصفحة الأم ومحاولات كسر الـ sandbox الشائعة
      if(/<\s*(iframe|object|embed|frame)\b/i.test(text)){e.target.value="";toast("الملف يحتوي عناصر غير مسموحة (iframe/object)",true);return}
      if(/\b(?:document|window)\s*\.\s*(?:cookie|domain)\b/i.test(text)&&/top\s*\.\s*location|parent\s*\.\s*location/i.test(text)){
        e.target.value="";toast("الملف يحاول الوصول لصفحة المنصة — ارفضه",true);return
      }
      window.__pendingModeHtml={text,name:String(f.name).slice(0,120),bytes:f.size};toast("تم تجهيز الملف؛ اضغط إضافة الوضع لحفظه",true);
    }).catch(()=>toast("تعذر قراءة الملف",true));
    return;
  }
  const c=e.target.dataset&&e.target.dataset.change;if(c)A[c]?.(e.target.dataset,e.target);
  if(e.target.type==="file"&&(e.target.id==="qf"||e.target.id==="sf")&&S.editingAsm){
    const part=e.target.id==="qf"?"q":"s",files=[...e.target.files];e.target.value="";
    (async()=>{
      const ed=S.editingAsm;let bad=0;
      for(const f of files){
        try{
          const id="t"+Date.now()+Math.random().toString(36).slice(2,6);
          if(/^image\//.test(f.type))ed[part].push({id,pend:true,kind:"image",name:f.name,data:await packImage(f,2000,0.92,950000)});
          else if(f.type==="application/pdf"&&f.size<=5*1024*1024)ed[part].push({id,pend:true,kind:"pdf",name:f.name,gid:id,b64:await readB64(f)});
          else bad++;
        }catch(err){bad++}
      }
      const ql=$("#qlist"),sl=$("#slist");if(ql)ql.innerHTML=fileList(ed.q,"q");if(sl)sl.innerHTML=fileList(ed.s,"s");
      if(bad)toast(bad+" ملف اترفض (لازم صورة أو PDF أقل من 5MB)");
    })();
  }
  if(e.target.type==="radio"&&S.view==="exam"){updProg();saveExamDraft();if(navigator.vibrate)navigator.vibrate(8)}
  if(e.target.id==="qbChatImg"&&e.target.files&&e.target.files[0]&&S.qb&&S.qb.roomCode){
    const files=[...e.target.files].slice(0,1500);e.target.value="";
    (async()=>{
      try{
      let n=0;for(const f of files){
        if(!/^image\//.test(f.type)){toast("صورة فقط — للفيديو استخدم زر 🔗 رابط");continue}
        toast("جاري رفع الصورة "+(n+1)+" من "+files.length+"…");
        const data=await packImage(f,1500,0.85,900000);
        await addDoc(collection(db,"qb_rooms",S.qb.roomCode,"chat"),{
          uid:S.user.uid,name:(S.profile.name||"طالب").split(" ")[0],
          text:"🖼 صورة",img:data,kind:"image",createdAt:serverTimestamp()
        });
        n++;}
        toast(n>1?"اتبعتت "+n+" صور ✓":"اتبعتت ✓");
      }catch(err){console.error(err);toast("فشل رفع الصورة")}
    })();
  }
  if(e.target.id==="grpImg"&&e.target.files&&e.target.files[0]&&S.groupId){
    const files=[...e.target.files].slice(0,10);e.target.value="";
    (async()=>{
      try{
      let n=0;for(const f of files){
        if(!/^image\//.test(f.type)){toast("صورة فقط");continue}
        toast("جاري رفع الصورة "+(n+1)+" من "+files.length+"…");
        const data=await packImage(f,640,0.72,320000);
        await addDoc(collection(db,"groups",S.groupId,"msgs"),{
          fromUid:S.user.uid,fromName:(S.profile.name||"طالب").split(" ")[0],
          text:"🖼 صورة",img:data,kind:"image",createdAt:serverTimestamp()
        });
        await updateDoc(doc(db,"groups",S.groupId),{lastText:"🖼 صورة",updatedAt:serverTimestamp()});
        n++;}
        toast(n>1?"اتبعتت "+n+" صور ✓":"اتبعتت ✓");
      }catch(err){console.error(err);toast("فشل رفع الصورة")}
    })();
  }
  if(e.target.id==="dmImg"&&e.target.files&&e.target.files[0]&&S.chatThread){
    const files=[...e.target.files].slice(0,10);e.target.value="";
    (async()=>{
      try{
      let n=0;for(const f of files){
        if(!/^image\//.test(f.type)){toast("صورة فقط — للفيديو استخدم زر 🔗 رابط");continue}
        toast("جاري رفع الصورة "+(n+1)+" من "+files.length+"…");
        const data=await packImage(f,640,0.72,320000);
        await sendDm(S.chatThread.uid,"🖼 صورة",data,{kind:"image"});
        n++;}
        toast(n>1?"اتبعتت "+n+" صور ✓":"اتبعتت ✓");
      }catch(err){console.error(err);toast("فشل إرسال الصورة")}
    })();
  }
  if(e.target.id==="aiFile"&&e.target.files&&e.target.files[0]){
    const hint=$("#aiFileHint");
    if(hint)hint.textContent="تم اختيار: "+e.target.files[0].name+" — اكتب سؤالك ودوس إرسال";
  }
  if(e.target.id==="meAvatar"&&e.target.files&&e.target.files[0]&&S.user){
    const f=e.target.files[0];e.target.value="";
    (async()=>{
      try{
        if(!/^image\//.test(f.type)||f.size>8*1024*1024){toast("صورة فقط");return}
        const big=await packImage(f,480,0.72,180000);
        const av=await packImage(f,160,0.7,20000);
        const thumb=await packImage(f,96,0.65,12000);
        await setDoc(doc(db,"avatars",S.user.uid),{data:big,updatedAt:serverTimestamp()});
        await updateDoc(doc(db,"students",S.user.uid),{avatar:av,avatarThumb:thumb});
        S.profile={...S.profile,avatar:av,avatarThumb:thumb};
        if(window.__peers)window.__peers[S.user.uid]={name:S.profile.name,avatar:thumb};
        toast("اتحفظت الصورة ✓");
        if(S.view==="me")scheduleRender();
      }catch(err){toast("فشل رفع الصورة")}
    })();
  }
});
document.addEventListener("input",e=>{
  if(e.target.id==="tgq"){S.tgq=e.target.value;clearTimeout(window.__tgqT);window.__tgqT=setTimeout(()=>{const f=document.activeElement&&document.activeElement.id==="tgq";render(true);if(f){const i=$("#tgq");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}},350);return}
  if(e.target.id==="sq"){S.sq=e.target.value;S.sLimit=40;const t=$("#stbl");if(t)t.innerHTML=studentsTable()}
  if(e.target.tagName==="TEXTAREA"&&S.view==="exam"&&e.target.name&&e.target.name.startsWith("q")){updProg();saveExamDraft()}
});
document.addEventListener("submit",e=>{e.preventDefault();const f=e.target.dataset.submit;if(f)A[f]?.()});


/* ---------- شاشة الافتتاح ---------- */
(function(){
  const SPLASH_MS = 900; // brand duration
  const el = document.getElementById("splash");
  if(!el) return;
  const start = performance.now();
  let done = false;
  function finish(){
    if(done) return; done = true;
    const left = Math.max(0, SPLASH_MS - (performance.now() - start));
    setTimeout(()=>{
      el.classList.add("hide");
      setTimeout(()=>{ try{el.remove()}catch(_){} }, 600);
    }, left);
  }
  setTimeout(finish, SPLASH_MS + 400);
  const appEl = document.getElementById("app");
  if(appEl){
    const mo = new MutationObserver(()=>{
      const t = appEl.textContent || "";
      if(t && !t.includes("جاري التحميل")){
        mo.disconnect();
        const minShow = 900;
        setTimeout(finish, Math.max(0, minShow - (performance.now() - start)));
      }
    });
    mo.observe(appEl, {childList:true, subtree:true});
  }
})();


window.addEventListener("error",function(ev){try{console.error("global",ev&&ev.message,ev&&ev.filename,ev&&ev.lineno)}catch(_){}});
window.addEventListener("unhandledrejection",function(ev){try{console.error("unhandled",ev&&ev.reason)}catch(_){}});

if(!configured)render(true);

/* ===== Student Life v1: Coins + Pet + Shop + Room + Quests ===== */
const LF_ST=[0,100,300,650,1200,2200],LF_STN=["بيضة","رضيع","طفل","شاب","بالغ","أسطوري"],LF_SC=[1,.55,.72,.9,1.08,1.3];
const LF_PETS=["🦊","🐶","🐰","🐑","🐗"],LF_PETMAP={"🐺":"🐗","🐱":"🐶","🐼":"🐑","🐧":"🐑","🐨":"🐑","🐢":"🐑","🐸":"🦊","🐲":"🐗","🐻":"🐶"};
const LF_CATS={title:"الألقاب",frame:"الإطارات",skin:"الثيمات",fx:"التأثيرات",acc:"للحيوان",pet:"🐾 حيوانات",room:"الحديقة",snd:"الأصوات",bub:"فقاعات الشات"};
const LF_OLD={"t1":150,"t2":400,"t3":400,"t4":400,"t5":900,"t6":1500,"t7":600,"f1":100,"f2":250,"f3":500,"f4":1200,"f5":800,"f6":700,"f7":1000,"s1":300,"s2":300,"s3":350,"s4":350,"s5":600,"s6":600,"x1":350,"x2":350,"x3":400,"x4":500,"x5":400,"a1":200,"a2":200,"a3":250,"a4":700,"a5":900,"a6":600,"r1":150,"r2":200,"r3":250,"r4":600,"r5":120,"r6":180,"r7":500,"r8":250,"r9":200,"r10":450,"r11":220,"r12":150,"p1":180,"p2":180,"p3":220,"p4":220,"p5":300,"g1":160,"g2":160,"g3":160,"h1":400,"h2":250,"h3":150,"h4":300,"h5":100,"h6":450,"h7":600,"h8":100,"h9":700,"n1":150,"n2":200,"n3":250,"n4":250,"n5":150,"n6":150,"n7":120,"n8":120,"b1":400,"b2":500,"b3":450,"b4":350,"b5":400};
const LF_SHOP=[
{id:"t1",c:"title",i:"📖",n:"طالب مجتهد",p:900,lv:1},{id:"t8",c:"title",i:"🧠",n:"العبقري",p:1500,lv:3},{id:"t9",c:"title",i:"🌟",n:"المتفوق",p:2500,lv:4},{id:"t10",c:"title",i:"🏅",n:"جامع الإنجازات",p:3500,lv:5},{id:"t11",c:"title",i:"🦁",n:"القائد",p:4500,lv:6},{id:"t12",c:"title",i:"🎖️",n:"المحترف",p:6000,lv:7},{id:"t13",c:"title",i:"🐉",n:"الوحش",p:9000,lv:8},{id:"t5",c:"title",i:"👑",n:"أسطورة",p:5400,lv:6},{id:"t6",c:"title",i:"💎",n:"VIP",p:9000,lv:8},{id:"t7",c:"title",i:"🎯",n:"صياد الجوائز",p:3600,lv:4},
{id:"f1",c:"frame",i:"🥉",n:"برونزي",p:800,lv:1,k:"bronze"},{id:"f2",c:"frame",i:"🥈",n:"فضي",p:2000,lv:2,k:"silver"},{id:"f3",c:"frame",i:"🥇",n:"ذهبي",p:4000,lv:4,k:"gold"},{id:"f4",c:"frame",i:"💠",n:"ألماس",p:9600,lv:8,k:"diamond"},{id:"f5",c:"frame",i:"🔥",n:"نار",p:6400,lv:6,k:"fire"},{id:"f6",c:"frame",i:"⚡",n:"نيون",p:5600,lv:5,k:"neon"},{id:"f7",c:"frame",i:"🌌",n:"Galaxy",p:8000,lv:7,k:"galaxy"},
{id:"s1",c:"skin",i:"🌊",n:"Ocean",p:1800,lv:2,k:"ocean"},{id:"s2",c:"skin",i:"🟣",n:"Purple",p:1800,lv:2,k:"purple"},{id:"s3",c:"skin",i:"🌅",n:"Sunset",p:2100,lv:3,k:"sunset"},{id:"s4",c:"skin",i:"🌲",n:"Forest",p:2100,lv:3,k:"forest"},{id:"s5",c:"skin",i:"🌈",n:"Aurora",p:3600,lv:5,k:"aurora"},{id:"s6",c:"skin",i:"💗",n:"Neon",p:3600,lv:5,k:"neon"},
{id:"x1",c:"fx",i:"⭐",n:"نجوم",p:2100,lv:2,k:"⭐"},{id:"x2",c:"fx",i:"❄️",n:"ثلج",p:2100,lv:3,k:"❄️"},{id:"x3",c:"fx",i:"💖",n:"قلوب",p:2400,lv:3,k:"💖"},{id:"x4",c:"fx",i:"✨",n:"شرارات",p:3000,lv:4,k:"✨"},{id:"x5",c:"fx",i:"💧",n:"مطر",p:2400,lv:3,k:"💧"},
{id:"a1",c:"acc",i:"🎩",n:"قبعة",p:1400,lv:1,k:"hat"},{id:"a2",c:"acc",i:"🕶️",n:"نظارة",p:1400,lv:1,k:"glasses"},{id:"a3",c:"acc",i:"🧣",n:"وشاح",p:1750,lv:2,k:"scarf"},{id:"a4",c:"acc",i:"👑",n:"تاج",p:4900,lv:5,k:"crown"},{id:"a5",c:"acc",i:"🪽",n:"جناحين",p:6300,lv:6,k:"wings"},{id:"a6",c:"acc",i:"😇",n:"هالة",p:4200,lv:4,k:"halo"},
{id:"r1",c:"room",s:"wall",i:"🦋",n:"فراشات",p:750,lv:1},{id:"r2",c:"room",s:"wall",i:"🐦",n:"عصافير",p:1000,lv:1},{id:"r3",c:"room",s:"desk",i:"📚",n:"رف كتب",p:1250,lv:2,rm:1},{id:"r4",c:"room",s:"desk",i:"🖥️",n:"كمبيوتر",p:3000,lv:4,rm:1},{id:"r5",c:"room",s:"plant",i:"🌵",n:"صبار",p:600,lv:1},{id:"r6",c:"room",s:"plant",i:"🌷",n:"زهور",p:900,lv:2},{id:"r7",c:"room",s:"floor",i:"🛏️",n:"سرير",p:2500,lv:3,rm:1},{id:"r8",c:"room",s:"floor",i:"🪑",n:"مقعد حديقة",p:1250,lv:2},{id:"r9",c:"room",s:"light",i:"💡",n:"عمود إنارة",p:1000,lv:1},{id:"r10",c:"room",s:"light",i:"🏮",n:"فانوس",p:2250,lv:3},{id:"r11",c:"room",s:"clock",i:"🪁",n:"طائرة ورقية",p:1100,lv:2},{id:"r12",c:"room",s:"clock",i:"🎈",n:"بالونات",p:750,lv:1},{id:"p1",c:"room",s:"paint",i:"☀️",n:"نهار صافي",p:900,lv:1,k:"#8ec5ff",f:"#79c24f"},{id:"p2",c:"room",s:"paint",i:"🌿",n:"ربيع",p:900,lv:1,k:"#bfe8d0",f:"#8bd05a"},{id:"p3",c:"room",s:"paint",i:"🌸",n:"غروب وردي",p:1100,lv:2,k:"#f6b9d3",f:"#6aa84a"},{id:"p4",c:"room",s:"paint",i:"🌅",n:"غروب برتقالي",p:1100,lv:2,k:"#ffc08a",f:"#8ea84a"},{id:"p5",c:"room",s:"paint",i:"🌙",n:"ليل",p:1500,lv:3,k:"#2b2f4a",f:"#2f5a3a"},{id:"g1",c:"room",s:"rug",i:"🟫",n:"ممر ترابي",p:800,lv:1,k:"#b58a5a"},{id:"g2",c:"room",s:"rug",i:"⬜",n:"ممر حجري",p:800,lv:1,k:"#a5adb7"},{id:"g3",c:"room",s:"rug",i:"🟩",n:"رقعة عشب فاتحة",p:800,lv:2,k:"#a6e06f"},{id:"h1",c:"room",s:"shelf",i:"🏆",n:"كأس",p:2000,lv:3,rm:1},{id:"h2",c:"room",s:"shelf",i:"🌍",n:"جلوب",p:1250,lv:2,rm:1},{id:"h3",c:"room",s:"shelf",i:"🧸",n:"دبدوب",p:750,lv:1,rm:1},{id:"h4",c:"room",s:"desk2",i:"🎧",n:"سماعات",p:1500,lv:3,rm:1},{id:"h5",c:"room",s:"desk2",i:"☕",n:"قهوة",p:500,lv:1,rm:1},{id:"h6",c:"room",s:"side",i:"🎸",n:"جيتار",p:2250,lv:4,rm:1},{id:"h7",c:"room",s:"side",i:"🔭",n:"تلسكوب",p:3000,lv:5,rm:1},{id:"h8",c:"room",s:"side",i:"⚽",n:"كورة",p:500,lv:1},{id:"h9",c:"room",s:"light",i:"🪔",n:"مشعل",p:3500,lv:6},{id:"n1",c:"snd",s:"win",i:"🎺",n:"فوز: ريترو",p:600,lv:1,k:[392,392,523,659,784],w:"square"},{id:"n2",c:"snd",s:"win",i:"🔔",n:"فوز: جرس",p:800,lv:2,k:[1047,1319,1568,2093],w:"sine"},{id:"n3",c:"snd",s:"lvl",i:"🎼",n:"ليفل: فانفار",p:1000,lv:3,k:[262,330,392,523,659,784],w:"sawtooth"},{id:"n4",c:"snd",s:"lvl",i:"🪄",n:"ليفل: سحر",p:1000,lv:3,k:[523,659,784,988,1319,1568],w:"sine"},{id:"n5",c:"snd",s:"box",i:"🔮",n:"صندوق: غموض",p:600,lv:1,k:[220,277,330,415,554],w:"sine"},{id:"n6",c:"snd",s:"box",i:"🕹️",n:"صندوق: أركيد",p:600,lv:1,k:[330,440,660,880],w:"square"},{id:"n7",c:"snd",s:"buy",i:"💵",n:"شراء: كاش",p:500,lv:1,k:[1568,2093],w:"sine"},{id:"n8",c:"snd",s:"buy",i:"🫧",n:"شراء: بوب",p:500,lv:1,k:[440,660,990],w:"triangle"},{id:"b1",c:"bub",i:"🟡",n:"ذهبي",p:2400,lv:3,k:"gold"},{id:"b2",c:"bub",i:"🔷",n:"نيون",p:3000,lv:4,k:"neon"},{id:"b3",c:"bub",i:"🪟",n:"زجاج",p:2700,lv:4,k:"glass"},{id:"b4",c:"bub",i:"💥",n:"كوميك",p:2100,lv:2,k:"comic"},{id:"b5",c:"bub",i:"🌇",n:"غروب",p:2400,lv:3,k:"sunset"},{id:"f8",c:"frame",i:"❤️",n:"روبي",p:7200,lv:6,k:"ruby"},{id:"f9",c:"frame",i:"💚",n:"زمرد",p:7200,lv:6,k:"emerald"},{id:"f10",c:"frame",i:"💙",n:"ياقوت",p:7200,lv:6,k:"sapphire"},{id:"f11",c:"frame",i:"🧊",n:"Ice",p:6000,lv:5,k:"ice"},{id:"f12",c:"frame",i:"🤖",n:"Cyber",p:10400,lv:8,k:"cyber"},{id:"f13",c:"frame",i:"🌈",n:"RGB",p:11200,lv:9,k:"rgb"},{id:"f14",c:"frame",i:"⚡",n:"Electric",p:9200,lv:7,k:"electric"},{id:"f15",c:"frame",i:"🌑",n:"Shadow",p:8000,lv:7,k:"shadow"},{id:"f16",c:"frame",i:"🔮",n:"Crystal",p:12800,lv:10,k:"crystal"},{id:"s7",c:"skin",i:"🪟",n:"Glass",p:2400,lv:3,k:"glass"},{id:"s8",c:"skin",i:"🌃",n:"Midnight",p:2400,lv:3,k:"midnight"},{id:"s9",c:"skin",i:"🥇",n:"Gold",p:4200,lv:5,k:"gold"},{id:"s10",c:"skin",i:"🌸",n:"Pink",p:2100,lv:2,k:"pink"},{id:"s11",c:"skin",i:"☁️",n:"Sky",p:2100,lv:2,k:"sky"},{id:"s12",c:"skin",i:"☕",n:"Coffee",p:2100,lv:2,k:"coffee"},{id:"s13",c:"skin",i:"🦾",n:"Cyberpunk",p:5400,lv:6,k:"cyberpunk"},{id:"s14",c:"skin",i:"📼",n:"Retro",p:3000,lv:4,k:"retro"},{id:"s15",c:"skin",i:"⬜",n:"Minimal",p:1500,lv:2,k:"minimal"},{id:"x6",c:"fx",i:"🍃",n:"أوراق",p:2100,lv:3,k:"🍃"},{id:"x7",c:"fx",i:"☄️",n:"نيزك",p:4500,lv:5,k:"☄️"},{id:"x8",c:"fx",i:"⚡",n:"برق",p:4800,lv:5,k:"⚡"},{id:"x9",c:"fx",i:"🫧",n:"فقاعات",p:2400,lv:3,k:"🫧"},{id:"x10",c:"fx",i:"💎",n:"ألماس",p:7500,lv:7,k:"💎"},{id:"x11",c:"fx",i:"☁️",n:"سحب",p:2100,lv:2,k:"☁️"},{id:"x12",c:"fx",i:"🌠",n:"شهب",p:5400,lv:6,k:"🌠"},{id:"z1",c:"pet",i:"🦋",n:"فراشة",p:12000,lv:4,k:"🦋",rm:1},{id:"z2",c:"pet",i:"🦉",n:"بومة",p:15000,lv:5,k:"🦉",rm:1},{id:"z3",c:"pet",i:"🦛",n:"فرس النهر",p:15000,lv:6,k:"🦛"},{id:"z4",c:"pet",i:"🐙",n:"أخطبوط",p:20000,lv:7,k:"🐙",rm:1},{id:"z5",c:"pet",i:"🦁",n:"أسد",p:30000,lv:9,k:"🦁"},{id:"z6",c:"pet",i:"🐯",n:"نمر",p:25000,lv:8,k:"🐯",rm:1},{id:"z7",c:"pet",i:"🦅",n:"نسر",p:30000,lv:9,k:"🦅",rm:1},{id:"z8",c:"pet",i:"🐬",n:"دلفين",p:30000,lv:9,k:"🐬",rm:1},{id:"z9",c:"pet",i:"🐘",n:"فيل",p:35000,lv:10,k:"🐘",rm:1},{id:"z10",c:"pet",i:"🦖",n:"ديناصور",p:45000,lv:11,k:"🦖",rm:1},{id:"z11",c:"pet",i:"🦓",n:"حمار وحشي",p:20000,lv:8,k:"🦓"},{id:"z12",c:"pet",i:"🦖",n:"تي ركس",p:80000,lv:15,k:"🦖"},{id:"z13",c:"pet",i:"🦕",n:"سبينوصور",p:50000,lv:12,k:"🦕"},{id:"d1",c:"room",s:"hill",i:"🏞️",n:"تل أخضر",p:1800,lv:2,m:"Hill001"},{id:"d2",c:"room",s:"hill",i:"🏞️",n:"تل مرتفع",p:2200,lv:3,m:"Hill002"},{id:"d3",c:"room",s:"hill",i:"⛰️",n:"جبال بعيدة",p:3500,lv:5,m:"MountainFar001"},{id:"d4",c:"room",s:"hill",i:"🏔️",n:"جبل",p:4800,lv:7,m:"Mountain001"},{id:"d5",c:"room",s:"cloud",i:"☁️",n:"سحابة",p:700,lv:1,m:"Cloud001"},{id:"d6",c:"room",s:"cloud",i:"☁️",n:"سحابة كبيرة",p:900,lv:2,m:"Cloud002"},{id:"d7",c:"room",s:"cloud",i:"☁️",n:"سحابة ثقيلة",p:1100,lv:3,m:"Cloud003"},{id:"d8",c:"room",s:"tree",i:"🌳",n:"شجرة صغيرة",p:1200,lv:1,m:"TreeLow001"},{id:"d9",c:"room",s:"tree",i:"🌳",n:"شجرة متوسطة",p:2400,lv:3,m:"TreeMed001"},{id:"d10",c:"room",s:"tree",i:"🌲",n:"شجرة عالية",p:3800,lv:5,m:"TreeHigh001"},{id:"d11",c:"room",s:"tree2",i:"🌳",n:"شجرة صغيرة (يمين)",p:1200,lv:1,m:"TreeLow002"},{id:"d12",c:"room",s:"tree2",i:"🌳",n:"شجرة متوسطة (يمين)",p:2400,lv:3,m:"TreeMed002"},{id:"d13",c:"room",s:"tree2",i:"🌲",n:"شجرة عالية (يمين)",p:3800,lv:5,m:"TreeHigh002"},{id:"d14",c:"room",s:"bush",i:"🌿",n:"شجيرة",p:700,lv:1,m:"Bush001"},{id:"d15",c:"room",s:"bush",i:"🌿",n:"شجيرة كبيرة",p:1000,lv:2,m:"Bush002"},{id:"d16",c:"room",s:"bush2",i:"🌾",n:"قصب",p:800,lv:2,m:"Reed001"},{id:"d17",c:"room",s:"bush2",i:"🌾",n:"قصب طويل",p:1100,lv:3,m:"Reed002"},{id:"d18",c:"room",s:"rock",i:"🪨",n:"صخرة",p:600,lv:1,m:"Rock001"},{id:"d19",c:"room",s:"rock",i:"🪨",n:"صخرة كبيرة",p:900,lv:2,m:"Rock002"},{id:"d20",c:"room",s:"rock",i:"🪨",n:"صخرة ضخمة",p:1300,lv:3,m:"Rock003"},{id:"d21",c:"room",s:"grass",i:"🌱",n:"عشب",p:400,lv:1,m:"Grass001"},{id:"d22",c:"room",s:"grass",i:"🌱",n:"عشب كثيف",p:650,lv:2,m:"Grass002"},{id:"d23",c:"room",s:"grass",i:"🌱",n:"عشب طويل",p:900,lv:3,m:"Grass003"},{id:"d24",c:"room",s:"floor",i:"⛲",n:"نافورة",p:3500,lv:4},{id:"d25",c:"room",s:"floor",i:"⛺",n:"خيمة",p:2500,lv:3},{id:"d26",c:"room",s:"floor",i:"🛝",n:"زحليقة",p:2800,lv:4}
];
const LF_POOL=[{id:"login",e:"login",t:"ادخل المنصة",n:1,r:20},{id:"e1",e:"exam",t:"خلّص امتحان",n:1,r:60},{id:"e2",e:"exam",t:"خلّص امتحانين",n:2,r:90},{id:"full",e:"full",t:"هات درجة كاملة",n:1,r:80},{id:"box",e:"box",t:"افتح صندوق الحظ",n:1,r:30},{id:"ai",e:"ai",t:"اسأل المساعد الذكي",n:1,r:30},{id:"game",e:"game",t:"ادخل لعبة",n:1,r:40}];
const LF_ACH=[{id:"a_ex1",i:"📝",t:"أول امتحان",ok:l=>l.tot.ex>=1,r:50},{id:"a_ex10",i:"📚",t:"10 امتحانات",ok:l=>l.tot.ex>=10,r:150},{id:"a_full",i:"💯",t:"أول درجة كاملة",ok:l=>l.tot.full>=1,r:100},{id:"a_box",i:"🎁",t:"فتحت أول صندوق",ok:l=>l.tot.box>=1,r:40},{id:"a_lv10",i:"⭐",t:"Level 10",ok:()=>xpLevel((S.profile||{}).xp||0)>=10,r:200},{id:"a_str7",i:"🔥",t:"7 أيام متتالية",ok:()=>((S.profile||{}).streak||0)>=7,r:150},{id:"a_c5k",i:"🪙",t:"جمعت 5000 عملة",ok:l=>l.earned>=5000,r:300},{id:"a_win",i:"🏆",t:"أول فوز في لعبة",ok:l=>l.tot.win>=1,r:100},{id:"a_ex100",i:"🎓",t:"100 امتحان",ok:l=>l.tot.ex>=100,r:500},{id:"a_full5",i:"💎",t:"5 درجات كاملة",ok:l=>l.tot.full>=5,r:250},{id:"a_shop5",i:"🛍️",t:"اشتريت 5 حاجات",ok:l=>l.inv.length>=5,r:120},{id:"a_pet3",i:"🐺",t:"حيوانك بقى شاب",ok:()=>lfStage((S.profile||{}).xp)>=3,r:200}];
const lfDef=()=>({coins:0,earned:0,inv:[],eq:{acc:[],room:{}},pet:null,lucky:0,lastDaily:"",q:{d:"",done:[],prog:{}},tot:{ex:0,full:0,box:0},ach:[],w:{k:"",done:[],prog:{}},paid:{},refunded:0,hatched:false});
const lfItem=id=>LF_SHOP.find(x=>x.id===id);
const lfStage=(xp,l)=>{let s=0;LF_ST.forEach((m,i)=>{if((xp||0)>=m)s=i});l=l===undefined?S.life:l;if(l&&l.hatched&&s<1)s=1;return s};
function lfQuests(){const k=todayKey();let h=0;for(const ch of k)h=(h*31+ch.charCodeAt(0))>>>0;const r=mulberry(h);return shuf(LF_POOL,r).slice(0,5)}
let __lfT=0;
function lfSave(){if(!S.user||S.isAdmin||!S.life)return;clearTimeout(__lfT);__lfT=setTimeout(async()=>{const l=S.life,sv=l._srv||{earned:0,eDay:"",eToday:0},de=l.earned-sv.earned;const base={coins:l.coins,earned:l.earned,inv:l.inv,eq:l.eq,pet:l.pet,lucky:l.lucky,lastDaily:l.lastDaily,q:l.q,tot:l.tot,ach:l.ach,w:l.w,paid:l.paid||{},refunded:l.refunded||0,hatched:!!l.hatched,updatedAt:serverTimestamp()};for(const off of [0,-240000,240000]){const dk=lfDayKey(off),used=sv.eDay===dk?sv.eToday:0,ed=de>0?dk:(sv.eDay||""),et=de>0?used+de:(sv.eToday||0);try{await setDoc(doc(db,"life",S.user.uid),{...base,eDay:ed,eToday:et},{merge:true});l._srv={earned:l.earned,eDay:ed,eToday:et};return}catch(e){if(!String(e.code||"").includes("permission"))return console.warn("life",e)}}},700)}
function lfSfx(k){try{if(localStorage.getItem("lf_mute")==="1")return;const c=window.__lfa||(window.__lfa=new (window.AudioContext||window.webkitAudioContext)());const ov=S.life&&S.life.eq&&S.life.eq.snd?lfItem(S.life.eq.snd[k]):null;const seq=ov?ov.k:({win:[523,659,784,1047],lvl:[392,523,659,784,1047],box:[300,400,500,700],buy:[660,880],coin:[880,1175]}[k]||[600]);seq.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=(ov&&ov.w)||"triangle";o.frequency.value=f;g.gain.setValueAtTime(.001,c.currentTime+i*.09);g.gain.exponentialRampToValueAtTime(.18,c.currentTime+i*.09+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.09+.2);o.connect(g);g.connect(c.destination);o.start(c.currentTime+i*.09);o.stop(c.currentTime+i*.09+.22)})}catch(_){}}
function lfApply(){const e=(S.life&&S.life.eq)||{};const sk=lfItem(e.skin);const r=document.documentElement;if(sk)r.dataset.skin=sk.k;else delete r.dataset.skin;let f=document.getElementById("fxl");if(f)f.remove();const fx=lfItem(e.fx);if(fx){f=document.createElement("div");f.id="fxl";for(let i=0;i<14;i++){const s=document.createElement("span");s.textContent=fx.k;s.style.cssText=`left:${Math.random()*100}%;font-size:${12+Math.random()*14}px;animation-duration:${7+Math.random()*8}s;animation-delay:${-Math.random()*12}s`;f.appendChild(s)}document.body.appendChild(f)}}
function lfAdd(c,why,silent){const l=S.life;if(!l||!c)return;const stg=lfStage((S.profile||{}).xp);if(why==="exam"&&stg>=1)c+=2;if(stg>=3&&c>20)c=Math.round(c*1.05);l.coins+=c;l.earned+=c;if(!silent){toast(`+${c} 🪙 ${why&&why!=="exam"?why:""}`,true);lfSfx("coin");lfBurst("🪙",6)}lfSave();lfAch();if(S.view==="life")render(true)}
function lfEvent(e,n){let hn=0;const l=S.life;if(!l||S.isAdmin)return;n=n==null?1:n;if(!n)return;const dk=todayKey(),wk=lfWeek();if(l.q.d!==dk)l.q={d:dk,done:[],prog:{}};if(!l.w||l.w.k!==wk)l.w={k:wk,done:[],prog:{}};[[l.q,lfQuests()],[l.w,LF_WEEK]].forEach(([b,list])=>{b.prog[e]=(b.prog[e]||0)+n;list.forEach(x=>{if(x.e===e&&!b.done.includes(x.id)&&b.prog[e]>=x.n){b.done.push(x.id);hn=1;lfAdd(x.r,"مهمة: "+x.t)}})});lfSave();if(hn)lfHatch()}
function lfAch(){const l=S.life;if(!l)return;LF_ACH.forEach(a=>{if(!l.ach.includes(a.id)&&a.ok(l)){l.ach.push(a.id);l.coins+=a.r;l.earned+=a.r;toast(`🏅 إنجاز: ${a.t} · +${a.r} 🪙`,true);lfSfx("win")}})}
async function lfInit(){if(!S.user||S.isAdmin)return;try{const s=await getDoc(doc(db,"life",S.user.uid));S.life=Object.assign(lfDef(),s.exists()?s.data():{});S.life.eq=Object.assign({acc:[],room:{}},S.life.eq||{});S.life.tot=Object.assign({ex:0,full:0,box:0},S.life.tot||{});lfReconcile(S.life);lfClean(S.life);lfCfgListen();S.life._srv={earned:S.life.earned,eDay:S.life.eDay||"",eToday:S.life.eToday||0};lfApply();const t=todayKey();if(S.life.lastDaily!==t){S.life.lastDaily=t;lfAdd(15,"دخول يومي");lfEvent("login");lfEvent("day");setTimeout(()=>lfReact("run"),900)}lfAch();lfSave();render(true)}catch(e){console.warn("lifeInit",e)}}
function lfOnXp(reason,xp0){if(!S.life||S.isAdmin)return;if(reason==="exam"||reason==="exam_full"||reason==="first_exam"){const full=reason==="exam_full";S.life.tot.ex++;if(full)S.life.tot.full++;lfAdd(40+(full?80:0),"exam");lfHatch();lfEvent("exam");if(full)lfEvent("full");lfSfx("win")}const p=S.profile||{};lfEvent("xp",Math.max(0,(p.xp||0)-(xp0||0)));if(xpLevel(p.xp||0)>xpLevel(xp0||0)){lfSfx("lvl");try{confetti()}catch(_){}toast("🎉 Level "+xpLevel(p.xp),true)}lfReact(reason==="exam_full"?"dance":"jump")}
function lfPet(l,xp,px){if(!l||!l.pet)return"";const st=lfStage(xp);const acc=(l.eq.acc||[]).map(id=>lfItem(id)).filter(Boolean).map(a=>`<span class="lf-acc ${a.k}">${a.i}</span>`).join("");return `<div class="lf-pet ${st===5?"aura":""}" data-act="petTap" style="font-size:${Math.round(px*LF_SC[st])}px"><span class="b ${st===0?"egg":""}">${st===0?"🥚":l.pet.t}${st>0?acc:""}</span><i class="sh"></i></div>`}
function lfFr(h,l){const f=l&&lfItem((l.eq||{}).frame);return f?`<div class="fr fr-${f.k}">${h}</div>`:h}
function lfTitle(l){const t=l&&lfItem((l.eq||{}).title);return t?`<div class="title-pill">${t.i} ${esc(t.n)}</div>`:""}
function lfChip(){const l=S.life;if(!l)return"";const xp=(S.profile||{}).xp||0,st=lfStage(xp),em=l.pet&&st>0?`<span class="pt" style="display:block">${lfAnyPet(l.pet.t,st)}</span>`:"🥚";const orbit=[...(l.eq.acc||[]),...Object.values(l.eq.room||{})].map(lfItem).filter(Boolean).slice(0,6);const acc=st>0?(l.eq.acc||[]).map(lfItem).filter(Boolean).map(a=>`<span class="lf-acc ${a.k}">${a.i}</span>`).join(""):"";const ly=[0,1,2,3].map(i=>`<span class="ly" style="transform:translateZ(${-i*7}px);filter:brightness(${1-i*.14})">${em}</span>`).join("");
return `<div class="lf-3d"><div class="plate"></div><div class="orb">${orbit.map((it,i)=>`<i style="--i:${i};--n:${orbit.length}">${it.i}</i>`).join("")}</div><div class="obj ${st===5?"aura":""}" style="font-size:${Math.round(66*LF_SC[st])}px"><span class="front">${ly}${acc}</span></div></div>${l.pet?`<div><b>${esc(l.pet.n)}</b> · ${LF_STN[st]}</div>`:""}${lfTitle(l)}<div style="margin:8px 0"><b>🪙 ${l.coins}</b> · اتحرك بصباعك على الحيوان 👆</div><button class="btn sm gold" data-act="openLife">🏠 غرفتي والمتجر</button>`}
function lfCountdown(){const left=(S.life.lucky||0)+864e5-Date.now();if(left<=0)return null;const h=Math.floor(left/36e5),m=Math.floor(left%36e5/6e4);return h+"س "+m+"د"}
function lifeView(){
  const l=S.life,p=S.profile||{},xp=p.xp||0;
  if(!l)return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openMe">رجوع</button>`)}<div class="card mut">جاري التحميل…</div></div>${studentNav()}`;
  const tab=S.lifeTab||"room",stg=lfStage(xp),nxt=LF_ST[stg+1];
  const lb0=(stg===1&&xp<LF_ST[1])?0:LF_ST[stg],prog=nxt?Math.max(0,Math.min(100,Math.round((xp-lb0)/(nxt-lb0)*100))):100;
  const tabs=[["room","🏠 غرفتي"],["shop","🛒 المتجر"],["quests","✅ المهام"],["ach","🏅 إنجازات"]].map(t=>`<button class="${tab===t[0]?"on":""}" data-act="lifeTab" data-t="${t[0]}">${t[1]}</button>`).join("");
  let body="";
  if(tab==="room"){
    if(!l.pet)body=`<div class="card"><b>اختار رفيقك 🥚</b><p class="mut">بيكبر بالـ XP بتاعك — مش بالأيام. وكل مرحلة بتفتحلك مكافأة.</p><div class="lf-grid">${LF_PETS.map(e=>`<div class="lf-it"><div class="ic"><span class="pt">${lfPetSvg(e,3,"64px")}</span></div><b style="display:block;font-size:13px;margin:2px 0 4px">${LF_NAME[e]||""}</b><button data-act="pickPet" data-e="${e}">اختار</button></div>`).join("")}</div></div>`;
    else{
      const sl=s=>{const id=l.eq.room[s],it=lfItem(id);if(it&&s==="rug")return `<span class="slot s-rug" style="background:${it.k}"></span>`;return it?`<span class="slot s-${s}">${it.i}</span>`:""};
      const q=(l.q.done||[]).length,mood=q>=3?"متحمس 🤩":q>=1?"سعيد 😊":"نعسان 😴";
      const cd=lfCountdown();
      body=`${lfRoomHtml(l,xp,"me")}
<div class="card" style="margin-top:12px"><div class="row"><b style="flex:1">${l.pet.t} ${esc(l.pet.n)} · ${LF_STN[stg]}</b><span class="pill">${mood}</span></div>
<div class="lf-xp" style="background:var(--line)"><i style="width:${prog}%;background:var(--pri)"></i></div>
<div class="mut" style="font-size:12px;margin-top:6px">${!l.hatched&&stg===0?"خلّص أي مهمة أو امتحان وهتفقس 🐣":nxt?`${nxt-xp} XP للمرحلة الجاية (${LF_STN[stg+1]})`:"وصل لأعلى مرحلة 🐉"} · اضغط عليه يلعب معاك</div>
<div class="mut" style="font-size:12px">${stg>=1?"• +2 🪙 لكل امتحان ":""}${stg>=3?"• +5% عملات ":""}${stg>=5?"• خصم 10% في المتجر":""}</div></div>
<button class="btn block gold" data-act="openBox" ${cd?"disabled":""}>🎁 صندوق الحظ ${cd?"· بعد "+cd:"· متاح دلوقتي!"}</button>
<div class="card" style="margin-top:12px"><b>اللي معاك</b><div class="lf-grid" style="margin-top:8px">${l.inv.map(lfItem).filter(Boolean).map(it=>`<div class="lf-it ${lfOn(it)?"on":""}"><div class="ic">${it.i}</div><small>${esc(it.n)}</small><button data-act="equip" data-id="${it.id}">${lfOn(it)?"شيل":"البس"}</button></div>`).join("")||`<div class="mut">لسه مفيش حاجة — روح المتجر 🛒</div>`}</div></div>`}
  }else if(tab==="shop"){
    const cat=S.lifeCat||"title",disc=stg>=5?.9:1,lv=xpLevel(xp);
    body=`<div class="lf-wallet"><span>🪙 رصيدك</span><b>${l.coins.toLocaleString("en")}</b></div><div class="lf-chips">${Object.keys(LF_CATS).map(k=>`<button class="${cat===k?"on":""}" data-act="lifeCat" data-c="${k}">${LF_CATS[k]}</button>`).join("")}</div><div class="lf-grid shop">${LF_SHOP.filter(x=>x.c===cat&&lfAvail(x)).map((it,i)=>lfShopCard(it,i,l,disc,lv)).join("")}</div><p class="mut" style="font-size:12px;text-align:center;margin-top:10px">كل حاجة هنا شكل بس — العملات مبتأثرش على درجاتك أو الامتحانات. لو السعر اتغيّر بيتسحب الغرض وفلوسك بترجعلك كاملة.</p>`;
  }else if(tab==="quests"){
    const q=l.q.d===todayKey()?l.q:{done:[],prog:{}},w=l.w&&l.w.k===lfWeek()?l.w:{done:[],prog:{}};
    const rq=(b,x)=>{const d=b.done.includes(x.id),pr=Math.min(b.prog[x.e]||0,x.n);return `<div class="lf-q ${d?"done":""}"><span style="font-size:24px">${d?"✅":"🎯"}</span><div style="flex:1"><b>${x.t}</b> <span class="mut" style="font-size:12px">${pr}/${x.n}</span><div class="bar"><i style="width:${pr/x.n*100}%"></i></div></div><span class="pill y">+${x.r} 🪙</span></div>`};
    body=`<div class="card"><b>مهام النهارده</b>${lfQuests().map(x=>rq(q,x)).join("")}</div><div class="card"><b>مهام الأسبوع 🗓️</b>${LF_WEEK.map(x=>rq(w,x)).join("")}</div>`;
  }else{
    body=`<div class="lf-grid">${LF_ACH.map(a=>{const ok=l.ach.includes(a.id);return `<div class="lf-it lf-ach ${ok?"ok":""}"><div class="ic">${a.i}</div><b style="font-size:12px">${a.t}</b><small>+${a.r} 🪙</small></div>`}).join("")}</div>`;
  }
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="openMe">رجوع</button>`)}
<div class="lf-top"><div class="r"><div><b>Lv ${xpLevel(xp)}</b><div style="opacity:.85;font-size:13px">${xp} XP · 🔥 ${p.streak||0} يوم</div></div><span><span class="lf-coin" id="lfCoin">🪙 ${l.coins}</span><button class="lf-mute" data-act="lfMute" aria-label="الصوت">${lfMuted()?"🔇":"🔊"}</button></span></div><div class="lf-xp"><i style="width:${xpProgress(xp)}%"></i></div></div>
<div class="lf-tabs">${tabs}</div>${body}</div>${studentNav()}`;
}
function lfOn(it){if(it.c==="pet")return ((S.life.eq.pets)||[]).includes(it.id);const e=S.life.eq;return it.c==="snd"?(e.snd||{})[it.s]===it.id:it.c==="acc"?e.acc.includes(it.id):it.c==="room"?e.room[it.s]===it.id:e[it.c]===it.id}
function lfOv(h){const o=document.createElement("div");o.className="lf-ov";o.innerHTML=h;o.addEventListener("click",e=>{if(e.target===o||e.target.dataset.x)o.remove()});document.body.appendChild(o);return o}
Object.assign(A,{
  openLife(){S.view="life";render(true)},
  lifeTab(d){S.lifeTab=d.t;render(true)},lifeCat(d){S.lifeCat=d.c;render(true)},
  async pickPet(d){if(!LF_PETS.includes(d.e))return;const n=await uiPrompt("اسم رفيقك؟","Spark");if(n===null)return;S.life.pet={t:d.e,n:(n||"Spark").slice(0,14)};lfSave();lfSfx("win");render(true);if((S.life.q.done||[]).length||S.life.tot.ex>0||S.life.ach.length)setTimeout(lfHatch,500)},
  petTap(d,b){const el=b.closest?b.closest(".lf-pet"):b;if(!el)return;
    el.classList.remove("jump","happy");void el.offsetWidth;el.classList.add("jump","happy");
    try{navigator.vibrate&&navigator.vibrate(12)}catch(_){}
    setTimeout(()=>el.classList.remove("happy"),1800);
    for(let i=0;i<2;i++){const h=document.createElement("span");h.className="lf-heart";h.textContent="💖";
      h.style.cssText="left:"+(40+i*20)+"%;top:-10px;animation-delay:"+(i*160)+"ms";el.appendChild(h);
      setTimeout(()=>h.remove(),1300)}
    lfSfx("coin")},
  buy(d){const it=lfItem(d.id);if(!it||!S.life||!lfAvail(it))return;if(S.shopCfg===undefined){toast("ثانية واحدة… بحمّل الأسعار");return}const l=S.life;if(xpLevel((S.profile||{}).xp||0)<it.lv)return;const disc=lfStage((S.profile||{}).xp)>=5?.9:1,base=lfPrice(it),pr=Math.round(base*disc);if(l.inv.includes(it.id)||l.coins<pr)return;l.coins-=pr;l.inv.push(it.id);l.paid=l.paid||{};l.paid[it.id]=[base,pr];lfEquipSet(it,true);lfApply();lfSave();lfSfx("buy");lfBurst("✨",8);toast(`اشتريت ${it.n} ${it.i}`,true);lfBought(it);render(true)},
  equip(d){const it=lfItem(d.id);if(!it||!S.life.inv.includes(it.id))return;lfEquipSet(it,!lfOn(it));lfBurst("✨",4);lfSfx("coin");lfApply();lfSave();render(true)},
  openBox(){const l=S.life;if(lfCountdown())return;l.lucky=Date.now();const r=Math.random()*100;let pz;const own=c=>LF_SHOP.filter(x=>x.c===c&&!l.inv.includes(x.id)&&lfAvail(x));const pick=c=>{const a=own(c);return a.length?a[Math.floor(Math.random()*a.length)]:null};
    if(r<40)pz={c:20};else if(r<60)pz={c:50};else if(r<75)pz={c:100};else if(r<85)pz={c:150};else if(r<90)pz={it:pick("title")};else if(r<94)pz={it:pick("frame")};else if(r<97)pz={it:pick("skin")};else if(r<99)pz={it:pick("acc")};else pz={c:500,jp:1};
    if(pz.it===null||(pz.it===undefined&&!pz.c))pz={c:100};
    const o=lfOv(`<div class="lf-box">🎁</div>`);lfSfx("box");l.tot.box++;
    setTimeout(()=>{if(pz.it){l.inv.push(pz.it.id);l.paid=l.paid||{};l.paid[pz.it.id]=[-1,0]}else lfAdd(pz.c,"",true);const t=pz.it?`${pz.it.i}<br><b>${pz.it.n}</b><br><span class="mut">${LF_CATS[pz.it.c]}</span>`:`${pz.jp?"🎰 JACKPOT":"🪙"}<br><b style="font-size:28px">+${pz.c}</b>`;o.innerHTML=`<div class="lf-prize"><div style="font-size:64px;line-height:1.3">${t}</div><button class="btn block" style="margin-top:14px" data-x="1">تمام</button></div>`;lfSfx(pz.jp||pz.it?"lvl":"win");lfEvent("box");lfAch();lfSave();render(true)},1300)},
  async studentCard(d){const uid=d.uid||S.user.uid;if(!S.isAdmin&&uid!==S.user.uid){toast("بطاقة الطالب متاحة لصاحب الحساب فقط");return}const o=lfOv(`<div class="lf-card"><div class="mut">جاري التحميل…</div></div>`);try{const [s,lf]=await Promise.all([getDoc(doc(db,"students",uid)),getDoc(doc(db,"life",uid))]);const u=s.exists()?s.data():{},l=Object.assign(lfDef(),lf.exists()?lf.data():{});l.eq=Object.assign({acc:[],room:{}},l.eq||{});lfClean(l);const xp=u.xp||0,stg=lfStage(xp,l);const rk=(typeof rankBoard==="function"?rankBoard(S.board).ranked:[]).findIndex(b=>(b.uid||b.id)===uid);const b=(S.board||[]).find(x=>(x.uid||x.id)===uid)||{};const av=u.avatarThumb||u.avatar;const ah=av?`<img src="${av}" alt="" style="width:84px;height:84px;border-radius:50%;object-fit:cover">`:`<div class="av" style="width:84px;height:84px;font-size:32px">${esc((u.name||"؟")[0])}</div>`;
    o.innerHTML=`<div class="lf-card ${stg>=5?"rl":stg>=4?"re":""}" data-tilt><div>${lfFr(ah,l)}<h3 style="margin:8px 0 2px">${esc(u.name||"طالب")}</h3>${lfTitle(l)}<div class="xpb"><i style="width:${typeof xpProgress==="function"?xpProgress(xp):0}%"></i></div><div class="lf-mini" style="margin:10px 0">${l.pet?`${lfRoomHtml(l,xp,"c"+uid)}<div class="mut" style="font-size:12px;margin-top:4px">${esc(l.pet.n)} · ${LF_NAME[l.pet.t]||""} · ${LF_STN[stg]}</div>`:`<span class="mut" style="font-size:13px">لسه معندوش حيوان</span>`}</div>
<div class="st"><div><b>⭐ ${xpLevel(xp)}</b>المستوى</div><div><b>🪙 ${l.coins}</b>عملات</div><div><b>🔥 ${u.streak||0}</b>أيام متتالية</div><div><b>${rk>=0?"#"+(rk+1):"—"}</b>الترتيب</div><div><b>${b.pct!=null?b.pct+"%":"—"}</b>نسبة النجاح</div><div><b>🏅 ${(l.ach||[]).length}</b>إنجازات</div></div><button class="btn block ghost" style="margin-top:12px" data-x="1">إغلاق</button></div></div>`;try{lfRoomInit()}catch(_){}}catch(e){o.innerHTML=`<div class="lf-prize">مقدرتش أحمّل البطاقة</div>`}}
});
function lfEquipSet(it,on){const e=S.life.eq;if(it.c==="acc"){e.acc=e.acc.filter(x=>x!==it.id);if(on)e.acc.push(it.id)}else if(it.c==="pet"){e.pets=(e.pets||[]).filter(x=>x!==it.id);if(on)e.pets.push(it.id);e.pets=e.pets.slice(-3)}else if(it.c==="snd"){e.snd=e.snd||{};if(on)e.snd[it.s]=it.id;else delete e.snd[it.s]}else if(it.c==="room"){if(on)e.room[it.s]=it.id;else delete e.room[it.s]}else e[it.c]=on?it.id:null}
{const _ai=A.openAI;if(_ai)A.openAI=function(){lfEvent("ai");return _ai.apply(this,arguments)};const _g=A.openGames;if(_g)A.openGames=function(){lfEvent("game");return _g.apply(this,arguments)}}
{const _ax=addXP;addXP=async function(a,r){const x0=(S.profile||{}).xp||0;await _ax(a,r);try{lfOnXp(r,x0)}catch(_){}}}


/* ===== Student Life v2 ===== */
const LF_WEEK=[{id:"w1",e:"exam",t:"خلّص 10 امتحانات",n:10,r:250},{id:"w2",e:"win",t:"اكسب 5 مباريات",n:5,r:250},{id:"w3",e:"day",t:"ادخل المنصة 7 أيام",n:7,r:250},{id:"w4",e:"xp",t:"اجمع 300 XP",n:300,r:250}];
const lfWeek=()=>"w"+Math.floor((Date.now()/864e5+2)/7);
const lfMuted=()=>{try{return localStorage.getItem("lf_mute")==="1"}catch(_){return false}};
function lfClean(l){const num=(v,m)=>Math.max(0,Math.min(m,Math.floor(+v||0)));l.coins=num(l.coins,1e7);l.earned=num(l.earned,1e8);l.lucky=num(l.lucky,4e12);if(l.all)l.inv=LF_SHOP.filter(x=>!x.rm).map(x=>x.id);l.refunded=num(l.refunded,1e9);l.hatched=!!l.hatched;l.all=!!l.all;l.inv=[...new Set((Array.isArray(l.inv)?l.inv:[]).filter(id=>typeof id==="string"&&lfItem(id)))];
 {const pd={};const o=(l.paid&&typeof l.paid==="object")?l.paid:{};l.inv.forEach(id=>{const v=o[id];if(Array.isArray(v)&&v.length===2){const b=Math.floor(+v[0]);pd[id]=[isFinite(b)?Math.max(-1,Math.min(1e7,b)):0,num(v[1],1e7)]}});l.paid=pd}
 const p=l.pet;if(p&&LF_PETMAP[p.t])p.t=LF_PETMAP[p.t];l.pet=p&&LF_PETS.includes(p.t)?{t:p.t,n:String(p.n||"Spark").slice(0,14)}:null;
 const e=l.eq=(l.eq&&typeof l.eq==="object")?l.eq:{};const ok=(id,c)=>{const it=lfItem(id);return it&&it.c===c&&l.inv.includes(id)?id:null};
 ["title","frame","skin","fx","bub"].forEach(c=>{e[c]=ok(e[c],c)});e.acc=(Array.isArray(e.acc)?e.acc:[]).filter(id=>ok(id,"acc")).slice(0,6);e.pets=(Array.isArray(e.pets)?e.pets:[]).filter(id=>ok(id,"pet")).slice(0,3);
 const r={};Object.keys(e.room||{}).forEach(s=>{const it=lfItem(e.room[s]);if(it&&it.c==="room"&&it.s===s&&l.inv.includes(it.id))r[s]=it.id});e.room=r;
 const sn={};Object.keys(e.snd||{}).forEach(s=>{const it=lfItem(e.snd[s]);if(it&&it.c==="snd"&&it.s===s&&l.inv.includes(it.id))sn[s]=it.id});e.snd=sn;
 l.tot={ex:num((l.tot||{}).ex,1e6),full:num((l.tot||{}).full,1e6),box:num((l.tot||{}).box,1e6),win:num((l.tot||{}).win,1e6)};l.ach=(Array.isArray(l.ach)?l.ach:[]).filter(a=>LF_ACH.some(x=>x.id===a));
 const bk=b=>({d:String((b&&b.d)||""),k:String((b&&b.k)||""),done:Array.isArray(b&&b.done)?b.done.filter(x=>typeof x==="string").slice(0,12):[],prog:(b&&b.prog&&typeof b.prog==="object")?b.prog:{}});l.q=bk(l.q);l.w=bk(l.w);return l}
const lfPeers={};let __lfPT=0;
function lfPeer(uid){if(!uid)return null;if(S.user&&uid===S.user.uid)return S.life||null;if(uid in lfPeers)return lfPeers[uid];lfPeers[uid]=null;getDoc(doc(db,"life",uid)).then(s=>{if(s.exists()){lfPeers[uid]=lfClean(Object.assign(lfDef(),s.data()));clearTimeout(__lfPT);__lfPT=setTimeout(()=>{try{render()}catch(_){}},400)}}).catch(()=>{});return null}
function lfTag(uid){const l=lfPeer(uid);if(!l)return"";const t=lfItem(l.eq.title);return (l.pet||t)?`<span class="lf-tag">${l.pet?l.pet.t:""}${t?" "+t.i+" "+esc(t.n):""}</span>`:""}
function lfBub(uid){const l=lfPeer(uid),b=l&&lfItem(l.eq.bub);return b?" lfb-"+b.k:""}
function lfBurst(e,n){for(let i=0;i<n;i++){const s=document.createElement("span");s.className="lf-fly";s.textContent=e;s.style.cssText=`left:${40+Math.random()*20}%;--dx:${(Math.random()-.5)*180}px;animation-delay:${i*60}ms`;document.body.appendChild(s);setTimeout(()=>s.remove(),1600)}}
function lfReact(k){const b=document.getElementById("lfBuddy");if(!b)return;["run","jump","dance","sad"].forEach(x=>b.classList.remove("r-"+x));void b.offsetWidth;b.classList.add("r-"+k);setTimeout(()=>b.classList.remove("r-"+k),1800)}
function lfBuddyUpd(){let b=document.getElementById("lfBuddy");const ok=S.life&&S.life.pet&&S.user&&!S.isAdmin&&!["exam","chatThread","groupThread","qbPlay","life","me","ai","loading"].includes(S.view);if(!ok){if(b)b.style.display="none";return}
 if(!b){b=document.createElement("div");b.id="lfBuddy";b.dataset.act="buddyTap";b.setAttribute("aria-label","رفيقك");document.body.appendChild(b)}
 const xp=(S.profile||{}).xp||0,st=lfStage(xp),acc=(S.life.eq.acc||[]).map(lfItem).filter(Boolean).map(a=>`<span class="lf-acc ${a.k}">${a.i}</span>`).join("");const sig=S.life.pet.t+st+acc;
 if(b._s!==sig){b._s=sig;b.style.fontSize=Math.round(34*LF_SC[st])+"px";b.innerHTML=`<span class="bd">${st===0?"🥚":S.life.pet.t}${st>0?acc:""}</span>`}b.style.display=""}
const LF_SAY=["يلا نذاكر! 📚","فخور بيك 💪","عايز امتحان جديد 😎","متنساش مهام النهارده ✅","أنا جعان XP 😋"];
Object.assign(A,{buddyTap(d,b){lfReact("jump");lfSfx("coin");toast(S.life.pet.n+": "+LF_SAY[Math.floor(Math.random()*LF_SAY.length)])},lfMute(){try{localStorage.setItem("lf_mute",lfMuted()?"0":"1")}catch(_){}render(true)}});
document.addEventListener("pointermove",e=>{const t=e.target.closest&&e.target.closest(".lf-3d");if(!t)return;const r=t.getBoundingClientRect();t.style.setProperty("--ry",((e.clientX-r.left)/r.width-.5)*90+"deg");t.style.setProperty("--rx",(.5-(e.clientY-r.top)/r.height)*40+"deg");t.classList.add("tilt");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("tilt"),1800)},{passive:true});
{const _sb=qbSaveBattle;qbSaveBattle=async function(){const g=S.qb;try{if(g&&g.match&&!g.match._lf&&S.life&&S.user&&!S.isAdmin){g.match._lf=1;const m=g.match,me=m.players.find(p=>p.uid===S.user.uid);if(me){const rk=[...m.players].sort((a,b)=>b.score-a.score).findIndex(p=>p.uid===S.user.uid)+1;if(rk===1&&m.players.length>1){S.life.tot.win++;lfAdd(/bot/i.test(String(g.mode))?35:120,"فوز 🏆");lfEvent("win");lfReact("dance");lfSfx("win")}else lfReact("sad")}}}catch(_){}return _sb.apply(this,arguments)}}
{const _r=render;render=function(){try{if(S.user&&S.profile&&!S.isAdmin&&!S.profile.phone)S.profile.phone=String(S.user.email||"").split("@")[0]}catch(_){}const r=_r.apply(this,arguments);try{lfBuddyUpd();lfPost();lfCfgListen();lfRoomInit();lfChatAnim()}catch(_){}return r}}


/* ===== Student Life v3 ===== */
function lfPost(){const el=document.getElementById("lfCoin");if(!el||!S.life)return;const to=S.life.coins,from=window.__lfShown==null?to:window.__lfShown;window.__lfShown=to;if(from===to){el.textContent="🪙 "+to;return}el.classList.add("pop");const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/700);el.textContent="🪙 "+Math.round(from+(to-from)*k);if(k<1)requestAnimationFrame(f);else el.classList.remove("pop")})(t0)}


/* ===== Student Life v4: XP guard + privacy ===== */
const XP_DAY_CAP=600;
const lfDayKey=off=>{const d=new Date(Date.now()+(off||0));return d.getUTCFullYear()+"-"+(d.getUTCMonth()+1)+"-"+d.getUTCDate()};
const lfXpDay=(cur,add,off)=>{const dk=lfDayKey(off),used=cur.xpDay===dk?(cur.xpToday||0):0;return{xpDay:dk,xpToday:used+add}};
async function lfSetXp(ref,data,cur,add){for(const off of [0,-240000,240000]){try{await setDoc(ref,{...data,...lfXpDay(cur,add,off)},{merge:true});return}catch(e){if(!String(e.code||"").includes("permission"))throw e}}throw new Error("xp-denied")}
async function lfMigrate(){
  try{
    const marker="priv_mig_v3";
    if(localStorage.getItem(marker)==="1")return;
    const privateFields=["ip","device","regIp","regDevice","phone"];
    const sensitiveBoardFields=["phone","email","ip","device","regIp","regDevice","fcmToken"];
    let batch=writeBatch(db),ops=0,studentsMoved=0,publicDocsCleaned=0;
    const flush=async()=>{if(ops){await batch.commit();batch=writeBatch(db);ops=0}};
    const students=await getDocs(collection(db,"students"));
    for(const d of students.docs){
      const data=d.data(),fields=privateFields.filter(k=>Object.prototype.hasOwnProperty.call(data,k));
      if(!fields.length)continue;
      const priv={updatedAt:serverTimestamp()},remove={};
      fields.forEach(k=>{priv[k]=data[k];remove[k]=deleteField()});
      batch.set(doc(db,"studentsPrivate",d.id),priv,{merge:true});
      batch.update(d.ref,remove);ops+=2;studentsMoved++;
      if(ops>=200)await flush();
    }
    await flush();
    for(const col of ["leaderboard","qb_battles"]){
      const ref=collection(db,col);let cursor=null;
      while(true){
        const pageQuery=cursor
          ?query(ref,orderBy(documentId()),startAfter(cursor),limit(200))
          :query(ref,orderBy(documentId()),limit(200));
        const page=await getDocs(pageQuery);
        if(page.empty)break;
        for(const d of page.docs){
          const data=d.data(),remove={};
          sensitiveBoardFields.forEach(k=>{if(Object.prototype.hasOwnProperty.call(data,k))remove[k]=deleteField()});
          if(Object.keys(remove).length){batch.update(d.ref,remove);ops++;publicDocsCleaned++;if(ops>=200)await flush()}
        }
        cursor=page.docs[page.docs.length-1];
        await flush();
        if(page.size<200)break;
      }
    }
    await flush();
    localStorage.setItem(marker,"1");
    if(studentsMoved||publicDocsCleaned)toast("🔒 اكتمل ترحيل الخصوصية: "+studentsMoved+" ملف طالب و"+publicDocsCleaned+" وثيقة قديمة",true);
  }catch(e){console.warn("privacy migration",e);toast("تعذر ترحيل بيانات الخصوصية؛ قد تتوقف لوحة الشرف حتى إكمالها",true)}
}
const __rs=()=>document.querySelectorAll("[data-tilt].on3").forEach(x=>{x.style.removeProperty("--rx");x.style.removeProperty("--ry");x.classList.remove("on3")});
document.addEventListener("pointermove",e=>{const t=e.target.closest&&e.target.closest("[data-tilt]");document.querySelectorAll("[data-tilt].on3").forEach(x=>{if(x!==t){x.style.removeProperty("--rx");x.style.removeProperty("--ry");x.classList.remove("on3")}});if(!t)return;const r=t.getBoundingClientRect();t.style.setProperty("--ry",((e.clientX-r.left)/r.width-.5)*24+"deg");t.style.setProperty("--rx",(.5-(e.clientY-r.top)/r.height)*18+"deg");t.classList.add("on3")},{passive:true});
document.addEventListener("pointerup",__rs);document.addEventListener("pointercancel",__rs);


/* ===== Store v5: realistic prices, refunds, hatch, admin tools ===== */
const lfPrice=it=>{const c=S.shopCfg&&S.shopCfg.prices;const v=c&&+c[it.id];return v>0?Math.round(v):it.p};
const lfAvail=it=>!it.rm&&!(((S.shopCfg&&S.shopCfg.off)||[]).includes(it.id));
function lfReconcile(l){
  if(!l||l.all)return 0;
  const cfg=S.shopCfg,off=(cfg&&cfg.off)||[];
  l.paid=(l.paid&&typeof l.paid==="object")?l.paid:{};
  let refund=0;const keep=[],gone=[];
  (Array.isArray(l.inv)?l.inv:[]).forEach(id=>{
    const it=lfItem(id),pd=l.paid[id],legacy=!Array.isArray(pd);
    const b=legacy?(LF_OLD[id]||0):(+pd[0]||0),a=legacy?b:(+pd[1]||0);
    let drop=false;
    if(!it||it.rm)drop=true;
    else if(cfg===undefined||cfg===null)drop=false;
    else if(off.includes(id))drop=true;
    else if(b>=0&&b!==lfPrice(it))drop=true;
    if(drop){if(b>=0)refund+=a;gone.push(id);delete l.paid[id]}else keep.push(id)
  });
  if(!gone.length)return 0;
  l.inv=keep;l.coins=(l.coins||0)+refund;l.refunded=(l.refunded||0)+refund;
  setTimeout(()=>{try{toast(`🔄 المتجر اتحدّث — شلنا ${gone.length} حاجة ورجّعنالك ${refund.toLocaleString("en")} 🪙`,true)}catch(_){}},800);
  return gone.length;
}
let __lfCfgOn=0;
function lfCfgListen(){
  if(__lfCfgOn||!S.user)return;__lfCfgOn=1;
  try{onSnapshot(doc(db,"config","tester"),s=>{S.testerUid=s.exists()?s.data().uid:null;if(S.isAdmin)render(true)},()=>{})}catch(_){}
  try{onSnapshot(doc(db,"config","shop"),s=>{
    S.shopCfg=s.exists()?s.data():{};
    if(S.life&&!S.isAdmin){const n=lfReconcile(S.life);if(n){lfClean(S.life);lfApply();lfSave()}}
    if(S.isAdmin||S.view==="life")render(true)
  },e=>{__lfCfgOn=0;S.shopCfg=S.shopCfg||{};console.warn("shopcfg",e)})}catch(_){__lfCfgOn=0}
}
const LF_RAR=[["c","عادي",1000],["r","نادر",4000],["e","ملحمي",12000],["l","أسطوري",1e9]];
const lfRar=it=>LF_RAR.find(r=>it.p<r[2]);
const LF_SKG={ocean:"#06b6d4,#1e3a8a",purple:"#a78bfa,#be185d",sunset:"#fb923c,#db2777",forest:"#4ade80,#065f46",aurora:"#34d399,#8b5cf6",neon:"#f472b6,#06b6d4",glass:"#94a3b8,#e2e8f0",midnight:"#1e1b4b,#4338ca",gold:"#f59e0b,#fde047",pink:"#f9a8d4,#ec4899",sky:"#7dd3fc,#2563eb",coffee:"#a16207,#451a03",cyberpunk:"#f0abfc,#22d3ee",retro:"#fb7185,#fbbf24",minimal:"#e5e7eb,#9ca3af"};
function lfPv(it,l){
  const pe=(l.pet&&l.pet.t)||"🐱";
  if(it.c==="frame")return lfFr(`<div class="pv-av">🙂</div>`,{eq:{frame:it.id}});
  if(it.c==="title")return `<span class="title-pill pv-t">${it.i} ${esc(it.n)}</span>`;
  if(it.c==="skin")return `<span class="pv-sk" style="background:linear-gradient(135deg,${LF_SKG[it.k]||"#888,#444"})">${it.i}</span>`;
  if(it.c==="acc")return `<span class="pv-pet">${pe}<span class="lf-acc ${it.k}">${it.i}</span></span>`;
  if(it.c==="fx")return `<span class="pv-fx"><i>${it.k}</i><i>${it.k}</i><i>${it.k}</i><i>${it.k}</i></span>`;
  if(it.c==="snd")return `<button type="button" class="pv-snd" data-act="sndPrev" data-id="${it.id}" aria-label="تجربة الصوت">▶ ${it.i}</button>`;
  if(it.c==="bub")return `<span class="tk-bubble me lfb-${it.k} pv-bub">${it.i} رسالة</span>`;
  return `<span class="pv-ic">${it.i}</span>`;
}
function lfShopCard(it,i,l,disc,lv){
  const own=l.inv.includes(it.id),base=lfPrice(it),pr=Math.round(base*disc),lock=lv<it.lv,rr=lfRar(it),cant=!own&&(lock||l.coins<pr);
  return `<div class="lf-it sh r-${rr[0]} ${lfOn(it)?"on":""} ${own?"own":""}" style="--d:${Math.min(i,14)*40}ms"><i class="rb">${rr[1]}</i><div class="pv">${lfPv(it,l)}</div><b class="nm">${esc(it.n)}</b><small>${own?"✅ ملكك":lock?"🔒 Level "+it.lv:`<span class="pr">🪙 ${pr.toLocaleString("en")}</span>${disc<1?`<s>${base.toLocaleString("en")}</s>`:""}`}</small>${own?`<button data-act="equip" data-id="${it.id}">${lfOn(it)?"شيل":"البس"}</button>`:`<button class="g" data-act="buy" data-id="${it.id}" ${cant?"disabled":""}>${!lock&&l.coins<pr?"ناقصك "+(pr-l.coins).toLocaleString("en"):"اشتري"}</button>`}</div>`;
}
function lfBought(it){
  const o=lfOv(`<div class="lf-prize lf-bought"><div class="bi">${it.i}</div><h3 style="margin:8px 0 2px">${esc(it.n)}</h3><p class="mut" style="margin:0 0 12px">اتضاف لحاجتك واتلبس تلقائي ✨</p><button class="btn block gold" data-x="1">حلو!</button></div>`);
  setTimeout(()=>{try{confetti()}catch(_){}},200);setTimeout(()=>{if(o.isConnected)o.remove()},2800);
}
function lfHatch(){
  const l=S.life;if(!l||!l.pet||l.hatched)return;
  l.hatched=true;lfSave();
  lfOv(`<div class="lf-hatch"><div class="hx"><i class="sp"></i><span class="egg">🥚</span><span class="pet">${l.pet.t}</span></div><h3 style="margin:6px 0">${esc(l.pet.n)} فقس! 🐣</h3><p class="mut" style="margin:0 0 14px">كمّل مهام ومذاكرة علشان يكبر معاك</p><button class="btn block gold" data-x="1">يلا نبدأ</button></div>`);
  lfSfx("box");setTimeout(()=>{lfSfx("lvl");try{confetti()}catch(_){}lfBurst("✨",10)},1450);
  try{lfReact("jump")}catch(_){}
  setTimeout(()=>{try{render(true)}catch(_){}},300);
}
function lfPlay(seq,w){try{const c=window.__lfa||(window.__lfa=new (window.AudioContext||window.webkitAudioContext)());seq.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=w||"triangle";o.frequency.value=f;g.gain.setValueAtTime(.001,c.currentTime+i*.09);g.gain.exponentialRampToValueAtTime(.18,c.currentTime+i*.09+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.09+.2);o.connect(g);g.connect(c.destination);o.start(c.currentTime+i*.09);o.stop(c.currentTime+i*.09+.22)})}catch(_){}}
function adminShop(){
  const cfg=S.shopCfg||{},pr=cfg.prices||{},off=cfg.off||[],cat=S.admShopCat||"title";
  const chips=Object.keys(LF_CATS).map(k=>`<button class="${cat===k?"on":""}" data-act="adminShopCat" data-c="${k}">${LF_CATS[k]}</button>`).join("");
  const rows=LF_SHOP.filter(x=>x.c===cat&&!x.rm).map(it=>`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);gap:8px;flex-wrap:nowrap"><span style="font-size:24px">${it.i}</span><div style="flex:1;min-width:0"><b>${esc(it.n)}</b><div class="mut" style="font-size:11px">الافتراضي ${it.p.toLocaleString("en")} · Level ${it.lv}</div></div><input class="ltr shp-p" data-id="${it.id}" type="number" min="1" inputmode="numeric" style="width:92px" placeholder="${it.p}" value="${pr[it.id]||""}"><label style="font-size:12px;white-space:nowrap"><input type="checkbox" class="shp-off" data-id="${it.id}" ${off.includes(it.id)?"checked":""}> إخفاء</label></div>`).join("");
  return `<div class="card"><h3>🛒 إدارة المتجر</h3><p class="mut">غيّر السعر أو اخفي أي غرض. لما تحفظ: كل طالب اشترى الغرض بسعر قديم بيتسحب منه الغرض وفلوسه بترجعله كاملة تلقائيًا. احفظ قبل ما تبدّل القسم.</p><div class="lf-chips">${chips}</div>${rows}<button class="btn gold" style="margin-top:12px;width:100%" data-act="adminShopSave">💾 حفظ أسعار ${LF_CATS[cat]}</button></div>`;
}
Object.assign(A,{
  sndPrev(d){const it=lfItem(d.id);if(it&&Array.isArray(it.k))lfPlay(it.k,it.w)},
  adminShopCat(d){S.admShopCat=d.c;render(true)},
  async adminShopSave(){
    try{
      const cfg=S.shopCfg||{},prices={...(cfg.prices||{})},off=new Set(cfg.off||[]);
      document.querySelectorAll(".shp-p").forEach(el=>{const it=lfItem(el.dataset.id);if(!it)return;const v=Math.round(+el.value);if(v>0&&v!==it.p)prices[it.id]=v;else delete prices[it.id]});
      document.querySelectorAll(".shp-off").forEach(el=>{if(el.checked)off.add(el.dataset.id);else off.delete(el.dataset.id)});
      await setDoc(doc(db,"config","shop"),{prices,off:[...off],v:Date.now()});
      toast("اتحفظ ✓ — التغيير بيوصل للطلاب فورًا",true)
    }catch(e){toast("فشل الحفظ: "+(e.code||e.message||""))}
  },
  async adminLifeAll(d){
    try{
      const tref=doc(db,"config","tester"),ts=await getDoc(tref),tid=ts.exists()?ts.data().uid:null;
      if(tid&&tid!==d.uid){toast("وضع التجربة محجوز لحساب واحد بس ومينفعش يتغيّر");return}
      const ref=doc(db,"life",d.uid);
      if(!tid){
        const ok=await uiDialog({title:"اختيار حساب التجربة",icon:"🔒",msg:"ده قرار نهائي: الطالب ده هيبقى حساب التجربة الوحيد (كل المتجر مفتوح ومتتسحبش منه حاجة)، ومينفعش تختار أو تشيل غيره بعد كده. تأكيد؟",ok:"تأكيد نهائي"});
        if(!ok)return;
        await setDoc(tref,{uid:d.uid,at:Date.now()})
      }
      let step="كتابة بيانات المتجر";
      try{await setDoc(ref,{all:true,coins:100000,hatched:true,inv:LF_SHOP.filter(x=>!x.rm).map(x=>x.id),updatedAt:serverTimestamp()},{merge:true})}
      catch(e2){if(String(e2.code||"").includes("permission"))toast("القواعد في Firebase مش متحدّثة. انسخ firestore.rules كامل في Rules ثم Publish، وارفع index.html الجديد وامسح الكاش");else toast("فشل "+step+": "+(e2.code||e2.message||""));return}
      S.testerUid=d.uid;toast("حساب التجربة جاهز ✓",true);render(true)
    }catch(e){toast(String(e.code||"").includes("permission")?"مفيش صلاحية: تأكد إن القواعد الجديدة اتنشرت وإنك داخل بحساب الأدمن":"فشل: "+(e.code||e.message||""))}
  }
});


/* ===== Room v2: live 3D-ish room, pet behaviours, extra pets, chat animation ===== */
const LF_SLOTS=["rug","hill","cloud","wall","clock","light","tree","tree2","bush","bush2","rock","grass","plant","floor","side"];
function lfRoomHtml(l,xp,uid){
  const hr=new Date().getHours(),night=hr>=19||hr<6,stg=lfStage(xp,l),eq=l.eq||{};
  const pn=lfItem((eq.room||{}).paint);
  const bg=pn?`background:linear-gradient(${pn.k} 0 62%,${pn.f} 62%)`:"";
  const DF={grass:["Grass001","🌱"],bush:["Bush001","🌿"]};const sl=s=>{const it=lfItem((eq.room||{})[s]);if(!it){const d=DF[s];return d?`<span class="slot s-${s} dflt" data-m="${d[0]}">${d[1]}</span>`:""}if(s==="rug")return `<span class="slot s-rug" style="background:${it.k}"></span>`;return `<span class="slot s-${s}"${it.m?` data-m="${it.m}"`:""}>${it.i}</span>`};
  const done=(l.q&&l.q.d===todayKey())?(l.q.done||[]).length:0;
  const mood=night?"sleepy":done>=3?"hyper":done>=1?"happy":"calm";
  const pos=window.__rmPos=window.__rmPos||{},px=(k,d)=>pos[uid+k]!=null?pos[uid+k]:d;
  const acc=stg>0?(eq.acc||[]).map(lfItem).filter(Boolean).map(a=>`<span class="lf-acc ${a.k}">${a.i}</span>`).join(""):"";
  const main=l.pet?`<div class="lf-pet m ${stg===5?"aura":""} ${stg===0?"isegg":""}" data-act="petTap" data-k="m" data-st="${stg}" style="--x:${px("m",42)}%;font-size:${Math.round(52*LF_SC[stg])}px"><span class="b ${stg===0?"egg":"pt"}">${stg===0?"🥚":lfPetSvg(l.pet.t,stg)}${acc}</span><i class="sh"></i></div>`:"";
  const ex=(eq.pets||[]).map(lfItem).filter(Boolean).slice(0,3).map((it,i)=>`<div class="lf-pet ex ${LF_FLY.includes(it.k)?"fly":""}" data-act="petTap" data-k="e${i}" data-st="4" style="--x:${px("e"+i,[24,72,58][i])}%;font-size:30px"><span class="b pt">${lfAnyPet(it.k,4)}</span><i class="sh"></i></div>`).join("");
  return `<div class="lf-room rm3 ${night?"night":""}" data-live="1" data-uid="${esc(uid)}" data-mood="${mood}" style="${bg}"><div class="sky"><i class="sun"></i><b class="cl c1"></b><b class="cl c2"></b></div><div class="boards"></div>${LF_SLOTS.map(sl).join("")}${l.pet&&stg>0?lfHouseSvg()+lfBowlSvg():""}${ex}${main}</div>`;
}
function lfPetGo(room,p,x,spd){
  x=Math.max(4,Math.min(78,x-8));
  const cur=parseFloat(p.style.getPropertyValue("--x"))||40,dist=Math.abs(x-cur);if(dist<2)return;
  const v=spd||24,dur=Math.max(.5,dist/v),run=!!spd&&spd>=40;
  p.style.setProperty("--wd",dur+"s");p.classList.toggle("fl",x>cur);p.classList.add("walk");p.classList.toggle("r-run",run);p.style.setProperty("--x",x+"%");
  (window.__rmPos=window.__rmPos||{})[(room.dataset.uid||"")+p.dataset.k]=x;
  clearTimeout(p._wt);p._wt=setTimeout(()=>{p.classList.remove("walk");p.classList.remove("r-run")},dur*1000+60);
}
function lfSay(p,t,ms){const s=document.createElement("em");s.className="say";s.textContent=t;p.appendChild(s);setTimeout(()=>s.remove(),ms||1700)}
function lfZoomies(room,p){
  lfSay(p,"🌀",1600);
  let dir=Math.random()<.5?-1:1,n=0;
  const go=()=>{if(!p.isConnected||n>=3)return;n++;
    const cx=parseFloat(p.style.getPropertyValue("--x"))||40;
    const nx=Math.max(8,Math.min(74,cx+dir*(24+Math.random()*18)));dir*=-1;
    lfPetGo(room,p,nx,62);setTimeout(go,850+Math.random()*500)};
  go();
}
function lfChase(room,p){
  const bf=room.querySelector(".bfly:not(.flee)");if(!bf)return false;
  bf.classList.add("flee");
  const r=room.getBoundingClientRect(),b=bf.getBoundingClientRect();
  lfPetGo(room,p,(b.left-r.left)/r.width*100,46);
  p.classList.remove("hop");void p.offsetWidth;p.classList.add("hop");
  setTimeout(()=>p.classList.remove("hop"),1300);
  lfSay(p,"🦋",1600);
  setTimeout(()=>{if(bf.isConnected)bf.classList.remove("flee")},4200);
  return true;
}
function lfPetBrain(room,p,i){
  const k=p.dataset.k;
  if(p.classList.contains("isegg")){
    const et=()=>{if(!p.isConnected||!room.isConnected)return;
      if(Math.random()<.55){p.classList.remove("wig");void p.offsetWidth;p.classList.add("wig")}
      if(Math.random()<.35)lfSay(p,"✨");
      setTimeout(et,2600+Math.random()*3400)};
    setTimeout(et,1600+i*700);return;
  }
  if(k==="m")p._goEat=()=>{
    const bowl=room.querySelector(".pet-bowl");if(!bowl||p.classList.contains("home"))return;
    const cur=parseFloat(p.style.getPropertyValue("--x"))||40;lfPetGo(room,p,90);
    const dur=Math.max(.5,Math.abs(72-cur)/24)*1000+250;
    setTimeout(()=>{if(!p.isConnected)return;p.classList.remove("walk");p.classList.add("fl","eat");bowl.classList.add("on");
      setTimeout(()=>{p.classList.remove("eat");bowl.classList.remove("on");lfSay(p,"😋")},3200)},dur)};
  if(k==="m")p._goHome=()=>{
    const house=room.querySelector(".pet-home");if(!house||p.classList.contains("home"))return;
    const cur=parseFloat(p.style.getPropertyValue("--x"))||40;lfPetGo(room,p,12);
    const dur=Math.max(.5,Math.abs(6-cur)/24)*1000+200;
    setTimeout(()=>{if(!p.isConnected)return;p.classList.add("home");house.classList.add("on");
      setTimeout(()=>{if(!p.isConnected)return;house.classList.remove("on");p.classList.remove("home");p.classList.add("hop");setTimeout(()=>p.classList.remove("hop"),1400);lfPetGo(room,p,40+Math.random()*30)},7000)},dur)};
  const act=(c,ms)=>{["hop","spin","sit","sleep","eat","yawn","stretch","scratch","sniff","happy","look","dig","wig"].forEach(x=>p.classList.remove(x));void p.offsetWidth;p.classList.add(c);clearTimeout(p._at);p._at=setTimeout(()=>p.classList.remove(c),ms)};
  const tick=()=>{
    if(!p.isConnected||!room.isConnected)return;
    if(p.classList.contains("home")){setTimeout(tick,1500);return}
    const mood=room.dataset.mood,r=Math.random();let next=2400+Math.random()*3200;
    if(k==="m"&&room.querySelector(".pet-home")&&((mood==="sleepy"&&r<.45)||r<.05)){p._goHome();setTimeout(tick,9000);return}
    if(mood==="sleepy"&&r<.7){act("sleep",6000);lfSay(p,"💤");next=6200}
    else if(r<.34||(mood==="hyper"&&r<.5)){
      const main=room.querySelector('.lf-pet[data-k="m"]');let x=Math.random()*70+12;
      if(k!=="m"&&main&&Math.random()<.4)x=(parseFloat(main.style.getPropertyValue("--x"))||40)+(Math.random()<.5?-14:14)+8;
      lfPetGo(room,p,x,mood==="hyper"?38:24)}
    else if(r<.43)act("sniff",1800);
    else if(r<.51){act("look",2400);p.classList.toggle("fl",Math.random()<.5)}
    else if(r<.58)act("yawn",1900);
    else if(r<.64)act("stretch",2300);
    else if(r<.70)act("scratch",1900);
    else if(r<.78){act("sit",3200);if(mood==="calm")lfSay(p,"😌")}
    else if(r<.86){if(k==="m"&&p._goEat)p._goEat();else{act("eat",1400);lfSay(p,"🍎")}}
    else if(r<.92)act("hop",1300);
    else if(r<.94){if(lfChase(room,p))next=5400;else act("hop",1300)}
    else if(r<.955){lfZoomies(room,p);next=7400}
    else if(r<.975){act("dig",2100);lfSay(p,"🐾")}
    else lfSay(p,["💖","✨","🎵","📚"][Math.floor(Math.random()*4)]);
    setTimeout(tick,next)
  };
  setTimeout(tick,700+i*900);
}
function lfGardenFx(room){
  try{
    if(document.documentElement.getAttribute("data-fx")==="lite")return;
    const night=room.classList.contains("night");
    if(night){
      for(let i=0;i<7;i++){const s=document.createElement("i");s.className="star";
        s.style.cssText="left:"+(6+Math.random()*86).toFixed(1)+"%;top:"+(4+Math.random()*30).toFixed(1)+"%;animation-delay:-"+(Math.random()*3).toFixed(1)+"s";
        room.appendChild(s)}
      for(let i=0;i<5;i++){const f=document.createElement("i");f.className="ffly";
        f.style.cssText="left:"+(8+Math.random()*80).toFixed(1)+"%;top:"+(48+Math.random()*38).toFixed(1)+"%;animation-delay:-"+(Math.random()*5).toFixed(1)+"s";
        room.appendChild(f)}
    }else{
      for(let i=0;i<2;i++){const b=document.createElement("i");b.className="bfly";
        b.style.cssText="top:"+(26+Math.random()*18).toFixed(1)+"%;animation-duration:"+(16+Math.random()*10).toFixed(1)+"s;animation-delay:-"+(Math.random()*14).toFixed(1)+"s"+(i?";animation-direction:reverse":"");
        room.appendChild(b)}
      const leaf=()=>{if(!room.isConnected)return;
        const l=document.createElement("i");l.className="leaf";l.textContent=Math.random()<.5?"🍃":"🍂";
        l.style.cssText="left:"+(6+Math.random()*86).toFixed(1)+"%;animation-duration:"+(5.5+Math.random()*3.5).toFixed(1)+"s";
        room.appendChild(l);setTimeout(()=>l.remove(),10000);
        room._lt=setTimeout(leaf,7000+Math.random()*8000)};
      room._lt=setTimeout(leaf,2200+Math.random()*4000);
    }
  }catch(_){}
}
function lfRoomInit(){
  document.querySelectorAll(".lf-room[data-live]:not([data-on])").forEach(room=>{
    room.dataset.on="1";try{c3dAttach(room)}catch(_){}
    try{lfGardenFx(room)}catch(_){}
    room.addEventListener("pointermove",e=>{const r=room.getBoundingClientRect();room.style.setProperty("--px",(((e.clientX-r.left)/r.width-.5)*2).toFixed(2));room.style.setProperty("--py",(((e.clientY-r.top)/r.height-.5)*2).toFixed(2))},{passive:true});
    room.addEventListener("pointerleave",()=>{room.style.setProperty("--px",0);room.style.setProperty("--py",0)});
    room.addEventListener("click",e=>{if(e.target.closest(".lf-pet"))return;const r=room.getBoundingClientRect(),p=room.querySelector('.lf-pet[data-k="m"]');if(p&&!p.classList.contains("isegg"))lfPetGo(room,p,(e.clientX-r.left)/r.width*100)});
    room.querySelectorAll(".lf-pet").forEach((p,i)=>lfPetBrain(room,p,i));
    const mp=room.querySelector('.lf-pet[data-k="m"]');
    if(mp&&!mp.classList.contains("isegg"))setTimeout(()=>{if(mp.isConnected)lfSay(mp,"👋")},1400);
  });
  if(!window.__lfVis){window.__lfVis=1;
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState!=="visible")return;
      document.querySelectorAll('.lf-room .lf-pet[data-k="m"]').forEach(p=>{
        if(!p.isConnected||p.classList.contains("isegg"))return;
        p.classList.remove("hop");void p.offsetWidth;p.classList.add("hop");
        setTimeout(()=>p.classList.remove("hop"),1300);lfSay(p,"👋");
      });
    });
  }
}
{const _lr=lfReact;lfReact=function(k){try{_lr(k)}catch(_){}try{document.querySelectorAll('.lf-room .lf-pet[data-k="m"]').forEach(p=>{["run","jump","dance","sad"].forEach(x=>p.classList.remove("r-"+x));void p.offsetWidth;p.classList.add("r-"+k);setTimeout(()=>p.classList.remove("r-"+k),1900)})}catch(_){}}}
let __ck="",__seen=new Set();
function lfChatAnim(){
  const key=S.view+"|"+((S.chatThread&&S.chatThread.uid)||(S.groupThread&&(S.groupThread.id||S.groupThread.gid))||"");
  const bs=document.querySelectorAll(".tk-log .tk-bubble[data-mid]");
  if(key!==__ck){__ck=key;__seen=new Set();bs.forEach(b=>__seen.add(b.dataset.mid));return}
  bs.forEach(b=>{const m=b.dataset.mid;if(!__seen.has(m)){__seen.add(m);b.classList.add("nw")}});
  if(__seen.size>800)__seen=new Set([...__seen].slice(-300));
}

/* ===== Pet v3: realistic full-body pets (SVG) + house ===== */
Object.assign(A,{petHome(){const p=document.querySelector('.lf-room .lf-pet[data-k="m"]');if(p&&p._goHome)p._goHome();lfSfx&&lfSfx("coin")}});
Object.assign(A,{petEat(){const p=document.querySelector('.lf-room .lf-pet[data-k="m"]');if(p&&p._goEat)p._goEat();lfSfx&&lfSfx("coin")}});
const LF_FLY=[],LF_CUSTOM=[];
function lfPetSvg(t,st,w){return `<span class="pe"${w?` style="font-size:${w}"`:""}>${t}</span>`}
function lfAnyPet(t,st,w){return lfPetSvg(t,st,w)}
function lfBowlSvg(){return `<div class="pet-bowl" data-act="petEat"><svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="40" cy="44" rx="30" ry="5" fill="rgba(0,0,0,.25)"/><g class="fd"><ellipse cx="40" cy="22" rx="22" ry="8" fill="#b9722f"/><circle cx="30" cy="18" r="4" fill="#d58a3e"/><circle cx="42" cy="15" r="4.5" fill="#c97d34"/><circle cx="52" cy="19" r="3.6" fill="#d58a3e"/></g><path d="M10 24C10 44 70 44 70 24Z" fill="#4a8fe0"/><ellipse cx="40" cy="24" rx="30" ry="7" fill="#2f6fc4"/><ellipse cx="40" cy="24" rx="23" ry="5" fill="none"/><path d="M16 30C24 40 56 40 64 30" stroke="#fff" stroke-width="2" opacity=".35" fill="none"/></svg></div>`}
function lfHouseSvg(){
  return `<div class="pet-home" data-act="petHome"><i class="zz">💤</i><svg viewBox="0 0 100 86" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="phw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c58b52"/><stop offset="1" stop-color="#8a5a2c"/></linearGradient></defs>
<rect x="10" y="34" width="80" height="48" rx="3" fill="url(#phw)"/><path d="M10 40H90M10 50H90M10 60H90M10 70H90" stroke="#6b4320" stroke-width="1.3" opacity=".5"/>
<path d="M2 38L50 6L98 38Z" fill="#b5452f"/><path d="M2 38L50 6L98 38" stroke="#7d2a1b" stroke-width="3" fill="none" stroke-linejoin="round"/><path d="M14 36L50 12L86 36" stroke="#e0775f" stroke-width="1.5" fill="none" opacity=".6"/>
<path class="dr" d="M34 82V58C34 46 66 46 66 58V82Z"/><rect x="40" y="26" width="20" height="9" rx="2" fill="#f1d9a8"/><path d="M44 31h12" stroke="#8a5a2c" stroke-width="1.5"/></svg></div>`;
}

/* ===== v54: Companion 3D — procedural Three.js animals (strong phones only, lazy-loaded) ===== */
/* ===== v61: GLB companions — Three.js + your GLB models, every phone, adaptive quality ===== */
const LF_NAME={"🦊":"ثعلب","🐶":"كورجي","🐰":"أرنب","🐑":"خروف","🐗":"خنزير بري","🦓":"حمار وحشي","🦛":"فرس النهر","🦁":"أسد","🦕":"سبينوصور","🦖":"تي ركس"};
const C3_GLB={
"🦊":{f:"fox",sz:.92,aura:0xff9a3a},"🐶":{f:"corgi",sz:.85,aura:0xffd84a},"🐰":{f:"hare",sz:.8,aura:0xffb3d9},"🐑":{f:"sheep",sz:.95,aura:0xbfe3ff},
"🐗":{f:"boar",sz:1,aura:0xffb040},"🦓":{f:"zebra",sz:1.2,aura:0xc8d6ff},"🦛":{f:"hippo",sz:1.25,aura:0x9ad0ff},"🦁":{f:"lion",sz:1.15,aura:0xffd84a},
"🦕":{f:"spino",sz:1.5,aura:0xff7a1a,fire:1},"🦖":{f:"trex",sz:1.55,aura:0xff5a1a,fire:1}
};
const C3V={"🦊":[520,"triangle"],"🐶":[420,"triangle"],"🐰":[780,"sine"],"🐑":[330,"triangle"],"🐗":[160,"sawtooth"],"🦓":[300,"triangle"],"🦛":[130,"sawtooth"],"🦁":[130,"sawtooth"],"🦕":[110,"sawtooth"],"🦖":[95,"sawtooth"]};
const C3U="https://cdn.jsdelivr.net/npm/three@0.160.0/";
const C3D={ok:null,T:null,GLTF:null,Skel:null,Env:null,p:null,R:null,sc:null,cam:null,cv:null,room:null,ents:new Map(),raf:0,idle:0,last:0,fN:0,fT:0,slow:0,vis:true,io:null,dot:null,shT:null,pln:null,w:0,h:0,dpr:0,cache:{},props:new Map(),L:null,nightK:1,tier:null,cap:0,dprMax:2,sndT:0,hi:{}};
function c3dTier(){
  if(C3D.tier)return C3D.tier;
  let weak=false;
  try{const N=navigator,Cn=N.connection||{};weak=!!((N.deviceMemory&&N.deviceMemory<=3)||(N.hardwareConcurrency&&N.hardwareConcurrency<=4)||Cn.saveData===true||/(^|-)2g$/.test(Cn.effectiveType||"")||document.documentElement.getAttribute("data-fx")==="lite")}catch(_){}
  C3D.tier=weak?"low":"high";C3D.cap=weak?30:0;C3D.dprMax=weak?1:2;
  return C3D.tier;
}
/* only WebGL itself can block it — never the phone model or its speed */
function c3dCan(){
  if(C3D.ok!==null)return C3D.ok;
  let ok=true;
  try{const c=document.createElement("canvas");if(!(c.getContext("webgl2")||c.getContext("webgl")))ok=false}catch(_){ok=false}
  return C3D.ok=ok;
}
function c3dLoad(){
  if(!C3D.p){
    c3dTier();
    const imp=u=>import(u);
    const viaMap=()=>Promise.all([imp(C3U+"build/three.module.js"),imp(C3U+"examples/jsm/loaders/GLTFLoader.js"),imp(C3U+"examples/jsm/utils/SkeletonUtils.js"),C3D.tier==="high"?imp(C3U+"examples/jsm/environments/RoomEnvironment.js").catch(()=>null):null]);
    const viaEsm=()=>Promise.all([imp(C3U+"+esm"),imp(C3U+"examples/jsm/loaders/GLTFLoader.js/+esm"),imp(C3U+"examples/jsm/utils/SkeletonUtils.js/+esm"),null]);
    const canMap=!!(window.HTMLScriptElement&&HTMLScriptElement.supports&&HTMLScriptElement.supports("importmap"));
    C3D.p=(canMap?viaMap().catch(()=>viaEsm()):viaEsm().catch(()=>viaMap())).then(([T,G,S,E])=>{
      C3D.T=T;C3D.GLTF=G.GLTFLoader;C3D.Skel=S;C3D.Env=E&&E.RoomEnvironment;return T;
    });
  }
  return C3D.p;
}
function c3dGlbAny(key,paths){
  if(!C3D.cache[key]){
    C3D.cache[key]=(async()=>{
      let err;
      for(const p of paths){
        try{return await new Promise((res,rej)=>new C3D.GLTF().load(new URL(p,document.baseURI).href,res,undefined,rej))}catch(e){err=e}
      }
      throw err;
    })();
    C3D.cache[key].catch(()=>setTimeout(()=>{delete C3D.cache[key]},20000));
  }
  return C3D.cache[key];
}
function c3dGlb(name){return c3dGlbAny("p:"+name,["./pets/"+name+".glb","./"+name+".glb"])}
function c3dAttach(room){
  try{
    if(!c3dCan())return;
    c3dLoad().then(()=>{if(room.isConnected&&C3D.ok)c3dStart(room)}).catch(err=>{console.warn("c3d load",err);c3dOff(false)});
  }catch(_){}
}
function c3dMakeTex(T){
  const mk=(w,h,fn)=>{const c=document.createElement("canvas");c.width=w;c.height=h;fn(c.getContext("2d"));return new T.CanvasTexture(c)};
  C3D.dot=mk(32,32,g=>{const r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,"rgba(255,255,255,1)");r.addColorStop(.4,"rgba(255,255,255,.55)");r.addColorStop(1,"rgba(255,255,255,0)");g.fillStyle=r;g.fillRect(0,0,32,32)});
  C3D.shT=mk(64,64,g=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,"rgba(0,0,0,.55)");r.addColorStop(.55,"rgba(0,0,0,.25)");r.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=r;g.fillRect(0,0,64,64)});
}
function c3dStart(room){
  const T=C3D.T;if(!T)return;
  try{
    const hi=C3D.tier==="high";
    if(!C3D.R){
      c3dMakeTex(T);
      const cv=document.createElement("canvas");cv.className="c3d-cv";
      const R=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:hi,powerPreference:"default"});
      R.outputColorSpace=T.SRGBColorSpace;R.toneMapping=T.ACESFilmicToneMapping;R.toneMappingExposure=1.12;R.setClearColor(0x000000,0);
      cv.addEventListener("webglcontextlost",e=>{try{e.preventDefault()}catch(_){}c3dOff(false)});
      const sc=new T.Scene(),cam=new T.OrthographicCamera(0,300,250,0,-2000,2000);cam.position.z=600;
      const hemi=new T.HemisphereLight(0xfff4e0,0x7a5a3a,hi?.7:1.3);sc.add(hemi);
      const key=new T.DirectionalLight(0xfff0d8,hi?2.1:1.7);key.position.set(-160,260,300);sc.add(key);
      const fill=new T.DirectionalLight(0xa8c8ff,hi?.6:.4);fill.position.set(260,80,200);sc.add(fill);
      const rim=new T.DirectionalLight(0xffffff,hi?1.2:.6);rim.position.set(60,160,-260);sc.add(rim);C3D.L={hemi,key,fill,rim,h0:hemi.intensity,k0:key.intensity,f0:fill.intensity};
      if(hi&&C3D.Env){try{const pm=new T.PMREMGenerator(R);sc.environment=pm.fromScene(new C3D.Env(),.04).texture;pm.dispose()}catch(_){}}
      C3D.pln=new T.PlaneGeometry(1,1);
      C3D.R=R;C3D.cv=cv;C3D.sc=sc;C3D.cam=cam;
    }
    try{document.querySelectorAll(".lf-room[data-3d]").forEach(r=>{if(r!==room)r.removeAttribute("data-3d")})}catch(_){}
    C3D.room=room;room.appendChild(C3D.cv);room.setAttribute("data-3d","1");
    C3D.ents.forEach(e=>c3dKill(e));C3D.ents.clear();C3D.props.forEach(p=>c3dPropKill(p));C3D.props.clear();
    C3D.w=0;C3D.fN=0;C3D.fT=0;C3D.slow=0;
    try{if(C3D.io)C3D.io.disconnect();C3D.io=new IntersectionObserver(es=>{C3D.vis=es[es.length-1].isIntersecting;if(C3D.vis)c3dKick()},{threshold:0});C3D.io.observe(room)}catch(_){C3D.vis=true}
    c3dKick();
  }catch(err){console.warn("c3d start",err);c3dOff(false)}
}
function c3dKick(){if(!C3D.raf&&C3D.room&&C3D.ok){C3D.last=performance.now();C3D.raf=requestAnimationFrame(c3dLoop)}}
function c3dStop(){if(C3D.raf){cancelAnimationFrame(C3D.raf);C3D.raf=0}if(C3D.idle){clearTimeout(C3D.idle);C3D.idle=0}}
function c3dOff(){
  C3D.ok=false;c3dStop();
  try{C3D.ents.forEach(e=>c3dKill(e));C3D.ents.clear();C3D.props.forEach(p=>c3dPropKill(p));C3D.props.clear();if(C3D.cv&&C3D.cv.parentNode)C3D.cv.parentNode.removeChild(C3D.cv)}catch(_){}
  try{document.querySelectorAll(".lf-room[data-3d]").forEach(r=>r.removeAttribute("data-3d"));document.querySelectorAll(".lf-pet[data-g3],.slot[data-g3]").forEach(r=>r.removeAttribute("data-g3"))}catch(_){}
}
function c3dKill(e){
  try{
    if(e.mixer)e.mixer.stopAllAction();
    if(e.p&&e.p.removeAttribute)e.p.removeAttribute("data-g3");
    [e.g,e.sh,e.fx,e.gl].forEach(o=>{if(!o)return;if(o.parent)o.parent.remove(o);o.traverse(m=>{if(m.material&&m.material.dispose)m.material.dispose();if(m.geometry&&m.geometry!==C3D.pln&&!m.isSkinnedMesh&&m.geometry.dispose)m.geometry.dispose()})});
  }catch(_){}
}
/* ---------- entity ---------- */
function c3dEnt(p){
  const T=C3D.T,sp=((p.querySelector(".pe")||{}).textContent||"").trim(),cfg=C3_GLB[sp];
  if(!cfg)return null;
  const st=+p.dataset.st||4;
  let e=C3D.ents.get(p);
  if(e&&e.sp===sp&&e.st===st)return e;
  if(e)c3dKill(e);
  e={p,sp,st,cfg,seed:Math.random()*100,g:new T.Group(),yawG:new T.Group(),tilt:new T.Group(),ready:0,mixer:null,act:{},cur:{},b:{},bq:{},anim:{},yaw:1.07,glanceT:0,glance:0,pf:{},hopT:-1,spinT:-1,hs:1,q:new T.Quaternion(),eu:new T.Euler(),sc:[.6,.7,.82,.95,1.1][Math.max(0,Math.min(4,st-1))]};
  e.g.add(e.yawG);e.yawG.add(e.tilt);C3D.sc.add(e.g);
  e.sh=new T.Mesh(C3D.pln,new T.MeshBasicMaterial({map:C3D.shT,transparent:true,depthWrite:false}));e.sh.position.z=-60;C3D.sc.add(e.sh);
  if(st>=5||(cfg.fire&&st>=3)){
    const N=26,pm=new T.PointsMaterial({size:7,map:C3D.dot,color:cfg.aura,transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending,sizeAttenuation:false});
    const gm=new T.BufferGeometry();gm.setAttribute("position",new T.BufferAttribute(new Float32Array(N*3),3));
    const pts=new T.Points(gm,pm);pts.frustumCulled=false;C3D.sc.add(pts);e.fx=pts;e.fxN=N;e.fire=!!cfg.fire&&st<5;
  }
  if(st>=5){const sm=new T.Sprite(new T.SpriteMaterial({map:C3D.dot,color:cfg.aura,transparent:true,opacity:.3,depthWrite:false,blending:T.AdditiveBlending}));sm.position.z=-120;C3D.sc.add(sm);e.gl=sm}
  C3D.ents.set(p,e);
  c3dGlb(cfg.f).then(gltf=>{if(C3D.ents.get(p)===e)c3dFill(e,gltf)}).catch(err=>console.warn("glb",cfg.f,err));
  if(p.classList.contains("m")&&!C3D.hi[sp]){C3D.hi[sp]=1;setTimeout(()=>c3dSnd(sp,"hi"),900)}
  return e;
}
function c3dFill(e,gltf){
  const T=C3D.T,hi=C3D.tier==="high",root=C3D.Skel.clone(gltf.scene),pivot=new T.Group(),bones={};
  pivot.add(root);
  root.traverse(o=>{
    if(o.isBone)bones[o.name]=o;
    if(o.isMesh&&o.material&&!Array.isArray(o.material)){
      o.frustumCulled=false;
      const old=o.material,map=old.map||null;
      if(map){map.anisotropy=hi?4:1}
      const m=hi?new T.MeshStandardMaterial({map,roughness:.76,metalness:0,envMapIntensity:.6}):new T.MeshLambertMaterial({map});
      m.color.set(0xffffff);
      if(map){m.emissive.set(0xffffff);m.emissiveMap=map;m.emissiveIntensity=.12}
      o.material=m;
    }
  });
  root.updateMatrixWorld(true);
  /* align model so its head points +Z (toward the camera) whatever the export axis was */
  let ang=0;
  if(bones.Head&&bones.Tail){const a=new T.Vector3(),b=new T.Vector3();bones.Head.getWorldPosition(a);bones.Tail.getWorldPosition(b);if(Math.abs(a.x-b.x)+Math.abs(a.z-b.z)>1e-4)ang=Math.atan2(a.x-b.x,a.z-b.z)}
  pivot.rotation.y=-ang;pivot.updateMatrixWorld(true);
  let box=new T.Box3().setFromObject(pivot),sz=new T.Vector3();box.getSize(sz);
  const L=Math.max(sz.x,sz.z,.0001),k=1/L;
  pivot.scale.setScalar(k);pivot.updateMatrixWorld(true);
  box=new T.Box3().setFromObject(pivot);const c=new T.Vector3();box.getCenter(c);
  pivot.position.set(-c.x,-box.min.y,-c.z);
  e.tilt.add(pivot);
  e.b={head:bones.Head,mouth:bones.Mouth,tail:bones.Tail,earL:bones.LeftEar,earR:bones.RightEar};
  Object.keys(e.b).forEach(k2=>{if(e.b[k2])e.bq[k2]=e.b[k2].quaternion.clone()});
  if(bones.Head){const qw=new T.Quaternion();bones.Head.getWorldQuaternion(qw);e.hs=new T.Vector3(1,0,0).applyQuaternion(qw).x>=0?1:-1;
    e.headS=[1,1.5,1.34,1.17,1,1][e.st]||1}
  if(gltf.animations&&gltf.animations.length){
    e.mixer=new T.AnimationMixer(root);
    gltf.animations.forEach(cl=>{
      cl.tracks.forEach(tr=>{const n=tr.name.split(".")[0];Object.keys(e.b).forEach(k2=>{if(e.b[k2]&&e.b[k2].name===n)e.anim[k2]=1})});
      const a=e.mixer.clipAction(cl),n=(cl.name||"").toLowerCase();
      if(n.includes("dead")){a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true}
      const key=n.includes("walk")||n.includes("run")?"walk":n.includes("dead")||n.includes("death")?"dead":n.includes("attack")?"attack":n.includes("idle")?"idle":n;
      if(!e.act[key])e.act[key]=a;
    });
    if(!e.act.idle){const f=Object.keys(e.act)[0];if(f)e.act.idle=e.act[f]}
    if(e.act.idle){e.act.idle.play();e.cur.act="idle"}
  }
  e.ready=1;e.p.setAttribute("data-g3","1");
}
const c3Sm=(c,t,k,dt)=>c+(t-c)*Math.min(1,k*dt);
function c3dBn(e,key,rx,ry,rz){
  const b=e.b[key];if(!b)return;
  if(!e.anim[key]&&e.bq[key])b.quaternion.copy(e.bq[key]);
  e.q.setFromEuler(e.eu.set(rx,ry,rz));b.quaternion.multiply(e.q);
}
function c3dPose(e,dt,t){
  const cl=e.p.classList,has=c=>cl.contains(c),c=e.cur,T=C3D.T;
  const walk=has("walk")||has("r-run"),sleep=has("sleep"),scr=has("scratch"),sit=has("sit")||scr,eat=has("eat"),yawn=has("yawn"),str=has("stretch"),sniff=has("sniff"),
    happy=has("happy")||has("r-dance"),sad=has("r-sad"),look=has("look"),hop=has("hop")||has("r-jump"),spin=has("spin"),dance=has("r-dance"),dig=has("dig");
  const idle=!walk&&!sleep&&!sit&&!eat&&!yawn&&!str&&!sniff&&!dig;
  let px=0,py=0,mood="";
  try{const rm=e.p.closest&&e.p.closest(".lf-room");if(rm){px=parseFloat(rm.style.getPropertyValue("--px"))||0;py=parseFloat(rm.style.getPropertyValue("--py"))||0;mood=rm.dataset.mood||""}}catch(_){}
  if(cl.contains("m")){const F={happy,eat,sad,yawn,hop};for(const k in F){if(F[k]&&!e.pf[k])c3dSnd(e.sp,k);e.pf[k]=F[k]}}
  if(hop){e.hopT=e.hopT<0?0:e.hopT+dt}else e.hopT=-1;
  if(spin){e.spinT=e.spinT<0?0:e.spinT+dt}else e.spinT=-1;
  /* animation clip */
  let want="idle",ts=1;
  if(sleep&&e.act.dead)want="dead";
  else if(walk&&e.act.walk){want="walk";ts=has("r-run")?1.7:1}
  else ts=sad?.55:happy?1.7:sit?.7:1;
  if(e.mixer){
    if(want!==c.act&&e.act[want]){const n=e.act[want],o=e.act[c.act];n.reset().fadeIn(.3).play();if(o&&o!==n)o.fadeOut(.3);c.act=want}
    if(e.act[c.act])e.act[c.act].timeScale=ts;
    e.mixer.update(dt);
  }
  /* facing (model head is +Z; right = +X) */
  const ty=has("fl")?Math.PI/2-.5:-(Math.PI/2-.5);
  e.yaw=c3Sm(e.yaw,ty,7,dt);
  let yawAdd=0;
  if(e.spinT>=0){const q=Math.min(1,e.spinT/.8);yawAdd=(q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2)*Math.PI*2}
  if(dance)yawAdd+=Math.sin(t*10)*.35;
  e.glanceT-=dt;if(e.glanceT<=0){e.glance=(Math.random()-.5)*1.1;e.glanceT=1.8+Math.random()*3.2}
  /* body (procedural layer on top of the clip) */
  let dy=0,pitch=0,roll=0;
  if(hop&&e.hopT>=0){const u=(e.hopT%.65)/.65;dy=Math.sin(u*Math.PI)*.32}
  if(walk){const f=has("r-run")?11:7;dy+=Math.abs(Math.sin(t*f))*.05;roll+=Math.sin(t*f)*.045}
  if(happy){dy+=Math.abs(Math.sin(t*10))*.04;roll+=Math.sin(t*10)*.07}
  if(dance)roll+=Math.sin(t*12)*.1;
  if(dig){pitch=.24;dy-=.06;roll+=Math.sin(t*22)*.05}
  if(sit){pitch=-.32;dy-=.03}
  if(eat)pitch=.14+Math.sin(t*9)*.05;
  if(str)pitch=.26;
  if(sad)pitch=.08;
  if(scr)roll+=Math.sin(t*26)*.04;
  c.dy=c3Sm(c.dy||0,dy,hop?30:10,dt);c.pitch=c3Sm(c.pitch||0,pitch,8,dt);c.roll=c3Sm(c.roll||0,roll,10,dt);
  const br=1+Math.sin(t*2.4+e.seed)*.012;
  let sqx=1,sqy=br;
  if(hop&&e.hopT>=0){const u2=(e.hopT%.65)/.65,j=Math.sin(u2*Math.PI);sqy=br*(1+j*.15);sqx=1-j*.06}
  else if(dig){sqy=br*.94;sqx=1.05}
  e.tilt.position.y=c.dy;e.tilt.rotation.x=c.pitch;e.tilt.rotation.z=c.roll;e.tilt.scale.set(sqx,sqy,sqx);
  e.yawG.rotation.y=e.yaw+yawAdd;
  /* bones (head, jaw, tail, ears) — after the mixer so they layer on the clip */
  let hp=0,hy=idle?e.glance*.55:0,jaw=0,tAmp=.22,tF=1.8,ear=0;
  if(eat){hp=.45+.15*Math.sin(t*9);jaw=.2+.2*Math.sin(t*14);hy=0}
  if(sniff){hp=.3+.06*Math.sin(t*14);hy=Math.sin(t*3)*.15}
  if(sad){hp=.4;tAmp=.04}
  if(yawn){hp=-.5;jaw=.65;hy=0}
  if(str){hp=.2;hy=0}
  if(look)hy=.7*(Math.sin(e.seed)>0?1:-1);
  if(dig){hp=.55+.08*Math.sin(t*18);hy=0;tAmp=1.1;tF=20}
  if(walk){tAmp=.35;tF=6}
  if(happy){tAmp=.9;tF=16;jaw=.3}
  if(sleep){tAmp=.03;hy=0}
  if(idle){hy+=px*.45;hp+=py*.2;
    if(mood==="hyper"){tAmp=.55;tF=8}else if(mood==="sleepy"){tAmp=.08}}
  c.hp=c3Sm(c.hp||0,hp,9,dt);c.hy=c3Sm(c.hy||0,hy,8,dt);c.jaw=c3Sm(c.jaw||0,jaw,14,dt);c.tAmp=c3Sm(c.tAmp==null?.22:c.tAmp,tAmp,6,dt);
  if(e.b.head&&e.headS)e.b.head.scale.setScalar(e.headS);
  if(!(sleep&&c.act==="dead")){
    c3dBn(e,"head",c.hp*e.hs,c.hy,0);
    c3dBn(e,"mouth",c.jaw*e.hs,0,0);
  }
  c3dBn(e,"tail",0,Math.sin(t*tF)*c.tAmp,0);
  ear=(Math.sin(t*.37+e.seed*3)>.96?.45:0)+(happy?Math.sin(t*20)*.12:0);
  c3dBn(e,"earL",0,0,ear);c3dBn(e,"earR",0,0,-ear);
  return e.tilt.position.y;
}
/* ---------- sounds ---------- */
function c3dSnd(sp,k){
  try{
    if(localStorage.getItem("lf_mute")==="1")return;
    const now=Date.now();if(now-C3D.sndT<5000)return;
    const c=window.__lfa||(window.__lfa=new (window.AudioContext||window.webkitAudioContext)());
    if(c.state!=="running"){try{c.resume()}catch(_){}return}
    C3D.sndT=now;
    const v=C3V[sp]||[400,"triangle"],f=v[0],t0=c.currentTime;
    const sh={hi:[[1,1.5],[1.5,1.2]],happy:[[1,1.6],[1.3,1.9],[1.6,2.1]],eat:[[1,1.1],[1,1.1],[1,1.1]],sad:[[1.4,.8]],yawn:[[1.3,.7]],hop:[[1,1.5]]}[k]||[[1,1]];
    sh.forEach((q,i)=>{const o=c.createOscillator(),g=c.createGain(),st=t0+i*(k==="eat"?.12:.16),d=(k==="yawn"||k==="sad")?.6:.14;
      o.type=v[1];o.frequency.setValueAtTime(f*q[0],st);o.frequency.linearRampToValueAtTime(f*q[1],st+d);
      g.gain.setValueAtTime(.0001,st);g.gain.exponentialRampToValueAtTime(.06,st+.02);g.gain.exponentialRampToValueAtTime(.0001,st+d+.05);
      o.connect(g);g.connect(c.destination);o.start(st);o.stop(st+d+.08)});
  }catch(_){}
}
/* ---------- loop ---------- */
function c3dFit(room){
  const w=room.clientWidth,h=room.clientHeight,d=Math.min(window.devicePixelRatio||1,C3D.dprMax);
  if(w===C3D.w&&h===C3D.h&&d===C3D.dpr)return;
  C3D.w=w;C3D.h=h;C3D.dpr=d;C3D.R.setPixelRatio(d);C3D.R.setSize(w,h,false);
  const c=C3D.cam;c.left=0;c.right=w;c.top=h;c.bottom=0;c.updateProjectionMatrix();
}
function c3dLoop(now){
  C3D.raf=0;
  const room=C3D.room;
  try{
    if(!room||!room.isConnected||!C3D.ok){
      if(C3D.ok){const r=[...document.querySelectorAll(".lf-room[data-live][data-on]")].reverse().find(x=>x.isConnected);if(r){c3dStart(r);return}}
      c3dStop();return}
    if(document.hidden||!C3D.vis){C3D.idle=setTimeout(()=>{C3D.idle=0;c3dKick()},500);return}
    const el=now-C3D.last;
    if(el<(C3D.cap===30?30:15)){C3D.raf=requestAnimationFrame(c3dLoop);return}
    const dt=Math.min(.05,el/1000);C3D.last=now;
    C3D.fN++;C3D.fT+=el;
    /* adaptive quality: slow device => lower resolution / 30fps, never switch the pets off */
    if(C3D.fN>=90){const fps=C3D.fN/(C3D.fT/1000);C3D.fN=0;C3D.fT=0;
      if(fps<(C3D.cap===30?20:26)){if(++C3D.slow>=2){C3D.slow=0;if(C3D.dprMax>1)C3D.dprMax=1;else if(C3D.cap!==30)C3D.cap=30}}else C3D.slow=0}
    c3dFit(room);
    const t=now/1000,H=C3D.h,px=parseFloat(room.style.getPropertyValue("--px"))||0,seen=new Set();
    room.querySelectorAll(".lf-pet").forEach(p=>{
      seen.add(p);
      if(p.classList.contains("isegg")||p.classList.contains("home")){const o=C3D.ents.get(p);if(o){o.g.visible=false;o.sh.visible=false;if(o.fx)o.fx.visible=false;if(o.gl)o.gl.visible=false}return}
      const e=c3dEnt(p);if(!e)return;
      if(!e.ready){e.g.visible=false;e.sh.visible=false;return}
      const fpx=parseFloat(getComputedStyle(p).fontSize)||52;
      const size=fpx*2.3*e.cfg.sz;
      const cx=p.offsetLeft+p.offsetWidth/2-px*14,gy=H-(p.offsetTop+p.offsetHeight)+8;
      const lift=c3dPose(e,dt,t);
      e.g.visible=true;e.sh.visible=true;
      e.g.scale.setScalar(size);e.g.position.set(cx,gy,p.classList.contains("m")?30:0);
      e.sh.scale.set(size*(.8-Math.max(0,lift)*.5),size*.16,1);e.sh.position.set(cx,gy+2,-60);
      if(e.fx){
        e.fx.visible=true;const a=e.fx.geometry.attributes.position,N=e.fxN;
        for(let i=0;i<N;i++){
          const u=((t*(e.fire?.5:.18)+i/N)%1),ang=i*2.4+t*(e.fire?.8:.9),rr=size*(e.fire?.34:.55)*(e.fire?1-u*.6:1);
          a.setXYZ(i,Math.cos(ang)*rr,u*size*(e.fire?.8:.95),Math.sin(ang)*rr*.5);
        }
        a.needsUpdate=true;e.fx.position.set(cx,gy,40);
      }
      if(e.gl){e.gl.visible=true;e.gl.position.set(cx,gy+size*.35,-120);const s=size*(1.5+Math.sin(t*2+e.seed)*.08);e.gl.scale.set(s,s,1)}
    });
    c3dProps(room,t,dt);
    c3dNight(room.classList.contains("night"),dt);
    C3D.ents.forEach((e,p)=>{if(!seen.has(p)||!p.isConnected){c3dKill(e);C3D.ents.delete(p)}});
    C3D.R.render(C3D.sc,C3D.cam);
    C3D.raf=requestAnimationFrame(c3dLoop);
  }catch(err){console.warn("c3d loop",err);c3dOff(false)}
}

/* ---------- feed: auto-loads while scrolling (no button), lazy media ---------- */
function fadLazy(h){return String(h||"").replace(/<img /g,'<img loading="lazy" decoding="async" ').replace(/<video /g,'<video preload="none" ')}
function fadMoreBtn(total){
  S.fadTotal=total;
  const show=S.fadShow||10,lim=S.fadLimit||FAD_PAGE_SIZE,more=show<total||((S.fadaye7All||[]).length>=lim&&lim<FAD_PAGE_MAX);
  return more?`<div id="fadSentinel" class="mut" style="text-align:center;padding:16px;font-size:13px">⏳ بيحمّل…</div>`:"";
}
let __fadGrowT=0;
function fadGrow(){
  const now=Date.now();if(now-__fadGrowT<350||S.view!=="fadaye7")return;__fadGrowT=now;
  const total=S.fadTotal||0,show=S.fadShow||10;
  if(show<total){S.fadShow=Math.min(total,show+10);scheduleRender();return}
  const lim=S.fadLimit||FAD_PAGE_SIZE;
  if((S.fadaye7All||[]).length>=lim&&lim<FAD_PAGE_MAX&&!S.fadBusy){S.fadBusy=1;S.fadLimit=Math.min(FAD_PAGE_MAX,lim+30);try{if(typeof __fadUnsub==="function")__fadUnsub()}catch(_){}__fadUnsub=null;try{window.__fadUnsub=null}catch(_){}ensureFadaye7Listen()}
}
Object.assign(A,{fadMore(){fadGrow()}});
{
  let io=null,last=null;
  const mo=new MutationObserver(()=>{
    if(S.view!=="fadaye7")return;
    const el=document.getElementById("fadSentinel");
    if(el&&el!==last){last=el;if(!io)io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))fadGrow()},{rootMargin:"900px"});io.disconnect();io.observe(el)}
  });
  try{mo.observe(document.getElementById("app")||document.body,{childList:true,subtree:true})}catch(_){}
}

/* ---------- garden props (Nature Kit) ---------- */
const C3_PS={Hill:{w:.95,y:.35},HillSand:{w:.95,y:.35},MountainFar:{w:1.05,y:.33},Mountain:{w:.75,y:.33},Cliff:{w:.5,y:.33},Cloud:{w:.26},TreeHigh:{h:.68},TreeMed:{h:.54},TreeLow:{h:.4},Bush:{h:.16},Reed:{h:.25},Rock:{h:.12},Grass:{h:.085}};
const C3_SL={hill:{x:.5,y:.35,z:-380},cloud:{x:.3,y:.8,z:-360},tree:{x:.12,y:.3,z:-250},tree2:{x:.88,y:.3,z:-240},bush:{x:.3,y:.21,z:-150},bush2:{x:.72,y:.21,z:-140},rock:{x:.91,y:.09,z:-80},grass:{x:[.17,.5,.85],y:.055,z:-70}};
function c3dPropNew(el){
  const T=C3D.T,name=el.dataset.m||"",type=name.replace(/\d+$/,""),ps=C3_PS[type];
  const sl=[...el.classList].map(c=>/^s-/.test(c)?c.slice(2):"").find(x=>x&&C3_SL[x]);
  if(!ps||!sl)return null;
  const pr={el,name,type,ps,lay:C3_SL[sl],insts:[],ready:0,seed:Math.random()*10};
  C3D.props.set(el,pr);
  c3dGlbAny("g:"+name,["./garden/"+name+".glb","./"+name+".glb"]).then(gltf=>{
    if(C3D.props.get(el)!==pr)return;
    const hi=C3D.tier==="high",alpha=type==="Grass"||type==="Reed";
    let mat=null;
    const mk=()=>{
      const root=gltf.scene.clone(true);
      root.traverse(o=>{
        if(o.isMesh&&o.material&&!Array.isArray(o.material)){
          o.frustumCulled=false;
          if(!mat){const map=o.material.map||null;
            mat=hi?new T.MeshStandardMaterial({map,roughness:.9,metalness:0,envMapIntensity:.45,side:T.DoubleSide,alphaTest:alpha?.4:0}):new T.MeshLambertMaterial({map,side:T.DoubleSide,alphaTest:alpha?.4:0});
            mat.color.set(0xffffff);if(map){mat.emissive.set(0xffffff);mat.emissiveMap=map;mat.emissiveIntensity=.16}}
          o.material=mat;
        }
      });
      const piv=new T.Group();piv.add(root);piv.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(piv),sz=new T.Vector3(),c=new T.Vector3();box.getSize(sz);box.getCenter(c);
      const k=1/Math.max(ps.h?sz.y:sz.x,.0001);
      root.position.set(-c.x,-box.min.y,-c.z);
      const g=new T.Group();piv.scale.setScalar(k);g.add(piv);
      C3D.sc.add(g);return g;
    };
    const n=Array.isArray(pr.lay.x)?pr.lay.x.length:1;
    for(let i=0;i<n;i++)pr.insts.push({g:mk(),i});
    pr.mat=mat;pr.ready=1;el.setAttribute("data-g3","1");
  }).catch(err=>console.warn("garden",name,err));
  return pr;
}
function c3dPropKill(pr){
  try{pr.insts.forEach(n=>{if(n.g.parent)n.g.parent.remove(n.g)});if(pr.mat&&pr.mat.dispose)pr.mat.dispose();if(pr.el&&pr.el.removeAttribute)pr.el.removeAttribute("data-g3")}catch(_){}
}
function c3dProps(room,t,dt){
  const W=C3D.w,H=C3D.h,seen=new Set();
  room.querySelectorAll(".slot[data-m]").forEach(el=>{
    seen.add(el);
    let pr=C3D.props.get(el);if(!pr)pr=c3dPropNew(el);
    if(!pr||!pr.ready)return;
    const L=pr.lay,ps=pr.ps,amp0={Grass:.07,Reed:.05,TreeHigh:.014,TreeMed:.016,TreeLow:.018,Bush:.012}[pr.type]||0;
    const gust=1+.6*Math.max(0,Math.sin(t*.13+pr.seed*1.7));
    const amp=amp0*((pr.type==="Grass"||pr.type==="Reed")?gust:1);
    pr.insts.forEach(n=>{
      const fx=Array.isArray(L.x)?L.x[n.i]:L.x,s=(ps.h?H*ps.h:W*ps.w)*(1+Math.sin(pr.seed+n.i*2.1)*.12);
      let x=fx*W,y=(ps.y!=null?ps.y:L.y)*H;
      if(pr.type==="Cloud"){x=((fx*W+t*7)%(W*1.5))-W*.25;y=L.y*H+Math.sin(t*.4+pr.seed)*3}
      n.g.visible=true;n.g.scale.setScalar(s);n.g.position.set(x,y,L.z-n.i*2);
      n.g.rotation.z=amp?Math.sin(t*(.8+pr.seed*.04)+n.i+pr.seed)*amp:0;
    });
  });
  C3D.props.forEach((pr,el)=>{if(!seen.has(el)||!el.isConnected){c3dPropKill(pr);C3D.props.delete(el)}});
}
function c3dNight(night,dt){
  const L=C3D.L;if(!L)return;
  C3D.nightK=c3Sm(C3D.nightK,night?1:0,2,dt);
  const k=C3D.nightK;
  L.hemi.intensity=L.h0*(1-.5*k);L.key.intensity=L.k0*(1-.55*k);L.fill.intensity=L.f0*(1+.5*k);
  L.key.color.setHex(night?0xaab8ff:0xfff0d8);
}

/* ===== v76: حزمة الهمّة — الهدية اليومية + وضع التركيز + ملاحظاتي ===== */
function v76Day(){const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate()}
function v76Time(){try{return new Date().toLocaleDateString("ar-EG",{day:"numeric",month:"long"})+" · "+new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}catch(_){return v76Day()}}
function v76GiftTaken(){try{return localStorage.getItem("gift_day")===v76Day()}catch(_){return true}}
function v76HomeExtras(){
  try{
    if(S.isAdmin)return "";
    let out='';
    if(!v76GiftTaken())out+='<div class="card v76-gift" data-act="giftOpen"><span class="gi">🎁</span><div class="gt"><b>هدية النهارده!</b><div class="mut" style="margin-top:2px">افتحها وخد XP وقطط — مرة واحدة كل يوم</div></div><span class="btn sm gold">افتح</span></div>';
    out+='<div class="v76-row"><button type="button" class="v76-tile" style="background:linear-gradient(135deg,#7C3AED,#4338CA)" data-act="openFocus"><span class="g">🎯</span><span><b>وضع التركيز</b><br><small>جلسة هدوء وبالوقت — وتجيب XP</small></span></button><button type="button" class="v76-tile" style="background:linear-gradient(135deg,#B45309,#92400E)" data-act="openNotes"><span class="g">📝</span><span><b>ملاحظاتي</b><br><small>سجّل أي حاجة مهمة على طول</small></span></button></div>';
    return out;
  }catch(_){return ""}
}
/* --- وضع التركيز --- */
function focusState(){if(!S.focus)S.focus={mins:25,left:25*60,run:false,fin:false};if(S.focus._iv==null)S.focus._iv=null}
function focusStopIv(){try{if(S.focus&&S.focus._iv){clearInterval(S.focus._iv);S.focus._iv=null}}catch(_){}}
function focusFmt(s){s=Math.max(0,s|0);const m=Math.floor(s/60),x=s%60;return (m<10?"0":"")+m+":"+(x<10?"0":"")+x}
function v76FocusDone(mins){
  try{navigator.vibrate&&navigator.vibrate([30,60,30])}catch(_){}
  let tot=0;try{tot=(+(localStorage.getItem("focus_min_total")||0))+mins;localStorage.setItem("focus_min_total",String(tot))}catch(_){}
  const dk=v76Day();let dn=0;try{dn=(+(localStorage.getItem("focus_cnt_"+dk)||0))+1;localStorage.setItem("focus_cnt_"+dk,String(dn))}catch(_){}
  toast("خلصت جلسة تركيز "+mins+" دقيقة 🎉",true);
  try{if(typeof lfBurst==="function")lfBurst("🎉",8)}catch(_){}
  try{if(typeof lfSfx==="function")lfSfx("coin")}catch(_){}
  try{addXP(Math.min(15,Math.max(6,Math.round(mins/5))),"focus_session")}catch(_){}
  try{if(typeof lfAdd==="function")lfAdd(Math.min(30,Math.round(mins/5)*3),"تركيز",true)}catch(_){}
  render(true);
}
function focusView(){
  focusState();const f=S.focus;
  let tot=0,dn=0;try{tot=+(localStorage.getItem("focus_min_total")||0);dn=+(localStorage.getItem("focus_cnt_"+v76Day())||0)}catch(_){}
  const presets=[15,25,50].map(m=>`<button type="button" class="btn sm ${f.mins===m?"gold":"ghost"}" data-act="focusPick" data-m="${m}" ${f.run?"disabled":""}>${m} دقيقة</button>`).join("");
  const pct=Math.round((1-f.left/(f.mins*60))*100);
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>🎯 وضع التركيز</h2><p class="mut">اختار مدة الجلسة وشغّل العدّاد — سيب الموبايل وركّز. كل جلسة كاملة بتجيب XP وقطط.</p>
<div class="card fc-card">
<div class="fc-presets">${presets}</div>
<div class="fc-clock ${f.run?"run":""}" id="fcClock">${focusFmt(f.left)}</div>
<div class="fc-bar"><i id="fcBar" style="width:${pct}%"></i></div>
<div class="row" style="justify-content:center;margin-top:16px">
${f.fin?`<button class="btn gold" data-act="focusReset">🎉 خلصت! ابدأ جلسة جديدة</button>`:f.run?`<button class="btn" data-act="focusToggle">⏸ وقفة</button>`:`<button class="btn gold" data-act="focusToggle">${f.left<f.mins*60?"▶ كمّل التركيز":"▶ ابدأ التركيز"}</button>`}
${!f.fin&&!f.run&&f.left<f.mins*60?`<button class="btn ghost" data-act="focusReset">↺ من الأول</button>`:""}
</div>
</div>
<div class="card"><b>📈 إحصائيات تركيزك</b><div class="mut" style="margin-top:6px">النهارده: <b>${dn}</b> جلسة · إجمالي دقايق التركيز: <b>${tot}</b> دقيقة</div></div>
</div>${studentNav()}`;
}
/* --- ملاحظاتي --- */
function notesLoad(){try{return JSON.parse(localStorage.getItem("my_notes_v76")||"[]")||[]}catch(_){return []}}
function notesSave(a){try{localStorage.setItem("my_notes_v76",JSON.stringify(a))}catch(_){}}
function notesView(){
  const a=notesLoad();
  return `<div class="wrap">${header(`<button class="btn ghost sm" data-act="home">رجوع</button>`)}
<h2>📝 ملاحظاتي</h2><p class="mut">اكتب أي حاجة محتاج تفتكرها — واجب، ميعاد، حاجة مهمة. محفوظة على موبايلك بس ومش بتتبعت لأي حد.</p>
<div class="card nt-compose"><textarea id="noteIn" rows="3" dir="auto" placeholder="اكتب ملاحظتك هنا..."></textarea><button type="button" class="btn sm gold" data-act="noteAdd">➕ حفظ الملاحظة</button></div>
${a.length?a.map((n,i)=>`<div class="card nt-item"><div class="nt-x" dir="auto">${esc(n.x)}</div><div class="row" style="justify-content:space-between;margin-top:8px"><span class="mut" style="font-size:12px">${esc(n.t||"")}</span><button type="button" class="btn ghost sm" data-act="noteDel" data-i="${i}">🗑 حذف</button></div></div>`).join(""):`<div class="card empty"><div class="ei">🗒️</div><b>مفيش ملاحظات لسه</b><div class="mut" style="margin:8px auto 14px">أول ملاحظة هتكتبها هتظهر هنا.</div></div>`}
</div>${studentNav()}`;
}
/* --- أفعال v76 --- */
Object.assign(A,{
  giftOpen(){
    if(v76GiftTaken())return;
    try{localStorage.setItem("gift_day",v76Day())}catch(_){}
    const coins=10+Math.floor(Math.random()*21);
    try{navigator.vibrate&&navigator.vibrate(20)}catch(_){}
    try{if(typeof lfBurst==="function")lfBurst("🎁",10)}catch(_){}
    try{if(typeof lfAdd==="function")lfAdd(coins,"هدية",true)}catch(_){}
    toast("🎉 فتحت هدية النهارده! +"+coins+" 🪙 و +8 XP",true);
    try{addXP(8,"daily_gift")}catch(_){}
    render(true);
  },
  openFocus(){focusStopIv();focusState();S.view="focus";render(true)},
  focusPick(d){focusStopIv();focusState();const m=Math.max(5,Math.min(120,+d.m||25));S.focus={mins:m,left:m*60,run:false,fin:false,_iv:null};render(true)},
  focusToggle(){
    focusState();const f=S.focus;if(f.fin)return;
    if(f.run){focusStopIv();f.run=false;render(true);return}
    if(f.left<=0)f.left=f.mins*60;
    f.run=true;render(true);
    f._iv=setInterval(()=>{
      const g=S.focus;if(!g)return;
      if(S.view!=="focus"||!g.run){focusStopIv();if(g)g.run=false;return}
      g.left--;
      const c=document.getElementById("fcClock");if(c)c.textContent=focusFmt(g.left);
      const b=document.getElementById("fcBar");if(b)b.style.width=(Math.round((1-g.left/(g.mins*60))*100))+"%";
      if(g.left<=0){focusStopIv();g.run=false;g.fin=true;v76FocusDone(g.mins)}
    },1000);
  },
  focusReset(){focusStopIv();focusState();S.focus.left=S.focus.mins*60;S.focus.run=false;S.focus.fin=false;render(true)},
  openNotes(){S.view="notes";render(true)},
  noteAdd(){
    const el=document.getElementById("noteIn");const v=el?String(el.value||"").trim():"";
    if(!v){toast("اكتب حاجة الأول");return}
    const a=notesLoad();a.unshift({x:v.slice(0,2000),t:v76Time()});notesSave(a);
    toast("اتبعتت الملاحظة ✓",true);render(true);
  },
  noteDel(d){const a=notesLoad();const i=+d.i;if(!(i>=0&&i<a.length))return;a.splice(i,1);notesSave(a);render(true)}
});

/* __GLOBALS_EXPORT__ */
try{window.S=S}catch(_){}
try{if(typeof pauseExamNow==="function")window.pauseExamNow=pauseExamNow}catch(_){}
try{if(typeof uiDialog==="function")window.uiDialog=uiDialog}catch(_){}

/* Architecture: expose registries for diagnostics */
try{window.__GAMES_REGISTRY=EXTERNAL_GAMES;window.__LIMITS=LIMITS;window.__logger=logger}catch(_){}
