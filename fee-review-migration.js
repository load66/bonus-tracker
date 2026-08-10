/* BonusTracker v3.4.14 fee-review hotfix — imported facts are not user verification. */
(function(){
  'use strict';
  const VER='3.4.14-feereview1';

  function fieldSourceKind(e,key){
    return String(e?.fieldSources?.[key]?.kind||e?.resolvedFieldSources?.[key]?.kind||'').toLowerCase();
  }
  function feeReviewWasUserConfirmed(e){
    if(!e)return false;
    if(String(e.feeVerificationSource||'').toLowerCase()==='user-confirmed')return true;
    return /manual|user-confirmed/.test(fieldSourceKind(e,'monthlyFeeChecked'));
  }
  function isGeneratedCiti325Entry(e){
    if(!e)return false;
    const bank=String(e.bank||'').trim().toLowerCase();
    if(bank!=='citi'&&bank!=='citibank')return false;
    if(Number(e.bonus||0)!==325||String(e.opened||'')!=='2026-08-10')return false;
    const text=String([e.dataPoint,e.completeBonusText,e.notes,e.promoCodeText].filter(Boolean).join(' '));
    return /(?:enhanced direct deposit|\bedd\b)/i.test(text)&&/\$?3,?000/i.test(text)&&/90\s*(?:calendar\s*)?days/i.test(text);
  }
  function migrateImportedFeeReview(){
    try{
      if(typeof entries==='undefined'||!Array.isArray(entries))return 0;
      let changed=0;
      entries=entries.map(e=>{
        if(!e||!isGeneratedCiti325Entry(e)||e.monthlyFeeChecked!==true||feeReviewWasUserConfirmed(e))return e;
        changed++;
        return {
          ...e,
          monthlyFeeChecked:false,
          feeVerificationSource:'needs-user-review',
          feeReviewResetReason:'Imported/generated fee facts require user confirmation',
          feeReviewResetAt:typeof td==='function'?td():new Date().toISOString().slice(0,10)
        };
      });
      if(changed&&typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      return changed;
    }catch{return 0}
  }

  const baseModalSet=window.btModalSet;
  if(typeof baseModalSet==='function'){
    const wrapped=function(key,value,type){
      const out=baseModalSet.apply(this,arguments);
      try{
        if(key==='monthlyFeeChecked'&&typeof modal!=='undefined'&&modal){
          const yes=value===true||String(value).toLowerCase()==='yes'||String(value).toLowerCase()==='true';
          if(yes){
            modal.feeVerificationSource='user-confirmed';
            modal.feeVerificationConfirmedAt=typeof td==='function'?td():new Date().toISOString().slice(0,10);
          }else if(modal.feeVerificationSource==='user-confirmed'){
            modal.feeVerificationSource='needs-user-review';
          }
        }
      }catch{}
      return out;
    };
    window.btModalSet=wrapped;
    try{btModalSet=wrapped}catch{}
  }

  const baseCollect=window.collectModalEntryData;
  if(typeof baseCollect==='function'){
    const wrappedCollect=function(){
      const out=baseCollect.apply(this,arguments);
      try{
        if(out&&typeof modal!=='undefined'&&modal){
          if(modal.feeVerificationSource)out.feeVerificationSource=modal.feeVerificationSource;
          if(modal.feeVerificationConfirmedAt)out.feeVerificationConfirmedAt=modal.feeVerificationConfirmedAt;
        }
      }catch{}
      return out;
    };
    window.collectModalEntryData=wrappedCollect;
    try{collectModalEntryData=wrappedCollect}catch{}
  }

  window.btMigrateImportedFeeReview=migrateImportedFeeReview;
  window.btFeeReviewMigrationVersion=VER;
  const refresh=()=>{const changed=migrateImportedFeeReview();if(changed){try{R()}catch{}}};
  setTimeout(refresh,120);
  setTimeout(refresh,900);
})();
