/* Federal ordinary-income estimate, tax years 2025 and 2026.
 * Sources: IRS Rev. Proc. 2025-32 (2026), IRS 2025/2026 rate and deduction tables.
 * This is not a Form 1040 liability engine. Never infer personal tax facts.
 */
(function(root){
 'use strict';
 const RATES=[0.10,0.12,0.22,0.24,0.32,0.35,0.37];
 const YEARS=Object.freeze({
  2025:{standard:{single:15750,mfj:31500,mfs:15750,hoh:23625},
    limits:{single:[11925,48475,103350,197300,250525,626350],mfj:[23850,96950,206700,394600,501050,751600],mfs:[11925,48475,103350,197300,250525,375800],hoh:[17000,64850,103350,197300,250500,626350]}},
  2026:{standard:{single:16100,mfj:32200,mfs:16100,hoh:24150},
    limits:{single:[12400,50400,105700,201775,256225,640600],mfj:[24800,100800,211400,403550,512450,768700],mfs:[12400,50400,105700,201775,256225,384350],hoh:[17700,67450,105700,201750,256200,640600]}}
 });
 const STATUS=Object.freeze({single:'Single',mfj:'Married filing jointly',mfs:'Married filing separately',hoh:'Head of household'});
 function money(v){
  if(typeof v==='number')return Number.isFinite(v)&&v>=0&&v<=1000000000?v:null;
  if(typeof v!=='string'||!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(v.trim()))return null;
  const n=Number(v.trim());return Number.isFinite(n)&&n>=0&&n<=1000000000?n:null;
 }
 function taxOnOrdinary(taxableIncome,limits){
  const taxable=Math.max(0,Number(taxableIncome)||0);
  let last=0,tax=0;
  for(let i=0;i<RATES.length;i++){
   const upper=limits[i]===undefined?Infinity:limits[i];
   const span=Math.max(0,Math.min(taxable,upper)-last);
   tax+=span*RATES[i];
   if(taxable<=upper)break;
   last=upper;
  }
  return Math.round((tax+Number.EPSILON)*100)/100;
 }
 function estimate(input){
  const year=Number(input?.year),filingStatus=String(input?.filingStatus||'');
  const schedule=YEARS[year];
  if(!schedule)return{ok:false,reason:'unsupported-year'};
  if(!Object.hasOwn(STATUS,filingStatus))return{ok:false,reason:'filing-status'};
  const otherIncome=money(input?.otherIncome);
  if(otherIncome===null)return{ok:false,reason:'other-income'};
  const grossBonus=money(input?.bonusAmount);
  if(grossBonus===null)return{ok:false,reason:'bonus-amount'};
  const excluded=input?.excludedBonus===''||input?.excludedBonus==null?0:money(input.excludedBonus);
  if(excluded===null||excluded>grossBonus)return{ok:false,reason:'excluded-bonus'};
  const deduction=input?.deduction===''||input?.deduction==null?schedule.standard[filingStatus]:money(input.deduction);
  if(deduction===null)return{ok:false,reason:'deduction'};
  const withholding=input?.withholding===''||input?.withholding==null?null:money(input.withholding);
  const payments=input?.payments===''||input?.payments==null?0:money(input.payments);
  if((input?.withholding!==''&&input?.withholding!=null&&withholding===null)||payments===null)return{ok:false,reason:'prepayments'};
  const overtime=input?.qualifiedOvertime===''||input?.qualifiedOvertime==null?0:money(input.qualifiedOvertime);
  if(overtime===null)return{ok:false,reason:'qualified-overtime'};
  // IRS Schedule 1-A: married individuals must file jointly; qualified
  // overtime is the FLSA premium, not the full overtime compensation.
  if(overtime>0&&filingStatus==='mfs')return{ok:false,reason:'overtime-filing-status'};
  const ordinaryBonus=Math.round((grossBonus-excluded)*100)/100;
  const otCap=filingStatus==='mfj'?25000:12500;
  const phaseoutThreshold=filingStatus==='mfj'?300000:150000;
  const overtimeFor=grossIncome=>{
   const capped=Math.min(overtime,otCap);
   // Schedule 1-A Part III uses *completed* $1,000 increments.
   // Ordinary gross-income is used as the MAGI proxy in this planning tool.
   const reduction=Math.floor(Math.max(0,grossIncome-phaseoutThreshold)/1000)*100;
   return Math.max(0,Math.round((capped-reduction)*100)/100);
  };
  const overtimeDeductionBefore=overtimeFor(otherIncome);
  const overtimeDeduction=overtimeFor(otherIncome+ordinaryBonus);
  const baselineTaxable=Math.max(0,otherIncome-deduction-overtimeDeductionBefore);
  const taxable=Math.max(0,otherIncome+ordinaryBonus-deduction-overtimeDeduction);
  const before=taxOnOrdinary(baselineTaxable,schedule.limits[filingStatus]);
  const total=taxOnOrdinary(taxable,schedule.limits[filingStatus]);
  const added=Math.round((total-before)*100)/100;
  const marginalRate=RATES[schedule.limits[filingStatus].filter(v=>taxable>v).length];
  const delta=withholding===null?null:Math.round((total-withholding-payments)*100)/100;
  return{ok:true,year,filingStatus,otherIncome,grossBonus,excludedBonus:excluded,taxableBonus:ordinaryBonus,
    deduction,qualifiedOvertime:overtime,overtimeDeduction,overtimeDeductionBefore,overtimeLimit:otCap,overtimePhaseoutEstimated:otherIncome+ordinaryBonus>phaseoutThreshold,usedStandard:input?.deduction===''||input?.deduction==null,baselineTaxable,taxable,
    baselineTax:before,federalTax:total,bonusTax:added,marginalRate,withholding,payments,
    balance:delta,standardDeduction:schedule.standard[filingStatus]};
 }
 root.BTFederalTax=Object.freeze({estimate,taxOnOrdinary,years:[2025,2026],status:STATUS});
})(typeof window!=='undefined'?window:globalThis);
