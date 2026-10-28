/** أدوات مساعدة عامة — بدون اعتماد على حالة التطبيق أو Firebase */
export const $ = s => document.querySelector(s);
export const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const pad = n => String(n).padStart(2,"0");
export const dur = s => s==null?"-":Math.floor(s/60)+":"+pad(s%60);
export const pctOf = r => r.total?Math.round(r.score/r.total*100):0;
export const gcount = e => e.questions.filter(q=>!q.fun).length;
export const norm = s => String(s||"").replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\s+/g,"");

/** يرجّع timestamp بالميلي ثانية من Timestamp أو رقم أو كائن seconds */
export const tsMs = v => {
  if(!v)return 0;
  if(typeof v==="number")return v>1e12?v:v*1000;
  if(v.seconds!=null)return v.seconds*1000+(v.nanoseconds||0)/1e6;
  if(typeof v.toMillis==="function")return v.toMillis();
  if(v.createdAt)return tsMs(v.createdAt);
  return 0;
};
export const fmt = ts => {
  const ms=tsMs(ts);if(!ms)return "";
  return new Date(ms).toLocaleString("ar-EG",{dateStyle:"short",timeStyle:"short"});
};
export const tms = r => Math.floor(tsMs(r&&(r.createdAt||r.updatedAt||r.lastAt||r))/1000);

export const SUBJECTS = [
  {id:"arabic",name:"عربي",g:"أ ب",c:"#B91C1C",c2:"#C2410C"},
  {id:"science",name:"علوم",g:"H₂O",c:"#155E75",c2:"#0E7490"},
  {id:"history",name:"تاريخ",g:"م",c:"#92400E",c2:"#B45309"},
  {id:"english",name:"إنجليزي",g:"Aa",c:"#1D4ED8",c2:"#4338CA"},
  {id:"philosophy",name:"فلسفة",g:"؟",c:"#6D28D9",c2:"#86198F"},
  {id:"math",name:"رياضيات",g:"π",c:"#166534",c2:"#15803D"}
];
export const subName = id => id==="general"?"عام":(SUBJECTS.find(s=>s.id===id)||{name:id}).name;
export const subColor = id => (SUBJECTS.find(s=>s.id===id)||{c:"#0B5D57"}).c;

export const DOMAIN = "@eltafawoq.app";
export const MAX_ATTEMPTS = 2;
export const ADMIN_UID = "JQs0vS5OomSJy3qlYf8HRXAwS1w1"; // معرّف حساب الأدمن في Firebase Auth، ليس كلمة مرور

export const XP_TITLES = [
  {min:0,name:"المبتدئ",emoji:"🌱"},
  {min:50,name:"المجتهد",emoji:"📖"},
  {min:150,name:"المثابر",emoji:"🔥"},
  {min:300,name:"العبقري",emoji:"🧠"},
  {min:600,name:"أسطورة التفوق",emoji:"👑"}
];
export function xpTitle(xp){
  let t=XP_TITLES[0];
  for(const x of XP_TITLES){if((xp||0)>=x.min)t=x}
  return t;
}
export function xpLevel(xp){
  return Math.floor((xp||0)/50)+1;
}
export function xpProgress(xp){
  const v=(xp||0)%50;
  return Math.round(v/50*100);
}


/* ——— إعدادات المنصة (قيم ثابتة واضحة) ——— */
export const FAD_PAGE_SIZE = 20;          // عدد منشورات الفضايح الابتدائي
export const FAD_PAGE_MAX = 1500;         // سقف تحميل الفضايح
export const LEADERBOARD_LIMIT = 40;      // لوحة الشرف
export const CHATS_LIST_LIMIT = 40;       // قائمة المحادثات
export const BOOKS_PDF_MAX_BYTES = 900 * 1024; // ~900KB لرفع PDF في الكتب
export const MODE_FILE_MAX_BYTES = 600000;     // حد ملف HTML للأوضاع
export const EC_KEEP_DAYS = 14;           // أيام الاحتفاظ بسجل الأخطاء
export const TOAST_DEFAULT_MS = 2500;
export const STUDENTS_TABLE_PAGE = 40;
