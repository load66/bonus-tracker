/*
 * filename: scripts/tc-unified-pro-wrapper.js
 * version: 2.9.0
 * purpose: Unified Analyzer Pro wrapper. Overrides old Analyzer Pro UI to use tcUnifiedAnalyze().
 * last-touched: unknown
 */
(function(){
  const VER='2.9.0';
  const state={open:false,raw:'',result:null,tierIndex:null};
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const esc=v=>{if(typeof window.esc==='function')return window.esc(String(v??''));const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;};
  const money=n=>'$'+Number(n||0).toLocaleString();
  const pretty=d=>{try{return typeof fD==='function'?fD(d):new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return d||''}};
  function addDaysIso(start,days){try{if(typeof timerDueFromStart==='function')return timerDueFromStart(start,days);if(typeof addD==='function')return addD(start,days);}catch{}const d=new Date(String(start)+'T00:00:00');d.setDate(d.getDate()+(parseInt(days,10)||0));return d.toISOString().split('T')[0];}
  function getModal(){try{return typeof modal!=='undefined'&&modal?modal:null}catch{return null}}
  function analyze(raw){return typeof tcUnifiedAnalyze==='function'?tcUnifiedAnalyze(raw,{tierIndex:state.tierIndex}):{raw,reviewFlags:['Unified engine not loaded. Refresh.']};}
  function badge(ok){return `<span class="tm-pill ${ok?'green':'red'}" style="min-width:auto">${ok?'OK':'Review'}</span>`;}
  function fieldCard(title,value,source,ok){return `<div class="tc-box"><div class="tc-label">${esc(title)} ${badge(ok)}</div><div class="tc-body">${esc(value||'Review')}</div>${source?`<div class="tc-label" style="margin-top:8px">Source snippet</div><div class="tc-body" style="font-size:10px;color:#475569">${esc(source)}</div>`:''}</div>`;}
  function rawFromPage(){
    const tca=document.getElementById('tca_raw')?.value||'';if(tca.length>200)return tca;
    const areas=Array.from(document.querySelectorAll('textarea')).map(a=>a.value||'').filter(v=>/bonus|qualifying|direct deposit|monthly fee|monthly account fee|offer|promo|checking|terms/i.test(v));
    areas.sort((a,b)=>b.length-a.length);return areas[0]||'';
  }
  function render(){
    document.getElementById('tca_overlay')?.remove();
    if(!state.open)return;
    const r=state.result;
    let h=`<div class="cbg tca-bg" onclick="tcClosePro()"><div class="dd-box tca-box" onclick="event.stopPropagation()">`;
    h+=`<h3>✨ Unified Analyzer Pro <span style="font-size:9px;color:#94A3B8">v${VER}</span></h3>`;
    h+=`<div class="sub">One master engine powers Analyzer Pro, simple summary, auto-fill, timers, and saved T&C source.</div>`;
    h+=`<textarea id="tca_raw" class="dd-input" style="height:150px;resize:vertical;line-height:1.45" placeholder="Paste bank promo terms & conditions here...">${esc(state.raw)}</textarea>`;
    h+=`<div class="crow"><button class="c-c" onclick="tcClosePro()">Close</button><button class="c-g" onclick="tcRunPro()">Analyze</button></div>`;
    if(r){
      h+=`<div class="tc-box" style="margin-top:12px"><div class="tc-label">Unified Summary</div><div class="tc-body">Bonus: <b>${esc(r.bonus?money(r.bonus):'Review')}</b> ${badge(!!r.bonus)}\nReq days: <b>${esc(r.reqDays||'Review')}</b> · Funding days: <b>${esc(r.fundedDays||'—')}</b>\nPromo expiration/open-by: <b>${esc(r.openBy?pretty(r.openBy):'Review')}</b>\nEngine: ${esc(r.version||'unknown')}</div></div>`;
      if(r.tiers&&r.tiers.length){
        h+=`<div class="tc-box"><div class="tc-label">Tiered Bonus Detected</div><select id="tca_tier" class="dd-input" onchange="tcSelectTier(this.value)">`;
        r.tiers.forEach((t,i)=>{const sel=(state.tierIndex===null?i===r.tiers.length-1:i===state.tierIndex)?'selected':'';h+=`<option value="${i}" ${sel}>${money(t.bonus)} bonus — ${money(t.requirement)}+ requirement</option>`});
        h+=`</select><div class="tc-body">Default is the highest tier. Choose your target tier before applying.</div></div>`;
      }
      h+=fieldCard('Bank',r.bank,'',!!r.bank);
      h+=fieldCard('Bonus Amount',r.tiered?`Tiered: ${r.bonusTierText}`:(r.bonus?money(r.bonus):''),r.bonusSource,!!r.bonus);
      h+=fieldCard('Promo Code',r.code||r.promoCode?.value||'',r.promoCode?.source,!!(r.code&&!/review/i.test(r.code)));
      h+=fieldCard('Promo Expiration / Open-by Date',r.openBy?pretty(r.openBy):'',r.expiration?.source,!!r.openBy);
      h+=fieldCard('Requirement',`${r.count?`${r.count}+ DDs · `:''}${r.reqMoney?`${money(r.reqMoney)}+ ${r.reqIsTotal?'total':'each'} · `:''}${r.reqDays?`${r.reqDays} days`:''}`,r.reqSource,!!r.reqDays);
      h+=fieldCard('Funding Deadline',r.fundedDays?`${r.fundingAmount?money(r.fundingAmount)+' · ':''}${r.fundedDays} days`:'',r.fundingSource,!!r.fundedDays);
      h+=fieldCard('Monthly Fee',r.fee?`${money(r.fee)} monthly fee`:'',r.monthlyFee?.source||'',!!r.fee);
      h+=fieldCard('How to Avoid Monthly Fee',(r.waivers||[]).join('\n'),'',!!(r.waivers&&r.waivers.length));
      h+=fieldCard('What Counts',(r.counts||[]).join('\n'),'',!!(r.counts&&r.counts.length));
      h+=fieldCard('What Does NOT Count',(r.not||[]).join('\n'),'',!!(r.not&&r.not.length));
      h+=fieldCard('Eligibility / Churn',r.eligibilityText||r.eligibility?.value||'',r.eligibility?.source,!!(r.eligibilityText||r.prior));
      h+=`<div class="tc-box"><div class="tc-label">Action Plan</div><div class="tc-body">${esc(r.actionPlan||'Review manually.')}</div></div>`;
      if(r.reviewFlags&&r.reviewFlags.length)h+=`<div class="tc-box" style="border-color:#F59E0B;background:#FFFBEB"><div class="tc-label">Review Flags</div><div class="tc-body">${esc(r.reviewFlags.map(x=>'⚠️ '+x).join('\n'))}</div></div>`;
      h+=`<div class="crow" style="margin-top:10px"><button class="c-c" onclick="tcCopyPlan()">Copy Plan</button><button class="c-g" onclick="tcApplyPro()">Apply Fields</button></div>`;
      h+=`<button class="btn-p" onclick="tcCreateTimers()" style="margin-top:8px">Create Suggested Mini Timers</button>`;
    }
    h+=`</div></div>`;
    const d=document.createElement('div');d.id='tca_overlay';d.innerHTML=h;document.body.appendChild(d);
  }
  function setModalValueByLabel(labelTests,value){if(!value&&value!==0)return false;const root=document.querySelector('.modal');if(!root)return false;for(const lab of Array.from(root.querySelectorAll('label'))){const txt=clean(lab.textContent).toLowerCase();if(!labelTests.some(t=>txt.includes(t)))continue;const fg=lab.closest('.fg')||lab.parentElement;const input=fg?.querySelector('input,textarea,select');if(!input)continue;input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;}
  function applyToModal(r){const m=getModal();if(!m)return false;m.bank=m.bank||r.bank;if(r.bonus)m.bonus=r.bonus;if(r.code)m.promoCodeText=r.code;if(r.fee)m.monthlyFeeYNText=`Yes — ${money(r.fee)} monthly fee`;if(r.waivers?.length)m.avoidMonthlyFeeText=r.waivers.join('\n');if(r.actionPlan)m.completeBonusText=r.actionPlan;if(r.early)m.earlyTerminationFeeText=r.early;if(r.eligibilityText)m.eligibilityText=r.eligibilityText;if(r.openBy)m.expirationDateText=pretty(r.openBy);if(r.reqDays){m.reqDays=r.reqDays;m.requiredDaysText=String(r.reqDays)}return true;}
  window.tcOpenPro=function(){state.raw=rawFromPage()||state.raw||'';state.result=state.raw?analyze(state.raw):null;state.open=true;render();};
  window.tcClosePro=function(){state.open=false;render();};
  window.tcRunPro=function(){state.raw=document.getElementById('tca_raw')?.value||'';state.result=analyze(state.raw);render();};
  window.tcSelectTier=function(i){state.tierIndex=parseInt(i,10)||0;state.result=analyze(state.raw);render();};
  window.tcApplyPro=function(){const r=state.result;if(!r)return;applyToModal(r);setModalValueByLabel(['bank name'],r.bank||'');setModalValueByLabel(['bonus','amount'],r.bonus||'');setModalValueByLabel(['promo'],r.code||'');setModalValueByLabel(['monthly fee'],r.fee?`Yes — ${money(r.fee)} monthly fee`:'' );setModalValueByLabel(['avoid'],(r.waivers||[]).join('\n'));setModalValueByLabel(['complete'],r.actionPlan||'');setModalValueByLabel(['early termination','termination'],r.early||'');setModalValueByLabel(['eligibility','churn'],r.eligibilityText||'');setModalValueByLabel(['expiration','open-by'],r.openBy?pretty(r.openBy):'');setModalValueByLabel(['how many days','required days','req days'],r.reqDays||'');alert('Unified Analyzer fields applied. Review them, then Save.');state.open=false;try{R()}catch{}render();};
  window.tcCreateTimers=function(){const r=state.result;const m=getModal();if(!r||!m){alert('Open this from inside a bank entry first.');return;}const opened=m.opened||'';const list=Array.isArray(m.customTimers)?m.customTimers:[];let added=0;const mk=(text,date,startDate='',daysRequired=0)=>({id:typeof timerId==='function'?timerId():'tm_'+Math.random().toString(36).slice(2,8),text,date,startDate,daysRequired:Number(daysRequired||0),done:false});const add=t=>{if(!t.date)return;if(list.some(x=>clean(x.text).toLowerCase()===clean(t.text).toLowerCase()&&x.date===t.date))return;list.push(t);added++;};if(r.openBy)add(mk('Promo expiration / open-by deadline',r.openBy));if(opened&&r.reqDays)add(mk('Bonus requirement deadline',addDaysIso(opened,r.reqDays),opened,r.reqDays));if(opened&&r.fundedDays)add(mk('Funding deadline',addDaysIso(opened,r.fundedDays),opened,r.fundedDays));m.customTimers=list;alert(added?`Created ${added} mini timer(s). Tap Save on the bank entry.`:'No new timers added. Set Opened Date first for start+days timers.');state.open=false;try{R()}catch{}render();};
  window.tcCopyPlan=function(){const txt=state.result?.actionPlan||'';if(!txt)return;navigator.clipboard?.writeText(txt).then(()=>alert('Action plan copied.')).catch(()=>alert(txt));};
  function injectButton(){const root=document.querySelector('.modal');if(!root||root.querySelector('.tca-open-btn'))return;const target=root.querySelector('.m-hdr')||root;const btn=document.createElement('button');btn.className='inline-trigger tca-open-btn';btn.type='button';btn.style.cssText='width:100%;margin:0 0 10px;justify-content:center;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-style:solid';btn.innerHTML='✨ Open Unified Analyzer Pro';btn.onclick=()=>window.tcOpenPro();target.insertAdjacentElement('afterend',btn);}
  document.addEventListener('click',()=>setTimeout(injectButton,120),true);setTimeout(injectButton,300);setTimeout(injectButton,1000);
  if(!document.getElementById('tca_style')){const st=document.createElement('style');st.id='tca_style';st.textContent=`.tca-box{max-width:390px;max-height:88dvh;overflow:auto}.tca-box .tc-box{margin-top:8px}.tca-open-btn{font-size:11px}.app-version::after{content:' · Unified';opacity:.78}`;document.head.appendChild(st);}
})();