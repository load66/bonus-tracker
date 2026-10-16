/* Read-only bank bonus evidence. Never changes tracker milestones or canonical eligibility. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTBonusEvidenceCore=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400;
  const REASONS=Object.freeze({
    bonus:'Possible bonus payout',directDeposit:'Possible direct deposit',
    fee:'Possible bank fee',reversal:'Possible bonus reversal',recurring:'Possible recurring debit'
  });
  function openingTimestamp(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const date=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===value?date/1000:null;
  }
  function sign(value){
    const text=String(value??'').trim();
    if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))return null;
    const amount=Number(text);
    if(!Number.isFinite(amount)||Math.abs(amount)>1e12)return null;
    return amount>0?1:amount<0?-1:0;
  }
  function evidenceType(row){
    if(!row||row.pending)return null;
    const direction=sign(row.amount);
    const flags=Array.isArray(row.signals)?row.signals:[];
    if(direction===-1&&(row.kind==='possible_reversal'||flags.includes('possible_reversal')))return 'reversal';
    if(direction===1&&(row.kind==='possible_bonus'||flags.includes('possible_bonus')))return 'bonus';
    if(direction===1&&flags.includes('possible_direct_deposit'))return 'directDeposit';
    if(direction===-1&&flags.includes('possible_fee'))return 'fee';
    if(direction===-1&&flags.includes('possible_recurring'))return 'recurring';
    return null;
  }
  function summarize(state={},entries=[],now=Math.floor(Date.now()/1000)){
    const safeState=state&&typeof state==='object'?state:{};
    const open=Array.isArray(entries)?entries.filter(e=>e&&e.id!=null&&e.bank&&e.opened&&!e.closed):[];
    const accounts=Array.isArray(safeState.accounts)?safeState.accounts:[];
    const accountByKey=new Map(accounts.map(a=>[a.key,a]));
    const mappings=safeState.mappings&&typeof safeState.mappings==='object'?safeState.mappings:{};
    const transactions=safeState.transactions&&typeof safeState.transactions==='object'?safeState.transactions:{};
    const missing=new Set(Array.isArray(safeState.missingAccounts)?safeState.missingAccounts:[]);
    const grouped=new Map(),invalidLinks=[];
    const evidenceReviews=safeState.evidenceReviews&&typeof safeState.evidenceReviews==='object'?safeState.evidenceReviews:{};
    const validEntries=new Map(open.map(e=>[String(e.id),e]));
    for(const [key,mapping] of Object.entries(mappings)){
      const entry=mapping&&validEntries.get(String(mapping.entryId));
      if(!entry||mapping.bank!==entry.bank||mapping.opened!==entry.opened||openingTimestamp(entry.opened)===null){
        invalidLinks.push({key,reason:'Saved bank-bonus link needs review'});
        continue;
      }
      let group=grouped.get(String(entry.id));
      if(!group){
        group={entryId:String(entry.id),bank:entry.bank,opened:entry.opened,
          linkedAccounts:[],activity:[],counts:{bonus:0,directDeposit:0,fee:0,reversal:0,recurring:0},
          missingAccounts:0,unsupportedCurrency:0,review:{unreviewed:0,reviewed:0,dismissed:0}};
        grouped.set(String(entry.id),group);
      }
      const account=accountByKey.get(key);
      if(!account||missing.has(key)){
        group.missingAccounts++;
        continue;
      }
      const supported=account.currency==='USD';
      group.linkedAccounts.push({key,name:String(account.name||'Financial account'),bank:String(account.bank||''),productId:typeof mapping.productId==='string'?mapping.productId:null});
      if(!supported){group.unsupportedCurrency++;continue;}
      const rows=transactions[key]&&typeof transactions[key]==='object'&&!Array.isArray(transactions[key])
        ?Object.values(transactions[key]):[];
      const openedAt=openingTimestamp(entry.opened);
      for(const row of rows){
        if(!row||!Number.isFinite(row.posted)||row.posted<openedAt||row.posted>now+300)continue;
        const type=evidenceType(row);
        if(!type)continue;
        group.counts[type]++;
        const saved=evidenceReviews[key]&&evidenceReviews[key][String(row.id||'')];
        const reviewStatus=saved&&['reviewed','dismissed'].includes(saved.status)?saved.status:'unreviewed';
        group.review[reviewStatus]++;
        group.activity.push({
          reviewStatus,reviewedAt:saved?.reviewedAt||null,
          requirementId:reviewStatus==='reviewed'?saved?.requirementId||null:null,
          type,id:String(row.id||''),accountKey:key,
          amount:String(row.amount),posted:row.posted,
          description:String(row.description||row.merchant||'Bank transaction').slice(0,220)
        });
      }
    }
    const campaigns=[...grouped.values()].map(group=>{
      group.activity.sort((a,b)=>b.posted-a.posted||a.accountKey.localeCompare(b.accountKey));
      // Prioritize potentially costly reversals and fees above routine deposits,
      // while preserving newest-first ordering within each urgency tier.
      const urgency={reversal:5,fee:4,bonus:3,directDeposit:2,recurring:1};
      group.pending=group.activity.filter(a=>a.reviewStatus==='unreviewed')
        .sort((a,b)=>(urgency[b.type]||0)-(urgency[a.type]||0)
          ||b.posted-a.posted||a.accountKey.localeCompare(b.accountKey)||a.id.localeCompare(b.id));
      group.resolved=group.activity.filter(a=>a.reviewStatus!=='unreviewed');
      group.latest=group.pending.slice(0,5);
      group.needsReview=group.pending.length>0;
      return group;
    }).sort((a,b)=>{
      const score=g=>g.pending.reduce((n,a)=>n+({reversal:8,fee:5,bonus:4,directDeposit:3,recurring:1}[a.type]||0),0);
      return score(b)-score(a)||a.bank.localeCompare(b.bank);
    });
    const total={bonus:0,directDeposit:0,fee:0,reversal:0,recurring:0};
    const review={unreviewed:0,reviewed:0,dismissed:0};
    for(const c of campaigns){
      for(const type of Object.keys(total))total[type]+=c.counts[type];
      for(const status of Object.keys(review))review[status]+=c.review[status];
    }
    const linkedIds=new Set(campaigns.map(c=>c.entryId));
    return {
      linkedCampaigns:campaigns.length,unlinkedOpenCampaigns:open.filter(e=>!linkedIds.has(String(e.id))).length,
      openCampaigns:open.length,invalidLinks:invalidLinks.length,campaigns,
      counts:total,review,
      lastSuccess:Number.isFinite(safeState.lastSuccess)?safeState.lastSuccess:null,
      staleSync:!Number.isFinite(safeState.lastSuccess)||now-safeState.lastSuccess>2*DAY,
      evidenceOnly:true
    };
  }
  return Object.freeze({summarize,evidenceType,openingTimestamp,REASONS});
});
