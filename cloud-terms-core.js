/* Immutable R2 historical T&C snapshot projection; no tracker mutations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BTTermsCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const FIELDS=[
 'bank','accountType','entryId','opened','bonus','capturedAt','termsVerifiedAt','source',
 'schemaVersion','promoSourceUrl','feeScheduleSourceUrl','tcSourceRaw','feeScheduleRaw',
 'financialRules','eligibilityRules','eligibilityEvidenceText','eligibilityEvidenceSource',
 'currentCustomerEvidenceText','completeBonusText','monthlyFeeYNText','monthlyFeeAmountText',
 'monthlyFeeWaiverText','avoidMonthlyFeeText','earlyTerminationFeeText','closeRuleText',
 'closeRuleBasis','minHoldDays','earlyCloseFee','expirationDateText','payoutTimingText',
 'requiredDaysText','eligibilityText','sourceEligibilityBasis','churnPeriodValue',
 'churnPeriodUnit','couponEnrollmentDate','offerEnrollmentDate','closeRestrictionType',
 'closeBufferDays','closeFeeCountdownDays','closedWithNegativeBalance','eligibilityScope',
 'eligibilityAnchorEvidenceText','reapplicationAction','monthlyFeeFrequency','monthlyFeeWaiverType',
 'monthlyFeeWaiverAmountText','monthlyFeeNoMonthlyServiceFee','tcSourceId','tcSourceUpdatedAt',
 'churn','churnability','churnRuleText','churnReason','churnDecisionSource',
 'churnDecisionConfidence','churnBasis','eligibilityVerifiedAt'
];
const numeric=new Set(['bonus','schemaVersion','minHoldDays','earlyCloseFee','churnPeriodValue','closeBufferDays','closeFeeCountdownDays']);
const booleans=new Set(['closedWithNegativeBalance','monthlyFeeNoMonthlyServiceFee']);
function snapshot(entry){
 if(!entry||typeof entry!=='object'||!String(entry.bank||'').trim())return null;
 const id=String(entry.entryId||entry.id||'').trim();
 if(!id)return null;
 const result={format:'BonusTrackerHistoricalTerms',version:1};
 for(const key of FIELDS){
  let value=entry[key];
  if(key==='entryId')value=id;
  if(key==='accountType')value=/^(?:b|business)$/i.test(String(entry.accountType||''))?'business':'personal';
  if(key==='tcSourceRaw')value=entry.tcSourceRaw||entry.analysis?.rawText||entry.analyzedTC||'';
  if(key==='source'&&!value)value='saved-account';
  if(key==='financialRules'&&(!value||typeof value!=='object'||Array.isArray(value)))continue;
  if(key==='eligibilityRules'&&!Array.isArray(value))continue;
  if(numeric.has(key)){
   if(value===undefined||value===null||value==='')continue;
   const n=Number(value);if(!Number.isFinite(n))continue;
   value=n;
  }else if(booleans.has(key)){
   if(typeof value!=='boolean')continue;
  }else if(key!=='financialRules'&&key!=='eligibilityRules'){
   if(value===undefined||value===null)continue;
   value=String(value);
  }
  if(value!==undefined)result[key]=value;
 }
 if(!String(result.tcSourceRaw||'').trim()&&!String(result.feeScheduleRaw||'').trim()
  &&!String(result.earlyTerminationFeeText||'').trim()
  &&!String(result.monthlyFeeAmountText||result.monthlyFeeYNText||'').trim()
  &&!String(result.closeRuleText||'').trim()
  &&!String(result.completeBonusText||'').trim()&&!result.financialRules)return null;
 // A deterministic serialization is used for content-addressed immutable versions.
 return JSON.stringify(result);
}
function collect(entries,archive){
 const sources=[];
 if(Array.isArray(entries))sources.push(...entries);
 if(archive&&typeof archive==='object'&&!Array.isArray(archive)){
  for(const row of Object.values(archive)){
   if(!row||typeof row!=='object')continue;
   if(row.current)sources.push(row.current);
   if(Array.isArray(row.versions))sources.push(...row.versions);
  }
 }
 const snapshots=[],dedupe=new Set();
 for(const entry of sources){
  const result=snapshot(entry);
  if(!result||dedupe.has(result))continue;
  dedupe.add(result);snapshots.push(result);
 }
 return snapshots;
}
return {FIELDS,snapshot,collect};
});
