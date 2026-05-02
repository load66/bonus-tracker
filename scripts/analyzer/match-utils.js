/*
 * filename: scripts/analyzer/match-utils.js
 * version: 1.0.1
 * purpose: Shared defensive matcher for analyzer bank-rule gates.
 */
(function(){
  window.tcV3EngineAnalyze=window.tcV3EngineAnalyze||window.tcV3Analyze;
  function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
  function hit(raw,rx){
    try{
      if(!rx||typeof rx.source!=='string')return false;
      return new RegExp(rx.source,(rx.flags||'').replace(/[gy]/g,'')).test(raw);
    }catch(e){return false;}
  }
  function count(raw,tests){return list(tests).reduce((n,rx)=>n+(hit(raw,rx)?1:0),0);}
  window.tcV3MatchProfile=function(raw,spec){
    spec=spec||{};
    raw=String(raw||'');
    const brand=list(spec.brand);
    const product=list(spec.product);
    const anti=list(spec.anti);
    const minProduct=Number.isFinite(Number(spec.minProduct))?Number(spec.minProduct):1;
    if(anti.length&&count(raw,anti)>0)return false;
    if(brand.length&&count(raw,brand)<1)return false;
    if(product.length&&count(raw,product)<minProduct)return false;
    return !!(brand.length||product.length);
  };
})();
