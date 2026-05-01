/* ✅ Version 3.3.6 Newest update: Lock visible app badge to per-bank Actions folder release after all patches finish loading. */
(function(){
  const VER='3.3.6';
  function lockBadge(){
    const b=document.querySelector('.app-version');
    if(b && b.textContent!=='v'+VER) b.textContent='v'+VER;
    window.btVisibleAppVersion=VER;
  }
  setTimeout(lockBadge,100);
  setTimeout(lockBadge,600);
  setTimeout(lockBadge,1500);
  setTimeout(lockBadge,3000);
  setInterval(lockBadge,2500);
})();
