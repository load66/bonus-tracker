/* BonusTracker v3.4.30 — professional in-app feedback surfaces. */
(function(){
  'use strict';
  const VER='3.4.30-feedback1';
  const nativeAlert=typeof window.alert==='function'?window.alert.bind(window):null;
  const nativeConfirm=typeof window.confirm==='function'?window.confirm.bind(window):null;

  function text(v){return String(v==null?'':v).trim()}
  function toneFor(message,requested){
    if(requested)return requested;
    return /failed|error|invalid|cannot|required|missing|overdue|warning/i.test(String(message||''))?'danger':'info'
  }
  function ensureToastHost(){
    if(typeof document==='undefined'||!document.body)return null;
    let host=document.getElementById('bt_notice_host');
    if(host)return host;
    host=document.createElement('div');
    host.id='bt_notice_host';
    host.className='bt-notice-host';
    document.body.appendChild(host);
    return host
  }
  function notify(message,opts={}){
    const msg=text(message);if(!msg)return;
    const host=ensureToastHost();
    if(!host){try{nativeAlert&&nativeAlert(msg)}catch{};return}
    const item=document.createElement('div');
    item.className='bt-notice '+toneFor(msg,opts.tone);
    item.setAttribute('role','status');
    const title=document.createElement('div');
    title.className='bt-notice-title';
    title.textContent=text(opts.title)||(toneFor(msg,opts.tone)==='danger'?'Needs attention':'BonusTracker');
    const body=document.createElement('div');
    body.className='bt-notice-body';
    body.textContent=msg;
    item.appendChild(title);item.appendChild(body);
    host.appendChild(item);
    const ttl=Math.max(2200,Number(opts.duration||4200));
    setTimeout(()=>{try{item.classList.add('leaving');setTimeout(()=>item.remove(),180)}catch{}},ttl);
    return item
  }
  function confirmDialog(message,opts={}){
    const msg=text(message);
    return new Promise(resolve=>{
      if(typeof document==='undefined'||!document.body){
        let ok=false;try{ok=nativeConfirm?!!nativeConfirm(msg):false}catch{}
        resolve(ok);return
      }
      const old=document.getElementById('bt_confirm_overlay');if(old)old.remove();
      const overlay=document.createElement('div');
      overlay.id='bt_confirm_overlay';
      overlay.className='bt-confirm-overlay';
      overlay.setAttribute('role','presentation');
      const box=document.createElement('div');
      box.className='bt-confirm-sheet';
      box.setAttribute('role','dialog');
      box.setAttribute('aria-modal','true');
      const kicker=document.createElement('div');
      kicker.className='bt-confirm-kicker';
      kicker.textContent=text(opts.kicker)||'Confirm action';
      const title=document.createElement('h3');
      title.textContent=text(opts.title)||'Please review';
      const body=document.createElement('div');
      body.className='bt-confirm-message';
      body.textContent=msg;
      const actions=document.createElement('div');
      actions.className='bt-confirm-actions';
      const cancel=document.createElement('button');
      cancel.type='button';cancel.className='bt-confirm-btn secondary';
      cancel.textContent=text(opts.cancelLabel)||'Cancel';
      const ok=document.createElement('button');
      ok.type='button';ok.className='bt-confirm-btn '+(opts.danger?'danger':'primary');
      ok.textContent=text(opts.confirmLabel)||'Continue';
      actions.appendChild(cancel);actions.appendChild(ok);
      box.appendChild(kicker);box.appendChild(title);box.appendChild(body);box.appendChild(actions);
      overlay.appendChild(box);document.body.appendChild(overlay);
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;try{overlay.remove()}catch{};resolve(value)};
      cancel.addEventListener('click',()=>finish(false));
      ok.addEventListener('click',()=>finish(true));
      overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});
      try{ok.focus()}catch{}
    })
  }

  window.btNotify=notify;
  window.btConfirmDialog=confirmDialog;
  window.alert=function(message){notify(message)};
  window.btUiFeedbackVersion=VER;
})();