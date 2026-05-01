/* ✅ Version 3.3.6 Newest update: Per-bank Actions folder for cleaner expanded cards. */
(function(){
  const VER='3.3.6';
  const CARD_FLAG='data-bt-bank-actions-card';
  let activeTargets=null;

  function badge(){
    const b=document.querySelector('.app-version');
    if(b)b.textContent='v'+VER;
    window.btVisibleAppVersion=VER;
  }
  function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
  function text(el){return clean(el?.textContent||el?.value||el?.getAttribute?.('aria-label')||el?.getAttribute?.('title')||'');}
  function isVisible(el){
    if(!el||!el.getBoundingClientRect)return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
  }
  function isActionButton(el,rx){
    if(!el||el.closest('#bt_bank_actions_sheet'))return false;
    const t=text(el);
    return rx.test(t);
  }
  function buttonsIn(root){return Array.from(root.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]'));}
  function hasTextButton(root,rx){return buttonsIn(root).some(b=>isActionButton(b,rx));}
  function findButton(root,rx){return buttonsIn(root).find(b=>isActionButton(b,rx));}

  function closestCard(el){
    let p=el;
    for(let i=0;p&&i<12;i++,p=p.parentElement){
      if(!p.getBoundingClientRect)continue;
      const r=p.getBoundingClientRect();
      const t=clean(p.textContent);
      if(r.width>260&&r.height>160&&/\$\d/.test(t)&&/(Opened|OPENED|Working|Countdown|Requirement|Received|RECEIVED|Req Met|REQ MET|Checklist|Mini Countdown|Delete)/.test(t))return p;
    }
    return null;
  }

  function findActionRow(card){
    const update=findButton(card,/^update\s+received$/i);
    if(!update)return null;
    let p=update.parentElement;
    for(let i=0;p&&i<5;i++,p=p.parentElement){
      const t=clean(p.textContent);
      const r=p.getBoundingClientRect?.();
      if(!r)continue;
      const hasEdit=hasTextButton(p,/^edit$/i);
      const hasClose=hasTextButton(p,/^close$/i);
      const hasDelete=hasTextButton(p,/^delete$/i);
      const hasUpdate=hasTextButton(p,/^update\s+received$/i);
      if(hasEdit&&hasClose&&hasDelete&&hasUpdate&&r.width>240&&r.height<140)return p;
    }
    return update.parentElement;
  }

  function findTargets(card){
    const actionRow=findActionRow(card);
    return {
      edit: actionRow ? findButton(actionRow,/^edit$/i) : null,
      updateReceived: actionRow ? findButton(actionRow,/^update\s+received$/i) : findButton(card,/^update\s+received$/i),
      close: actionRow ? findButton(actionRow,/^close$/i) : findButton(card,/^close$/i),
      delete: actionRow ? findButton(actionRow,/^delete$/i) : findButton(card,/^delete$/i),
      addChecklist: findButton(card,/^\+?\s*add\s+checklist\s+step$/i),
      addMiniTimer: findButton(card,/^\+?\s*add\s+mini\s+timer$/i),
      actionRow
    };
  }

  function hideOriginals(targets){
    if(targets.actionRow){
      targets.actionRow.setAttribute('data-bt-hidden-bank-actions','1');
      targets.actionRow.style.display='none';
    }
    [targets.addChecklist,targets.addMiniTimer].forEach(btn=>{
      if(btn){
        btn.setAttribute('data-bt-hidden-bank-actions','1');
        btn.style.display='none';
        const p=btn.parentElement;
        if(p&&clean(p.textContent)===clean(btn.textContent)){
          p.setAttribute('data-bt-hidden-bank-actions','1');
          p.style.display='none';
        }
      }
    });
  }

  function bankNameFromCard(card){
    const t=clean(card.textContent);
    const bad=/^(Working|Countdown Active|Requirement Deadline|Checklist|Mini Countdown Timers|Opened|Received|Req Met|Hold Until|Close Fee|Close Fee Countdown|Done|Edit|Delete|Update Received|Close)$/i;
    const candidates=Array.from(card.querySelectorAll('h1,h2,h3,strong,b,div,span')).map(el=>clean(el.textContent)).filter(s=>s&&s.length>=3&&s.length<=45&&!/\$\d/.test(s)&&!bad.test(s)&&!/^\d+d\b/i.test(s));
    return candidates[0]||'Bank';
  }

  function ensureActionsButton(card,targets){
    let btn=card.querySelector(':scope > .bt-bank-actions-btn, .bt-bank-actions-btn');
    if(btn)return btn;
    btn=document.createElement('button');
    btn.type='button';
    btn.className='bt-bank-actions-btn';
    btn.innerHTML='<span class="bt-ba-ico">⚙️</span><span>Actions</span>';
    btn.onclick=function(e){e.preventDefault();e.stopPropagation();openSheet(card,targets);};
    const anchor=targets.actionRow||card.lastElementChild;
    if(anchor&&anchor.parentElement){anchor.parentElement.insertBefore(btn,anchor.nextSibling);} else card.appendChild(btn);
    return btn;
  }

  function item(label,sub,emoji,key,danger){
    return `<button class="bt-ba-item ${danger?'danger':''}" type="button" data-key="${key}"><span class="emoji">${emoji}</span><span>${label}<small>${sub}</small></span></button>`;
  }
  function openSheet(card,targets){
    activeTargets=targets;
    closeSheet(false);
    const bank=bankNameFromCard(card);
    const backdrop=document.createElement('div');
    backdrop.id='bt_bank_actions_backdrop';
    backdrop.onclick=()=>closeSheet(true);
    const sheet=document.createElement('div');
    sheet.id='bt_bank_actions_sheet';
    sheet.innerHTML=`
      <div class="bt-ba-head"><div><b>Bank Actions</b><small>${bank}</small></div><button type="button" class="bt-ba-x" data-key="cancel">×</button></div>
      <div class="bt-ba-list">
        ${targets.edit?item('Edit Bank','Change bank details','✏️','edit'):''}
        ${targets.updateReceived?item('Mark Bonus Received','Enter bonus received date','🎁','updateReceived'):''}
        ${targets.close?item('Close Account','Record closed date','🔒','close'):''}
        ${targets.addChecklist?item('Add Checklist Step','Add a task to this bank','✅','addChecklist'):''}
        ${targets.addMiniTimer?item('Add Mini Timer','Add a custom countdown','⏱️','addMiniTimer'):''}
        ${targets.delete?item('Delete Bank','Remove this bank entry','🗑️','delete',true):''}
      </div>
    `;
    sheet.addEventListener('click',function(e){
      const b=e.target.closest('button[data-key]');
      if(!b)return;
      const key=b.getAttribute('data-key');
      if(key==='cancel'){closeSheet(true);return;}
      const target=activeTargets&&activeTargets[key];
      closeSheet(true);
      if(target){
        target.style.display='';
        try{target.click();}catch{}
        setTimeout(apply,350);
      }
    });
    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
  }
  function closeSheet(clear=true){
    document.getElementById('bt_bank_actions_sheet')?.remove();
    document.getElementById('bt_bank_actions_backdrop')?.remove();
    if(clear)activeTargets=null;
  }

  function processCard(card){
    if(!card||card.closest('#bt_bank_actions_sheet'))return;
    const targets=findTargets(card);
    if(!targets.updateReceived&&!targets.close&&!targets.delete&&!targets.addChecklist&&!targets.addMiniTimer)return;
    card.setAttribute(CARD_FLAG,'1');
    hideOriginals(targets);
    ensureActionsButton(card,targets);
  }

  function apply(){
    badge();
    addStyle();
    const updateButtons=Array.from(document.querySelectorAll('button,a,[role="button"]')).filter(b=>isActionButton(b,/^update\s+received$/i));
    updateButtons.forEach(b=>processCard(closestCard(b)));
    const expandedAddButtons=Array.from(document.querySelectorAll('button,a,[role="button"]')).filter(b=>isActionButton(b,/^\+?\s*add\s+(checklist\s+step|mini\s+timer)$/i));
    expandedAddButtons.forEach(b=>processCard(closestCard(b)));
  }

  function addStyle(){
    if(document.getElementById('bt_bank_actions_style'))return;
    const st=document.createElement('style');
    st.id='bt_bank_actions_style';
    st.textContent=`
      [data-bt-hidden-bank-actions="1"]{display:none!important;}
      .bt-bank-actions-btn{width:100%;min-height:54px;border:0;border-radius:18px;margin:12px 0 4px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font:900 15px 'DM Sans',system-ui;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 12px 26px rgba(37,99,235,.24);-webkit-tap-highlight-color:transparent}.bt-bank-actions-btn .bt-ba-ico{font-size:18px}
      #bt_bank_actions_backdrop{position:fixed;inset:0;z-index:340;background:rgba(15,23,42,.32);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
      #bt_bank_actions_sheet{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);z-index:341;background:rgba(248,250,252,.98);border:1px solid rgba(148,163,184,.35);border-radius:24px;padding:12px;box-shadow:0 28px 70px rgba(15,23,42,.32);font-family:'DM Sans',system-ui;color:#0f172a;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      .bt-ba-head{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 10px}.bt-ba-head b{display:block;font-size:16px}.bt-ba-head small{display:block;margin-top:2px;color:#64748b;font-size:12px;font-weight:800}.bt-ba-x{border:0;background:#e2e8f0;color:#334155;border-radius:999px;width:34px;height:34px;font-size:23px;font-weight:900;line-height:1}.bt-ba-list{display:grid;gap:8px}.bt-ba-item{width:100%;border:0;border-radius:17px;background:#fff;color:#0f172a;text-align:left;padding:12px 12px;font:900 14px 'DM Sans',system-ui;box-shadow:inset 0 0 0 1px rgba(226,232,240,.95);display:flex;align-items:center;gap:11px}.bt-ba-item .emoji{font-size:20px;width:26px;text-align:center}.bt-ba-item small{display:block;margin-top:2px;color:#64748b;font-size:11px;font-weight:700}.bt-ba-item.danger{background:#fef2f2;color:#dc2626;box-shadow:inset 0 0 0 1px rgba(254,202,202,.95)}
      @media(min-width:700px){#bt_bank_actions_sheet{left:50%;right:auto;transform:translateX(-50%);width:420px;bottom:40px}.bt-ba-list{grid-template-columns:1fr 1fr}.bt-ba-item.danger{grid-column:1/-1}}
    `;
    document.head.appendChild(st);
  }

  window.btBankActionsFolderVersion=VER;
  window.btBankActionsFolderApply=apply;
  window.btBankActionsFolderClose=closeSheet;

  setTimeout(apply,250);
  setTimeout(apply,900);
  setTimeout(apply,1800);
  setInterval(apply,1600);
  const obs=new MutationObserver(()=>setTimeout(apply,0));
  setTimeout(()=>{try{obs.observe(document.body,{childList:true,subtree:true,characterData:true})}catch{}},300);
})();
