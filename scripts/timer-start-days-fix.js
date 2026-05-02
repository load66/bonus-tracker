/*
 * filename: scripts/timer-start-days-fix.js
 * version: 3.3.33
 * purpose: Fix Start + Days / Due Date mode switching inside the countdown timer modal.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.33';
  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();

  function readTimerModal(){
    try{return (0,eval)('timerEditModal')}catch{return window.timerEditModal||null}
  }

  function writeTimerModal(value){
    window.timerEditModal=value;
    try{window.__btTimerModePatchValue=value;(0,eval)('timerEditModal=window.__btTimerModePatchValue')}catch{}
  }

  function render(){try{if(typeof R==='function')R()}catch{try{window.R&&window.R()}catch{}}}

  function isTimerBox(el){
    const box=el?.closest?.('.dd-box,.cbg,.modal,body');
    if(!box)return null;
    return (box.querySelector?.('#tem_text,#tem_start')||/countdown timer/i.test(box.textContent||''))?box:null;
  }

  function switchMode(mode){
    const old=readTimerModal();
    if(!old)return false;
    const next={...old};
    next.mode=mode==='days'?'days':'due';
    const text=document.getElementById('tem_text');
    const start=document.getElementById('tem_start');
    const days=document.getElementById('tem_days');
    if(text)next.text=text.value||'';
    if(start)next.startDate=start.value||'';
    if(days)next.daysRequired=days.value||'';
    if(next.mode==='due')next.daysRequired='';
    writeTimerModal(next);
    render();
    setTimeout(()=>{try{document.getElementById('tem_text')?.focus()}catch{}},0);
    return true;
  }

  document.addEventListener('click',function(e){
    const btn=e.target?.closest?.('button');
    if(!btn||!isTimerBox(btn))return;
    const text=clean(btn.textContent).toLowerCase();
    if(text.includes('start + days')){
      e.preventDefault();
      e.stopImmediatePropagation();
      switchMode('days');
      return;
    }
    if(text.includes('due date')){
      e.preventDefault();
      e.stopImmediatePropagation();
      switchMode('due');
    }
  },true);

  window.btTimerStartDaysFixStatus=function(){return{version:VER,hasTimerModal:!!readTimerModal(),mode:readTimerModal()?.mode||''}};
})();
