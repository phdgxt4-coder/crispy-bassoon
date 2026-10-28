/** مساعدات الامتحانات — تحويل نص الأسئلة، التقييم المقالي، الترتيب العشوائي */
export const LET = {"أ":0,"ا":0,"a":0,"1":0,"ب":1,"b":1,"2":1,"ج":2,"c":2,"3":2,"د":3,"d":3,"4":3};
export const LETTERS = ["أ","ب","ج","د"];

export function parseQs(t){
  const qs=[],errors=[];
  t.replace(/\r/g,"").trim().split(/\n\s*\n/).filter(b=>b.trim()).forEach((blk,i)=>{
    const lines=blk.split("\n").map(l=>l.trim()).filter(Boolean);
    const q=[],o=[];let a,fun=false,essay=false,modelAns="";
    for(const l of lines){
      if(/^\[(?:ترفيه|fun)\]$/i.test(l)){fun=true;continue}
      if(/^\[(?:مقالي|essay)\]$/i.test(l)){essay=true;continue}
      let m=l.match(/^(?:الإجابة|الاجابة|الجواب|answer|ans|الحل)\s*[:：\-]\s*(.+)$/i);
      if(m){
        if(essay){modelAns=m[1].trim();continue}
        a=LET[m[1].trim().toLowerCase().charAt(0)];continue
      }
      if(essay && modelAns && !/^\[/.test(l) && !/^[أابجدa-dA-D1-4]\s*[\)\.\-–]/.test(l)){
        modelAns+=" "+l;continue
      }
      m=l.match(/^([أابجدa-dA-D1-4])\s*[\)\.\-–]\s*(.+)$/);
      if(m&&LET[m[1].toLowerCase()]===o.length){o.push(m[2].trim());continue}
      if(!o.length && !modelAns)q.push(l);
      else if(!essay) errors.push(`سؤال ${i+1}: سطر مش مفهوم: "${l}"`);
    }
    if(!q.length){errors.push(`سؤال ${i+1}: نص السؤال ناقص`);return}
    if(essay){
      if(!modelAns){errors.push(`سؤال ${i+1}: سؤال مقالي لازم فيه سطر "الحل: ..." أو "الإجابة: ..."`);return}
      qs.push({q:q.join("\n"),essay:true,model:modelAns,fun:!!fun});
    }else{
      if(o.length<2||o.length>4)errors.push(`سؤال ${i+1}: لازم من 2 إلى 4 اختيارات (أ ب ج د)`);
      else if(a===undefined||a>=o.length)errors.push(`سؤال ${i+1}: سطر "الإجابة: ب" ناقص أو غلط`);
      else qs.push(fun?{q:q.join("\n"),o,a,fun:true}:{q:q.join("\n"),o,a});
    }
  });
  return {qs,errors};
}

export const serialize = qs => qs.map(x=>{
  if(x.essay) return x.q+"\n[مقالي]\nالحل: "+x.model+(x.fun?"\n[ترفيه]":"");
  return x.q+"\n"+x.o.map((t,i)=>`${LETTERS[i]}) ${t}`).join("\n")+`\nالإجابة: ${LETTERS[x.a]}`+(x.fun?"\n[ترفيه]":"");
}).join("\n\n");

export function normalizeAr(s){
  return String(s||"").toLowerCase()
    .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
    .replace(/[ًٌٍَُِّْ]/g,"").replace(/[^\u0600-\u06FFa-z0-9\s]/g," ")
    .replace(/\s+/g," ").trim();
}

export function tokenSet(s){return new Set(normalizeAr(s).split(" ").filter(w=>w.length>1))}

export function extractNums(s){
  const m=String(s||"").match(/-?\d+(?:[.,]\d+)?/g)||[];
  return m.map(x=>x.replace(",",".")).filter((v,i,a)=>a.indexOf(v)===i);
}

export function essayScoreOne(student, model){
  if(!student||!String(student).trim()) return 0;
  const st=normalizeAr(student), md=normalizeAr(model);
  if(!md) return 0;
  if(st===md) return 1;
  if(st.includes(md)||md.includes(st)) return 0.95;
  // final-number match: if model has numbers and student's last/key numbers match → high credit
  const mn=extractNums(model), sn=extractNums(student);
  if(mn.length){
    const lastM=mn[mn.length-1];
    const lastS=sn.length?sn[sn.length-1]:null;
    const allHit=mn.every(n=>sn.includes(n));
    if(lastS===lastM && mn.length<=3) return sn.length<=mn.length+2?0.92:0.85;
    if(allHit && mn.length>=1) return 0.88;
    if(lastS===lastM) return 0.8;
  }
  const ts=tokenSet(student), tm=tokenSet(model);
  if(!tm.size){
    // model is mostly numbers/symbols
    if(mn.length && sn.length && sn[sn.length-1]===mn[mn.length-1]) return 0.9;
    return 0;
  }
  let hit=0; tm.forEach(w=>{if(ts.has(w)) hit++});
  const recall=hit/tm.size, precision=ts.size?hit/ts.size:0;
  const f1=(recall+precision)?(2*recall*precision)/(recall+precision):0;
  const lenRatio=Math.min(st.length,md.length)/Math.max(st.length,md.length||1);
  let score=f1*0.7+lenRatio*0.1+(recall>0.45?0.1:0);
  if(mn.length && sn.length && sn[sn.length-1]===mn[mn.length-1]) score=Math.max(score,0.82);
  if(recall>=0.6) score=Math.max(score,0.7);
  if(recall>=0.8) score=Math.max(score,0.88);
  if(recall>=0.95) score=Math.max(score,1);
  return Math.min(1, Math.round(score*100)/100);
}

export function essayScore(student, model){
  if(!student||!String(student).trim()) return 0;
  const alts=String(model||"").split(/\|{3}|\n\s*---\s*\n|\n\s*\/\/\s*\n/).map(s=>s.trim()).filter(Boolean);
  if(!alts.length) return 0;
  let best=0;
  for(const alt of alts) best=Math.max(best, essayScoreOne(student, alt));
  return best;
}

export const SAMPLE=`عاصمة مصر هي؟
أ) الإسكندرية
ب) القاهرة
ج) أسوان
د) طنطا
الإجابة: ب

ما ناتج 7 × 8؟
أ) 54
ب) 56
ج) 58
د) 64
الإجابة: ب

علل: الجليد يطفو فوق سطح الماء؟
[مقالي]
الحل: بسبب الترتيب الشبكي الناتج عن الروابط الهيدروجينية مما يجعل كثافة الجليد أقل من كثافة الماء السائل

أوجد س إذا كان 2س + 6 = 14
[مقالي]
الحل: 2س + 6 = 14
2س = 8
س = 4
|||
س = (14 - 6) / 2 = 4
|||
الناتج: 4`;

export function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function shuf(arr,rnd){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function buildOrder(e,seed){
  const rnd=mulberry(seed),on=e.shuffle!==false;
  const idx=e.questions.map((_,i)=>i);
  const g=idx.filter(i=>!e.questions[i].fun),f=idx.filter(i=>e.questions[i].fun);
  return (on?shuf(g,rnd):g).concat(f).map(i=>{
    const q=e.questions[i];
    if(q.essay) return {i,o:[]};
    return {i,o:on?shuf(q.o.map((_,j)=>j),rnd):q.o.map((_,j)=>j)};
  });
}
