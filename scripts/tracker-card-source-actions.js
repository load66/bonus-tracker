/* ✅ Version 3.3.9 Newest update: Compact source-rendered per-bank Actions menu. No DOM scanning or overlay patching. */
(function(){
  const VER='3.3.9';

  window.__btBankActionPrompt=window.__btBankActionPrompt||null;

  function lockSourceActionsBadge(){
    const b=document.querySelector('.app-version');
    if(b)b.textContent='v'+VER;
    window.btVisibleAppVersion=VER;
  }

  function ensureBankActionCompactStyle(){
    if(document.getElementById('bt_source_bank_actions_compact_style'))return;
    const st=document.createElement('style');
    st.id='bt_source_bank_actions_compact_style';
    st.textContent=`
      .bt-ba-compact{padding:10px 14px calc(12px + var(--safe-b))!important;max-height:72dvh!important;overflow-y:auto!important;border-radius:18px 18px 0 0!important;}
      .bt-ba-compact .m-bar{margin-bottom:8px!important;height:4px!important;width:34px!important;}
      .bt-ba-compact .m-hdr{margin-bottom:8px!important;}
      .bt-ba-compact .m-hdr h2{font-size:15px!important;line-height:1.1!important;}
      .bt-ba-identity{display:flex;align-items:center;gap:8px;margin:4px 0 8px;padding:6px 8px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;}
      .bt-ba-identity .blogo{width:30px!important;height:30px!important;border-radius:9px!important;font-size:11px!important;}
      .bt-ba-identity .card-name{font-size:13px!important;line-height:1.1!important;}
      .bt-ba-status{font-size:9px!important;color:#64748B;font-weight:900;letter-spacing:.3px;margin-top:1px;text-transform:uppercase;}
      .bt-ba-list{display:grid;grid-template-columns:1fr;gap:6px;}
      .bt-ba-mini{width:100%;border:0;border-radius:12px;background:#F8FAFC;color:#0F172A;padding:8px 10px;font-family:'DM Sans',system-ui,sans-serif;text-align:left;box-shadow:inset 0 0 0 1px #E2E8F0;display:flex;align-items:center;gap:8px;min-height:46px;cursor:pointer;}
      .bt-ba-mini:active{transform:scale(.985);}
      .bt-ba-mini .ico{width:24px;height:24px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#EFF6FF;font-size:14px;flex-shrink:0;}
      .bt-ba-mini b{display:block;font-size:12px;line-height:1.05;color:inherit;}
      .bt-ba-mini small{display:block;margin-top:2px;font-size:9px;line-height:1.15;color:#94A3B8;font-weight:700;}
      .bt-ba-mini.danger{background:#FEF2F2;color:#DC2626;box-shadow:inset 0 0 0 1px #FECACA;}
      .bt-ba-mini.danger .ico{background:#FEE2E2;}
      .bt-ba-mini.cancel{justify-content:center;text-align:center;background:#E2E8F0;color:#334155;min-height:40px;}
      .bt-ba-mini.cancel .ico{display:none;}
      @media(min-width:520px){.bt-ba-compact{max-width:420px!important;border-radius:18px!important;padding-bottom:14px!important}.bt-ba-list{grid-template-columns:1fr 1fr}.bt-ba-mini.danger,.bt-ba-mini.cancel{grid-column:1/-1}}
    `;
    document.head.appendChild(st);
  }

function openBankActions(id){
  window.__btBankActionPrompt=id;
  R();
}
function closeBankActions(){
  window.__btBankActionPrompt=null;
  R();
}
function runBankAction(id,action){
  const e=entries.find(x=>x.id===id);
  window.__btBankActionPrompt=null;
  if(!e){R();return}
  expanded=id;
  if(action==='edit'){openEdit(id);return}
  if(action==='received'){openRcv(id);return}
  if(action==='close'){closeAcct(id);return}
  if(action==='delete'){delEntry(id);return}
  if(action==='checklist'){
    inlineStateFor(id).checklist=true;
    inlineStateFor(id).timer=false;
    R();
    setTimeout(()=>{const el=document.getElementById('ck_'+id);if(el)el.focus()},0);
    return;
  }
  if(action==='timer'){
    inlineStateFor(id).timer=true;
    inlineStateFor(id).checklist=false;
    R();
    setTimeout(()=>{const el=document.getElementById('tm_txt_'+id);if(el)el.focus()},0);
    return;
  }
  R();
}
function bankActionSheetButton(id,action,icon,title,sub,danger=false){
  return `<button class="bt-ba-mini ${danger?'danger':''}" onclick="event.stopPropagation();runBankAction('${id}','${action}')"><span class="ico">${icon}</span><span><b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span></button>`;
}
function rBankActions(){
  const e=entries.find(x=>x.id===window.__btBankActionPrompt);
  if(!e)return'';
  ensureBankActionCompactStyle();
  let h='<div class="ov" onclick="closeBankActions()"><div class="modal bt-ba-compact" onclick="event.stopPropagation()">';
  h+='<div class="m-bar"></div><div class="m-hdr"><h2>Bank Actions</h2><span class="m-id">'+esc(getEntryDisplayId(e)||e.id||'')+'</span></div>';
  h+='<div class="bt-ba-identity">'+bankLogo(e.bank,true)+'<div><div class="card-name">'+esc(e.bank)+'</div><div class="bt-ba-status">'+esc(status(e)||'')+'</div></div></div>';
  h+='<div class="bt-ba-list">';
  h+=bankActionSheetButton(e.id,'edit','✏️','Edit Bank','Details, dates, bonus, rules');
  if(!e.closed)h+=bankActionSheetButton(e.id,'received','🎁',e.bonusRecd?'Update Received':'Mark Received','Bonus received date');
  if(!e.closed)h+=bankActionSheetButton(e.id,'close','🔒','Close Account','Record closed date');
  if(!e.closed)h+=bankActionSheetButton(e.id,'checklist','✅','Add Checklist','New requirement step');
  if(!e.closed)h+=bankActionSheetButton(e.id,'timer','⏱️','Add Timer','Custom countdown');
  h+=bankActionSheetButton(e.id,'delete','🗑️','Delete Bank','Remove tracker entry',true);
  h+='<button class="bt-ba-mini cancel" onclick="event.stopPropagation();closeBankActions()"><span><b>Cancel</b></span></button>';
  h+='</div></div></div>';
  return h;
}

function rTracker(sorted){
  const q=search.toLowerCase();
  const f=q?sorted.filter(e=>(e.bank||'').toLowerCase().includes(q)||(e.id||'').toLowerCase().includes(q)):sorted;
  let h='';
  const bkd=daysSinceBk();
  if(bkd>=7) h += `<div class="bk-remind">${bkd>=999?'Backup recommended':'Backup updated '+bkd+'d ago'} <button onclick="exportBackup()">Export</button></div>`;

  h += '<div class="qbar">';
  h += quickBtn('blue',I.backup,'Backup','exportBackup()');
  h += quickBtn('green',I.restore,'Restore','importBackup()');
  h += quickBtn('purple',I.quick,'Quick Add','showTemplates=!showTemplates;R()');
  h += quickBtn('red',I.trash,'Reset','resetAllData()');
  h += '</div>';

  if(showTemplates){
    h += '<div class="sec">Quick add templates</div><div class="tgrid">';
    TEMPLATES.forEach((t,i)=>{
      h += `<button class="tbtn" onclick="addFromTpl(${i})">${bankLogo(t.bank,true)}<div class="t-info"><div class="nm">${esc(t.bank)}</div><div class="bn">${fM(t.bonus)}</div></div></button>`;
    });
    h += '</div>';
  }

  h += `<input class="sinput" type="text" placeholder="Search banks..." value="${esc(search)}" oninput="search=this.value;R()">`;
  h += `<button class="tc-btn" onclick="showAnalyzer=!showAnalyzer;R()">${I.spark}<span>${showAnalyzer?'Hide analyzer':'Analyze promo terms'}</span></button>`;
  if(showAnalyzer) h += rAnalyzer();

  if(!f.length){
    return h + '<div class="empty"><div class="em">No banks yet</div><p>Add your first bank with the + button, use Quick Add for templates, or restore a saved backup.</p></div>' + rBankActions();
  }

  h += '<div class="sec">Your banks</div>';

  f.forEach(e=>{
    const s=status(e), isX=expanded===e.id, nr=nextReopen(e), countdown=getCountdown(e), urg=getUrg(e);
    h += `<div class="card u-${urg}">`;
    h += `<div class="card-h" onclick="expanded=expanded==='${e.id}'?null:'${e.id}';R()">`;
    h += `<div class="card-logo-col">${bankLogo(e.bank)}${e.churn?churnTagHtml(e.bank,e.churn):''}</div>`;
    h += `<div class="card-left"><div class="card-name">${esc(e.bank)}</div><div class="card-row">${statusBadgeHtml(e,countdown)}</div></div>`;
    h += '<div class="card-right"><div class="card-right-main">';
    if((s==='WORKING'||s==='CUSTOM TIMER')&&e.bonus) h += `<div class="card-bonus">${fM(e.bonus)}</div>`;
    h += `<div class="card-id">${esc(getEntryDisplayId(e))}</div></div>`;
    h += '</div></div>';

    if(isX){
      h += '<div class="card-exp"><div class="card-grid">';
      if(e.opened) h += `<div class="cf"><div class="k">Opened</div><div class="v">${fD(e.opened)}</div></div>`;
      if(e.closed) h += `<div class="cf"><div class="k">Closed</div><div class="v">${fD(e.closed)}</div></div>`;
      if(e.bonusRecd) h += `<div class="cf"><div class="k">Received</div><div class="v ok">${fD(e.bonusRecd)}</div></div>`;
      if(nr) h += `<div class="cf"><div class="k">Reopen</div><div class="v">${fD(nr)}</div></div>`;
      if(e.reqMet) h += `<div class="cf"><div class="k">Req Met</div><div class="v">${fD(e.reqMet)}</div></div>`;
      if(isCompleted(e)) h += '<div class="cf"><div class="k">Tax</div><div class="v ok">Logged</div></div>';
      if(e.referralBonus) h += `<div class="cf"><div class="k">Referral</div><div class="v"><span class="ref-b">+${fM(e.referralBonus)}</span></div></div>`;
      if(e.minHoldDays>0&&!e.closed){
        const scd=safeCloseDate(e);
        h += `<div class="cf"><div class="k">Hold Until</div><div class="v${daysUntilSafe(e)<=0?' ok':' warn'}">${fD(scd)}</div></div>`;
      }
      if(e.earlyCloseFee>0&&!e.closed){
        const __feeMeta=closeFeeCountdownMeta(e);
        const __feeTitle=safeCloseDate(e)?`Safe close: ${fD(safeCloseDate(e))}`:'Add opened date to calculate';
        h += `<div class="cf"><div class="k">Close Fee</div><div class="v warn">${fM(e.earlyCloseFee)}</div></div>`;
        h += `<div class="cf"><div class="k">Close Fee Countdown</div><div class="v" style="padding-top:2px"><span class="tm-pill ${__feeMeta.cls}" title="${esc(__feeTitle)}" style="margin-left:6px">${esc(__feeMeta.text)}</span></div></div>`;
      }
      h += '</div>';

      if(!e.closed){
        h += '<div class="sec" style="margin-top:6px">Checklist</div><ul class="ck">';
        if(e.checklist&&e.checklist.length){
          e.checklist.forEach((c,ci)=>{
            h += `<li><div class="ckb${c.done?' dn':''}" onclick="event.stopPropagation();toggleCk('${e.id}',${ci})"></div><span class="ck-text${c.done?' dn':''}">${esc(c.text)}</span><span class="ck-del" onclick="event.stopPropagation();rmCk('${e.id}',${ci})">×</span></li>`;
          });
        }
        h += '</ul><div class="ck-add-shell">';
        h += isInlineOpen(e.id,'checklist')
          ? `<div class="inline-form" onclick="event.stopPropagation()"><div class="ck-add"><input id="ck_${e.id}" placeholder="Add step..." onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.stopPropagation();addCk('${e.id}')}" /></div><div class="inline-actions"><button class="inline-btn primary" onclick="event.stopPropagation();addCk('${e.id}')">Add</button><button class="inline-btn secondary" onclick="event.stopPropagation();clearInlineInputs('${e.id}','checklist')">Reset</button><button class="inline-btn ghost" onclick="event.stopPropagation();toggleInlineForm('${e.id}','checklist',false)">Cancel</button></div></div>`
          : '';
        h += '</div>';
        h += '<div class="sec" style="margin-top:8px">Mini Countdown Timers</div><ul class="tm">';
        const __timers=sortCustomTimers(e.customTimers||[]);
        const __timerEditId=inlineStateFor(e.id).timerEdit||'';
        const __editTimer=__timers.find(t=>t.id===__timerEditId)||null;
        if(__timers.length){
          __timers.forEach((t)=>{const meta=timerCountdownMeta(t);h += `<li><div class="ckb${t.done?' dn':''}" onclick="toggleTimer('${e.id}','${t.id||''}')"></div><div class="tm-main"><div class="tm-title${t.done?' dn':''}">${esc(t.text||'Timer')}</div><div class="tm-sub">${timerMetaLine(t)}</div></div><span class="tm-pill ${meta.cls}">${esc(meta.text)}</span><button type="button" class="tm-edit-btn" onclick="event.stopPropagation();openTimerEditor('${e.id}','${t.id||''}')">Edit</button><span class="ck-del" onclick="event.stopPropagation();rmTimer('${e.id}','${t.id||''}')">×</span></li>`;});
        }else{
          h += '<li><div class="tm-main"><div class="tm-sub">Add a custom due date for bank-specific requirements.</div></div></li>';
        }
        h += '</ul><div class="tm-add-shell">';
        h += isInlineOpen(e.id,'timer')
          ? `<div class="inline-form"><div class="tm-add"><input id="tm_txt_${e.id}" placeholder="e.g. Use debit card once"><input id="tm_start_${e.id}" type="date"><input id="tm_days_${e.id}" type="number" inputmode="numeric" min="1" placeholder="Days" onkeydown="if(event.key==='Enter'){upsertTimer('${e.id}')}"></div><div class="inline-actions"><button class="inline-btn primary" onclick="upsertTimer('${e.id}')">Add timer</button><button class="inline-btn secondary" onclick="clearInlineInputs('${e.id}','timer')">Reset</button><button class="inline-btn ghost" onclick="toggleInlineForm('${e.id}','timer',false)">Cancel</button></div></div>`
          : '';
        h += '</div>';
      }

      if(e.notes) h += `<div class="card-notes" style="white-space:pre-wrap;font-size:12px;line-height:1.6">${esc(e.notes)}</div>`;
      if(e.analyzedTC) h += `<div class="tc-box"><div class="tc-label">T&amp;C analysis</div><div class="tc-body">${highlightTC(e.analyzedTC)}</div></div>`;
      h += '';

      h += '<div class="card-btns">';
      h += actionBtn('edit',I.quick,'Actions',`event.stopPropagation();openBankActions('${e.id}')`);
      h += '</div></div>';
    }

    h += '</div>';
  });

  const attentionSug=getAttentionSuggestions();
  const churnSug=getChurnSuggestions();
  if(attentionSug.length||churnSug.length){
    h += '<div class="sec">Suggested next</div>';
    h += '<div class="sug-split">';
    h += '<div class="sug-panel"><div class="sug-panel-h">Needs attention • '+entries.filter(e=>e&&e.bank&&!e.closed).length+' open</div>'+(attentionSug.length?attentionSug.map(s=>`<div class="sug-c">${bankLogo(s.bank,true)}<div class="s-info"><div class="nm">${esc(s.bank)}</div>${s.showBonus&&s.bonus?`<div class="sub">${fM(s.bonus)}</div>`:''}<div class="rsn">${esc(s.rsn)}</div></div></div>`).join(''):'<div class="sug-empty">No urgent items.</div>')+'</div>';
    h += '<div class="sug-panel"><div class="sug-panel-h">Least days to churn</div>'+(churnSug.length?churnSug.map(s=>`<div class="sug-c">${bankLogo(s.bank,true)}<div class="s-info"><div class="nm">${esc(s.bank)}</div>${s.showBonus&&s.bonus?`<div class="sub">${fM(s.bonus)}</div>`:''}<div class="rsn">${esc(s.rsn)}</div></div></div>`).join(''):'<div class="sug-empty">Nothing cooling down yet.</div>')+'</div>';
    h += '</div>';
  }

  return h + rBankActions();
}

  window.btSourceBankActionsVersion=VER;
  window.openBankActions=openBankActions;
  window.closeBankActions=closeBankActions;
  window.runBankAction=runBankAction;
  window.rBankActions=rBankActions;
  window.rTracker=rTracker;

  setTimeout(()=>{try{lockSourceActionsBadge();ensureBankActionCompactStyle();R();}catch(e){console.error('Bank Actions source renderer failed',e);}},0);
})();
