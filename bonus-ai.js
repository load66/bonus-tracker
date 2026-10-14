/* On-demand explanations. No writes to tracker entries, imports or financial rules. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app';
  const AUTH_URL='https://ppsljqaaanpkksxbpalk.supabase.co';
  const PUBLIC_KEY='sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n';
  const SESSION_KEY='bonus-ai-auth';
  let modal=null,selected='',busy=false,requestGeneration=0,refreshPromise=null,restoreFocus=null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const findEntry=id=>entries.find(e=>e.id===id);
  const text=value=>String(value??'').replace(/\b\d{8,}\b/g,'[identifier omitted]');
  function prefix(value,max){let s=value.slice(0,max);if(/[\uD800-\uDBFF]$/.test(s))s=s.slice(0,-1);return s;}
  function contextFor(e){
    const facts=[],truncated=[];
    const add=(id,label,value,max=700)=>{if(value===undefined||value===null||!String(value).trim())return;const full=text(value);if(full.length>max)truncated.push(label);facts.push({id,label,text:prefix(full,max)});};
    const combine=rows=>rows.filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()).map(([k,v])=>k+': '+v).join('\n');
    add('bank','Bank / account',e.bank,150);add('accounttype','Saved account category',e.accountType||'Not recorded',60);add('bonus','Saved bonus amount',e.bonus?fM(e.bonus):'Not recorded',80);
    add('today','Tracker date',td(),40);add('stage','Saved lifecycle stage',status(e),100);
    for(const [key,label] of [['opened','Opened'],['reqMet','Requirement met'],['bonusRecd','Bonus received'],['closed','Closed']])add(key.toLowerCase(),label,e[key]||'Not recorded',40);
    add('requirements','Saved requirements',combine([['Qualifying activity',e.dataPoint],['Complete bonus',e.completeBonusText],['Deadline wording',e.requiredDaysText],['Funding wording',e.fundingAmountText],['Required funding amount',Number(e.fundingAmount)>0?fM(e.fundingAmount):''],['Required hold days',Number(e.fundedDays)>0?e.fundedDays:''],['Enrollment code',e.promoCodeText]]),1500);
    add('payout','Saved payout wording',e.payoutTimingText);
    add('monthlyfee','Saved monthly fee wording',e.monthlyFeeYNText);add('feeamount','Saved monthly fee amount',e.monthlyFeeAmountText);add('feefrequency','Saved fee frequency',e.monthlyFeeFrequency,80);
    add('feewaiver','Saved fee waiver conditions',combine([['Waiver wording',e.monthlyFeeWaiverText],['Waiver type',e.monthlyFeeWaiverType],['Waiver amount',e.monthlyFeeWaiverAmountText],['Fee avoidance and companion accounts',e.avoidMonthlyFeeText]]),1500);
    add('closerule','Saved closure restrictions',combine([['Rule wording',e.closeRuleText],['Restriction type',e.closeRestrictionType],['Date basis',e.closeRuleBasis],['Early termination fee wording',e.earlyTerminationFeeText],['Saved early-close charge',Number(e.earlyCloseFee)>0?fM(e.earlyCloseFee):'']] ),1100);
    const gate=window.BTEligibilityGate;
    const rules=gate?.normalizedRules?.(e)||[];
    add('eligibility','Saved repeat-bonus rules',rules.map((r,i)=>combine([['Rule',i+1],['Basis',r.basis],['Period',r.period?r.period.value+' '+r.period.unit:'Not confirmed'],['Scope',r.scope],['Anchor date',r.anchorDate],['Anchor fallback',r.anchorFallback],['Condition',r.condition?JSON.stringify(r.condition):''],['Condition state',r.condition?gate.ruleConditionState(r,e):''],['Evidence',r.evidenceText]])).join('\n\n'),2200);
    add('eligibilitygate','Tracker repeat-eligibility checks',combine([['Decision',gate?.summary?.(e)],['Current-customer restriction',e.currentCustomerEvidenceText],['Closure prerequisite',e.mustCloseBeforeReapply===true?'Account must also be closed before reapplying':''],['Enrollment date',e.couponEnrollmentDate||e.offerEnrollmentDate],['Saved eligibility wording',e.eligibilityText]]),1000);
    add('timers','Saved custom reminders',Array.isArray(e.customTimers)?e.customTimers.map(t=>combine([['Reminder',t.text],['Start date',t.startDate],['Required days',Number(t.daysRequired)>0?t.daysRequired:''],['Saved due date',t.date],['Marked complete',t.done===true?'Yes':'No']])).join('\n\n'):'',1100);
    add('provenance','Saved source verification',combine([['Promotion source',e.promoSourceUrl],['Fee schedule source',e.feeScheduleSourceUrl],['Verified at',e.termsVerifiedAt]]),650);
    add('close_date','Tracker-calculated earliest close date',safeCloseDate(e)||'Not confirmed',40);add('reopen_date','Tracker-calculated next reopen date',nextReopen(e)||'Not confirmed',40);
    const readiness=closeReadiness(e);add('close_gate','Tracker closure checks',readiness.label+'; '+readiness.items.map(x=>(x.ok?'Passed: ':'Needs review: ')+x.label+(x.detail?' — '+x.detail:'')).join('; '),1400);
    const tasks=Array.isArray(e.checklist)?e.checklist:[];add('tasks','Task progress',tasks.filter(x=>x.done).length+' of '+tasks.length+' marked complete. This does not independently confirm every recurring period.',180);
    const next=window.btNextActionForEntry?.(e);if(next)add('nextaction','Tracker next step',next.label+'\n'+next.explanation,900);
    if(truncated.length)add('contextcoverage','Saved-field coverage','These fields were shortened: '+truncated.join(', ')+'. Omitted wording and conditions cannot be assumed.',900);
    const terms=text(e.tcSourceRaw||''),limit=Math.min(10000,terms.length);
    const withTerms=n=>[...facts,{id:'terms',label:'Saved promotion terms',text:prefix(terms,n)||'No original terms saved'},{id:'termscoverage',label:'Saved terms coverage',text:!terms?'Original promotion terms are missing.':n<terms.length?'Only the first '+prefix(terms,n).length+' of '+terms.length+' characters are included. Omitted wording cannot be assumed.':'These are saved historical terms, not freshly verified official terms.'}];
    // Prioritize structured rules and canonical dates; reserve space for a full question.
    while(JSON.stringify({question:'x'.repeat(500),facts:withTerms(0)}).length>17500){const candidate=facts.filter(f=>!['close_gate','close_date','reopen_date','contextcoverage'].includes(f.id)&&f.text.length>100).sort((a,b)=>b.text.length-a.text.length)[0];if(!candidate)break;candidate.text=prefix(candidate.text,Math.floor(candidate.text.length/2));const coverage=facts.find(f=>f.id==='contextcoverage');if(coverage)coverage.text=prefix(coverage.text+' Further shortened: '+candidate.label+'.',900);else facts.push({id:'contextcoverage',label:'Saved-field coverage',text:'Further shortened: '+candidate.label+'. Omitted wording cannot be assumed.'});}
    let low=0,high=limit;while(low<high){const mid=Math.ceil((low+high)/2);if(JSON.stringify({question:'x'.repeat(500),facts:withTerms(mid)}).length<=17500)low=mid;else high=mid-1;}
    return withTerms(low);
  }
  function session(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function saveSession(s){sessionStorage.setItem(SESSION_KEY,JSON.stringify({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+Number(s.expires_in||3600)}));}
  async function authRequest(grant,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const r=await fetch(AUTH_URL+'/auth/v1/token?grant_type='+grant,{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const d=await r.json();if(!r.ok||!d.access_token||!d.refresh_token)throw Error('Could not sign in. Check your Trading Journal email and password.');saveSession(d);return d.access_token;}finally{clearTimeout(timer)}
  }
  async function accessToken(){
    const s=session();if(!s?.access_token)throw Error('Sign in to use AI.');
    if(Number(s.expires_at)>Date.now()/1000+60)return s.access_token;
    if(!refreshPromise)refreshPromise=authRequest('refresh_token',{refresh_token:s.refresh_token}).catch(()=>{sessionStorage.removeItem(SESSION_KEY);throw Error('Your AI sign-in expired. Sign in again.');}).finally(()=>{refreshPromise=null;});
    return refreshPromise;
  }
  function close(){requestGeneration++;if(modal)modal.remove();modal=null;selected='';busy=false;if(restoreFocus?.isConnected)restoreFocus.focus();restoreFocus=null;}
  function message(value){if(modal)modal.querySelector('#bonus-ai-status').textContent=value;}
  function guidanceFor(e,question){
    const next=window.btNextActionForEntry?.(e),missing=[],ids=['nextaction'];
    let verdict='',tone='review',step=next?.explanation||'Review the saved requirements and dates before recording another milestone.';
    const q=String(question||'').toLowerCase();
    if(/(?:can|could|should|may|when).{0,40}\bclose\b|safe.{0,30}(?:close|closing)|closing this account|closure checks|\bclose (?:it|this account|my account|now)\b/.test(q)){
      ids.push('close_gate','close_date','eligibilitygate');
      if(e.closed){verdict='Already closed';step='The closure is recorded. Review the saved repeat-eligibility rules before another application.';}
      else if(next?.kind==='close'){verdict='Ready — tracker checks passed';tone='ready';step=next.explanation;}
      else if(!e.reqMet||!e.bonusRecd){verdict='Wait';tone='wait';step=!e.reqMet?'Confirm all qualifying requirements with the bank before recording completion.':'Wait until the bonus posts, then record its receipt before reviewing closure.';}
      else if(next?.context?.confirmed&&next.context.date&&next.context.date>td()){verdict='Wait';tone='wait';step='The tracker’s close checks are still blocked. Review the saved close date and restrictions below.';}
      else{verdict='Needs verification';step='Review the unresolved tracker closure checks and saved fee/eligibility terms before closing.';}
      if(verdict==='Needs verification'){const readiness=closeReadiness(e);for(const item of readiness.items||[])if(!item.ok)missing.push(item.label+(item.detail?': '+item.detail:''));if(!next?.context?.confirmed)missing.push('A confirmed closure date and its supporting terms.');if(!window.BTEligibilityGate?.validate?.(e)?.ok)missing.push('Verified repeat-eligibility rules or confirmed non-repeatable status.');}
    }else if(/waiv|maintenance fee|monthly.{0,20}fee/.test(q)){step='Check each account’s saved fee and waiver conditions against your actual balance and activity. Include any required savings or membership account.';ids.push('monthlyfee','feeamount','feewaiver');}
    else if(/direct deposit/.test(q)){step='Compare actual deposits with the saved qualifying activity, deadline and every recurring period before confirming completion.';ids.push('requirements','timers','tasks');}
    else if(/payout|paid|bonus.{0,15}arriv/.test(q)){step=e.bonusRecd?'The bonus is recorded as received. Review the tracker’s close checks next.':'Check the saved payout wording and actual bank activity; record receipt only after the bonus posts.';ids.push('payout','bonusrecd');}
    else if(/repeat|apply again|eligib/.test(q)){step='Use the tracker’s saved repeat-eligibility rules and calculated date, then verify the current official offer before applying again.';ids.push('eligibility','eligibilitygate','reopen_date');}
    else if(/early.close|forfeiture/.test(q)){step='Review the saved closure restrictions and fee wording before making a closure decision.';ids.push('closerule','close_gate');}
    else if(/savings|membership|share account/.test(q)){step='Review the required companion account’s minimum balance and fee conditions before withdrawing funds or closing it.';ids.push('feewaiver','terms');}
    return{verdict,tone,step,missing,ids};
  }
  function renderAnswer(result,facts,e,question){
    const area=modal.querySelector('#bonus-ai-answer');area.replaceChildren();
    const guide=guidanceFor(e,question);
    if(guide.verdict){const verdict=document.createElement('div');verdict.className='bonus-ai-verdict '+guide.tone;verdict.textContent=guide.verdict;area.append(verdict);}
    const title=document.createElement('b');title.textContent='AI answer';area.append(title);
    const p=document.createElement('p');p.className='bonus-ai-direct-answer';p.textContent=result.answer;area.append(p);
    const step=document.createElement('section'),heading=document.createElement('b'),body=document.createElement('p');step.className='bonus-ai-next-step';heading.textContent='Your next step';body.textContent=guide.step;step.append(heading,body);area.append(step);
    const missing=[...new Set([...guide.missing,...result.missing])];
    for(const id of ['contextcoverage','termscoverage']){const f=facts.find(x=>x.id===id);if(f&&/missing|shortened|only the first/i.test(f.text))missing.push(f.text);}
    if(missing.length){const title=document.createElement('b');title.textContent='Needs verification';area.append(title);const list=document.createElement('ul');list.className='bonus-ai-missing';for(const value of missing){const li=document.createElement('li');li.textContent=value;list.append(li)}area.append(list)}
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Supporting saved facts';details.append(summary);
    for(const id of [...new Set([...result.factIds,...guide.ids])]){const f=facts.find(x=>x.id===id);if(!f)continue;const label=document.createElement('b'),body=document.createElement('p');label.textContent=f.label;body.textContent=f.text;details.append(label,body)}area.append(details);
    message(result.cached?'Saved explanation reused.':'AI explanation · check the cited saved facts.');
  }
  async function ask(){
    if(busy||!modal)return;const question=modal.querySelector('#bonus-ai-question').value.trim();if(!question){message('Enter a question about this bonus.');return;}
    const e=findEntry(selected);if(!e){message('This account is no longer in the tracker.');return;}
    const facts=contextFor(e),generation=requestGeneration;
    modal.querySelector('#bonus-ai-answer').replaceChildren();
    busy=true;modal.querySelector('#bonus-ai-question').disabled=true;modal.querySelectorAll('[data-question]').forEach(b=>b.disabled=true);modal.querySelector('#bonus-ai-send').disabled=true;message('Reviewing saved terms and tracker facts…');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const token=await accessToken();const r=await fetch(API+'/api/bonus-tracker/ask',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({question,facts}),signal:controller.signal});const result=await r.json();
      if(!r.ok){if(r.status===401||r.status===403)sessionStorage.removeItem(SESSION_KEY);throw Error(result.detail||result.error||'AI is unavailable.');}
      if(typeof result.answer!=='string'||!result.answer.trim()||result.answer.length>1600||!Array.isArray(result.factIds)||result.factIds.length>12||!Array.isArray(result.missing)||result.missing.length>6||result.missing.some(x=>typeof x!=='string'||!x.trim()||x.length>180)||result.factIds.some(id=>!facts.some(f=>f.id===id))||(!result.factIds.length&&!result.missing.length))throw Error('AI returned an unsupported answer.');
      if(modal&&generation===requestGeneration){if(!findEntry(selected)||JSON.stringify(contextFor(findEntry(selected)))!==JSON.stringify(facts))message('Tracker facts changed. Ask again for an updated explanation.');else renderAnswer(result,facts,findEntry(selected),question);}
    }catch(error){if(modal&&generation===requestGeneration){message(error.name==='AbortError'?'AI timed out. Your tracker is unchanged.':error.message);modal.querySelector('#bonus-ai-login').hidden=!!session();}}
    finally{clearTimeout(timer);if(modal&&generation===requestGeneration){busy=false;modal.querySelector('#bonus-ai-question').disabled=false;modal.querySelectorAll('[data-question]').forEach(b=>b.disabled=false);modal.querySelector('#bonus-ai-send').disabled=false;}}
  }
  window.btOpenBonusAI=function(id){
    const e=findEntry(id);if(!e)return;const opener=document.activeElement;close();restoreFocus=opener;selected=id;
    modal=document.createElement('div');modal.className='ov bonus-ai-overlay';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','bonus-ai-title');
    modal.innerHTML='<section class="modal bonus-ai-modal"><div class="bonus-ai-heading"><div><h2 id="bonus-ai-title">Ask AI</h2><p>'+escape(e.bank)+'</p></div><button type="button" id="bonus-ai-close" aria-label="Close AI">×</button></div><div id="bonus-ai-login"'+(session()?' hidden':'')+'><p>Use your existing Trading Journal sign-in.</p><label for="bonus-ai-email">Email</label><input id="bonus-ai-email" type="email" autocomplete="username"><label for="bonus-ai-password">Password</label><input id="bonus-ai-password" type="password" autocomplete="current-password"><button type="button" class="btn-s" id="bonus-ai-signin">Connect AI</button></div><label for="bonus-ai-question">Your question</label><textarea id="bonus-ai-question" maxlength="500" rows="3" placeholder="What do I still need to do for this bonus?"></textarea><div class="bonus-ai-suggestions"><button type="button" data-question="What do I still need to do for this bonus?">What remains?</button><button type="button" data-question="What do the saved terms say about when the bonus will be paid?">Payout timing</button><button type="button" data-question="What do the tracker closure checks and saved terms say about closing this account?">Can I close?</button><button type="button" data-question="What monthly maintenance fees are stated in the saved terms, including required companion accounts?">Monthly fee</button><button type="button" data-question="What are the exact saved conditions to waive each monthly fee? Distinguish alternatives from combined requirements.">Waive fees</button><button type="button" data-question="What direct deposits are required, including the amount, deadline and every recurring period?">Direct deposit</button><button type="button" data-question="What early-close fees or bonus forfeiture restrictions are stated in the saved terms?">Early-close fee</button><button type="button" data-question="Is a membership, share or savings account required? What are its minimum balance and fees?">Savings account</button><button type="button" data-question="What saved repeat-bonus rules and tracker checks determine when I can apply again?">Repeat eligibility</button></div><p class="bonus-ai-sharing">Ask AI shares this bonus’s saved rules, terms, dates, reminders, task counts and your question with Groq. Notes, account IDs and other bonuses are excluded.</p><button type="button" class="btn-p" id="bonus-ai-send">Ask AI</button><p id="bonus-ai-status" role="status"></p><div id="bonus-ai-answer"></div><p class="bonus-ai-boundary">Explains saved information. Current terms and eligibility may need verification. Answers never update records or replace tracker calculations.</p><button type="button" class="btn-s" id="bonus-ai-disconnect"'+(session()?'':' hidden')+'>Disconnect AI</button></section>';
    document.body.append(modal);modal.querySelector('#bonus-ai-close').onclick=close;modal.onclick=ev=>{if(ev.target===modal)close()};
    modal.querySelector('#bonus-ai-send').onclick=ask;
    modal.querySelectorAll('[data-question]').forEach(button=>button.onclick=()=>{modal.querySelector('#bonus-ai-question').value=button.dataset.question;modal.querySelector('#bonus-ai-question').focus()});
    modal.querySelector('#bonus-ai-signin').onclick=async()=>{
      const generation=requestGeneration,button=modal.querySelector('#bonus-ai-signin');button.disabled=true;message('Connecting…');
      const email=modal.querySelector('#bonus-ai-email').value.trim(),password=modal.querySelector('#bonus-ai-password').value;
      try{await authRequest('password',{email,password});if(modal&&generation===requestGeneration){modal.querySelector('#bonus-ai-password').value='';modal.querySelector('#bonus-ai-login').hidden=true;modal.querySelector('#bonus-ai-disconnect').hidden=false;message('Connected. Ask a question when ready.');}}
      catch(error){if(modal&&generation===requestGeneration)message(error.message)}finally{button.disabled=false;}
    };
    modal.querySelector('#bonus-ai-disconnect').onclick=()=>{sessionStorage.removeItem(SESSION_KEY);modal.querySelector('#bonus-ai-login').hidden=false;modal.querySelector('#bonus-ai-disconnect').hidden=true;message('Disconnected.');};
    modal.querySelector(session()?'#bonus-ai-question':'#bonus-ai-email').focus();
  };
  document.addEventListener('keydown',ev=>{if(!modal)return;if(ev.key==='Escape'){close();return;}if(ev.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,textarea,summary')].filter(e=>!e.disabled&&e.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}}});
  window.BTBonusAI={contextFor,guidanceFor};
})();
