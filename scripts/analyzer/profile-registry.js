/*
 * filename: scripts/analyzer/profile-registry.js
 * version: 3.3.23
 * purpose: Analyzer profile registry for reusable saved bank bonus profiles, including Chase Total Checking.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.23';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const PROFILES=[
    {
      id:'busey-bank-personal-checking-levelup',
      bank:'Busey Bank',
      product:'Foundation Checking / Pillar Banking',
      type:'personal checking',
      status:'saved',
      signals:[/Busey Bank|Busey/i,/Foundation Checking|Pillar Banking|LEVELUP1|LEVELUP2/i,/Busey Debit Mastercard|tiered credit/i],
      requirements:'Promo code + online banking + 3 debit transactions + tiered DD within 90 days',
      note:'Saved profile: Busey Bank Foundation Checking / Pillar Banking tiered direct deposit bonus.'
    },
    {
      id:'equity-bank-bloom-checking-savings',
      bank:'Equity Bank',
      product:'Bloom checking + savings combo',
      type:'personal checking + savings',
      status:'saved',
      signals:[/Equity Bank|Equity Bancshares/i,/Bloom Bonus|Bloom/i,/checking and savings|new checking and savings|Enter Promotional Code/i],
      requirements:'Open/fund checking+savings combo + $1,000 DD + debit card use within 45 days',
      note:'Saved profile: Equity Bank Bloom checking + savings combo bonus. Bonus amount may need review if not included in pasted T&C.'
    },
    {
      id:'regions-lifegreen-personal-checking',
      bank:'Regions Bank',
      product:'LifeGreen personal checking',
      type:'personal checking',
      status:'saved',
      signals:[/Regions/i,/LifeGreen|personal Regions checking/i,/Qualifying ACH direct deposits|Register before you open/i],
      requirements:'Register before opening + $1,000+ qualifying ACH direct deposits within 90 days',
      note:'Saved profile: Regions LifeGreen personal checking ACH direct deposit bonus. Bonus amount may need review if not included in pasted T&C.'
    },
    {
      id:'pnc-virtual-wallet-consumer-checking',
      bank:'PNC',
      product:'Virtual Wallet / Virtual Wallet with Performance Select',
      type:'personal checking',
      status:'saved',
      signals:[/\bPNC\b|PNC Bank/i,/Virtual Wallet|Performance Select/i,/CREDITS CHECK REWARD|Spend account|qualifying direct deposit/i],
      requirements:'Tiered qualifying direct deposit within 60 days; $100 for $500+ DD or $400 for $5,000+ DD',
      note:'Saved profile: PNC Virtual Wallet consumer checking tiered direct deposit reward.'
    },
    {
      id:'bank-of-america-business-advantage-banking',
      bank:'Bank of America',
      product:'Business Advantage Banking',
      type:'business checking',
      status:'saved',
      signals:[/Bank of America|BofA/i,/Business Advantage Banking|Business Advantage Relationship Banking|Business Advantage Fundamentals/i,/Maintenance Period|Balance Requirement|\$400 or \$750/i],
      requirements:'Tiered new money deposit by day 30 + daily balance hold from day 31 through day 90',
      note:'Saved profile: Bank of America Business Advantage Banking $400/$750 new money + maintenance period bonus.'
    },
    {
      id:'capital-one-business-checking-sboffer500',
      bank:'Capital One',
      product:'Basic or Enhanced Business Checking',
      type:'business checking',
      status:'saved',
      signals:[/Capital One/i,/SBOFFER500|Basic or Enhanced checking|Basic Checking|Enhanced Checking/i,/10 qualifying electronic transactions|minimum end-of-day balance/i],
      requirements:'$5,000 external deposit by day 30 + 60-day balance hold within 90 days + 10 electronic transactions',
      note:'Saved profile: Capital One Basic/Enhanced Business Checking SBOFFER500 bonus.'
    },
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
      id:'chase-total-checking-personal',
      bank:'Chase',
      product:'Chase Total Checking',
      type:'personal checking',
      status:'saved-flexible-coupon',
      signals:[/Chase Total Checking/i,/direct deposits totaling \$[\d,]+ or more/i,/within 90 days of coupon enrollment/i,/new Chase Total Checking account/i],
      requirements:'Coupon-specific direct deposit amount within 90 days; payout typically within 15 days after requirements are completed',
      note:'Saved profile: Chase Total Checking personal checking. Coupon bonus and DD amount can vary, so review/correct those fields after Auto-Fill.'
    },
    {
      id:'chase-business-complete-checking',
      bank:'Chase',
      product:'Business Complete Checking',
      type:'business checking',
      status:'saved',
      signals:[/Chase Business Complete Checking/i,/business checking offer/i,/JPMorgan Chase/i,/5 qualifying transactions|five qualifying transactions/i],
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