/*
 * filename: scripts/tc-test-harness.js
 * version: 2.10.0
 * purpose: Hidden Analyzer Test Harness. Developer/debug only, no visible UI.
 * last-touched: unknown
 */
(function(){
  const VER='2.10.0';
  const samples=[
    {
      name:'U.S. Bank Smartly tiered checking',
      text:'U.S. Bank Smartly Checking bonus: open from April 9, 2026 through and including June 18, 2026. Funded with at least $25 within 30 days. Complete two or more direct deposits within 90 days that total: $2,000 to $4,999.99 to earn the $250 bonus, $5,000 to $7,999.99 to earn the $350 bonus, or $8,000 or more to earn the $450 bonus. Other electronic deposits or person-to-person payments are not considered a direct deposit.',
      expect:{bank:'U.S. Bank',bonus:450,reqMoney:8000,reqDays:90,fundedDays:30,openBy:'2026-06-18'}
    },
    {
      name:'Morgan Stanley CHECKING25',
      text:'Open one new Checking or Max-Rate Checking Account from Morgan Stanley Private Bank. You must apply promo code CHECKING25 at the time of account opening. Set up and receive at least two Direct Deposits each of $1,500 or more within 90 days from account opening. You can expect your bonus to be deposited on or about the 120th day from account opening. The $15 monthly account fee can be waived when you maintain an average monthly balance of at least $5,000.',
      expect:{bank:'Morgan Stanley Private Bank',code:'CHECKING25',reqMoney:1500,reqDays:90,fee:15}
    },
    {
      name:'Wells Fargo $400',
      text:'To receive the $400 bonus, use your bonus offer code when opening a new Wells Fargo consumer checking account by May 19, 2026 and receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening. Transfers, mobile deposits, Zelle, branch or ATM deposits are not considered qualifying. The monthly service fee is $15.',
      expect:{bank:'Wells Fargo',bonus:400,reqMoney:1000,reqDays:90,fee:15,openBy:'2026-05-19'}
    }
  ];
  function same(a,b){return String(a||'')===String(b||'')}
  function run(){
    if(typeof tcUnifiedAnalyze!=='function')return {version:VER,error:'tcUnifiedAnalyze not loaded'};
    return samples.map(s=>{
      const r=tcUnifiedAnalyze(s.text);
      const checks={};
      Object.keys(s.expect).forEach(k=>{checks[k]={expected:s.expect[k],actual:r[k],pass:same(r[k],s.expect[k])};});
      return {name:s.name,pass:Object.values(checks).every(x=>x.pass),checks,result:r};
    });
  }
  window.tcRunAnalyzerTests=run;
  window.tcAnalyzerTestHarnessVersion=VER;
})();