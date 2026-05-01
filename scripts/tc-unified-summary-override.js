/* ✅ Version 2.15.2 Newest update: Visible summary uses current pasted T&C first; saved source vault is fallback only. */
(function(){
  const VER='2.15.2';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const esc=v=>{if(typeof window.esc==='function')return window.esc(String(v??''));const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;};
  const money=n=>'$'+Number(n||0).toLocaleString();
  const pretty=d=>{try{return typeof fD==='function'?fD(d):new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return d||''}};
  function isTerms(v){return String(v||'').length>200&&/bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking|terms|conditions/i.test(v||'');}

  function rawText(){
    const direct=document.getElementById('tca_raw')?.value||'';
    if(isTerms(direct))return direct;

    const page=Array.from(document.querySelectorAll('textarea'))
      .filter(a=>a.id!=='tca_raw')
      .map(a=>a.value||'')
      .filter(isTerms)
      .sort((a,b)=>b.length-a.length)[0]||'';
    if(isTerms(page))return page;

    try{
      const saved=window.tcGetSavedSource?.()?.raw||window.__btLastTcSource?.raw||'';
      if(isTerms(saved))return saved;
    }catch{}
    return '';
  }
  function card(){
    return Array.from(document.querySelectorAll('.tc-box,.az-area,.card'))
      .filter(el=>!el.querySelector('textarea,input,select'))
      .filter(el=>{const t=el.textContent||'';return t.length<7000&&t.includes('SIMPLE TERMS')&&(t.includes('HOW TO EARN')||t.includes('WHAT COUNTS'))})
      .sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null;
  }
  function linesFromResult(r){
    const lines=[];
    lines.push('<div class="tc-label">SIMPLE TERMS:</div>');
    lines.push(r.tiered?`* Bonus: <span class="hl-money">Tiered ${esc(r.bonusTierText||'')}</span>`:`* Bonus: ${r.bonus?`<span class="hl-money">${money(r.bonus)}</span>`:'Review'}`);
    lines.push(`* Account: ${esc(r.acct||'Review')}`);
    if(r.code)lines.push(`* Promo code: <span class="hl-code">${esc(r.code)}</span>`);
    lines.push(`* Monthly fee: ${r.fee?`<span class="hl-fee">${money(r.fee)}</span>`:'Not clearly stated in pasted T&C'}`);
    if(r.waivers&&r.waivers.length)lines.push(`* Fee waiver: ${esc(r.waivers.slice(0,3).join(' OR '))}`);
    lines.push(`* Early close / payout risk: ${esc(r.early||r.earlyClose?.value||'Keep account open and in good standing until bonus payout.')}`);
    lines.push('');
    lines.push('<span class="hl-section">HOW TO EARN THE BONUS:</span>');
    let step=1;
    lines.push(`* ${step++}. Open one eligible account${r.openBy?` by <span class="hl-days">${pretty(r.openBy)}</span>`:''}${r.code?` using promo code <span class="hl-code">${esc(r.code)}</span>`:''}.`);
    if(r.fundedDays)lines.push(`* ${step++}. Fund the account${r.fundingAmount?` with at least <span class="hl-money">${money(r.fundingAmount)}</span>`:''} within <span class="hl-days">${r.fundedDays} days</span>.`);
    lines.push(`* ${step++}. Complete ${r.count?`at least <span class="hl-days">${r.count}</span> `:''}qualifying Direct Deposits${r.reqMoney?`${r.reqIsTotal?' totaling ':' of '}<span class="hl-money">${money(r.reqMoney)}+</span>${r.reqIsTotal?'':' each'}`:''}${r.reqDays?` within <span class="hl-days">${r.reqDays} days</span>`:''}.`);
    lines.push(`* ${step++}. Bonus payout: ${esc(r.payout||r.payoutText||'payout timing needs review')}.`);
    lines.push('* '+step+'. Keep account open and in good standing until payout.');
    lines.push('');
    lines.push('<span class="hl-section">WHAT COUNTS:</span>');
    (r.counts&&r.counts.length?r.counts:['Review qualifying deposit wording manually']).forEach(x=>lines.push(`* ${esc(x)}`));
    lines.push('');
    lines.push('<span class="hl-section">WHAT DOES NOT COUNT:</span>');
    const nots=(r.not&&r.not.length?r.not:(r.notCounts&&r.notCounts.length?r.notCounts:['Not clearly listed']));
    nots.forEach(x=>lines.push(`* <span class="hl-warn">${esc(x)}</span>`));
    if(r.waivers&&r.waivers.length){
      lines.push('');lines.push('<span class="hl-section">MONTHLY FEE CAN BE AVOIDED WITH:</span>');
      r.waivers.forEach(x=>lines.push(`* ${esc(x)}`));
    }
    lines.push('');
    lines.push('<span class="hl-section">ELIGIBILITY / CHURN:</span>');
    const elig=(r.eligibilityText||r.eligibility?.value||'Review eligibility manually').split('\n').filter(Boolean);
    elig.forEach(x=>lines.push(`* ${esc(x)}`));
    lines.push('');
    lines.push('<span class="hl-section">REVIEW:</span>');
    lines.push(r.clear?'* Qualification path is clear from pasted T&C. Verify exact account type and target tier before applying.':'* Qualification path needs manual review.');
    return `<div class="tc-body">${lines.join('\n')}</div>`;
  }
  function run(){
    const raw=rawText();
    if(!raw||raw.length<200||typeof tcUnifiedAnalyze!=='function')return false;
    const box=card();
    if(!box)return false;
    let result=null;
    try{ result=tcUnifiedAnalyze(raw); }catch(e){ console.warn('[unified-summary] analyze failed',e); return false; }
    if(!result)return false;
    box.dataset.unifiedSummary=VER;
    box.dataset.unifiedEngine=result.version||'';
    box.dataset.bankProfile=result.bankProfilesVersion||'';
    box.dataset.sourcePriority=result.sourcePriority||'';
    box.classList.add('tc-strict-card');
    box.style.height='auto';box.style.maxHeight='none';box.style.minHeight='0';box.style.overflow='visible';
    box.innerHTML=linesFromResult(result);
    return true;
  }
  function sched(){[80,220,500,1000,1800,2600].forEach(ms=>setTimeout(run,ms));}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&/analyz|fill from analyzer|paste|auto.?fill|hide analyzer|show analyzer/i.test(b.textContent||''))sched()},true);
  document.addEventListener('input',e=>{if(e.target&&e.target.tagName==='TEXTAREA')setTimeout(run,300)},true);
  window.tcUnifiedReplaceSimpleTerms=run;
  setTimeout(sched,600);
  const st=document.createElement('style');st.textContent=`.app-version::after{content:' · Unified';opacity:.78}.tc-strict-card{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}`;document.head.appendChild(st);
})();
