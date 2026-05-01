/* ✅ Version 2.10.0 Newest update: Bank-specific reliability profiles for Unified Analyzer Pro. No extra UI. */
(function(){
  const VER='2.10.0';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const has=(raw,re)=>re.test(String(raw||''));
  const money=n=>Number(n||0);
  function setIfBlank(obj,key,val){ if((obj[key]===undefined||obj[key]===null||obj[key]===''||obj[key]===0)&&val) obj[key]=val; }
  function isoFrom(raw,re){ const m=String(raw||'').match(re); if(!m)return''; const mo={jan:'01',january:'01',feb:'02',february:'02',mar:'03',march:'03',apr:'04',april:'04',may:'05',jun:'06',june:'06',jul:'07',july:'07',aug:'08',august:'08',sep:'09',sept:'09',september:'09',oct:'10',october:'10',nov:'11',november:'11',dec:'12',december:'12'}; return `${m[3]}-${mo[m[1].toLowerCase()]}-${String(m[2]).padStart(2,'0')}`; }
  function pushFlag(r,msg){ r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[]; if(!r.reviewFlags.includes(msg)) r.reviewFlags.push(msg); }
  function profileName(raw, r){
    const txt=String(raw||'');
    if(/U\.S\. Bank|US Bank|Bank Smartly/i.test(txt))return'usbank';
    if(/Morgan Stanley Private Bank|E\*TRADE/i.test(txt))return'morgan';
    if(/Wells Fargo/i.test(txt))return'wells';
    if(/Bank of America|BofA/i.test(txt))return'boa';
    if(/Chase/i.test(txt))return'chase';
    if(/Capital One/i.test(txt))return'capitalone';
    if(/Citi(?:bank)?/i.test(txt))return'citi';
    if(/PNC/i.test(txt))return'pnc';
    return (r.bank||'generic').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  }
  function applyUSBank(r){
    const raw=r.raw||'';
    if(!/U\.S\. Bank|US Bank|Bank Smartly/i.test(raw))return r;
    r.bank='U.S. Bank';
    if(/Bank Smartly/i.test(raw)) r.acct='U.S. Bank Smartly Checking';
    const tiers=[];
    if(/\$\s*2,?000\s*to\s*\$\s*4,?999\.99\s*to\s*earn\s*the\s*\$\s*250\s*bonus/i.test(raw)) tiers.push({bonus:250,requirement:2000,maxRequirement:4999.99,confidence:'High',source:'U.S. Bank tier: $2,000 to $4,999.99 to earn $250'});
    if(/\$\s*5,?000\s*to\s*\$\s*7,?999\.99\s*to\s*earn\s*the\s*\$\s*350\s*bonus/i.test(raw)) tiers.push({bonus:350,requirement:5000,maxRequirement:7999.99,confidence:'High',source:'U.S. Bank tier: $5,000 to $7,999.99 to earn $350'});
    if(/\$\s*8,?000\s*or\s*more\s*to\s*earn\s*the\s*\$\s*450\s*bonus/i.test(raw)) tiers.push({bonus:450,requirement:8000,maxRequirement:0,confidence:'High',source:'U.S. Bank tier: $8,000 or more to earn $450'});
    if(tiers.length){ r.tiers=tiers; r.tiered=true; r.targetTier=tiers[tiers.length-1]; r.bonus=tiers[tiers.length-1].bonus; r.selectedBonus=r.bonus; r.reqMoney=tiers[tiers.length-1].requirement; r.reqIsTotal=true; r.bonusTierText=tiers.map(t=>`$${t.bonus.toLocaleString()} for $${t.requirement.toLocaleString()}+ DD`).join(' / '); }
    if(/two or more direct deposits within 90 days/i.test(raw)||/direct deposits within 90 days/i.test(raw)){ r.count=2; r.reqDays=90; }
    if(/funded with at least \$25 within 30 days/i.test(raw)){ r.fundingAmount=25; r.fundedDays=30; }
    const openBy=isoFrom(raw,/through and including\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})/i);
    if(openBy){ r.openBy=openBy; r.expiration={value:openBy,display:openBy,confidence:'High',source:'U.S. Bank offer period through and including open-by date'}; }
    if(/Monthly Maintenance Fee/i.test(raw)&&!r.fee) r.fee=0;
    if(/combined monthly direct deposits totaling \$1,500/i.test(raw)&&!(r.waivers||[]).some(x=>/1,500/.test(x))) r.waivers=(r.waivers||[]).concat('$1,500+ combined monthly direct deposits');
    if(/minimum average account balance of \$1,500/i.test(raw)&&!(r.waivers||[]).some(x=>/average account balance/.test(x))) r.waivers=(r.waivers||[]).concat('$1,500+ minimum average account balance');
    return r;
  }
  function applyMorgan(r){
    const raw=r.raw||'';
    if(!/Morgan Stanley Private Bank|E\*TRADE/i.test(raw))return r;
    r.bank='Morgan Stanley Private Bank';
    if(/CHECKING25/i.test(raw)){ r.code='CHECKING25'; r.promoCode={value:'CHECKING25',confidence:'High',source:'promo code CHECKING25'}; }
    if(/two Direct Deposits.*\$1,500|two Direct Deposits each of \$1,500|at least two Direct Deposits.*\$1,500/i.test(raw)){ r.count=2; r.reqMoney=1500; r.reqIsTotal=false; }
    if(/within 90 days/i.test(raw)) r.reqDays=90;
    if(/on or about the 120th day|day 120/i.test(raw)) r.payout='after day 90 assessment; deposited on or about day 120 if qualified';
    if(/\$15 monthly account fee|\$15 monthly/i.test(raw)){ r.fee=15; r.monthlyFee={value:'$15 monthly fee',amount:15,confidence:'High',source:'$15 monthly account fee'}; }
    if(/average monthly balance of at least \$5,000/i.test(raw)) r.waivers=['$5,000 average monthly balance in Max-Rate Checking'];
    return r;
  }
  function applyWells(r){
    const raw=r.raw||'';
    if(!/Wells Fargo/i.test(raw))return r;
    r.bank='Wells Fargo';
    if(/\$400 bonus/i.test(raw)){ r.bonus=400; r.selectedBonus=400; }
    if(/\$1,000 or more in qualifying electronic deposits/i.test(raw)){ r.reqMoney=1000; r.reqIsTotal=true; }
    if(/within 90 calendar days/i.test(raw)) r.reqDays=90;
    if(/monthly service fee is \$15/i.test(raw)){ r.fee=15; r.monthlyFee={value:'$15 monthly fee',amount:15,confidence:'High',source:'monthly service fee is $15'}; }
    return r;
  }
  function applyGenericProfiles(r){
    r.profile=profileName(r.raw||'',r);
    applyUSBank(r); applyMorgan(r); applyWells(r);
    r.waivers=Array.from(new Set((r.waivers||[]).filter(Boolean)));
    if(r.tiered&&r.targetTier){ r.bonus=r.targetTier.bonus; r.selectedBonus=r.bonus; if(!r.reqMoney)r.reqMoney=r.targetTier.requirement; }
    if(!r.clear) r.clear=!!(r.bonus&&r.reqDays);
    return r;
  }
  window.tcApplyBankProfiles=applyGenericProfiles;
  window.tcBankProfilesVersion=VER;
})();
