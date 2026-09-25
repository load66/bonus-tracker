/*
 * filename: profile-registry-academy.js
 * version: 3.4.16
 * purpose: Academy Bank profile registry extension.
 * last-touched: unknown
 */
(function(){
  const VER='3.4.16';
  const ACADEMY={
    id:'academy-bank-elite-investment-checking',
    bank:'Academy Bank',
    product:'Elite Investment Checking',
    type:'personal checking',
    status:'saved',
    signals:[/Academy Bank|Elite Investment Checking/i,/\$100 opening balance|four direct deposits|at least four direct deposits/i,/Online Banking|early closure fee|MoneyPass/i],
    requirements:'$500 bonus; $100 opening balance + 4 direct deposits totaling $10,000 + Online Banking within 90 days',
    note:'Saved profile: Academy Bank Elite Investment Checking $500 direct deposit bonus.'
  };
  function scoreProfile(p,raw){return (p.signals||[]).reduce((n,re)=>n+(re.test(raw)?1:0),0)}
  function matchesAcademySavedOffer(raw){
    try{if(typeof window.tcV3AcademySavedOfferMatches==='function')return window.tcV3AcademySavedOfferMatches(raw)}catch{}
    const s=String(raw||'');
    return /\bAcademy Bank\b/i.test(s)
      && /\bElite Investment Checking\b/i.test(s)
      && /\$\s*500\s+(?:cash\s+)?bonus/i.test(s)
      && /(?:four|4)\s+(?:qualifying\s+)?direct deposits?/i.test(s)
      && /\$\s*10,?000/i.test(s)
      && /\b90\s+(?:calendar\s+)?days?\b/i.test(s)
      && !/\b(?:there is|there's)\s+no\s+(?:cash\s+)?bonus\b|\bnot\s+(?:a|an)\s+(?:cash\s+)?bonus\s+offer\b/i.test(s)
  }
  function wrapList(){
    if(window.__tcV31AcademyRegistryWrapped)return;
    if(typeof window.tcV3KnownProfiles!=='function'||typeof window.tcV3MatchKnownProfile!=='function')return;
    const baseList=window.tcV3KnownProfiles;
    const baseMatch=window.tcV3MatchKnownProfile;
    window.tcV3KnownProfiles=function(){
      const list=baseList()||[];
      if(list.some(p=>p.id===ACADEMY.id))return list;
      return [ACADEMY].concat(list);
    };
    window.tcV3MatchKnownProfile=function(raw){
      raw=String(raw||'');
      const academyScore=scoreProfile(ACADEMY,raw);
      const base=baseMatch(raw);
      if(matchesAcademySavedOffer(raw) && (!base?.known || academyScore >= (base.score||0))) return {...ACADEMY,score:academyScore,known:true};
      return base;
    };
    window.__tcV31AcademyRegistryWrapped=true;
  }
  window.tcV31AcademyProfile=ACADEMY;
  window.tcV31AcademyRegistryVersion=VER;
  setTimeout(wrapList,100);setTimeout(wrapList,600);setTimeout(wrapList,1500);
})();
