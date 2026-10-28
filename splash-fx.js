// شاشة البداية: تظهر 1.9 ثانية على الأقل، وتختفي فقط لما المحتوى جاهز — بدون شاشة بيضاء
(function(){
  var done=false;
  var minMs=1900;
  var t0=Date.now();
  function hideSplash(){
    if(done)return; done=true;
    var el=document.getElementById("splash");
    if(!el)return;
    el.classList.add("hide");
    // إزالة العنصر بعد انتهاء الانتقال فقط
    setTimeout(function(){try{el.remove()}catch(e){}},600);
  }
  function appReady(){
    var a=document.getElementById("app");
    return !!(a&&a.firstElementChild&&(a.innerText||"").length>8);
  }
  var iv=setInterval(function(){
    var elapsed=Date.now()-t0;
    if(elapsed<minMs)return;
    if(appReady()){clearInterval(iv);hideSplash();return}
    // مهلة أمان: بعد 1.9ث + 8ث لو المحتوى لسه مش جاهز
    if(elapsed>minMs+8000){clearInterval(iv);hideSplash();return}
    if(elapsed>12000){clearInterval(iv);showFail()}
  },40);
  function showFail(){
    if(done)return;
    var el=document.getElementById("splash");
    if(!el)return;
    var box=el.querySelector(".splash-inner");
    if(!box)return;
    box.innerHTML='<div class="splash-logo">التفوق</div><div class="splash-sub" style="margin:14px 0">تعذّر تحميل المنصة، اتأكد من النت وجرب تاني</div>'
      +'<button id="spRetry" style="padding:10px 22px;border-radius:12px;border:0;background:#2f6df6;color:#fff;font:inherit;font-weight:700;margin:4px">إعادة المحاولة</button>'
      +'<button id="spClear" style="padding:10px 22px;border-radius:12px;border:1px solid #888;background:transparent;color:inherit;font:inherit;margin:4px">مسح الكاش وإعادة التحميل</button>';
    document.getElementById("spRetry").onclick=function(){location.reload()};
    document.getElementById("spClear").onclick=function(){
      var jobs=[];
      try{if(window.caches)jobs.push(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return /^eltafawoq-v/i.test(x)}).map(function(x){return caches.delete(x)}))}))}catch(e){}
      try{if(navigator.serviceWorker)jobs.push(navigator.serviceWorker.getRegistrations().then(function(r){var scope=new URL("./",location.href).href;return Promise.all(r.filter(function(x){return x.scope===scope}).map(function(x){return x.unregister()}))}))}catch(e){}
      Promise.all(jobs).catch(function(){}).then(function(){location.reload()});
    };
  }
})();

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){});
  });
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  window.__deferredPrompt=e;
  window.__canInstall=true;
});
window.addEventListener('appinstalled',()=>{
  window.__deferredPrompt=null;
  try{window.toast&&window.toast('تم تثبيت تطبيق التفوق ✓',true)}catch(e){}
});

/* ===== زر الرجوع في الموبايل/التطبيق ===== */
(function(){
  try{history.replaceState({r:1},"");history.pushState({a:1},"")}catch(_){return}
  let leaving=false,asking=false;
  window.addEventListener("popstate",async()=>{
    if(leaving)return;
    try{history.pushState({a:1},"")}catch(_){}
    const dlg=document.querySelector(".dlg-ov");
    if(dlg){const no=dlg.querySelector('[data-k="no"]');if(no)no.click();return}
    const pk=document.getElementById("reactPicker");if(pk){pk.remove();return}
    if(typeof window.S!=="undefined"&&window.S.view==="exam"&&window.S.cur&&!window.S.cur.done){if(typeof window.pauseExamNow==="function")window.pauseExamNow(true);return}
    if(typeof window.S==="undefined"||!window.S.user)return;
    const btn=[...document.querySelectorAll(".wrap button[data-act],.top button[data-act]")].find(b=>b.textContent.trim()==="رجوع");
    if(btn){btn.click();return}
    if(asking)return;
    asking=true;
    const ok=typeof window.uiDialog==="function"?await window.uiDialog({title:"الخروج من المنصة",icon:"👋",msg:"عايز تخرج من التطبيق؟",ok:"خروج"}):true;
    asking=false;
    if(ok){leaving=true;try{history.go(-2)}catch(_){}setTimeout(()=>{try{window.close()}catch(_){}},300)}
  });
})();
