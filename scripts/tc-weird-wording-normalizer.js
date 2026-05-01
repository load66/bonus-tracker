/* ✅ Version 2.13.0 Newest update: Weird Wording Normalizer for bank bonus T&C language. No extra UI. */
(function(){
  const VER='2.13.0';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();

  const phraseMap = [
    {re:/adjusted interest/gi, add:'bonus payout'},
    {re:/cash reward/gi, add:'cash bonus'},
    {re:/cash offer/gi, add:'cash bonus offer'},
    {re:/welcome offer/gi, add:'bonus offer'},
    {re:/incentive/gi, add:'bonus'},
    {re:/new money/gi, add:'new qualifying deposit funds'},
    {re:/aggregate deposits?/gi, add:'total qualifying deposits'},
    {re:/cumulative deposits?/gi, add:'total qualifying deposits'},
    {re:/combined deposits?/gi, add:'total qualifying deposits'},
    {re:/qualifying electronic deposits?/gi, add:'qualifying direct deposits'},
    {re:/eligible electronic deposits?/gi, add:'qualifying direct deposits'},
    {re:/external deposits?/gi, add:'qualifying external deposits'},
    {re:/payroll deposits?/gi, add:'direct deposits from employer payroll'},
    {re:/recurring deposits? of income/gi, add:'regular recurring direct deposit income'},
    {re:/statement cycles?/gi, add:'statement periods'},
    {re:/fee periods?/gi, add:'monthly fee periods'},
    {re:/maintain(?:ed)?/gi, add:'keep / hold requirement'},
    {re:/good standing/gi, add:'account must remain open and eligible'},
    {re:/positive balance/gi, add:'account must remain open with positive balance'},
    {re:/available balance/gi, add:'account balance'},
    {re:/offer period/gi, add:'promo open-by period'},
    {re:/through and including/gi, add:'through open-by date'},
    {re:/valid through/gi, add:'promo expiration date'},
    {re:/valid until/gi, add:'promo expiration date'},
    {re:/discontinued or changed/gi, add:'offer can change or end'},
    {re:/not considered/gi, add:'does not count'},
    {re:/do not constitute/gi, add:'does not count'},
    {re:/excluded activity/gi, add:'does not count activity'},
    {re:/not qualify/gi, add:'does not qualify'},
    {re:/not eligible/gi, add:'not eligible'},
    {re:/sole discretion/gi, add:'bank may review manually'},
    {re:/gaming|abuse|misuse/gi, add:'bonus abuse risk'},
    {re:/clawback|reclaim|reverse|deduct|forfeit/gi, add:'early closure clawback risk'}
  ];

  function annotateSentence(sentence){
    let tags=[];
    phraseMap.forEach(p=>{ if(p.re.test(sentence)){ tags.push(p.add); } p.re.lastIndex=0; });
    tags=[...new Set(tags)];
    return tags.length ? `${sentence} [normalized: ${tags.join('; ')}]` : sentence;
  }

  function normalizeRaw(raw){
    const text=String(raw||'');
    if(!text.trim())return text;
    const parts=text.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
    if(!parts.length)return text;
    const annotated=parts.map(annotateSentence).join('\n');
    return annotated.length > text.length ? annotated : text;
  }

  function enhanceResult(r, originalRaw){
    if(!r)return r;
    const raw=String(originalRaw||r.raw||'');
    const weird=[];
    phraseMap.forEach(p=>{ if(p.re.test(raw)) weird.push(p.add); p.re.lastIndex=0; });
    if(weird.length){
      r.weirdWordingDetected=[...new Set(weird)];
      r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[];
      const msg='Unusual bank wording normalized before analysis.';
      if(!r.reviewFlags.includes(msg))r.reviewFlags.push(msg);
    }
    r.weirdWordingNormalizerVersion=VER;
    return r;
  }

  function wrapAnalyze(){
    if(window.__tcWeirdWordingWrapped)return;
    if(typeof window.tcUnifiedAnalyze!=='function')return;
    const base=window.tcUnifiedAnalyze;
    window.tcUnifiedAnalyze=function(raw,opts){
      const original=String(raw||'');
      const normalized=normalizeRaw(original);
      const result=base(normalized,opts);
      result.raw=original;
      result.normalizedRaw=normalized;
      return enhanceResult(result, original);
    };
    window.tcStrictAnalyze=window.tcUnifiedAnalyze;
    window.__tcWeirdWordingWrapped=true;
  }

  window.tcNormalizeWeirdBankWording=normalizeRaw;
  window.tcWeirdWordingNormalizerVersion=VER;
  setTimeout(wrapAnalyze,180);
  setTimeout(wrapAnalyze,800);
  setTimeout(wrapAnalyze,1800);
})();
