/* Owner-private bonus activity review, mounted exclusively in Finances.
 * Only the existing explicit Tracker milestone dialogs may change a bonus record.
 */
(function(){
  'use strict';
  const BASE='https://api-production-00f74.up.railway.app/api/bonus-tracker';
  let provider='simplefin';
  const endpoint=()=>BASE+(provider==='plaid'?'/plaid/accounts':'/simplefin');
  const TYPES=window.BTBonusEvidenceCore?.REASONS||{};
  let snapshot=null,loading=false,saving=false,error='',saveNotice='',showAll=false,showResolved=false,hideAmounts=true,rev=0;
  const pendingLimits=new Map(),resolvedLimits=new Map();
  const el=(tag,text,parent,cls)=>{
    const n=document.createElement(tag);
    if(text!==undefined)n.textContent=text;
    if(cls)n.className=cls;
    if(parent)parent.append(n);
    return n;
  };
  const button=(parent,label,onClick,cls='bonus-evidence-button')=>{
    const b=el('button',label,parent,cls);b.type='button';b.onclick=onClick;return b;
  };
  const fmtDate=t=>Number.isFinite(t)&&t>0?new Date(t*1000).toLocaleDateString():'Not available';
  const fmtMoney=(v,code='USD')=>{
    const n=Number(v);
    if(v==null||v===''||!Number.isFinite(n))return 'Unavailable';
    try{return new Intl.NumberFormat(undefined,{style:'currency',currency:code}).format(n)}
    catch{return String(v)+' '+code}
  };
  const activeEntries=()=>typeof entries!=='undefined'&&Array.isArray(entries)?entries.filter(e=>e&&!e.closed):[];
  function reset(){
    snapshot=null;loading=false;saving=false;error='';saveNotice='';showAll=false;showResolved=false;hideAmounts=true;pendingLimits.clear();resolvedLimits.clear();rev++;
  }
  function update(){
    const root=document.getElementById('bt-bonus-evidence');
    if(root)paint(root);
  }
  function manage(){
    if(typeof window.btOpenBankSync==='function')window.btOpenBankSync();
  }
  function reviewPayout(id){
    if(typeof openRcv==='function')openRcv(String(id)); // Existing explicit confirmation flow.
  }
  async function sameOwner(auth,token){
    if(window.BTBonusAuth!==auth||!auth.connected())return false;
    const current=await auth.token().catch(()=>null);if(!current||!auth.connected())return false;
    if(current===token)return true;
    const identity=value=>{try{const row=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return row.sub?JSON.stringify([row.iss||'',row.sub]):null}catch{return null}};
    return Boolean(identity(token)&&identity(token)===identity(current));
  }
  async function refresh(){
    if(loading)return;
    const auth=window.BTBonusAuth;
    if(!auth?.connected()){
      snapshot=null;error='Sign in to review your linked bank activity.';update();return;
    }
    const call=++rev;
    loading=true;error='';update();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const token=await auth.token();
      if(call!==rev||!auth.connected())return;
      const response=await fetch(endpoint(),{
        method:'GET',cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+token},signal:controller.signal
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof payload.detail==='string'?payload.detail:'Bank activity could not be retrieved.');
      if(!(await sameOwner(auth,token))){snapshot=null;throw Error('Sign-in changed. Reopen bank activity.');}
      if(call!==rev||!auth.connected()||!document.getElementById('bt-bonus-evidence')?.closest('#bt-finances-page'))return;
      snapshot=payload;error='';
    }catch(e){
      if(call!==rev)return;
      error=e.name==='AbortError'?'Bank activity request timed out. Try again.':String(e.message||'Bank activity unavailable.');
    }finally{
      clearTimeout(timer);
      if(call===rev){loading=false;update();}
    }
  }
  async function submitReview(group,activity,decision,requirementId=null){
    if(saving||!snapshot?.connected)return;
    const call=++rev;
    saving=true;error='';saveNotice='';update();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const auth=window.BTBonusAuth;
      if(!auth?.connected())throw Error('Sign in to review your bank activity.');
      const token=await auth.token();
      if(rev!==call||!auth.connected())return;
      const response=await fetch(endpoint()+'/evidence-review',{
        method:'PUT',credentials:'omit',cache:'no-store',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        signal:controller.signal,
        body:JSON.stringify({
          account:activity.accountKey,transaction:activity.id,
          entryId:group.entryId,bank:group.bank,opened:group.opened,
          decision,requirementId:decision==='reviewed'&&requirementId?requirementId:null
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof payload.detail==='string'?payload.detail:'The review was not saved.');
      if(!(await sameOwner(auth,token))){snapshot=null;throw Error('Sign-in changed. Reopen bank activity.');}
      if(call!==rev||!auth.connected()||!document.getElementById('bt-bonus-evidence')?.closest('#bt-finances-page'))return;
      snapshot=payload;
      saveNotice=decision==='clear'?'Review reopened.':decision==='dismissed'?'Not relevant saved.':'Review saved. Promotion requirements remain unconfirmed.';
    }catch(e){
      if(call===rev)error=(e.name==='AbortError'?'Review request timed out. ':String(e.message||'Review not saved. '))
        +'No bonus milestones were changed. Please retry.';
    }finally{
      clearTimeout(timer);
      if(call===rev){saving=false;update();}
    }
  }
  function requirementReport(group){
    const entry=activeEntries().find(e=>String(e.id)===group.entryId&&e.opened===group.opened&&e.bank===group.bank);
    return window.BTBonusRequirementProgress?.evaluate(entry,group,window.BTFinancialRules?.validate)||null;
  }
  function paint(root){
    root.replaceChildren();
    const top=el('div',undefined,root,'bonus-evidence-toolbar');
    const title=el('div',undefined,top,'bonus-evidence-heading');
    el('strong','Bonus activity',title);
    el('small','Direct deposits · bonus credits · fees · reversals',title);
    el('p',(provider==='plaid'?'Plaid':'SimpleFIN')+' · '+ 'Read-only evidence for linked bonus accounts',root,'bonus-evidence-provider-help');
    const actions=el('div',undefined,top,'bonus-evidence-controls');
    if(!snapshot){
      const open=button(actions,loading?'Checking…':'Review bank activity',refresh,'bonus-evidence-button primary');
      open.disabled=loading;
    }else{
      const reload=button(actions,loading?'Checking…':'Refresh',refresh);
      reload.disabled=loading;
      button(actions,'Clear',()=>{reset();update()});
    }
    if(error){const message=el('p',error,root,'bonus-evidence-message');message.setAttribute('role','alert');}
    if(saveNotice){const message=el('p',saveNotice,root,'bonus-evidence-note');message.setAttribute('role','status');}
    if(!snapshot){return;}
    if(!window.BTBonusAuth?.connected()){reset();update();return;}
    if(!snapshot.connected){
      el('p',provider==='plaid'?'No connected Plaid fallback institution. Use Add Bank after trying SimpleFIN first.':'No connected financial institution. Link your SimpleFIN accounts to review bank-bonus evidence.',root,'bonus-evidence-note');
      button(root,'Manage connected accounts',manage);
      return;
    }
    const report=window.BTBonusEvidenceCore?.summarize(snapshot,activeEntries());
    if(!report){
      el('p','Bank evidence tools are not available. Reload BonusTracker.',root,'bonus-evidence-note');return;
    }
    const metrics=el('div',undefined,root,'bonus-evidence-metrics');
    for(const [label,value] of [
      ['To review',report.review.unreviewed],
      ['Reviewed',report.review.reviewed],
      ['Dismissed',report.review.dismissed],
      ['Linked bonuses',report.linkedCampaigns]
    ]){
      const tile=el('div',undefined,metrics,'bonus-evidence-metric');
      el('b',String(value),tile);el('small',label,tile);
    }
    if(report.unlinkedOpenCampaigns){
      const n=report.unlinkedOpenCampaigns;
      el('p',n+' open bonus campaign'+(n===1?' has':'s have')+' no verified bank account link. Link the correct account to enable transaction review.',root,'bonus-evidence-note');
      button(root,'Manage bonus-account links',manage);
    }
    if(report.invalidLinks)el('p',report.invalidLinks+' saved account link'+(report.invalidLinks===1?' needs':'s need')+' review because its bank, opening date or campaign no longer matches.',root,'bonus-evidence-warning');
    if(report.staleSync)el('p','Transaction data may be missing or stale. A missing payout or deposit here does not prove it was not received.',root,'bonus-evidence-warning');
    if(!report.linkedCampaigns){
      el('p','No matching open bonus campaigns have linked bank accounts yet.',root,'bonus-evidence-note');
      return;
    }
    const heading=el('div',undefined,root,'bonus-evidence-list-title');
    el('h3','Linked bonus campaigns',heading);
    el('small','Last synced: '+fmtDate(report.lastSuccess),heading);
    const queueActions=el('div',undefined,root,'bonus-evidence-controls');
    button(queueActions,showResolved?'Hide reviewed items':'Show reviewed / dismissed',()=>{showResolved=!showResolved;update()});
    if(!report.review.unreviewed)el('p','No new flagged evidence to review. Keep checking sync freshness and promotion requirements.',root,'bonus-evidence-note');
    const campaigns=showAll?report.campaigns:report.campaigns.slice(0,4);
    for(const group of campaigns){
      const card=el('article',undefined,root,'bonus-evidence-card');
      const lead=el('div',undefined,card,'bonus-evidence-card-title');
      el('strong',group.bank,lead);
      el('small','Opened '+group.opened+' · '+group.linkedAccounts.length+' matched account'+(group.linkedAccounts.length===1?'':'s'),lead);
      const pills=el('div',undefined,card,'bonus-evidence-pills');
      for(const [key,label] of [['reversal','Reversals'],['fee','Fees'],['bonus','Bonus credits'],['directDeposit','Direct deposits'],['recurring','Recurring debits']]){
        if(!group.counts[key])continue;
        el('span',group.counts[key]+' '+label,pills,key==='reversal'||key==='fee'?'bonus-evidence-pill caution':'bonus-evidence-pill');
      }
      if(group.missingAccounts)el('p','A linked account was missing from the latest provider response. Check your connection.',card,'bonus-evidence-warning');
      if(group.unsupportedCurrency)el('p','A linked non-USD or unknown-currency account was excluded from this USD evidence review.',card,'bonus-evidence-warning');
      el('p',group.review.unreviewed+' needs review · '+group.review.reviewed+' reviewed · '+group.review.dismissed+' dismissed',card,'bonus-evidence-note');
      // Never strand older transaction evidence behind a fixed slice of the
      // 90-day provider window. Small batches preserve mobile compactness.
      const pendingShown=Math.min(group.pending.length,pendingLimits.get(group.entryId)||5);
      const resolvedShown=showResolved
        ?Math.min(group.resolved.length,resolvedLimits.get(group.entryId)||5):0;
      const visibleActivity=group.pending.slice(0,pendingShown)
        .concat(group.resolved.slice(0,resolvedShown));
      if(!visibleActivity.length)el('p',group.activity.length?'No new evidence in this campaign.':'No flagged posted transactions observed since this bonus was opened. This does not confirm requirements are unmet.',card,'bonus-evidence-note');
      else{
        const list=el('div',undefined,card,'bonus-evidence-activity');
        const progress=requirementReport(group);
        const eligibleRules=progress?.scopeVerified?progress.requirements.filter(r=>r.applicable):[];
        for(const activity of visibleActivity){
          const line=el('div',undefined,list,'bonus-evidence-row');
          const note=el('div',undefined,line);
          el('strong',TYPES[activity.type]||'Possible bank activity',note);
          el('small',fmtDate(activity.posted)+' · '+activity.description,note);
          el('b',hideAmounts?'••••••':fmtMoney(activity.amount),line);
          const actionRow=el('div',undefined,line,'bonus-evidence-review-actions');
          if(activity.reviewStatus==='unreviewed'){
            let choice=null;
            if(activity.type==='directDeposit'&&eligibleRules.length){
              const lbl=el('label','Requirement (optional)',actionRow,'bonus-evidence-review-label');
              choice=el('select',undefined,lbl,'bonus-evidence-rule-select');
              const none=el('option','Reviewed only — no requirement',choice);none.value='';
              for(const rule of eligibleRules){const option=el('option',rule.text.slice(0,100),choice);option.value=rule.id;}
            }
            const mark=button(actionRow,'Mark reviewed',()=>submitReview(group,activity,'reviewed',choice?.value||null),'bonus-evidence-button primary');
            const dismiss=button(actionRow,'Not relevant',()=>submitReview(group,activity,'dismissed'));
            mark.disabled=saving;dismiss.disabled=saving;
          }else{
            el('small',activity.reviewStatus==='dismissed'?'Not relevant':('Reviewed'+(activity.requirementId?' · Requirement '+activity.requirementId:'')),actionRow);
            const undo=button(actionRow,'Undo review',()=>submitReview(group,activity,'clear'));
            undo.disabled=saving;
          }
        }
        const paging=el('div',undefined,card,'bonus-evidence-paging');
        if(group.pending.length>pendingShown){
          const more=Math.min(5,group.pending.length-pendingShown);
          button(paging,'Show '+more+' more to review',()=>{
            pendingLimits.set(group.entryId,pendingShown+5);update();
          });
        }
        if(showResolved&&group.resolved.length>resolvedShown){
          const more=Math.min(5,group.resolved.length-resolvedShown);
          button(paging,'Show '+more+' more reviewed',()=>{
            resolvedLimits.set(group.entryId,resolvedShown+5);update();
          });
        }
        if(!showResolved&&group.resolved.length)el('small',group.resolved.length+
          ' reviewed or dismissed entries hidden until you choose Show reviewed / dismissed.',card,'bonus-evidence-note');
      }
      const progress=requirementReport(group);
      if(progress){
        const panel=el('section',undefined,card,'bonus-evidence-progress');
        el('strong','Requirement candidate progress',panel);
        if(progress.mode!=='structured'){
          el('p','Verified, structured promotion rules are needed for deposit progress. Review the official T&C and import the updated rule package.',panel,'bonus-evidence-note');
        }else{
          for(const rule of progress.requirements){
            const entry=el('div',undefined,panel,'bonus-evidence-progress-row');
            el('strong',rule.text,entry);
            if(rule.applicable){
              const count=rule.reviewedCount+' reviewed candidate'+(rule.reviewedCount===1?'':'s');
              const goal=rule.targetCount?' / '+rule.targetCount+' required deposit(s)':'';
              const amount=rule.targetAmount?' · Candidate amount '+(hideAmounts?'••••••':fmtMoney(rule.reviewedAmount))+' / '+(hideAmounts?'••••••':fmtMoney(rule.targetAmount)):'';
              el('small',count+goal+amount,entry);
              if(rule.recurrence==='calendar-month')el('small',rule.reviewedCalendarMonths+' observed calendar months; recurring qualification still needs verification.',entry);
            }else el('small','Manual check needed for this requirement.',entry);
          }
          el('p',progress.notice,panel,'bonus-evidence-note');
        }
      }
      if(group.counts.bonus){
        const row=el('div',undefined,card,'bonus-evidence-card-actions');
        button(row,'Review payout',()=>reviewPayout(group.entryId),'bonus-evidence-button primary');
      }
    }
    if(report.campaigns.length>4)button(root,showAll?'Show fewer':'Show all '+report.campaigns.length+' linked bonuses',()=>{showAll=!showAll;update()});
    const footer=el('p','Reviewing or linking a candidate to a requirement is not confirmation that it qualifies. The bank’s source, timing and account rules must still be checked. No milestone, payout, closure or eligibility status is changed automatically.',root,'bonus-evidence-disclaimer');
    footer.setAttribute('role','note');
    const privacy=el('div',undefined,root,'bonus-evidence-privacy');
    button(privacy,hideAmounts?'Show transaction amounts':'Hide transaction amounts',()=>{hideAmounts=!hideAmounts;update()});
  }
  function dispose(){
    // Revoke in-flight requests and discard private account evidence on route changes.
    if(snapshot||loading||saving||error||saveNotice)reset();
  }
  function mount(root, source='simplefin'){
    // Never inject bank activity into Tracker or any other app section.
    if(!root?.closest('#bt-finances-page'))return false;
    const next=source==='plaid'?'plaid':'simplefin';
    if(provider!==next){provider=next;reset();}
    root.id='bt-bonus-evidence';root.className='bonus-evidence';
    root.setAttribute('role','region');
    root.setAttribute('aria-label','Bank bonus activity evidence');
    paint(root);return true;
  }
  window.BTBonusEvidence=Object.freeze({mount,dispose});
  window.btRegisterPostRender?.('finance-only-bonus-evidence-cleanup',()=>{
    if(!document.getElementById('bt-bonus-evidence'))dispose();
  });
})();
