/* Bonus Tracker v3.4.07 — mobile analyzer viewport and scroll guard. */
(function(){
  'use strict';
  const VER='3.4.07';
  let lastOverlay=null;

  function syncVisualViewport(){
    const vv=window.visualViewport;
    const height=Math.max(320,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight||0));
    const top=Math.max(0,Math.round(vv?.offsetTop||0));
    document.documentElement.style.setProperty('--tca-visual-height',height+'px');
    document.documentElement.style.setProperty('--tca-visual-top',top+'px');
  }

  function prepareAnalyzer(){
    syncVisualViewport();
    const overlay=document.getElementById('tca_overlay');
    if(!overlay){
      document.documentElement.classList.remove('analyzer-open');
      document.body.classList.remove('analyzer-open');
      lastOverlay=null;
      return;
    }

    const box=overlay.querySelector('.tca-box');
    const scroller=overlay.querySelector('.cbg');
    if(!box||!scroller)return;

    document.documentElement.classList.add('analyzer-open');
    document.body.classList.add('analyzer-open');
    box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true');
    box.tabIndex=-1;

    if(lastOverlay!==overlay){
      lastOverlay=overlay;
      const active=document.activeElement;
      if(active&&!overlay.contains(active)&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName||'')){
        try{active.blur()}catch{}
      }
      requestAnimationFrame(()=>{
        scroller.scrollTop=0;
        box.scrollTop=0;
        setTimeout(()=>{
          syncVisualViewport();
          scroller.scrollTop=0;
        },120);
      });
    }
  }

  const observer=new MutationObserver(prepareAnalyzer);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.addEventListener('resize',syncVisualViewport,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(syncVisualViewport,80),{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',syncVisualViewport,{passive:true});
    window.visualViewport.addEventListener('scroll',syncVisualViewport,{passive:true});
  }

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.getElementById('tca_overlay')&&typeof window.tcClosePro==='function')window.tcClosePro();
  });

  window.BT_APP_VERSION=VER;
  window.btReleaseVersion=VER;
  window.btPrepareMobileAnalyzer=prepareAnalyzer;
  syncVisualViewport();
  prepareAnalyzer();
})();
