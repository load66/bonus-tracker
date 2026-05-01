/* ✅ Version 3.3.7 Newest update: Roll back broken per-bank Actions folder and restore clicks. */
(function(){
  const VER='3.3.7';
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
