/* Bonus Tracker v3.4.05 — mobile analyzer runtime guard. */
(function(){
  'use strict';
  const VER='3.4.05';
  let lastOverlay=null;

  function prepareAnalyzer(){
    const overlay=document.getElementById('tca_overlay');
    if(!overlay){
      document.documentElement.classList.remove('analyzer-open');
      document.body.classList.remove('analyzer-open');
      lastOverlay=null;
      return;
    }
    const box=overlay.querySelector('.tca-box');
    if(!box)return;
    document.documentElement.classList.add('analyzer-open');
    document.body.classList.add('analyzer-open');
    box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true');
    box.tabIndex=-1;
    if(lastOverlay!==overlay){
      lastOverlay=overlay;
      requestAnimationFrame(()=>{
        box.scrollTop=0;
        try{box.focus({preventScroll:true})}catch{}
      });
    }
  }

  const observer=new MutationObserver(prepareAnalyzer);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('touchmove',e=>{
    if(e.target&&e.target.closest&&e.target.closest('#tca_overlay .tca-box'))e.stopPropagation();
  },{capture:true,passive:true});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.getElementById('tca_overlay')&&typeof window.tcClosePro==='function')window.tcClosePro();
  });

  window.BT_APP_VERSION=VER;
  window.btReleaseVersion=VER;
  window.btPrepareMobileAnalyzer=prepareAnalyzer;
  prepareAnalyzer();
})();
