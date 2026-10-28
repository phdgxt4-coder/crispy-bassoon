/** مكوّنات واجهة قابلة لإعادة الاستخدام — بدون اعتماد على حالة التطبيق */
import { esc } from "./utils.js";

/** شاشة فارغة موحّدة */
export function emptyBox(icon, title, sub){
  return `<div class="card empty"><div class="ei">${icon||"📭"}</div><b>${title||"فاضي"}</b><div class="mut">${sub||""}</div></div>`;
}

/** شارة حالة (ناجح / راسب / موقوف…) */
export function pill(t, c){
  return `<span class="pill ${c||""}">${t}</span>`;
}

/** بطاقة تحميل بسيطة */
export function loadingCard(msg){
  return `<div class="card"><div class="mut">${esc(msg||"جاري التحميل…")}</div><div class="sk" style="height:48px;margin-top:10px"></div></div>`;
}

/** صف هيكل تحميل (skeleton) */
export function skeletonRows(n){
  return Array.from({length:Math.max(1,n||3)},()=>`<div class="sk"></div>`).join("");
}
