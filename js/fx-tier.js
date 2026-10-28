/* fx tier */
(function(){
  var tier = "high";
  try{
    var m = navigator.deviceMemory || 4;
    var c = navigator.hardwareConcurrency || 4;
    if(m < 2 || c < 4) tier = "low";
    else if(m < 4 || c < 6) tier = "mid";
  }catch(e){}
  window.__FX_TIER = tier;
  if(tier === "low") document.documentElement.classList.add("fx-low");
})();
