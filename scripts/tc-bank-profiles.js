/* ✅ Version 2.15.0 Newest update: Add Bank of America Bonus Chart parser for table-style tiered offers. No extra UI. */
(function(){
  const VER='2.15.0';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  function isoFrom(raw,re){ const m=String(raw||'').match(re); if(!m)return''; const mo={jan:'01',january:'01',feb:'02',february:'02',mar:'03',march:'03',apr:'04',april:'04',may:'05',jun:'06',june:'06',jul:'07',july:'07',aug:'08',august:'08',sep:'09',sept:'09',september:'09',oct:'10',october:'10',nov:'11',november:'11',dec:'12',december:'12'}; return `${m[3]}-${mo[m[1].toLowerCase()]}-${String(m[2]).padStart(2,'0')}`; }
  function moneyFmt(n){return '$'+Number(n||0).toLocaleString();}
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
  function uniq(arr){return Array.from(new Set((arr||[]).filter(Boolean)));}
  function setTiers(r, tiers){
    if(!tiers.length)return;
    r.tiers=tiers;
    r.tiered=true;
    r.targetTier=tiers[tiers.length-1];
    r.bonus=r.targetTier.bonus;
    r.selectedBonus=r.bonus;
    r.reqMoney=r.targetTier.requirement;
    r.reqIsTotal=true;
    r.bonusTierText=tiers.map(t=>`${moneyFmt(t.bonus)} for ${moneyFmt(t.requirement)}+ DD`).join(' / ');
  }
  function addNot(r,label){r.not=uniq((r.not||[]).concat(label));r.notCounts=uniq((r.notCounts||[]).concat(label));}

  function applyUSBank(r){
    const raw=r.raw||'';
    if(!/U\.S\. Bank|US Bank|Bank Smartly/i.test(raw))return r;
    r.bank='U.S. Bank';
    if(/Bank Smartly/i.test(raw)) r.acct='U.S. Bank Smartly Checking';
    const tiers=[];
    if(/\$\s*2,?000\s*to\s*\$\s*4,?999\.99\s*to\s*earn\s*the\s*\$\s*250\s*bonus/i.test(raw)) tiers.push({bonus:250,requirement:2000,maxRequirement:4999.99,confidence:'High',source:'U.S. Bank tier: $2,000 to $4,999.99 to earn $250'});
    if(/\$\s*5,?000\s*to\s*\$\s*7,?999\.99\s*to\s*earn\s*the\s*\$\s*350\s*bonus/i.test(raw)) tiers.push({bonus:350,requirement:5000,maxRequirement:7999.99,confidence:'High',source:'U.S. Bank tier: $5,000 to $7,999.99 to earn $350'});
    if(/\$\s*8,?000\s*or\s*more\s*to\s*earn\s*the\s*\$\s*450\s*bonus/i.test(raw)) tiers.push({bonus:450,requirement:8000,maxRequirement:0,confidence:'High',source:'U.S. Bank tier: $8,000 or more to earn $450'});
    setTiers(r,tiers);
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

  function applyBOA(r){
    const raw=r.raw||'';
    if(!/Bank of America|BofA|Advantage SafeBalance|Advantage Plus|Advantage Relationship/i.test(raw))return r;
    r.bank='Bank of America';
    if(/personal checking account|Advantage SafeBalance|Advantage Plus|Advantage Relationship/i.test(raw)) r.acct='Bank of America eligible personal checking';

    const tiers=[];
    if(/\$\s*2,?000\s*[–-]\s*\$\s*4,?999[\s\S]{0,35}\$\s*100/i.test(raw) || /\$\s*2,?000\s*to\s*\$\s*4,?999[\s\S]{0,35}\$\s*100/i.test(raw)) tiers.push({bonus:100,requirement:2000,maxRequirement:4999,confidence:'High',source:'BofA Bonus Chart: $2,000–$4,999 = $100'});
    if(/\$\s*5,?000\s*[–-]\s*\$\s*9,?999[\s\S]{0,35}\$\s*300/i.test(raw) || /\$\s*5,?000\s*to\s*\$\s*9,?999[\s\S]{0,35}\$\s*300/i.test(raw)) tiers.push({bonus:300,requirement:5000,maxRequirement:9999,confidence:'High',source:'BofA Bonus Chart: $5,000–$9,999 = $300'});
    if(/\$\s*10,?000\s*or\s*more[\s\S]{0,35}\$\s*500/i.test(raw)) tiers.push({bonus:500,requirement:10000,maxRequirement:0,confidence:'High',source:'BofA Bonus Chart: $10,000 or more = $500'});
    setTiers(r,tiers);

    const openBy=isoFrom(raw,/(?:Offer expires on|open.*?by)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})/i);
    if(openBy){ r.openBy=openBy; r.expiration={value:openBy,display:openBy,confidence:'High',source:'Bank of America offer expires/open-by date'}; }

    if(/within ninety\s*\(90\)\s*days|90-day Deposit Period|within 90 days/i.test(raw)) r.reqDays=90;
    if(/Qualifying Direct Deposits will be totaled|Total Qualifying Direct Deposits|Bonus Chart/i.test(raw)) r.reqIsTotal=true;
    if(/Set up and receive Qualifying Direct Deposits/i.test(raw)) r.count=0;
    if(/minimum deposit required to open.*SafeBalance.*\$25/i.test(raw)){ r.fundingAmount=25; }
    if(/minimum deposit required to open.*Plus.*\$100|minimum deposit required to open.*Relationship.*\$100/i.test(raw)){ r.fundingAmount=r.fundingAmount||100; }
    r.payout='within 60 days after the 90-day Deposit Period ends and requirements are satisfied';
    r.payoutText=r.payout;
    r.early='Keep account open and in good standing through the date any earned bonus is paid.';

    if(/teller deposits/i.test(raw)) addNot(r,'Teller deposits');
    if(/wire transfers/i.test(raw)) addNot(r,'Wire transfers');
    if(/debit card transfers/i.test(raw)) addNot(r,'Debit card transfers');
    if(/ATM transfers or deposits/i.test(raw)) addNot(r,'ATM transfers or deposits');
    if(/Online and Mobile Banking transfers or deposits/i.test(raw)) addNot(r,'Online/Mobile Banking transfers or deposits');
    if(/bank or brokerage account|Merrill investment account/i.test(raw)) addNot(r,'Bank/brokerage/Merrill transfers');
    if(/salary, pension or Social Security/i.test(raw)) r.counts=uniq((r.counts||[]).concat('Salary/paycheck, pension, Social Security benefits from employer/other payer'));
    if(/using account and routing numbers/i.test(raw)) r.counts=uniq((r.counts||[]).concat('Direct deposit using account and routing numbers'));

    const elig=[];
    if(/not owned or co-owned.*personal checking account within the last twelve/i.test(raw)) elig.push('Not eligible if you owned/co-owned a Bank of America personal checking account within the last 12 months.');
    if(/Fiduciary accounts.*business accounts are not eligible/i.test(raw)) elig.push('Fiduciary/trust and business accounts are not eligible.');
    if(/cannot be combined/i.test(raw)) elig.push('Cannot be combined with other checking bonus offers.');
    if(/one bonus per account and per customer/i.test(raw)) elig.push('Limited to one bonus per account and per customer.');
    if(/1099|taxable income|Internal Revenue Service|IRS/i.test(raw)) elig.push('Bonus may be taxable and reported to the IRS/Form 1099.');
    if(elig.length) r.eligibilityText=uniq((r.eligibilityText?r.eligibilityText.split('\n'):[]).concat(elig)).join('\n');
    return r;
  }

  function applyGenericProfiles(r){
    r.profile=profileName(r.raw||'',r);
    applyUSBank(r); applyMorgan(r); applyWells(r); applyBOA(r);
    r.waivers=uniq((r.waivers||[]).filter(Boolean));
    r.not=uniq((r.not||[]).filter(Boolean));
    r.notCounts=uniq((r.notCounts||r.not||[]).filter(Boolean));
    if(r.tiered&&r.targetTier){ r.bonus=r.targetTier.bonus; r.selectedBonus=r.bonus; if(!r.reqMoney)r.reqMoney=r.targetTier.requirement; }
    if(!r.clear) r.clear=!!(r.bonus&&r.reqDays);
    r.bankProfilesVersion=VER;
    return r;
  }
  window.tcApplyBankProfiles=applyGenericProfiles;
  window.tcBankProfilesVersion=VER;
})();
