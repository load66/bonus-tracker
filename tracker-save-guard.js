/* BonusTracker v3.4.13 — persist source-derived professional fields on every save. */
(function(){
  'use strict';
  const VER='3.4.13';
  function install(){
    const repair=window.btProfessionalRepairWellsPersonal;
    if(typeof repair!=='function')return false;

    const currentNormalize=window.normalizeLifecycleEntry;
    if(typeof currentNormalize==='function'&&!currentNormalize.__btSaveGuard3413){
      const wrapped=function(e){const x=currentNormalize(e);return repair(x)||x};
      wrapped.__btSaveGuard3413=true;
      try{normalizeLifecycleEntry=wrapped}catch{}
      window.normalizeLifecycleEntry=wrapped;
    }

    const currentCollect=window.collectModalEntryData;
    if(typeof currentCollect==='function'&&!currentCollect.__btSaveGuard3413){
      const wrappedCollect=function(){const d=currentCollect.apply(this,arguments);return d?repair(d):d};
      wrappedCollect.__btSaveGuard3413=true;
      try{collectModalEntryData=wrappedCollect}catch{}
      window.collectModalEntryData=wrappedCollect;
    }
    window.btTrackerSaveGuardVersion=VER;
    return true;
  }
  setTimeout(install,0);setTimeout(install,450);setTimeout(install,2100);
})();
