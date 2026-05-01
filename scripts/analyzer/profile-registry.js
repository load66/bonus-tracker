/* ✅ Version 3.0.5 Newest update: Analyzer profile registry adds BMO Business Checking as saved reusable profile. */
(function(){
  const VER='3.0.5';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const PROFILES=[
    {
      id:'bmo-business-checking-tiered-hold',
      bank:'BMO',
      product:'Digital/Simple/Premium/Elite Business Checking',
      type:'business checking',
      status:'saved',
      signals:[/\bBMO\b/i,/Business Checking/i,/Day 30|Day 31 to Day 90|Day 31 through Day 90/i],
      requirements:'Tiered Day 30 balance check + Day 31–90 hold',
      note:'Saved profile: BMO Business Checking tiered Day 30 + Day 31–90 balance hold bonus.'
    },
    {
      id:'chase-business-complete-checking',
      bank:'Chase',
      product:'Business Complete Checking',
      type:'business checking',
      status:'saved',
      signals:[/Chase Business Complete Checking/i,/business checking offer/i,/JPMorgan Chase/i],
      requirements:'New money funding + 60-day hold + 5 qualifying transactions',
      note:'Saved profile: Chase Business Complete Checking business bonus.'
    },
    {
      id:'wells-fargo-business-checking',
      bank:'Wells Fargo',
      product:'Initiate/Navigate/Optimize Business Checking',
      type:'business checking',
      status:'saved',
      signals:[/Wells Fargo/i,/Initiate Business Checking|Navigate Business Checking|Optimize Business Checking/i,/minimum daily collected balance/i],
      requirements:'Deposit $2,500 by day 30 + maintain through day 60',
      note:'Saved profile: Wells Fargo Business Checking deposit + hold bonus.'
    },
    {
      id:'bank-of-america-personal-checking-chart',
      bank:'Bank of America',
      product:'Advantage personal checking',
      type:'personal checking',
      status:'saved',
      signals:[/Bank of America|BofA/i,/Advantage SafeBalance|Advantage Plus|Advantage Relationship/i,/Bonus Chart/i],
      requirements:'Tiered direct deposit chart',
      note:'Saved profile: Bank of America personal checking bonus chart.'
    },
    {
      id:'morgan-stanley-private-bank-checking',
      bank:'Morgan Stanley Private Bank',
      product:'Checking / Max-Rate Checking',
      type:'personal checking',
      status:'generic-covered',
      signals:[/Morgan Stanley Private Bank|E\*TRADE/i,/Max-Rate Checking/i,/CHECKING25|promo code/i],
      requirements:'Direct deposit bonus; generic parser covers it, dedicated profile can be added if needed',
      note:'Generic-covered profile: Morgan Stanley Private Bank Checking / Max-Rate Checking.'
    },
    {
      id:'us-bank-smartly-checking',
      bank:'U.S. Bank',
      product:'Smartly Checking',
      type:'personal checking',
      status:'generic-covered',
      signals:[/U\.S\. Bank|US Bank/i,/Smartly Checking/i,/direct deposits.*\$2,000|\$8,000 or more/i],
      requirements:'Tiered direct deposit bonus; generic parser covers it, dedicated profile can be added if needed',
      note:'Generic-covered profile: U.S. Bank Smartly Checking.'
    }
  ];
  function matchProfile(raw){
    raw=String(raw||'');
    let best=null,bestScore=0;
    PROFILES.forEach(p=>{
      const score=(p.signals||[]).reduce((n,re)=>n+(re.test(raw)?1:0),0);
      if(score>bestScore){bestScore=score;best=p;}
    });
    if(best&&bestScore>=2)return {...best,score:bestScore,known:true};
    return {known:false,status:'new-or-review',note:'No saved exact profile found. Send this sample so it can be added as a reusable bank profile.'};
  }
  function list(){return PROFILES.slice();}
  function wrap(){
    if(window.__tcV3ProfileRegistryWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){
      const r=base(raw,opts);
      const m=matchProfile(raw||r?.raw||r?.normalizedRaw||'');
      if(r){
        r.profileRegistry=m;
        r.profileRegistryVersion=VER;
        r.profileKnown=!!m.known;
        r.profileStatus=m.status;
        r.profileNote=m.note;
      }
      return r;
    };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3ProfileRegistryWrapped=true;
  }
  window.tcV3KnownProfiles=list;
  window.tcV3MatchKnownProfile=matchProfile;
  window.tcV3ProfileRegistryVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();
