/*
 * filename: scripts/tc-first-defense-gate.js
 * version: 2.15.2
 * purpose: Current pasted T&C is always first priority. Saved source vault is fallback only.
 * last-touched: unknown
 */
(function(){
  const VER='2.15.2';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const MIN_SOURCE=180;

  function isTerms(raw){
    const s=clean(raw);
    if(s.length<MIN_SOURCE)return false;
    return /bonus|offer|eligible|qualifying|direct deposit|checking|monthly fee|terms|conditions|promo/i.test(s);
  }

  function pageTextareaSource(){
    const areas=Array.from(document.querySelectorAll('textarea'))
      .filter(a=>a.id!=='tca_raw')
      .map(a=>a.value||'')
      .filter(isTerms)
      .sort((a,b)=>b.length-a.length);
    return areas[0]||'';
  }

  function savedSource(){
    try{return window.tcGetSavedSource?.()?.raw||window.__btLastTcSource?.raw||'';}catch{return'';}
  }

  function sourceFromScreen(){
    const tca=document.getElementById('tca_raw')?.value||'';
    if(isTerms(tca))return {raw:tca,from:'analyzer-box'};

    const page=pageTextareaSource();
    if(isTerms(page))return {raw:page,from:'current-page-textarea'};

    const saved=savedSource();
    if(isTerms(saved))return {raw:saved,from:'saved-source-vault-fallback'};

    return {raw:'',from:'none'};
  }

  function normalize(raw){
    const original=String(raw||'');
    if(!original)return {original:'',normalized:'',changed:false};
    let normalized=original;
    try{
      if(typeof tcNormalizeWeirdBankWording==='function') normalized=tcNormalizeWeirdBankWording(original);
    }catch{}
    return {original,normalized,changed:normalized!==original};
  }

  function saveOriginalSource(raw, reason='first-defense'){
    if(!isTerms(raw))return false;
    try{
      if(typeof tcSaveSourceNow==='function' && document.getElementById('tca_raw')){
        const ta=document.getElementById('tca_raw');
        const old=ta.value;
        ta.value=raw;
        const ok=tcSaveSourceNow();
        ta.value=old;
        return !!ok;
      }
    }catch{}
    try{
      window.__btLastTcSource={raw,reason,updatedAt:new Date().toISOString(),analyzerVersion:VER};
      return true;
    }catch{return false;}
  }

  function runFirstDefense(raw){
    const picked=raw?{raw,from:'direct'}:sourceFromScreen();
    const normalized=normalize(picked.raw);
    if(isTerms(normalized.original)) saveOriginalSource(normalized.original,'first-defense-'+picked.from);
    window.__tcFirstDefenseLast={
      version:VER,
      source:picked.from,
      originalLength:normalized.original.length,
      normalizedLength:normalized.normalized.length,
      changed:normalized.changed,
      time:new Date().toISOString()
    };
    return normalized;
  }

  function preloadAnalyzerBox(){
    const ta=document.getElementById('tca_raw');
    if(!ta)return;
    if(isTerms(ta.value))return;
    const src=sourceFromScreen();
    if(isTerms(src.raw)){
      ta.value=src.raw;
      ta.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }

  function wrapUnifiedAnalyze(){
    if(window.__tcFirstDefenseAnalyzeWrapped)return;
    if(typeof window.tcUnifiedAnalyze!=='function')return;
    const base=window.tcUnifiedAnalyze;
    window.tcUnifiedAnalyze=function(raw,opts){
      const fd=runFirstDefense(raw);
      const result=base(fd.normalized||raw,opts);
      if(result){
        result.raw=fd.original||raw||'';
        result.normalizedRaw=fd.normalized||raw||'';
        result.firstDefenseApplied=true;
        result.firstDefenseChanged=fd.changed;
        result.firstDefenseVersion=VER;
        result.sourcePriority=window.__tcFirstDefenseLast?.source||'';
      }
      return result;
    };
    window.tcStrictAnalyze=window.tcUnifiedAnalyze;
    window.__tcFirstDefenseAnalyzeWrapped=true;
  }

  function wrapAnalyzerButtons(){
    if(window.__tcFirstDefenseButtonsWrapped)return;
    const oldOpen=window.tcOpenPro;
    if(typeof oldOpen==='function'){
      window.tcOpenPro=function(){
        const out=oldOpen.apply(this,arguments);
        setTimeout(()=>{preloadAnalyzerBox(); runFirstDefense();},80);
        setTimeout(preloadAnalyzerBox,250);
        return out;
      };
    }
    const oldRun=window.tcRunPro;
    if(typeof oldRun==='function'){
      window.tcRunPro=function(){
        preloadAnalyzerBox();
        runFirstDefense();
        return oldRun.apply(this,arguments);
      };
    }
    window.__tcFirstDefenseButtonsWrapped=true;
  }

  document.addEventListener('paste',e=>{
    const target=e.target;
    if(!target||target.tagName!=='TEXTAREA')return;
    setTimeout(()=>{
      const raw=target.value||'';
      if(isTerms(raw)) runFirstDefense(raw);
    },80);
  },true);

  document.addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn)return;
    const txt=clean(btn.textContent||'');
    if(/analyz|auto.?fill|create entry|apply fields|save t&c source|open unified analyzer/i.test(txt)){
      setTimeout(()=>{preloadAnalyzerBox(); runFirstDefense();},100);
    }
  },true);

  window.tcFirstDefenseRun=runFirstDefense;
  window.tcFirstDefenseStatus=function(){
    const src=sourceFromScreen();
    const fd=window.__tcFirstDefenseLast||{};
    return {version:VER,source:src.from,sourceLength:src.raw.length,last:fd,normalizer:window.tcWeirdWordingNormalizerVersion||'not loaded'};
  };

  setTimeout(()=>{wrapUnifiedAnalyze();wrapAnalyzerButtons();},250);
  setTimeout(()=>{wrapUnifiedAnalyze();wrapAnalyzerButtons();},900);
  setTimeout(()=>{wrapUnifiedAnalyze();wrapAnalyzerButtons();},1800);
})();