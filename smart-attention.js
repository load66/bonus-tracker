/* BonusTracker v3.4.14 attention hotfix — every open bank gets exactly one smart Needs Attention item. */
(function(){
  'use strict';
  const VER='3.4.14-attention1';
  const base=window.getAttentionSuggestions;

  function daysTo(date){
    if(!date)return 999999;
    try{if(typeof dB==='function'&&typeof td==='function')return Math.max(0,dB(td(),date))}catch{}
    const now=new Date(), due=new Date(String(date)+'T00:00:00');
    return Math.max(0,Math.floor((due-now)/864e5));
  }
  function semanticMissing(e){
    let state=null;
    try{if(typeof window.btSemanticStateForEntry==='function')state=window.btSemanticStateForEntry(e)}catch{}
    const timer=state?.timer||null;
    if(timer&&timer.date){
      const d=daysTo(timer.date);
      const label=String(state?.label||'Deadline').trim();
      const support=String(state?.support||'').trim();
      return {bank:e.bank,entryId:e.id||'',dedupeKey:e.id||e.bank,rsn:support?(support+' · '+label):label,bonus:e.bonus||0,showBonus:true,days:d,pri:3.5,category:state?.kind||'timer'};
    }
    if(!e.reqMet&&!e.bonusRecd&&e.opened&&Number(e.reqDays||0)>0){
      let due='';try{if(typeof reqDeadline==='function')due=reqDeadline(e)||''}catch{}
      const d=due?daysTo(due):999999;
      return {bank:e.bank,entryId:e.id||'',dedupeKey:e.id||e.bank,rsn:d<999999?(d+'d to requirement deadline.'):'Requirement pending.',bonus:e.bonus||0,showBonus:true,days:d,pri:4,category:'requirement'};
    }
    if(e.reqMet&&!e.bonusRecd)return {bank:e.bank,entryId:e.id||'',dedupeKey:e.id||e.bank,rsn:'Requirements met · waiting for bonus.',bonus:e.bonus||0,showBonus:true,days:999998,pri:5,category:'waiting-bonus'};
    if(e.bonusRecd)return {bank:e.bank,entryId:e.id||'',dedupeKey:e.id||e.bank,rsn:'Bonus received · close after the bank confirms closure.',bonus:e.bonus||0,showBonus:true,days:999997,pri:5.5,category:'bonus-received'};
    return {bank:e.bank,entryId:e.id||'',dedupeKey:e.id||e.bank,rsn:'Open · review next requirement.',bonus:e.bonus||0,showBonus:true,days:999999,pri:8,category:'review'};
  }
  function smart(){
    let rows=[];
    try{rows=typeof base==='function'?(base()||[]):[]}catch{rows=[]}
    const open=[];
    try{if(typeof entries!=='undefined'&&Array.isArray(entries))entries.forEach(e=>{if(e&&e.bank&&!e.closed)open.push(e)})}catch{}
    const seen=new Set(rows.map(r=>String(r?.entryId||r?.dedupeKey||r?.bank||'')));
    open.forEach(e=>{
      const key=String(e.id||e.bank||'');
      if(!seen.has(key)){rows.push(semanticMissing(e));seen.add(key)}
    });
    const openKeys=new Set(open.map(e=>String(e.id||e.bank||'')));
    rows=rows.filter(r=>openKeys.has(String(r?.entryId||r?.dedupeKey||r?.bank||'')));
    rows.sort((a,b)=>(Number(a.days??999999)-Number(b.days??999999))||(Number(a.pri??99)-Number(b.pri??99))||String(a.bank||'').localeCompare(String(b.bank||'')));
    return rows;
  }
  window.getAttentionSuggestions=smart;
  try{getAttentionSuggestions=smart}catch{}
  window.btSmartAttentionVersion=VER;
})();
