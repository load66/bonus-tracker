/*
 * filename: scripts/tc-conflict-detector.js
 * version: 2.10.0
 * purpose: Quiet conflict detector for Unified Analyzer Pro. No visible scorecard.
 * last-touched: unknown
 */
(function(){
  const VER='2.10.0';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const has=(raw,re)=>re.test(String(raw||''));
  function flag(r,msg){ r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[]; if(!r.reviewFlags.includes(msg)) r.reviewFlags.push(msg); }
  function isDisclosureSource(src){ return /\bas of\b|APY|Annual Percentage Yield|effective as of|interest rate|ratesheet|StockBrokers|U\.S\. News|award|recognized|competitor/i.test(src||''); }
  function fix(r){
    if(!r||!r.raw)return r;
    const raw=r.raw;
    if(typeof tcApplyBankProfiles==='function') r=tcApplyBankProfiles(r)||r;

    // Bonus/deposit conflict: large deposit requirement should never become bonus.
    if(r.bonus>=1000 && /bonus/i.test(raw) && /to earn\s*(?:the\s*)?\$\s*(250|300|350|400|450|500|600|700|800|900)\s*bonus/i.test(raw)){
      const bonuses=[]; raw.replace(/to earn\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*bonus/gi,(m,n)=>{bonuses.push(parseFloat(n.replace(/,/g,''))); return m;});
      if(bonuses.length){ r.bonus=Math.max(...bonuses); r.selectedBonus=r.bonus; flag(r,'Deposit requirement was detected near bonus wording; bonus corrected to actual bonus amount.'); }
    }

    // Expiration conflict: APY/effective/as-of disclosure dates are not promo expiration dates.
    if(r.openBy && r.expiration && isDisclosureSource(r.expiration.source)){
      r.openBy=''; r.expiration=null; flag(r,'Ignored disclosure/APY date as promo expiration.');
    }

    // Fee conflict: monthly fee should be small; fee waivers are usually larger balances.
    if(r.fee>=100){ flag(r,'Monthly fee looked like a waiver/balance amount, not a fee.'); r.fee=0; r.monthlyFee=null; }
    if(r.monthlyFee && /waiv|avoid|balance|deposit/i.test(r.monthlyFee.source||'') && r.monthlyFee.amount>=100){ r.monthlyFee=null; r.fee=0; flag(r,'Monthly fee source looked like waiver language; left fee for review.'); }

    // Days conflict: 30-day funding and 90-day DD requirement should be separate.
    if(r.reqDays===30 && /direct deposits?.*within\s+90\s+days|within\s+90\s+days.*direct deposits?/i.test(raw)){
      r.reqDays=90; flag(r,'Requirement deadline corrected to 90 days; 30 days appears to be funding/payout timing.');
    }
    if(!r.fundedDays && /funded with .*within\s+30\s+days|funded within\s+30\s+days/i.test(raw)) r.fundedDays=30;

    // Promo code conflict: generic promo code mention should not create fake code.
    if(r.code && /Mentioned|Review/i.test(r.code)) r.code='';

    // Exclusions conflict: never show “not clearly listed” if exclusion wording exists.
    if((!r.not||!r.not.length) && /not considered|do not constitute|person-to-person|P2P|Zelle|wire|mobile deposit|internal transfer|other electronic deposits/i.test(raw)){
      const out=[];
      if(/other electronic deposits/i.test(raw))out.push('Other electronic deposits');
      if(/person-to-person|P2P/i.test(raw))out.push('Person-to-person payments / P2P transfers');
      if(/Zelle/i.test(raw))out.push('Zelle incoming payments');
      if(/wire/i.test(raw))out.push('Wires / wire transfers');
      if(/mobile deposit|mobile check/i.test(raw))out.push('Mobile/check deposits');
      if(/internal transfer|account to account|one account to another/i.test(raw))out.push('Internal/account-to-account transfers');
      r.not=out; r.notCounts=out;
    }

    // If bank profile corrected core values, recompute clear flag.
    r.clear=!!(r.bonus&&r.reqDays);
    r.conflictsChecked=true;
    r.conflictDetectorVersion=VER;
    return r;
  }
  function wrap(){
    if(window.__tcConflictWrapped)return;
    if(typeof window.tcUnifiedAnalyze!=='function')return;
    const base=window.tcUnifiedAnalyze;
    window.tcUnifiedAnalyze=function(raw,opts){ return fix(base(raw,opts)); };
    window.tcStrictAnalyze=window.tcUnifiedAnalyze;
    window.__tcConflictWrapped=true;
  }
  setTimeout(wrap,100);setTimeout(wrap,600);setTimeout(wrap,1400);
  window.tcDetectConflicts=fix;
  window.tcConflictDetectorVersion=VER;
})();