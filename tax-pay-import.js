/* Tax pay screenshot JSON contract. No provider uploads, no persistence. */
(function(root){
 'use strict';
 const FORMAT='BonusTrackerTaxPayYTD';
 const optional=['federalTaxableWagesYtd','federalIncomeTaxWithheldYtd','totalEmployeeTaxesYtd','preTaxDeductionsYtd','postTaxDeductionsYtd','netPayYtd'];
 const known=new Set(['format','schemaVersion','taxYear','asOfDate','grossPayYtd',...optional]);
 const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
 function cash(n,optionalField=false){
  if(optionalField&&(n===null||n===undefined))return null;
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1000000000||cents(n)!==n)throw Error('Amounts must be valid, nonnegative dollars and cents.');
  return n;
 }
 function isoDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Use a valid YYYY-MM-DD pay date.');
  const date=new Date(value+'T00:00:00Z');
  if(Number.isNaN(+date)||date.toISOString().slice(0,10)!==value)throw Error('Pay date is not valid.');
  return date;
 }
 function read(raw,clock=new Date()){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!known.has(k)))
   throw Error('This is not a supported BonusTracker pay snapshot.');
  if(raw.format!==FORMAT||raw.schemaVersion!==1)throw Error('Unsupported pay snapshot format or version.');
  const year=raw.taxYear,day=isoDate(raw.asOfDate);
  if(year!==2025&&year!==2026)throw Error('Only the published 2025 and 2026 federal schedules are supported.');
  if(day.getUTCFullYear()!==year)throw Error('Pay date and tax year must match.');
  const clockDay=new Date(Date.UTC(clock.getFullYear(),clock.getMonth(),clock.getDate()));
  if(day>clockDay)throw Error('A future pay date cannot be used for an estimate.');
  if(!Object.hasOwn(raw,'grossPayYtd'))throw Error('Gross YTD pay is missing.');
  const copy={format:FORMAT,schemaVersion:1,taxYear:year,asOfDate:raw.asOfDate,grossPayYtd:cash(raw.grossPayYtd)};
  for(const field of optional)copy[field]=cash(raw[field],true);
  if(copy.federalTaxableWagesYtd!==null&&copy.federalTaxableWagesYtd>copy.grossPayYtd)
   throw Error('Federal taxable wages exceed gross pay. Check the screenshot values.');
  if(copy.federalIncomeTaxWithheldYtd!==null&&copy.totalEmployeeTaxesYtd!==null&&
     copy.federalIncomeTaxWithheldYtd>copy.totalEmployeeTaxesYtd)
   throw Error('Federal withholding cannot exceed total employee taxes on this snapshot.');
  // Cross-check only the comparable gross vs take-home fields; other payroll
  // calculations such as employer tax or imputed income are not inferred.
  return copy;
 }
 function project(data){
  const day=isoDate(data.asOfDate),year=data.taxYear;
  const daysElapsed=Math.floor((day-Date.UTC(year,0,1))/86400000)+1;
  const daysInYear=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  const factor=daysInYear/daysElapsed;
  // Federal taxable pay often excludes 401(k) deferrals and qualifying
  // health premiums. These YTD categories form a PROXY, not verified W-2 Box 1.
  const hasTaxable=data.federalTaxableWagesYtd!==null;
  const hasPretax=data.preTaxDeductionsYtd!==null;
  if(!hasTaxable&&hasPretax&&data.preTaxDeductionsYtd>data.grossPayYtd)
   throw Error('Pre-tax deductions exceed gross pay. Check the screenshot values.');
  const wageBasis=hasTaxable?'federal-taxable-wages':hasPretax?'gross-less-pretax-proxy':'gross-pay-proxy';
  const wageYtd=hasTaxable?data.federalTaxableWagesYtd:hasPretax?
   cents(data.grossPayYtd-data.preTaxDeductionsYtd):data.grossPayYtd;
  return {taxYear:year,asOfDate:data.asOfDate,daysElapsed,daysInYear,wageBasis,
   wageYtd,annualIncome:cents(wageYtd*factor),
   federalWithheldYtd:data.federalIncomeTaxWithheldYtd,
   annualFederalWithholding:data.federalIncomeTaxWithheldYtd===null?null:cents(data.federalIncomeTaxWithheldYtd*factor),
   employeeTaxesYtd:data.totalEmployeeTaxesYtd,source:'user-reviewed-pay-json'};
 }
 root.BTTaxPayImport=Object.freeze({read,project,format:FORMAT});
})(typeof window!=='undefined'?window:globalThis);
