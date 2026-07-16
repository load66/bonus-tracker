/*
 * filename: engine.js
 * version: 3.3.94
 * purpose: Analyzer v3 Engine with broader weird-wording normalization, safer source proof, and training-learning-ready results.
 * last-touched: unknown
 */
(function(){
  const VER='3.3.94';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const escRe=s=>String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const moneyNum=s=>{const n=parseFloat(String(s||'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0};
  const money=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  const WEIRD_WORDING_VER='3.3.94-core';
  const phraseMap=[
    {re:/adjusted interest/gi,label:'adjusted interest',add:'bonus payout'},
    {re:/cash reward/gi,label:'cash reward',add:'cash bonus'},
    {re:/statement credit/gi,label:'statement credit',add:'cash bonus / account credit'},
    {re:/account credit/gi,label:'account credit',add:'cash bonus credited to account'},
    {re:/relationship credit/gi,label:'relationship credit',add:'cash bonus credited after validation'},
    {re:/promotional reward/gi,label:'promotional reward',add:'cash bonus reward'},
    {re:/promotional credit/gi,label:'promotional credit',add:'cash bonus credited to account'},
    {re:/welcome bonus/gi,label:'welcome bonus',add:'cash bonus offer'},
    {re:/cash offer/gi,label:'cash offer',add:'cash bonus offer'},
    {re:/welcome offer/gi,label:'welcome offer',add:'bonus offer'},
    {re:/\bincentive\b/gi,label:'incentive',add:'bonus'},
    {re:/new money/gi,label:'new money',add:'new qualifying deposit funds'},
    {re:/aggregate deposits?/gi,label:'aggregate deposits',add:'total qualifying deposits'},
    {re:/cumulative deposits?/gi,label:'cumulative deposits',add:'total qualifying deposits'},
    {re:/combined deposits?/gi,label:'combined deposits',add:'total qualifying deposits'},
    {re:/qualifying electronic deposits?/gi,label:'qualifying electronic deposits',add:'qualifying direct deposits'},
    {re:/eligible electronic deposits?/gi,label:'eligible electronic deposits',add:'qualifying direct deposits'},
    {re:/eligible credits?/gi,label:'eligible credits',add:'qualifying direct deposits / credits'},
    {re:/qualifying credits?/gi,label:'qualifying credits',add:'qualifying direct deposits / credits'},
    {re:/ACH credits?/gi,label:'ACH credits',add:'ACH direct deposits / qualifying credits'},
    {re:/external deposits?/gi,label:'external deposits',add:'qualifying external deposits'},
    {re:/eligible external transfers?/gi,label:'eligible external transfers',add:'qualifying external deposits'},
    {re:/external transfer activity/gi,label:'external transfer activity',add:'qualifying external deposit activity'},
    {re:/payroll deposits?/gi,label:'payroll deposits',add:'direct deposits from employer payroll'},
    {re:/recurring deposits? of income/gi,label:'recurring deposits of income',add:'regular recurring direct deposit income'},
    {re:/statement cycles?/gi,label:'statement cycles',add:'statement periods'},
    {re:/fee periods?/gi,label:'fee periods',add:'monthly fee periods'},
    {re:/maintain(?:ed)?/gi,label:'maintain/maintained',add:'keep / hold requirement'},
    {re:/good standing/gi,label:'good standing',add:'account must remain open and eligible'},
    {re:/positive balance/gi,label:'positive balance',add:'account must remain open with positive balance'},
    {re:/available balance/gi,label:'available balance',add:'account balance'},
    {re:/offer period/gi,label:'offer period',add:'promo open-by period'},
    {re:/validation cycle/gi,label:'validation cycle',add:'bonus payout review period'},
    {re:/qualification period/gi,label:'qualification period',add:'bonus requirement period'},
    {re:/through and including/gi,label:'through and including',add:'through open-by date'},
    {re:/valid through/gi,label:'valid through',add:'promo expiration date'},
    {re:/valid until/gi,label:'valid until',add:'promo expiration date'},
    {re:/enroll by/gi,label:'enroll by',add:'promo open-by date'},
    {re:/register by/gi,label:'register by',add:'promo open-by date'},
    {re:/activation deadline/gi,label:'activation deadline',add:'promo/open-by deadline'},
    {re:/discontinued or changed/gi,label:'discontinued or changed',add:'offer can change or end'},
    {re:/not considered/gi,label:'not considered',add:'does not count'},
    {re:/do not constitute/gi,label:'do not constitute',add:'does not count'},
    {re:/excluded activity/gi,label:'excluded activity',add:'does not count activity'},
    {re:/not qualify/gi,label:'not qualify',add:'does not qualify'},
    {re:/not eligible/gi,label:'not eligible',add:'not eligible'},
    {re:/sole discretion/gi,label:'sole discretion',add:'bank may review manually'},
    {re:/gaming|abuse|misuse/gi,label:'gaming/abuse/misuse',add:'bonus abuse risk'},
    {re:/clawback|reclaim|reverse|deduct|forfeit/gi,label:'clawback/reclaim/reverse/deduct/forfeit',add:'early closure clawback risk'}
  ];
  function detectWeirdWording(raw){
    const found=[];
    const text=String(raw||'');
    phraseMap.forEach(p=>{p.re.lastIndex=0;if(p.re.test(text))found.push({term:p.label,meaning:p.add});p.re.lastIndex=0});
    const seen=new Set();
    return found.filter(x=>{const k=x.term+'|'+x.meaning;if(seen.has(k))return false;seen.add(k);return true});
  }
  function annotateWeirdSentence(sentence){
    const notes=[];
    phraseMap.forEach(p=>{p.re.lastIndex=0;if(p.re.test(sentence))notes.push(p.add);p.re.lastIndex=0});
    const cleanNotes=uniq(notes);
    if(!cleanNotes.length)return sentence;const note=`normalized terms: ${cleanNotes.join('; ')}`;return /[.!?]$/.test(sentence)?sentence.replace(/([.!?])$/,`; ${note}$1`):`${sentence}; ${note}`;
  }
  function normalizeWeirdBankWording(raw){
    const original=String(raw||'');
    const hits=detectWeirdWording(original);
    if(!original.trim()||!hits.length)return{raw:original,normalized:original,hits,aliases:[]};
    const parts=original.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
    const normalized=parts.length?parts.map(annotateWeirdSentence).join('\n'):original;
    return{raw:original,normalized,aliases:hits.map(x=>x.meaning),hits};
  }

  const mo={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  const pretty=iso=>{try{return window.fD?window.fD(iso):new Date(iso+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return iso||''}};
  const split=t=>String(t||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+/).map(clean).filter(x=>x.length>6);
  function dates(s){const out=[];let m;const add=(y,mm,d,src='')=>{if(y&&mm&&d)out.push({iso:`${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`,source:src})};const r1=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/gi;while((m=r1.exec(s)))add(m[3],mo[m[1].toLowerCase()],m[2],m[0]);const r2=/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/g;while((m=r2.exec(s)))add(m[3],m[1],m[2],m[0]);const r3=/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g;while((m=r3.exec(s)))add(m[1],m[2],m[3],m[0]);return out;}
  function days(s){const out=[];String(s||'').replace(/(\d{1,4}|ninety|sixty|thirty|twelve)\s*(?:\((\d{1,4})\))?\s*(?:calendar\s*)?(day|days|month|months)/gi,(m,w,n,unit)=>{let v=parseInt(n||w,10);if(!v){const map={ninety:90,sixty:60,thirty:30,twelve:12};v=map[String(w).toLowerCase()]||0}if(/month/i.test(unit))v*=30;if(v>0)out.push({days:v,text:m});return m});return out;}
  function monies(s){const a=[];String(s||'').replace(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/g,m=>{a.push({value:moneyNum(m),text:m.replace(/\s+/g,'')});return m});return a;}
  function isDisclosure(s){return /\bas of\b|APY|Annual Percentage Yield|effective as of|rates?|StockBrokers|U\.S\. News|FDIC|ratesheet|depositsrates|trademark|overdraft|Erica|mobile banking requires/i.test(s||'')}
  function lineMatch(lines,res){return lines.find(l=>res.some(r=>r.test(l)))||''}
  function allMatch(lines,res){return lines.filter(l=>res.some(r=>r.test(l)))}
  function accountType(raw,acct){const text=[raw,acct].filter(Boolean).join(' ');if(/\b(biz|business|commercial|merchant|treasury|llc|pllc|ein|dba|sole proprietor|business complete|business advantage|business checking|small business)\b/i.test(text))return'business';return'personal'}
  function bank(raw){if(/Bank of America|BofA/i.test(raw))return'Bank of America';if(/U\.S\. Bank|US Bank|Bank Smartly/i.test(raw))return'U.S. Bank';if(/Morgan Stanley Private Bank|E\*TRADE/i.test(raw))return'Morgan Stanley Private Bank';if(/Wells Fargo/i.test(raw))return'Wells Fargo';if(/Chase/i.test(raw))return'Chase';if(/Capital One/i.test(raw))return'Capital One';if(/Citi(?:bank)?/i.test(raw))return'Citibank';if(/PNC/i.test(raw))return'PNC Bank';const m=raw.match(/([A-Z][A-Za-z&.'’\- ]{2,90}?(?:Bank|Credit Union|Private Bank))/);return m?clean(m[1]):'New Bank Bonus'}
  function account(raw){if(/Chase Total Checking/i.test(raw))return'Chase Total Checking';if(/Bank of America/i.test(raw))return'Bank of America eligible personal checking';if(/Bank Smartly/i.test(raw))return'U.S. Bank Smartly Checking';if(/Checking or Max-Rate Checking|Checking OR Max-Rate Checking/i.test(raw))return'Checking OR Max-Rate Checking — open one only; do not enroll both';if(/consumer checking/i.test(raw))return'consumer checking';if(/personal checking/i.test(raw))return'personal checking';if(/business checking/i.test(raw))return'business checking';if(/checking/i.test(raw))return'checking';return'account type needs review'}
  function normalize(raw){return normalizeWeirdBankWording(raw).normalized}
  function wordNum(v){const map={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};v=String(v||'').toLowerCase();return parseInt(v,10)||map[v]||0}
  function hasNewMoneyFunding(raw){return /new money|minimum[^.]{0,80}deposit|deposit[^.]{0,80}new money/i.test(raw||'')}
  function transactionRequirement(raw){
    const text=String(raw||'');
    const activity='(?:qualifying\\s+)?(?:transactions?|debit\\s+card\\s+purchases?|card\\s+purchases?|bill\\s+payments?|ACH\\s+credits?|electronic\\s+credits?)';
    const patterns=[
      new RegExp('(?:complete|make|conduct|post|perform)[^.]{0,100}?(one|two|three|four|five|six|seven|eight|nine|ten|\\d{1,2})\\s+'+activity+'[^.]{0,140}?(?:within|in|during)\\s+(\\d{1,3})\\s+days','i'),
      new RegExp('(one|two|three|four|five|six|seven|eight|nine|ten|\\d{1,2})\\s+'+activity+'[^.]{0,140}?(?:within|in|during)\\s+(\\d{1,3})\\s+days','i'),
      new RegExp('(?:within|in|during)\\s+(\\d{1,3})\\s+days[^.]{0,140}?(?:complete|make|conduct|post|perform)[^.]{0,100}?(one|two|three|four|five|six|seven|eight|nine|ten|\\d{1,2})\\s+'+activity,'i')
    ];
    for(const re of patterns){
      const m=text.match(re);
      if(!m)continue;
      if(re===patterns[2])return{count:wordNum(m[2]),days:parseInt(m[1],10)||0,source:m[0],type:'transactions'};
      return{count:wordNum(m[1]),days:parseInt(m[2],10)||0,source:m[0],type:'transactions'};
    }
    return null;
  }
  function bestRequirementSource(raw,lines){
    const c=[];
    const reqRe=/(direct deposits?|electronic deposits?|qualifying deposits?|qualifying credits?|ACH credits?|recurring income|payroll|salary|government benefits|deposit period|qualifying activities|eligible deposits?|eligible external transfers?|external transfer activity)/i;
    (Array.isArray(lines)?lines:split(raw)).forEach(l=>{
      if(!reqRe.test(l)||isDisclosure(l))return;
      let score=0;
      if(/within|during|no later than|by day|deposit period|calendar days?/i.test(l))score+=4;
      if(/total|totaling|aggregate|cumulative|combined/i.test(l))score+=2;
      if(/direct deposit|payroll|salary|recurring income|government benefits/i.test(l))score+=3;
      if(monies(l).some(m=>m.value>=100))score+=2;
      if(/bonus|reward|cash offer|account credit/i.test(l)&&!/direct deposit|qualifying|eligible|deposit period/i.test(l))score-=5;
      c.push({line:l,score});
    });
    return c.sort((a,b)=>b.score-a.score)[0]?.line||'';
  }
  function holdDaysFromText(raw){const text=String(raw||'');let m=text.match(/maintain[^.]{0,120}?(?:for|through)\s+(\d{1,3})\s+days/i)||text.match(/balance[^.]{0,80}?for\s+(\d{1,3})\s+days/i);return m?parseInt(m[1],10)||0:0}
  function depositDaysFromText(raw){const text=String(raw||'');let m=text.match(/deposit[^.]{0,120}?(?:within|in)\s+(\d{1,3})\s+days/i)||text.match(/fund[^.]{0,120}?(?:within|in)\s+(\d{1,3})\s+days/i);return m?parseInt(m[1],10)||0:0}
  function closeRule(raw){
    const text=String(raw||'').replace(/\s+/g,' ');
    const out={basis:'opened',days:0,text:'',confidence:'low'};
    const closeWords=/(closed?|closing|close|remain open|keep[^.]{0,40}open|maintain[^.]{0,40}open|forfeit|forfeiture|clawback|reclaim|reverse|deduct|good standing|restricted|default)/i;
    const monthlyFeeNoise=/(monthly account fee|monthly service fee|monthly maintenance fee|monthly fee|service charge|maintenance fee|paper statement fee|statement fee|average monthly balance|avg monthly balance|fee waived|waived with|waived when|waive the monthly|avoid monthly|fee can be waived|minimum balance|APY|interest rate)/i;
    const split=text.split(/(?<=[.!?])\s+|\n+|;/).map(clean).filter(Boolean);
    const candidates=split.filter(s=>closeWords.test(s)&&!monthlyFeeNoise.test(s));
    const fallback=candidates.length?candidates.join('. '):'';
    const source=fallback||'';
    const patterns=[
      /(?:closed?|closing|close)[^.]{0,120}?(?:within|before)\s+(\d{1,3})\s*(days?|months?)\b[^.]{0,160}/i,
      /(?:remain|keep|maintain)[^.]{0,80}?open[^.]{0,120}?(\d{1,3})\s*(days?|months?)\b[^.]{0,160}/i,
      /(\d{1,3})\s*(days?|months?)\b[^.]{0,120}?(?:after|from)[^.]{0,80}?(?:opening|opened|account opening|account open)[^.]{0,120}/i,
      /(\d{1,3})\s*(days?|months?)\b[^.]{0,120}?(?:after|from)[^.]{0,80}?(?:bonus|cash reward|payout|payment)[^.]{0,120}/i,
      /(\d{1,3})\s*(days?|months?)\b[^.]{0,120}?(?:after|from)[^.]{0,80}?(?:requirement|qualification|deposit period)[^.]{0,120}/i
    ];
    let m=null, found='';
    for(const re of patterns){m=source.match(re);if(m){found=m[0];break}}
    if(m){
      let n=parseInt(m[1],10)||0;
      const unit=String(m[2]||'').toLowerCase();
      if(/month/.test(unit))n*=30;
      if(n>0&&n<=730){
        out.days=n;
        out.text=clean(found).slice(0,360);
        out.confidence='medium';
      }
    }
    const src=out.text||source||text;
    if(/after[^.]{0,90}(bonus|cash reward|payout|payment)|bonus[^.]{0,90}(posts|posted|received|paid|payment)/i.test(src))out.basis='bonus';
    else if(/after[^.]{0,90}(requirement|qualification|deposit period)|requirement[^.]{0,90}(met|complete|satisfied)/i.test(src))out.basis='reqmet';
    else if(/manual review|sole discretion|may forfeit|clawback|reclaim|reverse|deduct|forfeit|good standing|restricted|default/i.test(src)&&!out.days)out.basis='bonus';
    else out.basis=out.days?'opened':'bonus';
    if(!out.text){
      const risk=candidates.find(s=>/(forfeit|clawback|reclaim|reverse|deduct|good standing|remain open|keep[^.]{0,30}open|restricted|default)/i.test(s));
      if(risk){out.text=clean(risk).slice(0,360);out.confidence='low'}
    }
    if(monthlyFeeNoise.test(out.text||'')){
      out.days=0;out.text='';out.confidence='low';out.basis='bonus';
    }
    return out
  }
  function tiers(raw){const text=String(raw||'').replace(/\s+/g,' ');const out=[];const push=(req,max,bonus,src)=>{req=moneyNum(req);max=moneyNum(max);bonus=moneyNum(bonus);if(req>=100&&bonus>0&&bonus<req)out.push({requirement:req,maxRequirement:max||0,bonus,source:clean(src),confidence:'High'})};let m;
    const patterns=[/\$\s*([0-9,]+(?:\.\d+)?)\s*(?:to|–|-|—)\s*\$\s*([0-9,]+(?:\.\d+)?)\s*(?:to earn|=|\s+)\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*(?:bonus)?/gi,/\$\s*([0-9,]+(?:\.\d+)?)\s*(?:or more|\+)\s*(?:to earn|=|\s+)\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*(?:bonus)?/gi,/earn\s*\$\s*([0-9,]+(?:\.\d+)?)\s+with\s+(?:a\s+)?minimum\s+\$\s*([0-9,]+(?:\.\d+)?)\s+deposit(?:\s+in\s+new\s+money)?/gi,/\$\s*([0-9,]+(?:\.\d+)?)\s+(?:bonus|cash bonus)?[^.]{0,80}?minimum\s+\$\s*([0-9,]+(?:\.\d+)?)\s+deposit(?:\s+in\s+new\s+money)?/gi];
    while((m=patterns[0].exec(text)))push(m[1],m[2],m[3],m[0]);while((m=patterns[1].exec(text)))push(m[1],0,m[2],m[0]);while((m=patterns[2].exec(text)))push(m[2],0,m[1],m[0]);while((m=patterns[3].exec(text)))push(m[2],0,m[1],m[0]);
    const seen=new Set();return out.filter(t=>{const k=t.requirement+'|'+t.bonus;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.requirement-b.requirement)}
  function promoCode(raw){const patterns=[/(?:promo(?:tional)?|offer|coupon)\s+code\s*(?:is|:|=)?\s*([A-Z0-9][A-Z0-9\-]{3,})/gi,/(?:apply|use|using)\s+(?:promo(?:tional)?\s+code\s+)?([A-Z0-9][A-Z0-9\-]{3,})\s+at\s+the\s+time\s+of\s+account\s+opening/gi];let pick='';let src='';patterns.forEach(re=>{let m;while((m=re.exec(raw))){const c=String(m[1]||'').toUpperCase();if(/\d/.test(c)&&!/PROMOTIONAL|OBTAINED|THROUGH|VALID|OFFER|CODE/i.test(c)){pick=c;src=m[0]}}});return pick?{value:pick,source:src,confidence:'High'}:null}
  function openBy(raw,lines){
    const candidates=allMatch(lines,[/offer expires/i,/through and including/i,/open.*?by/i,/apply.*?by/i,/enroll.*?by/i,/register.*?by/i,/valid through/i,/valid until/i,/offer ends/i,/activation deadline/i]).filter(x=>!isDisclosure(x));
    for(const l of candidates){const d=dates(l);if(d.length)return{value:d[d.length-1].iso,display:pretty(d[d.length-1].iso),source:l,confidence:'High'}}
    return null
  }
  function requirements(raw,lines,tierList){
    const txn=transactionRequirement(raw);
    if(txn)return{reqDays:txn.days,count:txn.count,reqMoney:0,reqIsTotal:false,source:txn.source,targetTier:tierList[tierList.length-1]||null,requirementType:'transactions',requirementNoun:'qualifying transactions'};
    let l=bestRequirementSource(raw,lines)||lineMatch(lines,[/direct deposits?.*within/i,/within.*direct deposits?/i,/Qualifying Direct Deposits/i,/Deposit Period/i,/qualifying electronic deposits/i,/qualifying credits/i,/ACH credits/i,/recurring income/i,/eligible external transfers?/i,/external transfer activity/i])||'';
    const explicitDayText=raw.match(/(?:90|60|30)[- ]day Deposit Period|ninety\s*\(90\)\s*days|sixty\s*\(60\)\s*days|thirty\s*\(30\)\s*days|within\s+(?:90|60|30)\s+days|by\s+day\s+(?:90|60|30)/i)?.[0]||'';
    const ds=days(l+' '+explicitDayText);
    let reqDays=(ds.find(d=>[90,60,30].includes(d.days))||ds[0]||{}).days||0;
    const dayBy=String(l+' '+raw).match(/by\s+day\s+(\d{1,3})|no\s+later\s+than\s+day\s+(\d{1,3})/i);if(!reqDays&&dayBy)reqDays=parseInt(dayBy[1]||dayBy[2],10)||0;
    let count=/(?:two|2)\s*(?:or\s+more|\+)\s+(?:qualifying\s+)?(?:direct deposits?|electronic deposits?|credits?)|at least\s+(?:two|2)\s+(?:qualifying\s+)?(?:direct deposits?|electronic deposits?|credits?)/i.test(raw)?2:0;
    const target=tierList[tierList.length-1];
    let reqMoney=hasNewMoneyFunding(raw)?0:(target?.requirement||0);
    let reqIsTotal=!hasNewMoneyFunding(raw)&&(!!target||/total|totaled|totaling|aggregate|cumulative|combined|sum of/i.test(l+raw));
    if(!reqMoney){
      const ms=monies(l).filter(x=>x.value>=100).sort((a,b)=>b.value-a.value);
      reqMoney=ms[0]?.value||0;
    }
    const noun=/recurring income/i.test(l)?'recurring income direct deposits':(/eligible external|external transfer activity/i.test(l)?'eligible external deposits/transfers':(/ACH credits?|qualifying credits?/i.test(l)?'qualifying ACH credits':'qualifying Direct Deposits'));
    return{reqDays,count,reqMoney,reqIsTotal,source:l,targetTier:target||null,requirementType:'direct-deposit',requirementNoun:noun}
  }
  function funding(raw,lines){
    const l=lineMatch(lines,[/funded with.*within/i,/fund(?:ing)?[^.]{0,120}within/i,/minimum deposit required to open/i,/minimum initial deposit/i,/minimum opening deposit/i,/opening deposit/i,/deposit new money/i,/new money.*within/i]);
    const d=days(l);
    const ms=monies(l).filter(x=>x.value>0&&x.value<1000000).sort((a,b)=>b.value-a.value);
    return{fundedDays:/within|by day|no later/i.test(l)?(d[0]?.days||0):0,fundingAmount:ms[0]?.value||0,source:l}
  }
  function fee(raw,lines){
    const scope=String(raw||'');
    const feeLines=Array.isArray(lines)?lines:split(scope);
    let l=allMatch(feeLines,[/monthly maintenance fee|monthly service fee|monthly account fee|monthly fee/i]).find(x=>monies(x).some(m=>m.value>0&&m.value<100)&&!isDisclosure(x))||'';
    if(!l&&/Monthly Service Fee/i.test(scope))l=scope;
    const fee=monies(l||scope).filter(x=>x.value>0&&x.value<100).sort((a,b)=>b.value-a.value)[0]?.value||0;
    const waivers=[];
    const add=(label,re)=>{if(re.test(scope)&&!waivers.includes(label))waivers.push(label)};
    add('$500+ qualifying electronic deposits',/\$\s*500\+?\s+in\s+qualifying\s+electronic\s+deposits|qualifying\s+electronic\s+deposits[^.]{0,80}\$\s*500/i);
    add('$1,500+ balance at beginning of each day',/\$\s*1,?500\+?\s+balance\s+at\s+the\s+beginning\s+of\s+each\s+day|beginning\s+of\s+each\s+day[^.]{0,80}\$\s*1,?500/i);
    add('$5,000+ average beginning day balance / linked balances',/\$\s*5,?000\+?\s+average\s+beginning\s+day\s+balance|average\s+beginning\s+day\s+balance[^.]{0,80}\$\s*5,?000/i);
    add('Link to a qualifying checking account',/Link this account to a qualifying checking account|qualifying linked checking accounts?/i);
    add('$5,000 average monthly balance',/average monthly balance.*\$\s*5,?000|\$\s*5,?000.*average monthly balance/i);
    add('$1,500+ combined monthly direct deposits',/combined monthly direct deposits.*\$\s*1,?500|\$\s*1,?500.*combined monthly direct deposits/i);
    add('$1,500+ minimum average account balance',/minimum average account balance.*\$\s*1,?500|\$\s*1,?500.*minimum average account balance/i);
    add('Age/military/rewards waiver may apply',/age 13-24|age 65|military|Smart Rewards|under the age of 25/i);
    String(scope||'').split(/(?<=[.!?])\s+|\n+|;/).map(clean).forEach(s=>{
      if(!/(waiv|avoid|no monthly|no maintenance|minimum|average|daily|direct deposit|electronic deposit|linked|relationship|eStatement|paperless)/i.test(s))return;
      if(!/(monthly|maintenance|service fee|service charge|fee)/i.test(s)&&!/waiv|avoid/i.test(s))return;
      if(/overdraft|wire|atm|foreign|stop payment|cashier/i.test(s))return;
      const short=s.slice(0,220);
      if(/waiv|avoid|direct deposit|balance|linked|paperless|eStatement/i.test(short)&&!waivers.includes(short))waivers.push(short);
    });
    return{fee,waivers:uniq(waivers).slice(0,6),source:l}
  }
  function counts(raw){const out=[];if(/qualifying transactions?|debit card purchases|QuickDeposit|QuickAccept|Online Bill Pay|ACH credits/i.test(raw)){if(/debit card purchases/i.test(raw))out.push('Debit card purchases');if(/QuickDeposit/i.test(raw))out.push('Chase QuickDeposit');if(/ACH credits/i.test(raw))out.push('ACH credits');if(/wires|wire credits|wire transfer/i.test(raw))out.push('Wires credits/debits');if(/Online Bill Pay/i.test(raw))out.push('Chase Online Bill Pay');if(/QuickAccept/i.test(raw))out.push('Chase QuickAccept');}if(/new money/i.test(raw))out.push('New money deposit into the new account');if(/regular monthly income|regular recurring.*income/i.test(raw))out.push('Regular recurring income direct deposit');if(/ACH|Automated Clearing House/i.test(raw))out.push('ACH direct deposit');if(/salary|paycheck|pension|Social Security|government benefits|employer|payroll/i.test(raw))out.push('Salary/paycheck, pension, Social Security/government benefits, employer/government income');if(/account and routing numbers/i.test(raw))out.push('Direct deposit using account and routing numbers');return uniq(out)}
  function notCounts(raw){const out=[];const add=(label,re)=>{if(re.test(raw))out.push(label)};add('Teller deposits',/teller deposits/i);add('Wire transfers',/wire transfers|incoming wires|\bwires\b/i);add('Debit card transfers',/debit card transfers/i);add('ATM transfers or deposits',/ATM transfers or deposits|ATM deposits/i);add('Online/Mobile Banking transfers or deposits',/Online and Mobile Banking transfers or deposits|mobile banking transfers|online transfers/i);add('Bank/brokerage/Merrill transfers',/bank or brokerage account|Merrill investment account|brokerage transfers/i);add('Person-to-person payments / P2P transfers',/person-to-person|person to person|P2P/i);add('ACH debits',/ACH debits/i);add('Zelle incoming payments',/Zelle/i);add('Mobile/check deposits',/mobile check deposits|mobile deposits|check deposits/i);add('Internal/account-to-account transfers',/internal transfers|account-to-account|one account to another/i);add('Online transfers to Chase credit cards',/online transfers to Chase credit cards|Chase credit card/i);add('Other electronic deposits',/Other electronic deposits/i);return uniq(out)}
  function eligibility(raw){const out=[];if(/new .*checking|new eligible|new consumer/i.test(raw))out.push('New checking customer/account required.');if(/within the last twelve|within the last 12|past 12|last 12/i.test(raw))out.push('Not eligible if you owned/co-owned or received a related checking bonus within the last 12 months.');if(/Fiduciary|trusts|business accounts are not eligible/i.test(raw))out.push('Fiduciary/trust and business accounts may not be eligible.');if(/cannot be combined|may not be combined/i.test(raw))out.push('Cannot be combined with other checking bonus offers.');if(/one bonus per account|one bonus per customer/i.test(raw))out.push('Limited to one bonus per account/customer.');if(/1099|taxable|Internal Revenue Service|IRS|W-9|W-8/i.test(raw))out.push('Bonus may be taxable and reported on Form 1099/IRS.');return uniq(out)}
  function payout(raw,lines){const candidates=allMatch(lines,[/within fifteen|within 15|within sixty|within 60|within thirty|within 30|120th day|day 120|validation cycle|validate|validation/i]);const l=candidates.find(x=>/bonus|payout|credited|deposit/i.test(x))||candidates[0]||lineMatch(lines,[/credited.*bonus|deposit.*bonus/i]);if(/within fifteen|within 15/i.test(l))return{value:'within 15 days after requirements are completed, if account remains open and unrestricted',source:l};if(/validation cycle|validate|validation/i.test(l))return{value:'after bank validation/review cycle once requirements are satisfied',source:l};if(/within sixty|within 60/i.test(l))return{value:'within 60 days after the requirement/deposit period ends and requirements are satisfied',source:l};if(/120th day|day 120/i.test(raw))return{value:'after day 90 assessment; deposited on or about day 120 if qualified',source:l};if(/within thirty|within 30|up to 30/i.test(l))return{value:'within 30 days after requirements are met/assessed',source:l};return{value:'payout timing needs review',source:l}}
  function payoutDaysFromText(txt){txt=String(txt||'');if(/within\s+15|fifteen/i.test(txt))return 15;if(/within\s+30|thirty|up to\s+30/i.test(txt))return 30;if(/within\s+60|sixty/i.test(txt))return 60;if(/120th day|day\s*120/i.test(txt))return 30;return 0}
  function singleBonus(lines){
    const c=[];
    const reqNear=/(direct\s+deposits?|qualifying\s+deposits?|deposit(?:s|ed|ing)?|fund(?:ing|ed)?|minimum|balance|fee|waive|maintain|total(?:ing|ed)?|aggregate|cumulative|combined|spend|purchase|APY)/i;
    lines.filter(l=>/bonus|earn|receive|get|cash|offer|reward|incentive|statement credit|account credit|relationship credit|promotional reward|promotional credit|welcome bonus/i.test(l)&&!isDisclosure(l)).forEach(l=>{
      monies(l).forEach(m=>{
        if(!(m.value>=50&&m.value<3000))return;
        const pos=l.indexOf(m.text);
        const before=pos>=0?l.slice(Math.max(0,pos-80),pos):l;
        const after=pos>=0?l.slice(pos+m.text.length,pos+m.text.length+80):l;
        const around=before+' '+m.text+' '+after;
        let score=0;
        if(/bonus|cash\s+(?:bonus|offer|reward)|reward|incentive|statement credit|account credit|relationship credit|promotional reward|promotional credit|welcome bonus/i.test(around))score+=8;
        if(/(?:earn|receive|get|credited|deposited)\s+(?:a\s+|an\s+|the\s+)?(?:cash\s+)?bonus[^$]{0,45}$/i.test(before))score+=10;
        if(/(?:earn|receive|get|credited|deposited)[^$]{0,35}$/i.test(before)&&/bonus|cash/i.test(after))score+=7;
        if(/^\s*(?:cash\s+)?bonus\b/i.test(after))score+=8;
        if(/bonus|reward|incentive|credit/i.test(l))score+=2;
        if(/earn|receive|get|credited|cash|offer|reward|incentive|credit/i.test(l))score+=1;
        if(reqNear.test(around))score-=8;
        if(/(?:total(?:ing|ed)?|aggregate|cumulative|combined|minimum|balance|fee|deposit|deposits?|funding)[^$]{0,45}$/i.test(before))score-=10;
        if(/\$\s*[0-9,]+(?:\.\d+)?\+?\s+(?:or more|in direct deposits?|direct deposits?|deposit|balance|minimum|spend|purchase)/i.test(around))score-=10;
        if(/monthly|maintenance|service fee|waiv/i.test(around))score-=12;
        c.push({...m,score,source:l,context:clean(around)});
      });
    });
    return c.filter(x=>x.score>=6).sort((a,b)=>b.score-a.score||a.value-b.value)[0]||null
  }


  function findIdx(text,res,start=0){
    const slice=String(text||'').slice(start);
    let best=-1;
    (res||[]).forEach(re=>{const m=slice.search(re);if(m>=0&&(best<0||m<best))best=m});
    return best<0?-1:start+best;
  }
  function sectionFrom(text,startRes,endRes){
    const raw=String(text||'');
    const st=findIdx(raw,startRes,0);
    if(st<0)return'';
    const en=findIdx(raw,endRes||[],st+1);
    return clean(en>st?raw.slice(st,en):raw.slice(st));
  }
  function stripSections(text,resPairs){
    let out=String(text||'');
    (resPairs||[]).forEach(pair=>{
      const part=sectionFrom(out,pair[0],pair[1]);
      if(part)out=out.replace(part,' ');
    });
    return out;
  }
  function analyzerScopes(original,normalized){
    const raw=String(original||'');
    const norm=String(normalized||raw);
    const bonusStart=[/Bonus\s*\/\s*Account\s*Information/i,/To receive (?:this|the) bonus/i,/To earn (?:this|the) bonus/i,/Bonus Information/i,/Offer not available/i];
    const bonusEnd=[/Offer availability is subject/i,/With Chase Overdraft/i,/Service Fee:/i,/Product terms subject/i,/For more information/i,/Overdraft Assist/i];
    let bonus=sectionFrom(norm,bonusStart,bonusEnd);
    const chaseFee=sectionFrom(norm,[/Service Fee:\s*Chase Total Checking/i,/Chase Total Checking:\s*\$0 Monthly Service Fee/i],[/Chase Savings/i,/Bonus\s*\/\s*Account\s*Information/i,/Product terms subject/i]);
    const genericFee=sectionFrom(norm,[/Monthly Service Fee/i,/monthly maintenance fee/i,/monthly service fee/i],[/Bonus\s*\/\s*Account\s*Information/i,/To receive (?:this|the) bonus/i,/Offer not available/i]);
    const fee=chaseFee||genericFee;
    let cleanRaw=stripSections(norm,[[[/Service Fee:/i,/Monthly Service Fee/i],[/Bonus\s*\/\s*Account\s*Information/i,/To receive (?:this|the) bonus/i]],[[/Chase Savings/i],[/Bonus\s*\/\s*Account\s*Information/i,/Offer not available/i]],[[/With Chase Overdraft/i],[/ZZZ_NEVER_MATCH/]]]);
    if(!bonus)bonus=cleanRaw;
    return{full:norm,bonus,fee,cleanRaw};
  }
  function srcItem(field,value,source,confidence='medium',kind='extracted'){
    source=clean(source);
    if(value===undefined||value===null||value===''||!source)return null;
    return{field,value:String(value),source,confidence,kind};
  }
  function srcMap(items){
    const out={},arr=[];
    (items||[]).forEach(x=>{if(!x)return;out[x.field]=x;arr.push(x)});
    const seen=new Set();
    return{map:out,list:arr.filter(x=>{const k=x.field+'|'+x.source;if(seen.has(k))return false;seen.add(k);return true})};
  }
  function firstSource(lines,res){return lineMatch(lines,res)||''}
  function analyze(input,opts={}){
    const source=window.tcV3ResolveSource?window.tcV3ResolveSource(input,opts):{raw:input||'',kind:'direct'};
    const original=source.raw||'';
    const weird=normalizeWeirdBankWording(original);
    const raw=weird.normalized;
    const scopes=analyzerScopes(original,raw);
    const bonusRaw=scopes.bonus||scopes.cleanRaw||raw;
    const feeRaw=scopes.fee||raw;
    const bonusLines=split(bonusRaw);
    const fullLines=split(raw);
    const feeLines=split(feeRaw);
    let tierList=tiers(bonusRaw);
    const b=bank(raw);
    const acctValue=account(raw);
    const p=promoCode(bonusRaw);
    const exp=openBy(bonusRaw,bonusLines)||openBy(raw,fullLines);
    const req=requirements(bonusRaw,bonusLines,tierList);
    const fund=funding(bonusRaw,bonusLines);
    const feeObj=fee(feeRaw,feeLines);
    const pay=payout(bonusRaw,bonusLines);
    const bonusPick=singleBonus(bonusLines);
    const targetTier=tierList.length?(opts.tierIndex!=null?tierList[opts.tierIndex]:tierList[tierList.length-1]):null;
    let bonus=tierList.length?(targetTier?.bonus||0):(bonusPick?.value||0);
    const countValues=counts(bonusRaw);
    const notValues=notCounts(bonusRaw);
    const eligibilityLines=eligibility(bonusRaw);
    const bankSource=firstSource(fullLines,[new RegExp(escRe(b),'i')])||fullLines[0]||'';
    const accountSource=firstSource(fullLines,[/checking|savings|account type|eligible account|open.*account/i]);
    const acctType=accountType(raw,acctValue);
    const bonusSource=targetTier?.source||bonusPick?.source||bonusPick?.context||'';
    const countsSource=firstSource(bonusLines,[/salary|paycheck|ACH|Automated Clearing House|account and routing numbers|regular monthly income|payroll|pension|Social Security|government benefits|electronic deposit/i]);
    const notSource=firstSource(bonusLines,[/teller|wire|debit card transfers|ATM|Zelle|person-to-person|P2P|mobile check|internal transfers|Other electronic deposits|micro-deposits|cash|checks|interest payments/i]);
    const eligibilitySource=firstSource(bonusLines,[/new .*checking|new eligible|new consumer|last 12|last 3 years|within the last|cannot be combined|one bonus|1099|taxable|IRS|W-9|W-8|not eligible|closed within/i]);
    const earlySource=firstSource(bonusLines,[/good standing|forfeit|clawback|reclaim|reverse|deduct|close|closed|closure|restricted|early termination|time of payout/i]);
    const src=srcMap([
      srcItem('Bank',b,bankSource,bankSource?(/New Bank Bonus/i.test(b)?'low':'medium'):'low'),
      srcItem('Account',acctValue,accountSource,accountSource?'medium':'low'),
      srcItem('Account type',acctType==='business'?'Business':acctType==='personal'?'Personal':'Unknown / review',accountSource||bankSource,acctType==='unknown'?'low':'high'),
      srcItem('Bonus',bonus?money(bonus):'',bonusSource,bonus?(targetTier||bonusPick?.score>0?'high':'medium'):'low'),
      srcItem('Promo code',p?.value||'',p?.source||'',p?'high':'low'),
      srcItem('Expiration / open-by date',exp?.display||exp?.value||'',exp?.source||'',exp?'high':'low'),
      srcItem('Requirement days',req.reqDays?req.reqDays+' days':'',req.source||'',req.reqDays?'high':'low'),
      srcItem('Requirement amount',req.reqMoney?money(req.reqMoney):'',req.source||'',req.reqMoney?'high':'low'),
      srcItem('Funding deadline',fund.fundedDays?fund.fundedDays+' days':'',fund.source||'',fund.fundedDays?'medium':'low'),
      srcItem('Funding amount',fund.fundingAmount?money(fund.fundingAmount):'',fund.source||'',fund.fundingAmount?'medium':'low'),
      srcItem('Monthly fee',feeObj.fee?money(feeObj.fee):'',feeObj.source||'',feeObj.fee?'high':'low'),
      srcItem('Fee waiver',feeObj.waivers?.join(' OR ')||'',feeObj.source||feeRaw,feeObj.waivers?.length?'high':'low'),
      srcItem('What counts',countValues.join('; '),countsSource,countValues.length?'medium':'low'),
      srcItem('What does not count',notValues.join('; '),notSource,notValues.length?'medium':'low'),
      srcItem('Eligibility',eligibilityLines.join('; '),eligibilitySource,eligibilityLines.length?'medium':'low'),
      srcItem('Payout timing',pay.value,pay.source||'',pay.source?'medium':'low'),
      srcItem('Early close / payout risk','Keep account open and in good standing until payout.',earlySource,earlySource?'medium':'low')
    ]);
        const cr=closeRule(scopes.full);
    const result={version:VER,source,sourceKind:source.kind,sourceId:source.sourceId,sourceLength:source.length,bank:b,acct:acctValue,accountType:acctType,raw:original,normalizedRaw:raw,bonusScope:bonusRaw,feeScope:feeRaw,tiered:!!tierList.length,tiers:tierList,targetTier,bonus,selectedBonus:bonus,bonusTierText:tierList.map(t=>`${money(t.bonus)} for ${money(t.requirement)}+${hasNewMoneyFunding(bonusRaw)?' new money':' DD'}`).join(' / '),code:p?.value||'',promoCode:p,openBy:exp?.value||'',expiration:exp,reqDays:req.reqDays,reqMoney:req.reqMoney,reqIsTotal:req.reqIsTotal,count:req.count,reqSource:req.source,requirementType:req.requirementType,requirementNoun:req.requirementNoun,fundedDays:fund.fundedDays||((tierList.length&&hasNewMoneyFunding(bonusRaw))?depositDaysFromText(bonusRaw):0),fundingAmount:fund.fundingAmount||((tierList.length&&hasNewMoneyFunding(bonusRaw))?(targetTier?.requirement||0):0),fundingSource:fund.source||((tierList.length&&hasNewMoneyFunding(bonusRaw))?(targetTier?.source||'new money funding requirement'):''),holdDays:holdDaysFromText(bonusRaw),minHoldDays:((cr.days&&cr.text)?cr.days:holdDaysFromText(bonusRaw)),closeRuleBasis:cr.basis,closeRuleDays:cr.days,closeRuleText:cr.text,closeRuleConfidence:cr.confidence,closeBufferDays:5,analysisSchemaVersion:'analyzer-review-v1',analysisId:'az_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),hasExplicitCurrentOffer:!!(tierList.length||req.source),fee:feeObj.fee,monthlyFee:feeObj.fee?{value:money(feeObj.fee)+' monthly fee',amount:feeObj.fee,source:feeObj.source}:null,waivers:feeObj.waivers,counts:countValues,not:notValues,notCounts:notValues,eligibilityText:eligibilityLines.join('\n'),payout:pay.value,payoutText:pay.value,payoutSource:pay.source,early:'Keep account open and in good standing until bonus payout; closing/restriction before payout can forfeit bonus.',reviewFlags:[],clear:false,bankProfilesVersion:'v3-core',weirdWordingDetected:weird.hits,weirdWordingAliases:uniq(weird.aliases),weirdWordingNormalizerVersion:WEIRD_WORDING_VER,fieldSources:src.map,sourceSnippets:src.list,fieldConfidence:Object.fromEntries(src.list.map(x=>[x.field,x.confidence]))};
    if(result.weirdWordingAliases?.length)result.reviewFlags.push('Unusual bank wording normalized: '+result.weirdWordingAliases.slice(0,4).join('; ')+(result.weirdWordingAliases.length>4?'…':''));
    if(!result.bonus)result.reviewFlags.push('Bonus amount not found in bonus section. Leave amount blank/review instead of using fee-waiver amounts.');
    if(!result.reqDays&&/direct deposit|qualifying deposit/i.test(bonusRaw))result.reviewFlags.push('Requirement deadline needs review.');
    if(/promo code|promotional code|offer code/i.test(bonusRaw)&&!result.code)result.reviewFlags.push('Promo code mentioned but exact code needs review.');
    if(/offer expires|through and including|open.*by/i.test(bonusRaw)&&!result.openBy)result.reviewFlags.push('Promo expiration/open-by date needs review.');
    result.clear=!!(result.bonus&&result.reqDays);
    result.suggestedTimers=[];
    if(result.closeRuleText&&!result.closeRuleDays)result.reviewFlags.push('Close rule wording needs manual review: '+result.closeRuleText.slice(0,180));
    if(result.openBy)result.suggestedTimers.push({kind:'due',text:'Promo expiration / open-by deadline',date:result.openBy,source:exp?.source||''});
    if(result.fundedDays)result.suggestedTimers.push({kind:'days',text:'Deposit new money / funding deadline',daysRequired:result.fundedDays,source:result.fundingSource||fund.source||''});
    if(result.holdDays)result.suggestedTimers.push({kind:'days',text:'Maintain required new-money balance',daysRequired:result.holdDays,source:'hold requirement'});
    if(result.reqDays)result.suggestedTimers.push({kind:'days',text:result.requirementType==='transactions'?'Complete qualifying transactions':'Bonus requirement deadline',daysRequired:result.reqDays,source:req.source||''});
    const payoutDays=payoutDaysFromText(result.payout||result.payoutText||'');
    if(result.reqDays&&payoutDays)result.suggestedTimers.push({kind:'days',text:'Bonus payout watch',daysRequired:Number(result.reqDays)+payoutDays,source:result.payoutSource||'payout timing'});
    if(result.reqDays&&payoutDays)result.suggestedTimers.push({kind:'days',text:'Close check after payout',daysRequired:Number(result.reqDays)+payoutDays+5,source:'close check'});
    if(result.closeRuleDays)result.suggestedTimers.push({kind:'days',text:'Close hold / early-close safety date',daysRequired:result.closeRuleDays+3,source:result.closeRuleText||'close rule'});
    const plan=[];let step=1;
    plan.push(`${step++}. Open one eligible account${result.openBy?' by '+pretty(result.openBy):''}${result.code?' using promo code '+result.code:''}.`);
    if(result.fundedDays)plan.push(`${step++}. Deposit new money / fund the account${result.fundingAmount?' with at least '+money(result.fundingAmount):''} within ${result.fundedDays} days.`);
    if(result.holdDays)plan.push(`${step++}. Maintain the required new-money balance for ${result.holdDays} days.`);
    if(result.requirementType==='transactions')plan.push(`${step++}. Complete ${result.count||''} qualifying transactions${result.reqDays?' within '+result.reqDays+' days':''}.`);
    else plan.push(`${step++}. Complete ${result.count?'at least '+result.count+' ':''}qualifying Direct Deposits${result.reqMoney?`${result.reqIsTotal?' totaling ':' of '}${money(result.reqMoney)}+${result.reqIsTotal?'':' each'}`:''}${result.reqDays?' within '+result.reqDays+' days':''}.`);
    plan.push(`${step++}. Bonus payout: ${result.payout}.`);
    plan.push(`${step++}. Keep account open and in good standing until payout.`);
    if(result.closeRuleDays)plan.push(`${step++}. Close safety: keep open ${result.closeRuleDays} days from ${result.closeRuleBasis==='bonus'?'bonus received date':result.closeRuleBasis==='reqmet'?'requirement met date':'opened date'} plus your close buffer.`);
    else if(result.closeRuleText)plan.push(`${step++}. Close safety needs review: ${result.closeRuleText}`);
    result.actionPlan=plan.filter(Boolean).join('\n');
    result.beginnerSummary=[result.bank||'New bank',result.bonus?('$'+Number(result.bonus).toLocaleString()+' bonus'):'bonus needs review',result.reqDays?(result.reqDays+' day requirement'):'requirement timing needs review'].filter(Boolean).join(' • ');window.__tcV3AnalysisResult=result;window.__tcCurrentAnalysisResult=result;return result;
  }
  window.tcNormalizeWeirdBankWording=normalize;window.tcAnalyzeWeirdBankWording=normalizeWeirdBankWording;window.tcV3Analyze=analyze;window.tcUnifiedAnalyze=analyze;window.tcStrictAnalyze=analyze;window.tcV3EngineVersion=VER;window.tcWeirdWordingNormalizerVersion=WEIRD_WORDING_VER;
})();