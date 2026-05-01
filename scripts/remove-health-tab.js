/* Remove Health tab and stop all Health-related UI. Version display is controlled only by index.html. */
(function(){
  const KEEP=['tracker','tax','datapoints','phone'];

  function txt(el){return String(el?.textContent||el?.value||el?.getAttribute?.('aria-label')||el?.getAttribute?.('title')||'').trim().toLowerCase();}

  function forceTrackerIfHealth(){
    try{
      if(typeof tab!=='undefined' && String(tab).toLowerCase()==='health'){
        tab='tracker';
        if(typeof window!=='undefined')window.tab='tracker';
        if(typeof R==='function')setTimeout(()=>R(),0);
      }
    }catch{}
    try{
      if(window.tab && String(window.tab).toLowerCase()==='health'){
        window.tab='tracker';
        if(typeof R==='function')setTimeout(()=>R(),0);
      }
    }catch{}
  }

  function removeHealthLayers(){
    document.getElementById('bt_health_core_layer')?.remove();
    document.getElementById('bt_health_core_mount')?.remove();
    document.getElementById('bt_health_dashboard_327')?.remove();
    document.body.classList.remove('bt-health-core-layer-active','bt-health-core-active');
  }

  function removeHealthTabButtons(){
    const candidates=Array.from(document.querySelectorAll('button,a,[role="button"],.tb'));
    candidates.forEach(el=>{
      const t=txt(el);
      if(t==='health' || /\bhealth\b/.test(t)){
        const navish=el.closest('.tabs,.bottom-nav,.tabbar,[role="navigation"],nav') || el.classList.contains('tb');
        if(navish){
          el.style.display='none';
          el.style.pointerEvents='none';
          el.setAttribute('aria-hidden','true');
        }
      }
    });
  }

  function keepOnlyMainTabs(){
    const bars=Array.from(document.querySelectorAll('.tabs,.bottom-nav,.tabbar,[role="navigation"],nav'));
    bars.forEach(bar=>{
      const items=Array.from(bar.querySelectorAll('button,a,[role="button"],.tb'));
      items.forEach(el=>{
        const t=txt(el);
        if(t==='health'){
          el.style.display='none';
          el.style.pointerEvents='none';
          el.setAttribute('aria-hidden','true');
        }
      });
    });
  }

  function cleanupOldHealthScreen(){
    const body=(document.body.textContent||'').toLowerCase();
    if(!/data health|everything looks good|fix first/.test(body))return;
    forceTrackerIfHealth();
  }

  function apply(){
    removeHealthLayers();
    removeHealthTabButtons();
    keepOnlyMainTabs();
    cleanupOldHealthScreen();
  }

  window.btRemoveHealthTabApply=apply;

  setTimeout(apply,100);
  setTimeout(apply,500);
  setTimeout(apply,1200);
  setTimeout(apply,2500);
  setInterval(apply,1000);
  const obs=new MutationObserver(()=>setTimeout(apply,0));
  setTimeout(()=>{try{obs.observe(document.body,{childList:true,subtree:true,characterData:true})}catch{}},300);
})();
