/* Finance-only spending and recurring analysis. No persistence, no framework. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceInsights=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400000;
  const SPEND=new Set(['housing','loan','utilities','groceries','dining','transportation','shopping','health','entertainment','fees','taxes','travel','subscription','other','unreviewed']);
  const excluded=new Set(['verification','refund','bonus','unreviewed']);
  function cents(value){
    const match=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
    if(!match)return null;
    let n=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')||'0');
    if(n>100000000000000n)return null;
    return match[1]==='-'?-n:n;
  }
  function fmt(n){const neg=n<0n;if(neg)n=-n;return (neg?'-':'')+String(n/100n)+'.'+String(n%100n).padStart(2,'0')}
  const merchant=row=>String(row.merchant||row.description||'Unknown merchant').toLowerCase().replace(/\b\d+\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ').slice(0,64);
  function monthKey(ms){const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function monthShift(value,offset){const d=new Date(value+'-01T12:00:00');d.setMonth(d.getMonth()+offset);return monthKey(d.getTime())}
  const noSpend=new Set(['transfer','verification','refund']);
  const issuer=/(?:capital\s*one|chase|american\s*express|amex|discover|citi(?:bank)?|robinhood|fidelity|schwab|vanguard|e\s*\*?\s*trade)/i;
  const cardPayment=/(?:\b(?:pmt|payment|autopay|epay|crcardpmt|ccpmt)\b|credit\s*card\s*payment)/i;
  const investing=/(?:\brobinhood\b|\bfidelity\b|\bschwab\b|\bvanguard\b|\bbrokerage\b|\binvestment\b|\b401k\b|\broth\s*ira\b|\bira\b)/i;
  const contribute=/(?:\b(?:contribution|contribute|deposit|funding|transfer)\b)/i;
  const getGuard=()=>typeof window!=='undefined'?window.BTFinanceTransfer:typeof require==='function'?require('./finance-transfer-core.js'):null;
  const resolve=row=>getGuard()?.effective(row)||row;
  function spendingCategory(row,value){
    const item=resolve(row);
    if(item.excludedFromTotals===true||item.pending===true||value===null||value>=0n)return null;
    const category=String(item.category||'unreviewed').toLowerCase();
    if(noSpend.has(category)||item.kind==='card_payment'||item.kind==='investment_contribution'||
       (item.signals||[]).some(s=>['matched_internal_transfer','possible_transfer','card_payment','investment_transfer'].includes(s)))return null;
    return SPEND.has(category)?category:'unreviewed';
  }
  const seenMonth=(rows,month)=>rows.some(row=>!row.pending&&!row.excludedFromTotals&&
    Number.isFinite(row.posted)&&monthKey(row.posted*1000)===month&&cents(row.amount)!==null);
  const monthDays=month=>{const [year,number]=month.split('-').map(Number);return new Date(year,number,0).getDate()};
  function spent(rows,month){
    const amounts={},byDay={},incomeByDay={},counts={},merchantGroups=new Map();
    const purchases=new Map(),refunds=[];
    let total=0n,income=0n,uncategorized=0,records=0,refundOffset=0n;
    const valid=(rows||[]).filter(row=>row&&!row.pending&&!row.excludedFromTotals&&
      Number.isFinite(row.posted)&&monthKey(row.posted*1000)===month&&cents(row.amount)!==null);
    for(const raw of valid){
      const row=resolve(raw);
      const v=cents(row.amount),day=new Date(row.posted*1000).getDate(),category=spendingCategory(row,v);
      if(v>0n){
        if(row.category==='income'&&!row.signals?.some(signal=>['matched_internal_transfer','possible_transfer','investment_transfer','card_payment'].includes(signal))){income+=v;incomeByDay[day]=(incomeByDay[day]||0n)+v}
        if(row.category==='refund')refunds.push({row,value:v,day});
        continue;
      }
      if(!category)continue;
      const expense=-v;
      total+=expense;records++;amounts[category]=(amounts[category]||0n)+expense;
      byDay[day]=(byDay[day]||0n)+expense;counts[category]=(counts[category]||0)+1;
      if(category==='unreviewed')uncategorized++;
      const key=merchant(row),group=merchantGroups.get(key)||{merchant:row.merchant||row.description||'Unknown merchant',value:0n,count:0,rows:[]};
      group.value+=expense;group.count++;group.rows.push(row);merchantGroups.set(key,group);
      const same=purchases.get(key)||[];same.push({row,expense,category,day});purchases.set(key,same);
    }
    // A refund is not income. Offset only a demonstrably matching merchant debit
    // from this same reporting month; ambiguous refunds remain neutral.
    for(const {row,value,day} of refunds){
      const same=purchases.get(merchant(row))||[];
      if(same.length!==1||same[0].expense<value)continue;
      const buy=same[0];amounts[buy.category]-=value;
      byDay[day]=(byDay[day]||0n)-value;refundOffset+=value;total-=value;
      const group=merchantGroups.get(merchant(row));if(group)group.value-=value;
    }
    const categories=Object.entries(amounts).filter(([,v])=>v>0n)
      .map(([category,value])=>({category,amount:fmt(value),count:counts[category]||0,
        percentage:total?Number(value*10000n/total)/100:0}))
      .sort((a,b)=>Number(b.amount)-Number(a.amount));
    const merchants=[...merchantGroups.values()].filter(g=>g.value>0n)
      .map(g=>({merchant:g.merchant,amount:fmt(g.value),count:g.count,key:merchant(g.rows[0])}))
      .sort((a,b)=>Number(b.amount)-Number(a.amount));
    return {month,hasData:valid.length>0,total:fmt(total),income:fmt(income),uncategorized,records,
      refundOffsets:fmt(refundOffset),categories,merchants,
      byDay:Object.fromEntries(Object.entries(byDay).map(([key,value])=>[key,fmt(value)])),
      incomeByDay:Object.fromEntries(Object.entries(incomeByDay).map(([key,value])=>[key,fmt(value)]))};
  }
  function history(rows,until,limit=24){
    const months=[...new Set((rows||[]).filter(row=>row&&!row.pending&&!row.excludedFromTotals&&
      Number.isFinite(row.posted)&&cents(row.amount)!==null).map(row=>monthKey(row.posted*1000)))]
      .filter(month=>month<=until).sort();
    const selected=months.slice(-limit);
    return {start:months[0]||null,months:selected.map(month=>spent(rows,month))};
  }
  function budget(amount,spentAmount,day,days){
    const limit=cents(amount),actual=cents(spentAmount);
    if(limit===null||limit<=0n||actual===null)return null;
    const clampedDay=Math.min(Math.max(1,day),days);
    const percent=Number(actual*10000n/limit)/100;
    const left=limit>actual?limit-actual:0n;
    const projected=actual*BigInt(days)/BigInt(clampedDay);
    return {limit:fmt(limit),spent:fmt(actual),left:fmt(left),projected:fmt(projected),
      percent,level:actual>limit?'over':actual*5n>=limit*4n?'near':'ok'};
  }
  const INTERVALS=[['weekly',7,2],['biweekly',14,3],['monthly',30.44,6],['quarterly',91.3,12],['yearly',365.25,25]];
  const abs=n=>n<0n?-n:n;
  function recurring(rows,now=Date.now(),rules={}){
    const groups=new Map();
    for(const original of rows||[]){
      if(!original||original.pending||original.excludedFromTotals||
         !Number.isFinite(original.posted)||original.posted*1000>now+DAY)continue;
      const row=resolve(original),n=cents(row.amount);
      if(n===null||n===0n||excluded.has(row.category)||row.category==='bonus')continue;
      const signals=row.signals||[],label=getGuard()?.label(row);
      const type=signals.includes('card_payment')||row.kind==='card_payment'?'card_payment':
        row.category==='transfer'||signals.some(s=>['matched_internal_transfer','investment_transfer','transfer','possible_transfer'].includes(s))
          ?'transfer':n>0n?'income':'expense';
      // Transfers and card payments are never recurring bills or wages.
      const name=merchant(row);
      if(!name||['transaction','transfer','payment'].includes(name)&&type!=='card_payment')continue;
      const key=name+'|'+(n>0n?'credit':'debit');
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({at:row.posted*1000,cents:n,row,type});
    }
    const out=[];
    for(const [key,entries] of groups){
      entries.sort((a,b)=>a.at-b.at);
      const rule=rules[key]||{};
      if(entries.length<(rule.confirmed===true?2:3))continue;
      // Different financial transaction types should never share one stream.
      if(entries.some(entry=>entry.type!==entries[0].type))continue;
      const diffs=entries.slice(1).map((v,i)=>(v.at-entries[i].at)/DAY);
      const candidates=INTERVALS.map(([name,days,tolerance])=>({
        name,days,score:diffs.filter(d=>Math.abs(d-days)<=tolerance).length,
        error:diffs.reduce((sum,d)=>sum+Math.abs(d-days),0)
      })).sort((a,b)=>b.score-a.score||a.error-b.error);
      const match=candidates[0];
      if(match.score/Math.max(1,diffs.length)<.8)continue;
      const last=entries.at(-1),previous=entries.at(-2),value=abs(last.cents);
      const avg=entries.reduce((sum,x)=>sum+abs(x.cents),0n)/BigInt(entries.length);
      // Paychecks vary with hours; ordinary recurring debits should be stable.
      const tolerance=entries[0].type==='income'?25n:15n;
      if(avg===0n||entries.some(entry=>abs(abs(entry.cents)-avg)*100n>avg*tolerance))continue;
      const next=last.at+Math.round(match.days*DAY);
      const ended=now>next+match.days*DAY;
      const priceIncreased=value>abs(previous.cents)*11n/10n;
      out.push({key,merchant:last.row.merchant||last.row.description,
        category:last.row.category,frequency:match.name,
        average:fmt(avg),lastAmount:fmt(value),lastAt:Math.round(last.at/1000),
        nextAt:ended?null:Math.round(next/1000),
        status:ended?'possibly_ended':priceIncreased?'price_increased':'active',
        direction:last.cents>0n?'income':'expense',type:entries[0].type,
        history:entries.map(e=>({posted:Math.round(e.at/1000),amount:fmt(e.cents)}))});
    }
    return out.sort((a,b)=>(a.nextAt??Infinity)-(b.nextAt??Infinity));
  }
  function upcoming(items,now=Date.now(),days=14){
    return (items||[]).filter(x=>x.type==='expense'&&x.status!=='possibly_ended'&&
      Number.isFinite(x.nextAt)&&x.nextAt*1000>=now&&x.nextAt*1000<=now+days*DAY).slice(0,5);
  }
  return Object.freeze({spent,history,budget,spendingCategory,seenMonth,monthDays,merchant,recurring,upcoming,monthKey,monthShift,cents,fmt,SPEND});
});