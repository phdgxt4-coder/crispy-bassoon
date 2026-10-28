/* v92: Error Center collector — يلتقط الأخطاء مبكراً، يحتفظ بآخر 100 محلياً، ولا يكتب في Firebase إلا من الوحدة الرئيسية بحدود صارمة */
(function(){
  var EC=window.__EC={log:[],buf:[],ops:[],net:[],MAX:100,_in:0};
  try{EC.log=JSON.parse(localStorage.getItem("ec_log")||"[]").slice(-100)}catch(e){}
  function save(){try{localStorage.setItem("ec_log",JSON.stringify(EC.log.slice(-100)))}catch(e){}}
  function h(s){var x=5381,i=0;for(;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))|0;return (x>>>0).toString(36)}
  function dev(){var u=navigator.userAgent||"",b=/Edg\//.test(u)?"Edge":/OPR\//.test(u)?"Opera":/Firefox\//.test(u)?"Firefox":/Chrome\//.test(u)?"Chrome":/Safari\//.test(u)?"Safari":"?";
    var o=/Android/.test(u)?"Android":/iPhone|iPad|iPod/.test(u)?"iOS":/Windows/.test(u)?"Windows":/Mac OS/.test(u)?"macOS":/Linux/.test(u)?"Linux":"?";
    var m=u.match(/(?:Chrome|Firefox|Version)\/(\d+)/),pwa=false;try{pwa=!!(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)}catch(e){}
    return (o+" · "+b+(m?" "+m[1]:"")+" · "+screen.width+"x"+screen.height+(pwa?" · PWA":"")).slice(0,120)}
  EC.dev=dev;
  function fnOf(st){if(!st)return"";var l=String(st).split("\n");for(var i=0;i<l.length;i++){var m=l[i].match(/at\s+(?:async\s+)?([^\s(]+)\s+\(/)||l[i].match(/^\s*([^\s@(]+)@/);if(m&&m[1]&&!/^(Object\.)?(anonymous|<anonymous>)$/.test(m[1]))return m[1].slice(0,60)}return""}
  function clean(s,n){return String(s==null?"":s).replace(/https?:\/\/[^\s)'"]+/g,function(u){return u.split("?")[0].split("#")[0]}).slice(0,n)}
  EC.page=function(){return""};
  EC.report=function(type,err,extra){try{
    if(EC._in)return;EC._in=1;extra=extra||{};
    var msg=clean(err&&typeof err==="object"?((err.code?err.code+": ":"")+(err.message||"")):err,300),st=clean(err&&err.stack,800);
    if(!msg){EC._in=0;return}
    var fn=extra.fn||fnOf(st),e={t:Date.now(),type:type,msg:msg,stack:st,fn:String(fn).slice(0,80),page:clean(EC.page(),60),dev:dev(),ver:window.APP_BUILD||"",sig:h(type+"|"+msg.slice(0,120)+"|"+fn)};
    EC.log.push(e);if(EC.log.length>EC.MAX)EC.log.shift();save();
    if(EC.buf.length<50)EC.buf.push(e);
    EC._in=0}catch(x){EC._in=0}};
  addEventListener("error",function(ev){try{
    var t=ev.target;
    if(t&&t!==window&&t.nodeType===1){var u=t.src||t.href||"";if(u)EC.report("network",{message:"فشل تحميل "+t.tagName.toLowerCase()+": "+u},{fn:"resource"});return}
    EC.report("js",ev.error&&ev.error.message?ev.error:{message:(ev.message||"error")+" @"+String(ev.filename||"").split("/").pop()+":"+ev.lineno})}catch(x){}},true);
  addEventListener("unhandledrejection",function(ev){try{
    var r=ev.reason,c=r&&typeof r==="object"?String(r.code||""):"";
    var fb=r&&(r.name==="FirebaseError"||/^(auth|firestore|storage)\//.test(c)||/permission-denied|unavailable|failed-precondition|resource-exhausted|unauthenticated/.test(c));
    EC.report(fb?"firebase":"promise",r&&typeof r==="object"?r:{message:String(r)})}catch(x){}});
  var ce=console.error;
  console.error=function(){try{
    var a=arguments,f=a[0];
    if(f!=="global"&&f!=="unhandled"){
      var parts=[],st="",i,v;
      for(i=0;i<a.length&&i<4;i++){v=a[i];if(v&&v.stack&&!st)st=v.stack;parts.push(v&&v.message?v.message:(v&&typeof v==="object"?"[obj]":String(v)))}
      var s=parts.join(" ");
      if(s&&!/ResizeObserver|favicon|Failed to load resource|net::ERR/i.test(s))
        EC.report(/firebase|firestore|permission|FirebaseError/i.test(s)?"firebase":"console",{message:s,stack:st},f==="act"?{fn:"act:"+a[1]}:{})}
  }catch(x){}return ce.apply(console,arguments)};
  var of=window.fetch;
  if(of)window.fetch=function(i,o){var u="",t0=performance.now();try{u=clean(typeof i==="string"?i:(i&&i.url),120)}catch(x){}
    return of.apply(this,arguments).then(function(r){try{EC.net.push({t:Date.now(),u:u,s:r.status,ms:Math.round(performance.now()-t0)});if(EC.net.length>100)EC.net.shift();if(r.status>=500)EC.report("network",{message:"HTTP "+r.status+" "+u},{fn:"fetch"})}catch(x){}return r},
      function(e){try{if(!(e&&e.name==="AbortError"))EC.report("network",{message:"fetch فشل: "+u+" — "+(e&&e.message)},{fn:"fetch"})}catch(x){}throw e})};
})();
