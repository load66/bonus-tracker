/* On-demand explanations. No writes to tracker entries, imports or financial rules. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app';
  let modal=null,selected='',busy=false,requestGeneration=0,restoreFocus=null,pendingQuestion='';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const findEntry=id=>entries.find(e=>e.id===id);
  const text=value=>String(value??'').replace(/\b\d{8,}\b/g,'[identifier omitted]');
  function prefix(value,max){let s=value.slice(0,max);if(/[\uD800-\uDBFF]$/.test(s))s=s.slice(0,-1);return s;}
  function contextFor(e){
    const facts=[],truncated=[],structured=!!e.financialRules||Number(e.schemaVersion)>=3;
    const add=(id,label,value,max=700)=>{if(value===undefined||value===null||!String(value).trim())return;const full=text(value);if(full.length>max)truncated.push(label);facts.push({id,label,text:prefix(full,max)});};
    const combine=rows=>rows.filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()).map(([k,v])=>k+': '+v).join('\n');
    add('bank','Bank / account',e.bank,150);add('accounttype','Saved account category',e.accountType||'Not recorded',60);add('bonus','Saved bonus amount',e.bonus?fM(e.bonus):'Not recorded',80);
    add('today','Tracker date',td(),40);add('stage','Saved lifecycle stage',status(e),100);
    for(const [key,label] of [['opened','Opened'],['reqMet','Requirement met'],['bonusRecd','Bonus received'],['closed','Closed']])add(key.toLowerCase(),label,e[key]||'Not recorded',40);
    if(!structured){
    add('requirements','Saved requirements',combine([['Qualifying activity',e.dataPoint],['Complete bonus',e.completeBonusText],['Deadline wording',e.requiredDaysText],['Funding wording',e.fundingAmountText],['Required funding amount',Number(e.fundingAmount)>0?fM(e.fundingAmount):''],['Required hold days',Number(e.fundedDays)>0?e.fundedDays:''],['Enrollment code',e.promoCodeText]]),1500);
    add('payout','Saved payout wording',e.payoutTimingText);
    add('monthlyfee','Saved monthly fee wording',e.monthlyFeeYNText);add('feeamount','Saved monthly fee amount',e.monthlyFeeAmountText);add('feefrequency','Saved fee frequency',e.monthlyFeeFrequency,80);
    add('feewaiver','Saved fee waiver conditions',combine([['Waiver wording',e.monthlyFeeWaiverText],['Waiver type',e.monthlyFeeWaiverType],['Waiver amount',e.monthlyFeeWaiverAmountText],['Fee avoidance and companion accounts',e.avoidMonthlyFeeText]]),1500);
    add('closerule','Saved closure restrictions',combine([['Rule wording',e.closeRuleText],['Restriction type',e.closeRestrictionType],['Date basis',e.closeRuleBasis],['Early termination fee wording',e.earlyTerminationFeeText],['Saved early-close charge',Number(e.earlyCloseFee)>0?fM(e.earlyCloseFee):'']] ),1100);
    }
    const gate=window.BTEligibilityGate;
    const rules=gate?.normalizedRules?.(e)||[];
    add('eligibility','Saved repeat-bonus rules',rules.map((r,i)=>combine([['Rule',i+1],['Basis',r.basis],['Period',r.period?r.period.value+' '+r.period.unit:'Not confirmed'],['Scope',r.scope],['Anchor date',r.anchorDate],['Anchor fallback',r.anchorFallback],['Condition',r.condition?JSON.stringify(r.condition):''],['Condition state',r.condition?gate.ruleConditionState(r,e):''],['Evidence',r.evidenceText]])).join('\n\n'),2200);
    add('eligibilitygate','Tracker repeat-eligibility checks',combine([['Decision',gate?.summary?.(e)],['Current-customer restriction',e.currentCustomerEvidenceText],['Closure prerequisite',e.mustCloseBeforeReapply===true?'Account must also be closed before reapplying':''],['Enrollment date',e.couponEnrollmentDate||e.offerEnrollmentDate],['Saved eligibility wording',e.eligibilityText]]),1000);
    add('timers','Saved custom reminders',Array.isArray(e.customTimers)?e.customTimers.map(t=>combine([['Reminder',t.text],['Start date',t.startDate],['Required days',Number(t.daysRequired)>0?t.daysRequired:''],['Saved due date',t.date],['Marked complete',t.done===true?'Yes':'No']])).join('\n\n'):'',1100);
    if(structured)add('financialrules','Authoritative financial-rule evaluation',JSON.stringify(window.BTFinancialRules?.summarize(e)||{mode:'invalid',issues:['Financial-rule validator is unavailable.']}),3600);
    if(structured)add('decisionpolicy','Explanation boundary','Use financialrules for bonus requirements, account fees, waivers, payout and closure restrictions. Invalid rules require verification. Use the tracker dates and close_gate exactly. Never infer actual deposit qualification or waiver satisfaction from terms or task counts.',500);
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
  function close(){pendingQuestion='';requestGeneration++;if(modal)modal.remove();modal=null;selected='';busy=false;if(restoreFocus?.isConnected)restoreFocus.focus();restoreFocus=null;}
  function message(value){if(modal)modal.querySelector('#bonus-ai-status').textContent=value;}
  function answerText(value){
    return String(value||'').split('\n').map(line=>line.replace(/^(?:Qualifying activity|Complete bonus|Deadline wording|Funding wording|Required funding amount|Required hold days|Enrollment code|Waiver wording|Waiver type|Waiver amount|Fee avoidance and companion accounts|Rule wording|Restriction type|Date basis|Early termination fee wording|Saved early-close charge):\s*/i,'').trim()).filter(Boolean).filter((line,i,all)=>all.findIndex(v=>v.toLowerCase()===line.toLowerCase())===i).join('\n');
  }
  function feeAnswer(e){
    const wording=answerText(e.monthlyFeeYNText),amount=answerText(e.monthlyFeeAmountText);
    if(wording&&!/^(?:yes|no|unknown|not confirmed)$/i.test(wording))return wording
      .replace(/\bPersonal checking:\s*\$0 monthly maintenance fee\.?/i,'Your checking account has no monthly maintenance fee.')
      .replace(/\bRequired ([^:\n.]+):\s*\$([\d,.]+)\/month if the \$([\d,.]+) minimum balance is not maintained\.?/i,(_,account,fee,balance)=>'The required '+account+' account charges $'+fee+' per month if its balance falls below $'+balance+'.');
    if(/^no$/i.test(wording))return 'Your account is marked as having no monthly maintenance fee. Check any required companion account separately.';
    if(amount)return 'The fee listed for this account is '+amount+(e.monthlyFeeFrequency&&!/month|year|quarter|cycle/i.test(amount)?' ('+e.monthlyFeeFrequency+')':'')+'.';
    return 'The monthly fee has not been confirmed for this account.';
  }
  function guidanceFor(e,question){
    const next=window.btNextActionForEntry?.(e),missing=[],ids=['nextaction'];
    let verdict='',tone='review',step=next?.explanation||'Review the saved requirements and dates before recording another milestone.';
    const q=String(question||'').toLowerCase();
    if(/(?:can|could|should|may|when).{0,40}\bclose\b|safe.{0,30}(?:close|closing)|closing this account|closure checks|\bclose (?:it|this account|my account|now)\b/.test(q)){
      ids.push('close_gate','close_date','eligibilitygate');
      if(e.closed){verdict='Already closed';step='The closure is recorded. Review the saved repeat-eligibility rules before another application.';}
      else if(next?.kind==='close'){verdict='Ready — tracker checks passed';tone='ready';step=next.explanation;}
      else if(!e.reqMet||!e.bonusRecd){verdict=!e.reqMet?'Requirements incomplete':'Awaiting bonus payment';tone='wait';step=!e.reqMet?'Confirm all qualifying requirements with the bank before recording completion.':'Wait until the bonus posts, then record its receipt before reviewing closure.';}
      else if(next?.context?.confirmed&&next.context.date&&next.context.date>td()){verdict='Hold period active';tone='wait';step='The tracker’s close checks are still blocked. Review the saved close date and restrictions below.';}
      else{verdict='Needs verification';step='Review the unresolved tracker closure checks and saved fee/eligibility terms before closing.';}
      if(verdict==='Needs verification'){const readiness=closeReadiness(e);for(const item of readiness.items||[])if(!item.ok)missing.push(item.label+(item.detail?': '+item.detail:''));if(!next?.context?.confirmed)missing.push('A confirmed closure date and its supporting terms.');if(!window.BTEligibilityGate?.validate?.(e)?.ok)missing.push('Verified repeat-eligibility rules or confirmed non-repeatable status.');}
    }else if(/waiv|maintenance fee|monthly.{0,20}fee/.test(q)){step='Check each account’s saved fee and waiver conditions against your actual balance and activity. Include any required savings or membership account.';ids.push('monthlyfee','feeamount','feewaiver');}
    else if(/direct deposit/.test(q)){step='Compare actual deposits with the saved qualifying activity, deadline and every recurring period before confirming completion.';ids.push('requirements','timers','tasks');}
    else if(/payout|paid|bonus.{0,15}arriv/.test(q)){step=e.bonusRecd?'The bonus is recorded as received. Review the tracker’s close checks next.':'Check the saved payout wording and actual bank activity; record receipt only after the bonus posts.';ids.push('payout','bonusrecd');}
    else if(/repeat|apply.{0,35}again|eligib/.test(q)){step='Use the tracker’s saved repeat-eligibility rules and calculated date, then verify the current official offer before applying again.';ids.push('eligibility','eligibilitygate','reopen_date');}
    else if(/early.close|forfeiture/.test(q)){step='Review the saved closure restrictions and fee wording before making a closure decision.';ids.push('closerule','close_gate');}
    else if(/savings|membership|share account/.test(q)){step='Review the required companion account’s minimum balance and fee conditions before withdrawing funds or closing it.';ids.push('feewaiver','terms');}
    step=step.replace(/\bsaved /gi,'').replace('Review the saved','Review the');
    const rules=window.BTFinancialRules?.validate(e);
    if(verdict&&rules&&!rules.ok){verdict='Needs verification';tone='review';step='Resolve the conflicting financial rules before relying on the closure result.';missing.push(...rules.issues.map(x=>x.message));ids.push('financialrules');}
    return{verdict,tone,step,missing,ids};
  }
  function localAnswerFor(e,question,facts=contextFor(e)){
    const structured=window.BTFinancialRules?.answer(e,question);if(structured)return structured;
    const q=String(question||'').toLowerCase(),guide=guidanceFor(e,question);
    const byId=id=>facts.find(f=>f.id===id);
    let ids=[],answer='',step='',missing=[];
    // Handle one narrow intent. Comparisons and compound questions go to AI
    // rather than silently answering only the first recognized topic.
    if(/compare|versus|\bvs\b|also|why|explain|calculate/.test(q))return null;
    if(/\band\b/.test(q)&&!/^what (?:monthly maintenance fees|direct deposits)/.test(q)&&!q.includes('tracker closure checks and saved terms'))return null;
    if(guide.verdict){answer=guide.verdict==='Awaiting bonus payment'?'Your bonus payment has not been recorded, so the tracker is not ready to recommend closing this account. '+guide.step:guide.verdict==='Requirements incomplete'?'Completion of the qualifying requirements has not been recorded. '+guide.step:guide.verdict+'. '+guide.step;ids=guide.ids;missing=guide.missing;}
    else if(/early.close|forfeit|termination fee/.test(q)){ids=['closerule'];answer=answerText([e.closeRuleText,e.earlyTerminationFeeText].filter(Boolean).join('\n'))||'Early-close fees and restrictions have not been confirmed.';}
    else if(/waiv|avoid.{0,15}fee/.test(q)){ids=['feewaiver'];answer=answerText(e.monthlyFeeWaiverText||e.avoidMonthlyFeeText)||'The fee-waiver conditions have not been confirmed.';step=answerText(e.avoidMonthlyFeeText||e.monthlyFeeWaiverText)||guide.step;if(!byId('feewaiver'))missing.push('The exact fee-waiver conditions.');}
    else if(/monthly.{0,25}fee|maintenance fee/.test(q)){ids=['monthlyfee','feeamount','feefrequency','feewaiver'];answer=feeAnswer(e);step=answerText([e.monthlyFeeWaiverText,e.avoidMonthlyFeeText].filter(Boolean).join('\n'))||guide.step;if(!byId('monthlyfee')&&!byId('feeamount'))missing.push('Monthly fee amount and the official fee schedule.');}
    else if(/savings|membership|share account/.test(q)){ids=['feewaiver','monthlyfee'];answer=answerText(e.avoidMonthlyFeeText||e.monthlyFeeWaiverText)||'Companion-account requirements have not been confirmed.';missing.push('Confirm companion-account requirements against the official terms.');}
    else if(/direct deposit|\bdd\b|requirements|what (?:remains|do i still need)/.test(q)){ids=['requirements','timers','tasks','nextaction'];answer=answerText([e.completeBonusText||e.dataPoint,e.fundingAmountText,e.requiredDaysText?'Completion window: '+e.requiredDaysText:'',byId('tasks')?.text].filter(Boolean).join('\n'))||guide.step;if(!byId('requirements'))missing.push('The qualifying activity, amount, deadline and recurring periods.');}
    else if(/payout|paid|bonus.{0,15}arriv/.test(q)){ids=['payout','bonusrecd'];answer=(e.bonusRecd?'Your bonus is marked as received on '+e.bonusRecd+'.':'Your bonus has not been marked as received.')+(e.payoutTimingText?'\n\n'+answerText(e.payoutTimingText):'');if(!byId('payout'))missing.push('The exact payout wording and its start event.');}
    else if(/repeat|apply.{0,35}again|eligib/.test(q)){ids=['eligibility','eligibilitygate','reopen_date'];const rules=window.BTEligibilityGate?.normalizedRules?.(e)||[];const date=byId('reopen_date')?.text;answer=answerText(rules.map(r=>r.evidenceText).filter(Boolean).join('\n'))||'Repeat-bonus eligibility has not been confirmed.';answer+='\n\n'+(date&&date!=='Not confirmed'?'Tracker eligibility date: '+date+'.':'Your next application date is not confirmed.');}
    else if(/next deadline|next due date/.test(q)){const next=window.btNextActionForEntry?.(e);answer=next?.context?.confirmed?next.context.explanation:'The next tracker date is not confirmed.';ids=['nextaction'];}
    else return null;
    const used=ids.map(byId).filter(Boolean);
    if(!answer)answer=used.length?used.map(f=>answerText(f.text)).filter((text,i,all)=>all.indexOf(text)===i).join('\n\n'):'This information has not been confirmed for this account.';
    if(!used.length)missing.push('The applicable promotion or fee terms.');
    return {answer,step,factIds:used.map(f=>f.id),missing,local:true};
  }
  function renderAnswer(result,facts,e,question){
    const area=modal.querySelector('#bonus-ai-answer');area.replaceChildren();
    const guide=guidanceFor(e,question);
    if(guide.verdict){const verdict=document.createElement('div');verdict.className='bonus-ai-verdict '+guide.tone;verdict.textContent=guide.verdict;area.append(verdict);}
    const title=document.createElement('b');title.textContent='Answer';area.append(title);
    const p=document.createElement('p');p.className='bonus-ai-direct-answer';p.textContent=result.answer;area.append(p);
    const step=document.createElement('section'),heading=document.createElement('b'),body=document.createElement('p');step.className='bonus-ai-next-step';heading.textContent='Your next step';body.textContent=result.step||guide.step;step.append(heading,body);area.append(step);
    const missing=[...new Set([...guide.missing,...result.missing])];
    const coverage=['contextcoverage','termscoverage'].map(id=>facts.find(f=>f.id===id)).filter(f=>f&&/missing|shortened|only the first/i.test(f.text));
    if(!result.local)missing.push(...coverage.map(f=>f.text));
    if(missing.length){const title=document.createElement('b');title.textContent='What to confirm';area.append(title);const list=document.createElement('ul');list.className='bonus-ai-missing';for(const value of missing){const li=document.createElement('li');li.textContent=value;list.append(li)}area.append(list)}
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=coverage.length?'Source details · limited information':'Source details';details.append(summary);
    for(const id of [...new Set([...result.factIds,...guide.ids,...coverage.map(f=>f.id)])]){const f=facts.find(x=>x.id===id);if(!f)continue;const label=document.createElement('b'),body=document.createElement('p');label.textContent=f.label.replace(/^Saved /,'').replace(/^Tracker-calculated /,'');body.textContent=f.text;details.append(label,body)}area.append(details);
    message(result.local?'Based on your account details.':result.cached?'Previous AI explanation reused.':'AI explanation · review the source details.');
  }
  async function ask(forceAI=false){
    if(busy||!modal)return;const question=modal.querySelector('#bonus-ai-question').value.trim();if(!question){message('Enter a question about this bonus.');return;}
    const e=findEntry(selected);if(!e){message('This account is no longer in the tracker.');return;}
    const facts=contextFor(e),generation=requestGeneration;
    const local=(!forceAI||window.BTFinancialRules?.validate(e).ok===false)&&localAnswerFor(e,question,facts);if(local){renderAnswer(local,facts,e,question);return;}
    if(!window.BTBonusAuth?.connected()){pendingQuestion=question;modal.querySelector('#bonus-ai-login').hidden=false;message('Sign in once to use Ask AI for more. This browser will remember your session.');modal.querySelector('#bonus-ai-email').focus();return;}
    const fallback=localAnswerFor(e,question,facts);
    if(fallback)renderAnswer(fallback,facts,e,question);else modal.querySelector('#bonus-ai-answer').replaceChildren();
    busy=true;modal.querySelector('#bonus-ai-question').disabled=true;modal.querySelectorAll('[data-question]').forEach(b=>b.disabled=true);modal.querySelector('#bonus-ai-send').disabled=true;modal.querySelector('#bonus-ai-more').disabled=true;message('Reviewing saved terms and tracker facts…');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const send=token=>fetch(API+'/api/bonus-tracker/ask',{method:'POST',credentials:'omit',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({question,facts}),signal:controller.signal});
      let r=await send(await window.BTBonusAuth.token());
      if(r.status===401)r=await send(await window.BTBonusAuth.token(true));
      const result=await r.json();
      if(!r.ok)throw Error(result.detail||result.error||'AI is unavailable. Account-detail answers still work.');
      if(typeof result.answer!=='string'||!result.answer.trim()||result.answer.length>1600||!Array.isArray(result.factIds)||result.factIds.length>12||!Array.isArray(result.missing)||result.missing.length>6||result.missing.some(x=>typeof x!=='string'||!x.trim()||x.length>180)||result.factIds.some(id=>!facts.some(f=>f.id===id))||(!result.factIds.length&&!result.missing.length))throw Error('AI returned an unsupported answer.');
      if(modal&&generation===requestGeneration){if(!findEntry(selected)||JSON.stringify(contextFor(findEntry(selected)))!==JSON.stringify(facts))message('Tracker facts changed. Ask again for an updated explanation.');else renderAnswer(result,facts,findEntry(selected),question);}
    }catch(error){if(modal&&generation===requestGeneration){const current=findEntry(selected),same=current&&JSON.stringify(contextFor(current))===JSON.stringify(facts);if(same&&fallback)renderAnswer(fallback,facts,current,question);message((error.name==='AbortError'?'AI timed out.':error.message)+(same&&fallback?' Account-detail answer shown below.':''));modal.querySelector('#bonus-ai-login').hidden=window.BTBonusAuth?.connected()!==false;}}
    finally{clearTimeout(timer);if(modal&&generation===requestGeneration){busy=false;modal.querySelector('#bonus-ai-question').disabled=false;modal.querySelectorAll('[data-question]').forEach(b=>b.disabled=false);modal.querySelector('#bonus-ai-send').disabled=false;modal.querySelector('#bonus-ai-more').disabled=false;}}
  }
  window.btOpenBonusAI=function(id){
    const e=findEntry(id);if(!e)return;const opener=document.activeElement;close();restoreFocus=opener;selected=id;
    modal=document.createElement('div');modal.className='ov bonus-ai-overlay';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','bonus-ai-title');
    modal.innerHTML='<section class="modal bonus-ai-modal"><div class="bonus-ai-heading"><div><h2 id="bonus-ai-title">Ask AI</h2><p>'+escape(e.bank)+'</p></div><button type="button" id="bonus-ai-close" aria-label="Close AI">×</button></div><div id="bonus-ai-login" hidden><p>Use your Trading Journal sign-in. This browser remembers your session.</p><label for="bonus-ai-email">Email</label><input id="bonus-ai-email" type="email" autocomplete="username"><label for="bonus-ai-password">Password</label><input id="bonus-ai-password" type="password" autocomplete="current-password"><button type="button" class="btn-s" id="bonus-ai-signin">Sign in and ask AI</button></div><label for="bonus-ai-question">Question</label><textarea id="bonus-ai-question" maxlength="500" rows="3" placeholder="What do I still need to do for this bonus?"></textarea><div class="bonus-ai-suggestions"><button type="button" data-question="What do I still need to do for this bonus?">Requirements</button><button type="button" data-question="When should this bonus be paid?">Payout timing</button><button type="button" data-question="Can I close this account now?">Closure rules</button><button type="button" data-question="What monthly maintenance fees apply, including required companion accounts?">Monthly fee</button><button type="button" data-question="How do I waive each monthly fee?">Fee waivers</button><button type="button" data-question="What direct deposits are required, including the amount, deadline and every recurring period?">Direct deposit</button><button type="button" data-question="What early-close fees or bonus forfeiture restrictions apply?">Early-close fee</button><button type="button" data-question="Is a membership, share or savings account required? What are its minimum balance and fees?">Companion account</button><button type="button" data-question="When can I apply for this bonus again?">Repeat eligibility</button></div><p class="bonus-ai-sharing">Common questions use the information in your account. After sign-in, other questions or “Ask AI for more” send this bonus’s details and your question to Groq. Notes, account IDs and other bonuses are excluded.</p><button type="button" class="btn-p" id="bonus-ai-send">Get answer</button><button type="button" class="btn-s" id="bonus-ai-more">Ask AI for more</button><p id="bonus-ai-status" role="status"></p><div id="bonus-ai-answer"></div><p class="bonus-ai-boundary">Answers use saved account details. Verify current terms and eligibility. Answers do not change records or tracker calculations.</p><button type="button" class="btn-s" id="bonus-ai-disconnect" hidden>Sign out of AI</button></section>';
    document.body.append(modal);modal.querySelector('#bonus-ai-close').onclick=close;modal.onclick=ev=>{if(ev.target===modal)close()};
    modal.querySelector('#bonus-ai-send').onclick=()=>ask();modal.querySelector('#bonus-ai-more').onclick=()=>ask(true);
    modal.querySelectorAll('[data-question]').forEach(button=>button.onclick=()=>{modal.querySelector('#bonus-ai-question').value=button.dataset.question;modal.querySelector('#bonus-ai-question').focus()});
    modal.querySelector('#bonus-ai-disconnect').hidden=!window.BTBonusAuth?.connected();
    modal.querySelector('#bonus-ai-signin').onclick=async()=>{
      const current=modal,generation=requestGeneration,button=current.querySelector('#bonus-ai-signin');
      const email=current.querySelector('#bonus-ai-email').value.trim(),password=current.querySelector('#bonus-ai-password').value;
      if(!email||!password){message('Enter your email and password.');return;}
      button.disabled=true;message('Signing in…');
      try{await window.BTBonusAuth.signIn(email,password);if(modal===current&&generation===requestGeneration){current.querySelector('#bonus-ai-login').hidden=true;current.querySelector('#bonus-ai-disconnect').hidden=false;message('Signed in. This browser will remember your session.');const resume=pendingQuestion===current.querySelector('#bonus-ai-question').value.trim();pendingQuestion='';if(resume)await ask(true);}}
      catch(error){if(modal===current&&generation===requestGeneration)message(error.message);}
      finally{current.querySelector('#bonus-ai-password').value='';button.disabled=false;}
    };
    modal.querySelector('#bonus-ai-disconnect').onclick=()=>{window.BTBonusAuth.disconnect();close();};
    modal.querySelector('#bonus-ai-question').focus();
  };
  document.addEventListener('keydown',ev=>{if(!modal)return;if(ev.key==='Escape'){close();return;}if(ev.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,textarea,summary')].filter(e=>!e.disabled&&e.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}}});
  window.BTBonusAI={contextFor,guidanceFor,localAnswerFor};
})();
