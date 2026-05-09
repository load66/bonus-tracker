/*
 * filename: controller.js
 * version: 3.3.40
 * purpose: Analyzer v3 Controller renders stable summaries and makes Auto-fill New Entry open the real entry modal.
 * last-touched: unknown
 */
(function(){
  const VER='3.3.67';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const esc=v=>{if(window.esc)return window.esc(String(v??''));const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
  const money=n=>'$'+Number(n||0).toLocaleString();
  const pretty=d=>{try{return window.fD?window.fD(d):new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return d||''}};
  const isTerms=v=>String(v||'').length>160&&/(bonus|offer|eligible|qualifying|direct deposit|checking|monthly fee|terms|conditions|promo|bonus chart|qualification period)/i.test(v||'');
  function analyze(raw,opts){return window.tcV3Analyze?window.tcV3Analyze(raw,opts):null}
  function currentResult(raw){return analyze(raw)||window.__tcV3AnalysisResult||null}
  function profileStatusLine(r){
    const p=r?.profileRegistry;
    if(!p)return '';
    const color=p.known?'#16a34a':'#d97706';
    const label=p.known?(p.status==='saved'?'Already saved profile':'Generic-covered profile'):'New profile needed';
    const note=p.known?(p.note||'Saved reusable profile found.'):'No exact saved profile found yet.';
    return `<div style="margin:0 0 12px 0;padding:10px 12px;border-radius:14px;background:${p.known?'#ecfdf5':'#fffbeb'};border:1px solid ${p.known?'#bbf7d0':'#fde68a'};color:#0f172a;font-size:13px;line-height:1.35"><b style="color:${color}">Profile: ${esc(label)}</b><br><span style="color:#64748b">${esc(note)}</span></div>`;
  }
  function actionLines(r){
    if(r?.forceActionPlan&&r.actionPlan)return String(r.actionPlan).split('\n').filter(Boolean);
    const lines=[];let step=1;
    lines.push(`${step++}. Open one eligible account${r.openBy?' by '+pretty(r.openBy):''}${r.code&&!/Required/i.test(r.code)?' using promo code '+r.code:''}.`);
    if(r.fundedDays)lines.push(`${step++}. Deposit new money / fund the account${r.fundingAmount?' with at least '+money(r.fundingAmount):''} within ${r.fundedDays} days.`);
    if(r.holdDays||r.minHoldDays)lines.push(`${step++}. Maintain the required new-money balance for ${r.holdDays||r.minHoldDays} days.`);
    if(r.requirementType==='transactions')lines.push(`${step++}. Complete ${r.count||''} qualifying transactions${r.reqDays?' within '+r.reqDays+' days':''}.`);
    else lines.push(`${step++}. Complete ${r.count?'at least '+r.count+' ':''}qualifying Direct Deposits${r.reqMoney?`${r.reqIsTotal?' totaling ':' of '}${money(r.reqMoney)}+${r.reqIsTotal?'':' each'}`:''}${r.reqDays?' within '+r.reqDays+' days':''}.`);
    lines.push(`${step++}. Bonus payout: ${r.payout||'payout timing needs review'}.`);
    lines.push(`${step++}. Keep account open and in good standing until payout.`);
    return lines;
  }
  function summaryHtml(r){
    if(!r)return'';
    const lines=[];
    lines.push(profileStatusLine(r));
    lines.push('<div class="tc-label">SIMPLE TERMS:</div>');
    lines.push(r.tiered?`* Bonus: <span class="hl-money">Tiered ${esc(r.bonusTierText)}</span>`:`* Bonus: ${r.bonus?`<span class="hl-money">${money(r.bonus)}</span>`:'Review'}`);
    lines.push(`* Account: ${esc(r.acct||'Review')}`);
    lines.push(`* Account type: ${esc((detectAccountType(r)==='business'?'Business':detectAccountType(r)==='personal'?'Personal':'Personal'))}`);
    if(r.code)lines.push(`* Promo code: <span class="hl-code">${esc(r.code)}</span>`);
    lines.push(`* Monthly fee: ${r.fee?`<span class="hl-fee">${money(r.fee)}</span>`:'Not clearly stated in pasted T&C'}`);
    if(r.waivers?.length)lines.push(`* Fee waiver: ${esc(r.waivers.slice(0,3).join(' OR '))}`);
    lines.push(`* Early close / payout risk: ${esc(r.early||'Keep account open and in good standing until payout.')}`);
    lines.push('');
    lines.push('<span class="hl-section">HOW TO EARN THE BONUS:</span>');
    actionLines(r).forEach(x=>lines.push(`* ${esc(x).replace(/(\$[0-9,]+\+?)/g,'<span class="hl-money">$1</span>').replace(/(\b\d+\s*days?\b|day\s*\d+|May\s+\d{1,2},\s+20\d{2})/gi,'<span class="hl-days">$1</span>')}`));
    lines.push('');
    lines.push('<span class="hl-section">WHAT COUNTS:</span>');
    (r.counts?.length?r.counts:['Review qualifying deposit wording manually']).forEach(x=>lines.push(`* ${esc(x)}`));
    lines.push('');
    lines.push('<span class="hl-section">WHAT DOES NOT COUNT:</span>');
    (r.not?.length?r.not:['Not clearly listed']).forEach(x=>lines.push(`* <span class="hl-warn">${esc(x)}</span>`));
    if(r.waivers?.length){lines.push('');lines.push('<span class="hl-section">MONTHLY FEE CAN BE AVOIDED WITH:</span>');r.waivers.forEach(x=>lines.push(`* ${esc(x)}`));}
    lines.push('');
    lines.push('<span class="hl-section">ELIGIBILITY / CHURN:</span>');
    (r.eligibilityText?r.eligibilityText.split('\n'):['Review eligibility manually']).filter(Boolean).forEach(x=>lines.push(`* ${esc(x)}`));
    if(r.profileFallbacks?.length){lines.push('');lines.push('<span class="hl-section">KNOWN PROFILE FALLBACK:</span>');lines.push(`* ${esc(r.profileFallbackSummary||'Saved profile filled missing fields. Verify against current T&C.')}`);r.profileFallbacks.slice(0,6).forEach(x=>lines.push(`* ${esc(x.field)}: <span class="hl-days">${esc(x.value)}</span>`));}
    lines.push('');
    lines.push('<span class="hl-section">REVIEW:</span>');
    lines.push(r.clear?'* Qualification path is clear from pasted T&C. Verify account type, offer code, and target tier before applying.':'* Qualification path needs manual review.');
    if(r.weirdWordingDetected?.length){lines.push('');lines.push('<span class="hl-section">WORDING NORMALIZED:</span>');r.weirdWordingDetected.slice(0,8).forEach(x=>lines.push(`* ${esc(x.term)} → ${esc(x.meaning)}`));if(r.weirdWordingDetected.length>8)lines.push(`* ${r.weirdWordingDetected.length-8} more wording notes`);}
    if(r.sourceSnippets?.length){lines.push('');lines.push('<span class="hl-section">SOURCE SNIPPETS:</span>');r.sourceSnippets.slice(0,10).forEach(x=>lines.push(`* <b>${esc(x.field)}</b> (${esc(x.confidence||'medium')}): ${esc(x.source).slice(0,220)}`));if(r.sourceSnippets.length>10)lines.push(`* ${r.sourceSnippets.length-10} more snippets in issue report`);}
    lines.push('');
    lines.push(`<span style="font-size:10px;color:#94a3b8">Source: ${esc(r.sourceKind||'unknown')} · Engine v3</span>`);
    return `<div class="tc-body">${lines.join('\n')}</div>`;
  }
  function findSummaryCard(){return Array.from(document.querySelectorAll('.tc-box,.az-area,.card')).filter(el=>!el.querySelector('textarea,input,select')).filter(el=>{const t=el.textContent||'';return t.includes('SIMPLE TERMS')&&(t.includes('HOW TO EARN')||t.includes('WHAT COUNTS'))}).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
  function findRaw(){const tca=document.getElementById('tca_raw')?.value||'';if(isTerms(tca))return tca;const areas=Array.from(document.querySelectorAll('textarea')).map(a=>a.value||'').filter(isTerms).sort((a,b)=>b.length-a.length);return areas[0]||''}
  function renderSummary(){const raw=findRaw();if(!raw)return false;const r=currentResult(raw);const card=findSummaryCard();if(!card||!r)return false;card.dataset.v3='true';card.dataset.sourceKind=r.sourceKind||'';card.style.height='auto';card.style.maxHeight='none';card.style.overflow='visible';card.innerHTML=summaryHtml(r);return true}
  function modalObj(){try{return modal||window.modal||null}catch{return window.modal||null}}
  function analyzerEarlyFeeText(r){const fee=r?.earlyCloseFee||r?.earlyTerminationFee;const n=parseInt(String(fee||'').replace(/[$,]/g,''),10)||0;if(n>0)return String(n);if(/no early close fee|no fee|none/i.test(String(r?.early||'')))return 'None';return ''}
  function analyzerEligibilityText(r){const parts=[];if(r?.eligibilityText)parts.push(r.eligibilityText);if(r?.early&&/closed|restricted|payout|good standing/i.test(r.early))parts.push(r.early);return Array.from(new Set(parts.map(clean).filter(Boolean))).join('\n')}
  function normalizeAccountType(v){v=String(v||'').toLowerCase().trim();if(/^(business|biz|b|commercial)$/.test(v))return'business';if(/^(personal|consumer|individual|p)$/.test(v))return'personal';return''}
  function detectAccountType(r){const direct=normalizeAccountType(r?.accountType);if(direct)return direct;const text=[r?.bank,r?.acct,r?.raw,r?.actionPlan,r?.eligibilityText].filter(Boolean).join(' ');if(/\b(biz|business|commercial|merchant|llc|ein|dba|sole proprietor|business checking|small business)\b/i.test(text))return'business';return'personal'}
  function payoutDaysFromText(txt){txt=String(txt||'');if(/within\s+15|fifteen/i.test(txt))return 15;if(/within\s+30|thirty|up to\s+30/i.test(txt))return 30;if(/within\s+60|sixty/i.test(txt))return 60;if(/120th day|day\s*120/i.test(txt))return 30;return 0}
  function makeSuggestedTimers(r,opened=''){
    const mk=(text,date='',startDate='',daysRequired=0)=>({id:window.timerId?window.timerId():'tm_'+Math.random().toString(36).slice(2,8),text:clean(text),date:date||'',startDate:startDate||'',daysRequired:Number(daysRequired||0),done:false});
    const out=[];
    const addDaysTimer=(text,days)=>{days=Number(days||0)||0;if(days>0)out.push(mk(text,opened?addDaysIso(opened,days):'',opened,days));};
    const source=(r?.suggestedTimers&&r.suggestedTimers.length)?r.suggestedTimers:[];
    source.forEach(t=>{const days=Number(t.daysRequired||t.days||0)||0;if(t.date)out.push(mk(t.text||'Suggested deadline',t.date,'',0));else if(days)addDaysTimer(t.text||'Suggested timer',days);});
    if(r?.openBy)out.push(mk('Promo expiration / open-by deadline',r.openBy));
    if(r?.fundedDays)addDaysTimer('Deposit new money / funding deadline',r.fundedDays);
    if(r?.holdDays||r?.minHoldDays)addDaysTimer('Maintain required balance / hold check',r.holdDays||r.minHoldDays);
    if(r?.reqDays)addDaysTimer(r.requirementType==='transactions'?'Complete qualifying transactions':'Bonus requirement deadline',r.reqDays);
    const pDays=payoutDaysFromText(r?.payout||r?.payoutText||'');
    if(r?.reqDays&&pDays){
      addDaysTimer('Bonus payout watch',Number(r.reqDays)+pDays);
      addDaysTimer('Close review after payout',Number(r.reqDays)+pDays+5);
    }
    const seen=new Set();
    return out.filter(t=>{const k=clean(t.text).toLowerCase()+'|'+String(t.daysRequired||'')+'|'+String(t.date||'');if(!t.text||seen.has(k))return false;seen.add(k);return true});
  }
  function mergeSuggestedTimers(existing,r,opened=''){
    const base=Array.isArray(existing)?existing.slice():[];
    const sig=x=>clean(x?.text||'').toLowerCase()+'|'+String(x?.daysRequired||'')+'|'+String(x?.date||'');
    const seen=new Set(base.map(sig));
    makeSuggestedTimers(r,opened).forEach(t=>{const k=sig(t);if(!seen.has(k)){base.push(t);seen.add(k)}});
    return base;
  }
  function applyToModal(r){const m=modalObj();if(!m||!r)return false;m.bank=m.bank||r.bank;m.accountType=normalizeAccountType(m.accountType)||detectAccountType(r);if(r.bonus)m.bonus=r.bonus;if(r.reqDays)m.reqDays=r.reqDays;if(r.reqMoney)m.dataPoint=m.dataPoint||('DD '+money(r.reqMoney)+(r.reqDays?' within '+r.reqDays+' days':''));if(r.code)m.promoCodeText=r.code;if(r.openBy)m.expirationDateText=pretty(r.openBy);if(r.fee)m.monthlyFeeYNText=`Yes — ${money(r.fee)} monthly fee`;if(r.waivers?.length)m.avoidMonthlyFeeText=r.waivers.join('\n');if(r.actionPlan)m.completeBonusText=r.actionPlan;const elig=analyzerEligibilityText(r);if(elig)m.eligibilityText=elig;const earlyFee=analyzerEarlyFeeText(r);if(earlyFee)m.earlyTerminationFeeText=earlyFee;if(r.fundedDays)m.fundedDays=r.fundedDays;if(r.fundingAmount){m.fundingAmount=r.fundingAmount;m.fundingAmountText=money(r.fundingAmount)}if(r.payout||r.payoutText)m.payoutTimingText=r.payout||r.payoutText;if(r.closeRuleBasis)m.closeRuleBasis=r.closeRuleBasis;if(r.closeRuleDays){m.minHoldDays=r.closeRuleDays;m.closeFeeCountdownDays=String(r.closeRuleDays)}else if(r.holdDays)m.minHoldDays=r.holdDays;if(r.closeRuleText)m.closeRuleText=r.closeRuleText;if(r.closeBufferDays)m.closeBufferDays=r.closeBufferDays;m.customTimers=mergeSuggestedTimers(m.customTimers,r,m.opened||'');m.tcAnalysisResult=r;m.tcSourceRaw=r.raw;m.tcSourceId=r.sourceId;try{window.tcV3SaveSourceForCurrentEntry&&window.tcV3SaveSourceForCurrentEntry(r.raw,{bank:r.bank})}catch{}return true}
  function addDaysIso(start,days){try{if(window.addD)return window.addD(start,days)}catch{}const d=new Date(start+'T00:00:00');d.setDate(d.getDate()+Number(days||0));return d.toISOString().split('T')[0]}
  function createTimers(r){const m=modalObj();if(!m||!r)return 0;m.customTimers=Array.isArray(m.customTimers)?m.customTimers:[];const before=m.customTimers.length;m.customTimers=mergeSuggestedTimers(m.customTimers,r,m.opened||'');return m.customTimers.length-before}
  function issueReport(r){
    r=r||window.__tcV3AnalysisResult||currentResult(findRaw());
    if(!r)return'No analyzer result found.';
    const snippets=(r.sourceSnippets||[]).map(x=>`${x.field} [${x.confidence||'medium'}${x.kind?'/'+x.kind:''}]: ${x.source}`).join('\n');
    const fallbacks=(r.profileFallbacks||[]).map(x=>`${x.field}: ${x.value} :: ${x.source}`).join('\n');
    const weird=(r.weirdWordingDetected||[]).map(x=>x.term+' -> '+x.meaning).join(' | ')||'None';
    const flags=(r.reviewFlags||[]).join(' | ')||'None';
    const bankRules=(r.bankRulesApplied||[]).join(' | ')||'None';
    const appVersion=document.querySelector('.app-version')?.textContent||'unknown';
    const raw=String(r.raw||'').slice(0,15000);
    return [
      'CHATGPT FIX PROMPT — BANK BONUS TRACKER ANALYZER',
      '',
      'I am pasting this from my Bank Bonus Tracker app. Please use it as a ready repair prompt.',
      '',
      'USER-VISIBLE PROBLEM:',
      '[Replace this line with what looked wrong in the app, for example: analyzer picked the wrong bonus amount, missed promo code, wrong requirement days, bad profile fallback, or confusing summary.]',
      '',
      'EXPECTED RESULT, IF KNOWN:',
      '[Optional: write the correct bonus / requirement / deadline / fee / payout wording here.]',
      '',
      'WHAT I NEED FROM YOU:',
      '1. Diagnose the issue using the structured report below.',
      '2. Decide whether the issue is in analyzer engine, bank-rule file, profile fallback, controller display, source resolver, or app/cache/versioning.',
      '3. Use SOURCE SNIPPETS first, PROFILE FALLBACKS second, and SOURCE T&C last.',
      '4. Tell me the exact file(s) and function(s) that need changes.',
      '5. If I uploaded the latest project zip in this chat, make the fix from that zip and give me changed files only plus a full backup zip.',
      '6. Do not push directly to GitHub unless I explicitly say to.',
      '7. Preserve current working behavior unless the report proves it is wrong.',
      '',
      'IMPORTANT CONTEXT:',
      '- This is a static GitHub Pages app, not an API-backed app.',
      '- Mobile Safari/PWA cache can show stale behavior, so check version markers before assuming upload failure.',
      '- The analyzer should never silently trust profile fallback. It must label profile fallback clearly.',
      '- If extraction is uncertain, prefer review warnings over false confidence.',
      '',
      'STRUCTURED REPORT:',
      'App Version: '+appVersion,
      'Engine: '+(window.tcV3EngineVersion||'unknown'),
      'Bank Rules: '+(window.tcV3BankRulesVersion||'unknown'),
      'Profile Registry: '+(window.tcV3ProfileRegistryVersion||'unknown'),
      'Weird Wording Normalizer: '+(window.tcWeirdWordingNormalizerVersion||'unknown'),
      'Source: '+(r.sourceKind||'unknown'),
      'Source ID: '+(r.sourceId||'none'),
      'Source Length: '+(r.sourceLength||raw.length||0),
      '',
      'EXTRACTED FIELDS:',
      'Bank: '+(r.bank||'Review'),
      'Account: '+(r.acct||'Review'),
      'Account Type: '+detectAccountType(r),
      'Bonus: '+(r.bonus||'Review'),
      'Selected Tier: '+(r.bonusTierText||'None'),
      'Promo Code: '+(r.code||'Review'),
      'Open-by / Expiration: '+(r.openBy||'Review'),
      'Requirement Days: '+(r.reqDays||'Review'),
      'Requirement Amount: '+(r.reqMoney||'Review'),
      'Requirement Is Total: '+(r.reqIsTotal?'yes':'no/unknown'),
      'Required Count: '+(r.count||'—'),
      'Funding Days: '+(r.fundedDays||'—'),
      'Funding Amount: '+(r.fundingAmount||'—'),
      'Hold Days: '+(r.holdDays||r.minHoldDays||'—'),
      'Close Rule Basis: '+(r.closeRuleBasis||'opened'),
      'Close Rule Days: '+(r.closeRuleDays||'—'),
      'Close Rule Text: '+(r.closeRuleText||'—'),
      'Monthly Fee: '+(r.fee||'Review/None'),
      'Payout: '+(r.payout||r.payoutText||'Review'),
      '',
      'ANALYZER FLAGS:',
      flags,
      '',
      'RULES / PROFILE:',
      'Rules Applied: '+bankRules,
      'Profile Note: '+(r.profileRegistry?.note||'not checked'),
      'Profile Known: '+(r.profileKnown?'yes':'no'),
      'Profile Status: '+(r.profileStatus||'unknown'),
      'Profile Fallback Summary: '+(r.profileFallbackSummary||'None'),
      '',
      'WEIRD WORDING:',
      weird,
      '',
      'SOURCE SNIPPETS:',
      snippets||'None',
      '',
      'PROFILE FALLBACKS:',
      fallbacks||'None',
      '',
      'ACTION PLAN GENERATED BY APP:',
      r.actionPlan||'None',
      '',
      'SOURCE T&C:',
      raw
    ].join('\n')
  }
  function copyIssueReport(){const txt=issueReport();navigator.clipboard?.writeText(txt).then(()=>alert('ChatGPT-ready fix prompt copied. Paste it into ChatGPT with a short note about what looked wrong.')).catch(()=>alert(txt))}
  function openPro(){const src=window.tcV3ResolveSource?window.tcV3ResolveSource(findRaw()):{raw:findRaw()};let r=analyze(src.raw);document.getElementById('tca_overlay')?.remove();let h=`<div class="cbg" onclick="tcClosePro()"><div class="dd-box tca-box" onclick="event.stopPropagation()"><h3>✨ Unified Analyzer Pro <span style="font-size:9px;color:#94A3B8">v3.3.67</span></h3><div class="sub">Clean v3 pipeline: current pasted text first, entry saved source second, vault fallback last.</div><textarea id="tca_raw" class="dd-input" style="height:150px;line-height:1.45">${esc(src.raw||'')}</textarea><div class="crow"><button class="c-c" onclick="tcClosePro()">Close</button><button class="c-g" onclick="tcRunPro()">Analyze</button></div><div id="tcv3_result">${summaryHtml(r)}</div>`;if(r?.tiers?.length){h+=`<div class="tc-box"><div class="tc-label">Target tier</div><select class="dd-input" onchange="tcV3SelectTier(this.value)">`;r.tiers.forEach((t,i)=>h+=`<option value="${i}" ${i===r.tiers.length-1?'selected':''}>${money(t.bonus)} bonus — ${money(t.requirement)}+</option>`);h+=`</select></div>`}h+=`<div class="crow"><button class="c-c" onclick="tcCopyIssueReport()">🧾 Copy ChatGPT Fix Prompt</button><button class="c-g" onclick="tcApplyPro()">Apply Fields</button></div><button class="btn-p" style="margin-top:8px" onclick="tcCreateTimers()">Create Suggested Mini Timers</button></div></div>`;const d=document.createElement('div');d.id='tca_overlay';d.innerHTML=h;document.body.appendChild(d)}
  function resultPlainText(r){
    if(!r)return'';
    const box=document.createElement('div');
    box.innerHTML=summaryHtml(r);
    return clean((box.textContent||'').replace(/SIMPLE TERMS:/g,'SIMPLE TERMS:\n').replace(/HOW TO EARN THE BONUS:/g,'\nHOW TO EARN THE BONUS:\n').replace(/WHAT COUNTS:/g,'\nWHAT COUNTS:\n').replace(/WHAT DOES NOT COUNT:/g,'\nWHAT DOES NOT COUNT:\n').replace(/MONTHLY FEE CAN BE AVOIDED WITH:/g,'\nMONTHLY FEE CAN BE AVOIDED WITH:\n').replace(/ELIGIBILITY \/ CHURN:/g,'\nELIGIBILITY / CHURN:\n').replace(/REVIEW:/g,'\nREVIEW:\n'));
  }
  function buildEntryFromResult(r){
    if(!r)return null;
    const feeText=r.fee?`Yes — ${money(r.fee)} monthly fee`:'';
    const reqDays=parseInt(r.reqDays||r.fundedDays||r.holdDays||0,10)||0;
    const minHold=parseInt(r.closeRuleDays||r.holdDays||0,10)||0;
    let earlyFee=0;
    const earlyFeeText=analyzerEarlyFeeText(r);
    try{if(typeof parseCloseFeeAmount==='function')earlyFee=parseCloseFeeAmount(earlyFeeText)||0}catch{}
    const complete=r.actionPlan||actionLines(r).join('\n');
    const eligibilityOut=analyzerEligibilityText(r);
    const analyzed=resultPlainText(r);
    return {
      bank:r.bank||'',
      accountType:detectAccountType(r),
      bonus:parseInt(r.bonus||0,10)||0,
      churn:'',
      opened:'',
      closed:'',
      bonusRecd:'',
      reqMet:'',
      notes:'',
      analyzedTC:analyzed,
      minHoldDays:minHold,
      closeRuleBasis:r.closeRuleBasis||'opened',
      closeBufferDays:parseInt(r.closeBufferDays||3,10)||3,
      closeRuleText:r.closeRuleText||'',
      monthlyFeeChecked:false,
      earlyCloseFee:earlyFee,
      reqDays:reqDays,
      referralBonus:0,
      dataPoint:'',
      fundedDays:parseInt(r.fundedDays||0,10)||0,
      fundingAmount:parseInt(r.fundingAmount||0,10)||0,
      fundingAmountText:r.fundingAmount?money(r.fundingAmount):'',
      payoutTimingText:r.payout||r.payoutText||'',
      plannedClose:'',
      phoneNum:'',
      feeChecked:false,
      monthlyFeeYNText:feeText,
      promoCodeText:r.code||'',
      avoidMonthlyFeeText:(r.waivers||[]).join('\n'),
      completeBonusText:complete,
      earlyTerminationFeeText:earlyFeeText,
      eligibilityText:eligibilityOut,
      expirationDateText:r.openBy?pretty(r.openBy):'',
      requiredDaysText:reqDays?String(reqDays):'',
      customTimers:makeSuggestedTimers(r,'')
    };
  }
  window.fillFromAI=function(){
    const raw=document.getElementById('az_input')?.value||findRaw();
    if(!isTerms(raw)){alert('Paste and analyze the full T&C first.');return;}
    analyzerText=raw;
    const r=currentResult(raw);
    if(!r){alert('Could not analyze enough data to create an entry.');return;}
    analyzerResult=window.analyzerResult||analyzerResult;
    const data=buildEntryFromResult(r);
    if(!data||!data.bank){alert('Bank name was not detected. Review the T&C and try again.');return;}
    try{window.tcV3SaveSourceForCurrentEntry&&window.tcV3SaveSourceForCurrentEntry(raw,{bank:data.bank})}catch{}
    modal={...data,checklist:[],customTimers:data.customTimers||[]};
    showAnalyzer=false;
    analyzerResult=null;
    tab='tracker';
    search='';
    expanded=null;
    R();
    setTimeout(()=>{try{document.querySelector('.modal input')?.focus()}catch{}},80);
  };
  window.tcOpenPro=openPro;window.tcClosePro=()=>document.getElementById('tca_overlay')?.remove();window.tcRunPro=function(){const raw=document.getElementById('tca_raw')?.value||findRaw();const r=analyze(raw);const box=document.getElementById('tcv3_result');if(box)box.innerHTML=summaryHtml(r);renderSummary()};window.tcV3SelectTier=function(i){const raw=document.getElementById('tca_raw')?.value||findRaw();const r=analyze(raw,{tierIndex:Number(i)});const box=document.getElementById('tcv3_result');if(box)box.innerHTML=summaryHtml(r)};window.tcApplyPro=function(){const raw=document.getElementById('tca_raw')?.value||findRaw();const r=currentResult(raw);applyToModal(r);alert('Applied v3 analyzer fields. Review, then save entry.');try{window.R&&window.R()}catch{};window.tcClosePro()};window.tcCreateTimers=function(){const raw=document.getElementById('tca_raw')?.value||findRaw();const r=currentResult(raw);const n=createTimers(r);alert(n?`Created ${n} mini timer(s). Save the entry.`:'No timers created. Add Opened Date for start+days timers.');try{window.R&&window.R()}catch{}};window.tcCopyIssueReport=copyIssueReport;window.tcV3RenderSummary=renderSummary;window.tcV3ApplyToModal=applyToModal;window.tcV3CreateTimers=createTimers;
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const txt=clean(b.textContent||'');if(/analyz|hide analyzer|show analyzer/i.test(txt))setTimeout(renderSummary,250)} ,true);
  document.addEventListener('input',e=>{if(e.target?.tagName==='TEXTAREA')setTimeout(renderSummary,350)},true);
  setTimeout(renderSummary,800);setTimeout(renderSummary,1800);
  const st=document.createElement('style');st.textContent=`.app-version::after{content:''!important;display:none!important}.tc-strict-card,[data-v3="true"]{height:auto!important;max-height:none!important;overflow:visible!important}`;document.head.appendChild(st);
})();