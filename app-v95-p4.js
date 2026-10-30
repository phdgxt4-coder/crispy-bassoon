eAttribute("data-g3")}catch(_){}
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
    out+='<div class="v76-row"><button type="button" class="v76-tile" style="background:linear-gradient(135deg,#7C3AED,#4338CA)" data-act="openFocus"><span class="g">🎯</span><span><b>وضع التركيز</b><br><small>جلسة هدوء وبالوقت — وتجيب XP</small></span></button><button type="button" class="v76-tile" style="background:linear-gradient(135deg,#B45309,#92400E)" data-act="openNotes"><span class="g">🗒️</span><span><b>ملاحظاتي</b><br><small>اكتب وخزّن على جهازك</small></span></button></div>';
    return out;
  }catch(_){return ""}
}
function focusFmt(sec){sec=Math.max(0,sec|0);const m=(sec/60)|0,s=sec%60;return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function focusState(){if(!S.focus)S.focus={mins:25,left:25*60,run:false,fin:false,_iv:null};return S.focus}
function focusStopIv(){try{const f=S.focus;if(f&&f._iv){clearInterval(f._iv);f._iv=null}}catch(_){}}
function v76FocusDone(mins){
  try{addXP(Math.min(30,5+Math.floor(mins/5)),"focus_session")}catch(_){}
  toast("انتهت جلسة التركيز ✓ +XP",true);
  render(true);
}
function notesLoad(){try{return JSON.parse(localStorage.getItem("elta_notes")||"[]")}catch(_){return []}}
function notesSave(a){try{localStorage.setItem("elta_notes",JSON.stringify(a.slice(0,100)))}catch(_){}}
function notesView(){
  const a=notesLoad();
  return `<div class="wrap"><div class="top"><button class="btn ghost sm" data-act="goHome">رجوع</button><b>ملاحظاتي</b></div>
<textarea id="noteIn" class="inp" rows="4" placeholder="اكتب ملاحظتك…" style="width:100%;margin:12px 0"></textarea>
<button class="btn" data-act="noteAdd" style="width:100%">حفظ</button>
<div style="margin-top:14px">
${a.length?a.map((n,i)=>`<div class="card nt-item"><div class="nt-x" dir="auto">${esc(n.x)}</div><div class="row" style="justify-content:space-between;margin-top:8px"><span class="mut" style="font-size:12px">${esc(n.t||"")}</span><button type="button" class="btn ghost sm" data-act="noteDel" data-i="${i}">🗑 حذف</button></div></div>`).join(""):`<div class="card empty"><div class="ei">🗒️</div><b>مفيش ملاحظات لسه</b><div class="mut" style="margin:8px auto 14px">أول ملاحظة هتكتبها هتظهر هنا.</div></div>`}
</div>${typeof studentNav==="function"?studentNav():""}</div>`;
}
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
