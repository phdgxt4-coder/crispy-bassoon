/* v53: invisible auto-quality + haptics + keyboard lift. No UI, no settings. */
(function(){
  try{
    var H=document.documentElement,N=navigator,C=N.connection||{};
    var cached=null;try{cached=JSON.parse(localStorage.getItem("fx_tier")||"null")}catch(_){}
    var fresh=!!(cached&&cached.t&&Date.now()-cached.at<6048e5);
    var weak=(N.deviceMemory&&N.deviceMemory<=3)||(N.hardwareConcurrency&&N.hardwareConcurrency<=4)||C.saveData===true||/(^|-)2g$/.test(C.effectiveType||"");
    H.setAttribute("data-fx","full");try{localStorage.removeItem("fx_tier");localStorage.removeItem("c3d_off")}catch(_){}
    function save(t){H.setAttribute("data-fx",t);try{localStorage.setItem("fx_tier",JSON.stringify({t:t,at:Date.now()}))}catch(_){}}
    function probe(ms,cb){
      var n=0,t0=0,hid=false;
      function f(t){
        if(document.hidden)hid=true;
        if(!t0)t0=t;else n++;
        if(t-t0<ms)requestAnimationFrame(f);else cb(hid?null:n/((t-t0)/1000));
      }
      requestAnimationFrame(f);
    }
    function start(){
      if(!fresh)setTimeout(function(){probe(1500,function(fps){
        if(fps===null)return;
        save("full");
      })},3500);
      setTimeout(function(){
        if(H.getAttribute("data-fx")!=="full")return;
        probe(2000,function(fps){if(fps!==null&&fps<28)save("lite")});
      },18000);
    }
    if(document.readyState==="complete")start();else window.addEventListener("load",start,{once:true});

    document.addEventListener("visibilitychange",function(){H.classList.toggle("fx-hidden",document.hidden)});

    var vv=window.visualViewport;
    if(vv){
      var raf=0;
      var kb=function(){
        cancelAnimationFrame(raf);
        raf=requestAnimationFrame(function(){
          var k=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
          H.style.setProperty("--kb",(k>80?k:0)+"px");
        });
      };
      vv.addEventListener("resize",kb);vv.addEventListener("scroll",kb);
    }

    document.addEventListener("submit",function(e){
      var f=e.target;
      if(f&&f.classList&&f.classList.contains("tk-compose")){
        try{N.vibrate&&N.vibrate(8)}catch(_){}
        var b=f.querySelector("button[type=submit]");
        if(b){b.classList.remove("v53-sent");void b.offsetWidth;b.classList.add("v53-sent")}
      }
    },true);
  }catch(_){}
})();
