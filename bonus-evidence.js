/* Tracker-specific bank activity review. No account data in local/session storage.
 * Read-only: only the existing milestone dialogs may change a tracker record.
 */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
  const TYPES=window.BTBonusEvidenceCore?.REASONS||{};
  let snapshot=null,loading=false,error='',showAll=false,hideAmounts=true,rev=0;
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
    snapshot=null;loading=false;error='';showAll=false;hideAmounts=true;rev++;
  }
  function update(){
    const root=document.getElementById('bt-bonus-evidence');
    if(root)paint(root);
  }
  function manage(){
    if(typeof window.btOpenBankSync==='function')window.btOpenBankSync();
  }
  function openTracker(id){
    if(typeof openAccountFromActionCenter==='function'){
      openAccountFromActionCenter(String(id));
    }
  }
  function reviewPayout(id){
    if(typeof openRcv==='function')openRcv(String(id)); // Existing explicit confirmation flow.
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
      const response=await fetch(API,{
        method:'GET',cache:'no-store',credentials:'omit',
        headers:{Authorization:'Bearer '+token},signal:controller.signal
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof payload.detail==='string'?payload.detail:'Bank activity could not be retrieved.');
      if(call!==rev||!auth.connected()||!document.getElementById('bt-bonus-evidence'))return;
      snapshot=payload;error='';
    }catch(e){
      if(call!==rev)return;
      error=e.name==='AbortError'?'Bank activity request timed out. Try again.':String(e.message||'Bank activity unavailable.');
    }finally{
      clearTimeout(timer);
      if(call===rev){loading=false;update();}
    }
  }
  function paint(root){
    root.replaceChildren();
    const top=el('div',undefined,root,'bonus-evidence-toolbar');
    const title=el('div',undefined,top,'bonus-evidence-heading');
    el('strong','Bank Activity Review',title);
    el('small','Check potential deposits, bonus credits, fees and reversals',title);
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
    if(!snapshot){return;}
    if(!window.BTBonusAuth?.connected()){reset();update();return;}
    if(!snapshot.connected){
      el('p','No connected financial institution. Link your SimpleFIN accounts to review bank-bonus evidence.',root,'bonus-evidence-note');
      button(root,'Manage connected accounts',manage);
      return;
    }
    const report=window.BTBonusEvidenceCore?.summarize(snapshot,activeEntries());
    if(!report){
      el('p','Bank evidence tools are not available. Reload BonusTracker.',root,'bonus-evidence-note');return;
    }
    const metrics=el('div',undefined,root,'bonus-evidence-metrics');
    for(const [label,value] of [
      ['Linked bonuses',report.linkedCampaigns],
      ['Possible direct deposits',report.counts.directDeposit],
      ['Possible payouts',report.counts.bonus],
      ['Fees / reversals',report.counts.fee+report.counts.reversal]
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
      if(!group.activity.length)el('p','No flagged posted transactions observed since this bonus was opened. This does not confirm requirements are unmet.',card,'bonus-evidence-note');
      else{
        const list=el('div',undefined,card,'bonus-evidence-activity');
        for(const activity of group.latest){
          const line=el('div',undefined,list,'bonus-evidence-row');
          const note=el('div',undefined,line);
          el('strong',TYPES[activity.type]||'Possible bank activity',note);
          el('small',fmtDate(activity.posted)+' · '+activity.description,note);
          el('b',hideAmounts?'••••••':fmtMoney(activity.amount),line);
        }
        if(group.activity.length>group.latest.length)el('small',group.activity.length-group.latest.length+' more flagged transactions available in Finances.',card,'bonus-evidence-note');
      }
      const row=el('div',undefined,card,'bonus-evidence-card-actions');
      button(row,'Open tracker',()=>openTracker(group.entryId));
      if(group.counts.bonus)button(row,'Review payout',()=>reviewPayout(group.entryId),'bonus-evidence-button primary');
    }
    if(report.campaigns.length>4)button(root,showAll?'Show fewer':'Show all '+report.campaigns.length+' linked bonuses',()=>{showAll=!showAll;update()});
    const footer=el('p','Review-only evidence. Direct deposits still need to satisfy the exact promotion terms. No requirements, payouts, closing dates or eligibility statuses are changed automatically.',root,'bonus-evidence-disclaimer');
    footer.setAttribute('role','note');
    const privacy=el('div',undefined,root,'bonus-evidence-privacy');
    button(privacy,hideAmounts?'Show transaction amounts':'Hide transaction amounts',()=>{hideAmounts=!hideAmounts;update()});
  }
  function install(){
    const anchor=document.querySelector('.tracker-overview');
    if(!anchor){
      // Clear private financial responses when leaving the Tracker tab.
      if(snapshot||loading||error)reset();
      return;
    }
    let root=document.getElementById('bt-bonus-evidence');
    if(!root){
      root=el('section');root.id='bt-bonus-evidence';
      root.className='bonus-evidence';root.setAttribute('aria-label','Bank bonus activity evidence');
      anchor.after(root);
    }
    paint(root);
  }
  window.btRegisterPostRender?.('bonus-evidence-review',install);
  install();
})();
