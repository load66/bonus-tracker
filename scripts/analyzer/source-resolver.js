/* ✅ Version 3.0.0 Newest update: Analyzer v3 Source Resolver. One source-of-truth for T&C text. */
(function(){
  const VER='3.0.0';
  const STORE_KEY='bt_tc_entry_sources_v3';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const isTerms=raw=>{const s=clean(raw);return s.length>=160&&/(bonus|offer|eligible|qualifying|direct deposit|checking|monthly fee|terms|conditions|promo|deposit period|bonus chart)/i.test(s)};
  const uid=()=>`src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  function readStore(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch{return{}}}
  function writeStore(s){try{localStorage.setItem(STORE_KEY,JSON.stringify(s||{}))}catch{}}
  function modalObj(){try{return window.modal||null}catch{return null}}
  function currentEntry(){
    const m=modalObj();
    if(!m)return null;
    const id=String(m.id||m._id||m.entryId||'');
    try{
      if(id&&Array.isArray(window.entries))return window.entries.find(e=>String(e.id)===id)||null;
      if(m._edit!==undefined&&m._edit!==null&&Array.isArray(window.entries))return window.entries[m._edit]||null;
    }catch{}
    return null;
  }
  function entryKey(entry){return String(entry?.id||modalObj()?.id||modalObj()?._id||modalObj()?.entryId||modalObj()?.bank||'current').trim()||'current'}
  function currentTextareaSource(){
    const tca=document.getElementById('tca_raw')?.value||'';
    if(isTerms(tca))return {raw:tca,kind:'analyzer-box',priority:1};
    const visible=Array.from(document.querySelectorAll('textarea'))
      .filter(a=>a.id!=='tca_raw')
      .map(a=>a.value||'')
      .filter(isTerms)
      .sort((a,b)=>b.length-a.length)[0]||'';
    if(isTerms(visible))return {raw:visible,kind:'current-visible-textarea',priority:2};
    return null;
  }
  function entrySavedSource(){
    const e=currentEntry();
    const m=modalObj();
    const raw=e?.tcSourceRaw||e?.tcSourceTerms||e?.tncSourceText||e?.rawTerms||m?.tcSourceRaw||m?.tcSourceTerms||m?.tncSourceText||'';
    if(isTerms(raw))return {raw,kind:'current-entry-saved-source',priority:3,entryId:entryKey(e)};
    const store=readStore();
    const key=entryKey(e);
    if(store[key]?.raw&&isTerms(store[key].raw))return {raw:store[key].raw,kind:'stored-entry-source',priority:4,entryId:key};
    return null;
  }
  function globalFallback(){
    const raw=window.__btLastTcSource?.raw||'';
    if(isTerms(raw))return {raw,kind:'global-fallback-last-source',priority:99};
    return null;
  }
  function resolve(raw,opts={}){
    const direct=String(raw||'');
    let picked=null;
    if(isTerms(direct))picked={raw:direct,kind:'direct-argument',priority:0};
    if(!picked)picked=currentTextareaSource();
    if(!picked)picked=entrySavedSource();
    if(!picked&&!opts.noGlobalFallback)picked=globalFallback();
    if(!picked)picked={raw:direct,kind:direct?'short-direct-argument':'none',priority:100};
    const e=currentEntry();
    const key=entryKey(e);
    const sourceId=uid();
    const source={...picked,sourceId,entryId:key,bank:e?.bank||modalObj()?.bank||'',length:String(picked.raw||'').length,resolvedAt:new Date().toISOString(),version:VER};
    window.__tcV3CurrentSource=source;
    return source;
  }
  function saveForCurrentEntry(raw,meta={}){
    const source=resolve(raw,{noGlobalFallback:true});
    if(!isTerms(source.raw))return false;
    const e=currentEntry();
    const m=modalObj();
    const key=entryKey(e);
    const rec={raw:source.raw,sourceId:source.sourceId,bank:meta.bank||e?.bank||m?.bank||'',updatedAt:new Date().toISOString(),version:VER,kind:source.kind};
    const store=readStore();store[key]=rec;writeStore(store);
    try{ if(e){e.tcSourceRaw=rec.raw;e.tcSourceId=rec.sourceId;e.tcSourceUpdatedAt=rec.updatedAt;} }catch{}
    try{ if(m){m.tcSourceRaw=rec.raw;m.tcSourceId=rec.sourceId;m.tcSourceUpdatedAt=rec.updatedAt;} }catch{}
    window.__btLastTcSource={raw:rec.raw,sourceId:rec.sourceId,reason:'entry-scoped-save',updatedAt:rec.updatedAt,version:VER};
    return true;
  }
  window.tcV3ResolveSource=resolve;
  window.tcV3SaveSourceForCurrentEntry=saveForCurrentEntry;
  window.tcV3CurrentEntry=currentEntry;
  window.tcV3SourceStore=()=>readStore();
  window.tcV3ClearSourceStore=()=>{localStorage.removeItem(STORE_KEY);return true};
  window.tcV3SourceResolverVersion=VER;
})();
