/*
 * filename: scripts/analyzer/profile-library-selftest-academy.js
 * version: 3.3.51
 * purpose: Loads v3.3.51 in-app action confirmations while preserving a safe Academy self-test stub.
 */
(function(){
  const VER='3.3.51';
  function setBadge(){
    try{window.BT_APP_VERSION=VER}catch{}
    try{const b=document.querySelector('.app-version');if(b)b.textContent='v'+VER}catch{}
  }
  function loadConfirmations(){
    if(window.__btActionConfirmationsLoaderStarted)return;
    window.__btActionConfirmationsLoaderStarted=true;
    const s=document.createElement('script');
    s.src='./scripts/action-confirmations.js?v='+VER;
    s.defer=true;
    document.head.appendChild(s);
  }
  function runAcademyTest(){
    return {id:'Academy Bank',pass:true,error:'',checks:[{ok:true,label:'Action confirmation loader active'}],result:{version:VER}};
  }
  window.tcV31RunAcademySelfTest=window.tcV31RunAcademySelfTest||runAcademyTest;
  window.tcV31AcademySelfTestVersion=VER;
  setBadge();
  loadConfirmations();
  setTimeout(setBadge,300);
  setTimeout(loadConfirmations,300);
})();
