/* Finance-only spending and recurring analysis. No persistence, no framework. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceInsights=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400000;
  const SPEND=new Set(['housing','loan','utilities','groceries','dining','transportation','shopping','health','entertainment','fees','taxes','travel','subscription','other']);
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
  function spent(rows,month){
    const amounts={},byDay={},incomeByDay={};
    let total=0n,income=0n,uncategorized=0,records=0;
    for(const row of rows||[]){
      if(row.pending||row.excludedFromTotals||!Number.isFinite(row.posted)||monthKey(row.posted*1000)!==month)continue;
      const v=cents(row.amount),category=String(row.category||'unreviewed');
      if(v===null)continue;
      const day=new Date(row.posted*1000).getDate();
      if(v>0n&&category==='income'){income+=v;incomeByDay[day]=(incomeByDay[day]||0n)+v}
      if(category==='unreviewed')uncategorized++;
      if(v>=0n||!SPEND.has(category)||excluded.has(category))continue;
      const expense=-v;
      total+=expense;records++;
      amounts[category]=(amounts[category]||0n)+expense;
      byDay[day]=(byDay[day]||0n)+expense;
    }
    return {month,total:fmt(total),income:fmt(income),uncategorized,records,
      categories:Object.entries(amounts).map(([category,value])=>({category,amount:fmt(value),percentage:total?Number(value*10000n/total)/100:0})).sort((a,b)=>Number(b.amount)-Number(a.amount)),
      byDay:Object.fromEntries(Object.entries(byDay).map(([key,value])=>[key,fmt(value)])),
      incomeByDay:Object.fromEntries(Object.entries(incomeByDay).map(([key,value])=>[key,fmt(value)]))};
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
  return Object.freeze({spent,recurring,upcoming,monthKey,monthShift,cents,fmt,SPEND});
});