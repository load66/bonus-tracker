/* Tax pay screenshot JSON contract. No provider uploads, no persistence. */
(function(root){
 'use strict';
 const FORMAT='BonusTrackerTaxPayYTD';
 const optional=['federalTaxableWagesYtd','federalIncomeTaxWithheldYtd','totalEmployeeTaxesYtd','preTaxDeductionsYtd','postTaxDeductionsYtd','netPayYtd'];
 const frequencies=['weekly','biweekly','monthly'];
 const scheduleFields=['payFrequency','nextPayDate','federalTaxableWagesPerPaycheck','federalIncomeTaxWithheldPerPaycheck'];
 const known=new Set(['format','schemaVersion','taxYear','asOfDate','grossPayYtd',...optional,...scheduleFields]);
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
  const frequency=raw.payFrequency??null, nextPay=raw.nextPayDate??null;
  if(frequency!==null&&!frequencies.includes(frequency))throw Error('Pay frequency must be weekly, biweekly or monthly.');
  if(nextPay!==null){
   const date=isoDate(nextPay);
   if(date<=day)throw Error('Next payday must be after this YTD snapshot date.');
  }
  if((frequency===null)!==(nextPay===null))
   throw Error('Include both pay frequency and next payday, or neither.');
  copy.payFrequency=frequency;copy.nextPayDate=nextPay;
  for(const key of ['federalTaxableWagesPerPaycheck','federalIncomeTaxWithheldPerPaycheck'])
   copy[key]=cash(raw[key],true);
  if((copy.federalTaxableWagesPerPaycheck!==null||copy.federalIncomeTaxWithheldPerPaycheck!==null)&&!frequency)
   throw Error('Pay frequency and next payday are needed for per-paycheck amounts.');
  // Cross-check only the comparable gross vs take-home fields; other payroll
  // calculations such as employer tax or imputed income are not inferred.
  return copy;
 }

 function payDates(nextISO,frequency,endISO){
  const next=isoDate(nextISO),end=isoDate(endISO),anchorDay=next.getUTCDate(),dates=[];
  let d=new Date(next.getTime());
  for(let count=0;count<90&&d<=end;count++){
   dates.push(d.toISOString().slice(0,10));
   if(frequency==='monthly'){
    const y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
    d=new Date(Date.UTC(y,m,Math.min(anchorDay,new Date(Date.UTC(y,m+1,0)).getUTCDate())));
   }else d=new Date(d.getTime()+(frequency==='weekly'?7:14)*86400000);
  }
  return dates;
 }
 function project(data,options={}){
  const day=isoDate(data.asOfDate),year=data.taxYear;
  const daysElapsed=Math.floor((day-Date.UTC(year,0,1))/86400000)+1;
  const daysInYear=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;
  const factor=daysInYear/daysElapsed;
  const hasTaxable=data.federalTaxableWagesYtd!==null;
  const hasPretax=data.preTaxDeductionsYtd!==null;
  if(!hasTaxable&&hasPretax&&data.preTaxDeductionsYtd>data.grossPayYtd)
   throw Error('Pre-tax deductions exceed gross pay. Check the screenshot values.');
  const wageBasis=hasTaxable?'federal-taxable-wages':hasPretax?'gross-less-pretax-proxy':'gross-pay-proxy';
  const wageYtd=hasTaxable?data.federalTaxableWagesYtd:hasPretax?
   cents(data.grossPayYtd-data.preTaxDeductionsYtd):data.grossPayYtd;
  let annualIncome=cents(wageYtd*factor);
  let annualFederalWithholding=data.federalIncomeTaxWithheldYtd===null?null:cents(data.federalIncomeTaxWithheldYtd*factor);
  let projectionMethod='calendar-average',remainingPaychecks=null,estimatedWagesPerPaycheck=null,estimatedWithheldPerPaycheck=null,trendPaychecks=null;
  const cadence=data.payFrequency,upcoming=data.nextPayDate;
  if(cadence&&upcoming){
   const future=payDates(upcoming,cadence,year+'-12-31');
   remainingPaychecks=future.length;
   estimatedWagesPerPaycheck=data.federalTaxableWagesPerPaycheck;
   estimatedWithheldPerPaycheck=data.federalIncomeTaxWithheldPerPaycheck;
   // When two YTD snapshots exist, calculate the new amount per paycheck
   // by subtraction; NEVER add consecutive YTD totals or compare different
   // wage bases. Infer only fixed 7/14 day schedules. Month is explicit only.
   const prev=options.previous;
   if(prev&&prev.taxYear===year&&prev.asOfDate<data.asOfDate&&
      (cadence==='weekly'||cadence==='biweekly')){
    const prior=project(prev);
    const comparable=prior.wageBasis===wageBasis;
    const periodDays=cadence==='weekly'?7:14;
    const currentDay=day.getTime(),priorDay=isoDate(prev.asOfDate).getTime(),nextDay=isoDate(upcoming).getTime();
    let count=0;
    // Count known paydays through the newer YTD date going backward from next payday.
    for(let n=1;n<=60;n++){
     const payday=nextDay-n*periodDays*86400000;
     if(payday<=priorDay)break;
     if(payday<=currentDay)count++;
    }
    if(count>0&&comparable&&wageYtd>=prior.wageYtd){
     trendPaychecks=count;
     if(estimatedWagesPerPaycheck===null)
      estimatedWagesPerPaycheck=cents((wageYtd-prior.wageYtd)/count);
     if(estimatedWithheldPerPaycheck===null&&data.federalIncomeTaxWithheldYtd!==null&&
        prev.federalIncomeTaxWithheldYtd!==null&&data.federalIncomeTaxWithheldYtd>=prev.federalIncomeTaxWithheldYtd)
      estimatedWithheldPerPaycheck=cents((data.federalIncomeTaxWithheldYtd-prev.federalIncomeTaxWithheldYtd)/count);
    }
   }
   if(estimatedWagesPerPaycheck!==null){
    annualIncome=cents(wageYtd+remainingPaychecks*estimatedWagesPerPaycheck);
    projectionMethod=data.federalTaxableWagesPerPaycheck===null?'pay-period-trend':'pay-period-entered';
   }
   if(estimatedWithheldPerPaycheck!==null&&data.federalIncomeTaxWithheldYtd!==null){
    annualFederalWithholding=cents(data.federalIncomeTaxWithheldYtd+remainingPaychecks*estimatedWithheldPerPaycheck);
    if(projectionMethod==='calendar-average')projectionMethod='pay-period-withholding-only';
   }
  }
  return{taxYear:year,asOfDate:data.asOfDate,daysElapsed,daysInYear,wageBasis,
   wageYtd,annualIncome,federalWithheldYtd:data.federalIncomeTaxWithheldYtd,annualFederalWithholding,
   employeeTaxesYtd:data.totalEmployeeTaxesYtd,source:'user-reviewed-pay-json',projectionMethod,
   payFrequency:cadence||null,nextPayDate:upcoming||null,remainingPaychecks,trendPaychecks,
   estimatedWagesPerPaycheck,estimatedWithheldPerPaycheck};
 }
 root.BTTaxPayImport=Object.freeze({read,project,format:FORMAT});
})(typeof window!=='undefined'?window:globalThis);
