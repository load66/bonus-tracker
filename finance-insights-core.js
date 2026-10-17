/* Finance-only spending and recurring analysis. No persistence, no framework. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceInsights=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400000;
  const SPEND=new Set(['housing','loan','utilities','groceries','dining','transportation','shopping','health','entertainment','fees','taxes','travel','subscription','other','unreviewed']);
  const excluded=new Set(['verification','refund','bonus']);
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
  const issuer=/\b(capital\s*one|chase|amex|american\s*express|discover|citi(?:bank)?|robinhood|fidelity|schwab|vanguard|synchrony|barclays|wells\s*fargo)\b/i;
  const payment=/\b(pmt|pymt|payment|autopay|epay|crcardpmt|card\s*payment)\b/i;
  const investment=/\b(robinhood|fidelity|schwab|vanguard|brokerage|401k|roth\s*ira|investment|ira)\b/i;
  const contribution=/\b(contribution|contribute|deposit|funding|transfer)\b/i;
  function expenseCategory(row){
    if(!row||row.pending||row.excludedFromTotals)return null;
    const v=cents(row.amount);
    if(v===null||v>=0n)return null;
    const category=String(row.category||'unreviewed');
    if(['transfer','verification','refund','bonus','income'].includes(category))return null;
    if((row.signals||[]).includes('matched_internal_transfer'))return null;
    const description=String(row.description||'')+' '+String(row.merchant||'');
    // Protect bank payments that have yet to be recategorized by the server.
    if(issuer.test(description)&&payment.test(description))return null;
    if(investment.test(description)&&contribution.test(description))return null;
    return SPEND.has(category)?category:'unreviewed';
  }
  function eligibleRows(rows,month,mode='spending'){
    return (rows||[]).filter(row=>{
      if(!Number.isFinite(row?.posted)||monthKey(row.posted*1000)!==month||
         row.pending||row.excludedFromTotals)return false;
      return mode==='spending'?expenseCategory(row)!==null:
        cents(row.amount)>0n&&row.category==='income';
    });
  }
  function spent(rows,month){
    const amounts={},byDay={},incomeByDay={},counts={};
    let total=0n,income=0n,uncategorized=0,records=0,observations=0;
    for(const row of rows||[]){
      if(row?.pending||row?.excludedFromTotals||!Number.isFinite(row?.posted)||
         monthKey(row.posted*1000)!==month)continue;
      const v=cents(row.amount);
      if(v===null)continue;
      observations++;
      const day=new Date(row.posted*1000).getDate();
      if(v>0n&&row.category==='income'){
        income+=v;incomeByDay[day]=(incomeByDay[day]||0n)+v;
      }
      const category=expenseCategory(row);
      if(!category)continue;
      const expense=-v;
      total+=expense;records++;
      if(category==='unreviewed')uncategorized++;
      amounts[category]=(amounts[category]||0n)+expense;
      counts[category]=(counts[category]||0)+1;
      byDay[day]=(byDay[day]||0n)+expense;
    }
    return {month,total:fmt(total),income:fmt(income),uncategorized,records,observations,
      hasData:observations>0,
      categories:Object.entries(amounts).map(([category,value])=>({category,amount:fmt(value),count:counts[category],
        percentage:total?Number(value*10000n/total)/100:0})).sort((a,b)=>Number(b.amount)-Number(a.amount)),
      byDay:Object.fromEntries(Object.entries(byDay).map(([key,value])=>[key,fmt(value)])),
      incomeByDay:Object.fromEntries(Object.entries(incomeByDay).map(([key,value])=>[key,fmt(value)]))};
  }
  function merchantTotals(rows,month){
    const groups=new Map();
    for(const row of eligibleRows(rows,month)){
      const label=String(row.merchant||row.description||'Unknown merchant').trim()||'Unknown merchant';
      const key=merchant(row)||label.toLowerCase();
      const entry=groups.get(key)||{merchant:label,amount:0n,count:0,rows:[]};
      entry.amount-=cents(row.amount);entry.count++;entry.rows.push(row);groups.set(key,entry);
    }
    return [...groups.values()].map(g=>({...g,amount:fmt(g.amount)}))
      .sort((a,b)=>Number(b.amount)-Number(a.amount));
  }
  function monthlyTrend(rows,throughMonth,months=24){
    const out=[];
    for(let i=months-1;i>=0;i--){
      const month=monthShift(throughMonth,-i),value=spent(rows,month);
      if(value.hasData)out.push(value);
    }
    return out;
  }
  function budgetState(spentAmount,budgetAmount,today,totalDays){
    const used=cents(spentAmount),limit=cents(budgetAmount);
    if(used===null||limit===null||limit<=0n)return null;
    const ratio=Number(used*10000n/limit)/100;
    const projected=used*BigInt(totalDays)/BigInt(Math.max(1,Math.min(totalDays,today)));
    const remaining=limit>used?limit-used:0n;
    return {used:fmt(used),limit:fmt(limit),remaining:fmt(remaining),
      percentage:ratio,level:used>limit?'over':used*5n>=limit*4n?'near':'ok',
      projected:fmt(projected)};
  }
  const INTERVALS=[['weekly',7,2],['biweekly',14,3],['monthly',30.44,6],['quarterly',91.3,12],['yearly',365.25,25]];
  function recurring(rows,now=Date.now()){
    const groups=new Map();
    for(const row of rows||[]){
      if(row.pending||row.excludedFromTotals||!Number.isFinite(row.posted)||row.posted*1000>now+DAY)continue;
      const n=cents(row.amount);
      if(n===null||n===0n||excluded.has(row.category)||row.category==='bonus')continue;
      const key=merchant(row)+'|'+(n>0n?'credit':'debit');
      if(!merchant(row)||merchant(row)==='transaction'||merchant(row)==='transfer')continue;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({at:row.posted*1000,cents:n,row});
    }
    const out=[];
    for(const [key,entries] of groups){
      entries.sort((a,b)=>a.at-b.at);
      if(entries.length<2)continue;
      const diffs=entries.slice(1).map((v,i)=>(v.at-entries[i].at)/DAY);
      const candidates=INTERVALS.map(([name,days,tolerance])=>({
        name,days,score:diffs.filter(d=>Math.abs(d-days)<=tolerance).length,
        error:diffs.reduce((sum,d)=>sum+Math.abs(d-days),0)
      })).sort((a,b)=>b.score-a.score||a.error-b.error);
      const match=candidates[0];
      if(match.score<1||match.score/Math.max(1,diffs.length)<.6)continue;
      const last=entries.at(-1),previous=entries.at(-2),abs=n=>(n<0n?-n:n);
      const avg=entries.reduce((sum,x)=>sum+abs(x.cents),0n)/BigInt(entries.length);
      const deviation=avg>0n?Number(abs(abs(last.cents)-avg)*10000n/avg)/100:0;
      if(deviation>30)continue;
      const priceIncreased=abs(last.cents)>abs(previous.cents)*11n/10n;
      const next=last.at+Math.round(match.days*DAY);
      const missed=now>next+match.days*DAY*.5;
      out.push({key,merchant:entries.at(-1).row.merchant||entries.at(-1).row.description,
        category:entries.at(-1).row.category,frequency:match.name,
        average:fmt(avg),lastAmount:fmt(abs(last.cents)),lastAt:Math.round(last.at/1000),
        nextAt:Math.round(next/1000),status:missed?'possibly_canceled':priceIncreased?'price_increased':'active',
        direction:last.cents>0n?'income':'expense',history:entries.map(e=>({posted:Math.round(e.at/1000),amount:fmt(e.cents)}))});
    }
    return out.sort((a,b)=>a.nextAt-b.nextAt);
  }
  function upcoming(items,now=Date.now(),days=14){
    return (items||[]).filter(x=>x.direction==='expense'&&x.status!=='possibly_canceled'&&x.nextAt*1000>=now-DAY&&x.nextAt*1000<=now+days*DAY).slice(0,5);
  }
  return Object.freeze({spent,recurring,upcoming,monthKey,monthShift,cents,fmt,SPEND,expenseCategory,eligibleRows,merchantTotals,monthlyTrend,budgetState});
});