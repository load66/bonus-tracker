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
    add('requirements','Saved requirements',combine([['Complete bonus',e.completeBonusText],['Deadline wording',e.requiredDaysText],['Funding wording',e.fundingAmountText],['Required funding amount',Number(e.fundingAmount)>0?fM(e.fundingAmount):''],['Required hold days',Number(e.fundedDays)>0?e.fundedDays:''],['Enrollment code',e.promoCodeText]]),1500);
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
  function renderAnswer(result,facts){
    const area=modal.querySelector('#bonus-ai-answer');area.replaceChildren();
    const p=document.createElement('p');p.textContent=result.answer;area.append(p);
    if(result.missing.length){const title=document.createElement('b');title.textContent='Still needed';area.append(title);const list=document.createElement('ul');for(const value of result.missing){const li=document.createElement('li');li.textContent=value;list.append(li)}area.append(list)}
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Saved facts used';details.append(summary);
    for(const id of result.factIds){const f=facts.find(x=>x.id===id);if(!f)continue;const label=document.createElement('b'),body=document.createElement('p');label.textContent=f.label;body.textContent=f.text;details.append(label,body)}area.append(details);
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
      if(typeof result.answer!=='string'||!Array.isArray(result.factIds)||!Array.isArray(result.missing)||result.factIds.some(id=>!facts.some(f=>f.id===id)))throw Error('AI returned an unsupported answer.');
      if(modal&&generation===requestGeneration){if(!findEntry(selected)||JSON.stringify(contextFor(findEntry(selected)))!==JSON.stringify(facts))message('Tracker facts changed. Ask again for an updated explanation.');else renderAnswer(result,facts);}
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
  window.BTBonusAI={contextFor};
})();
