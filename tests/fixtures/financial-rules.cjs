'use strict';
// Synthetic terms model real offer shapes; these are not current bank offers.
function fixture(){
 const promo='Receive a $250 bonus after three qualifying payroll direct deposits of $500 in three consecutive calendar months. Bonus is paid within 60 calendar days after all requirements are met. Keep the account open until the bonus posts. Not eligible if you received a checking bonus within the past 12 months.';
 const fees='Checking has no monthly maintenance fee. Share Savings has a $10 monthly maintenance fee. The Share Savings fee is waived by maintaining a $50 minimum daily balance. Membership requires retaining $50 in Share Savings. No early account-closure fee applies.';
 const ev=(source,quote)=>({source,quote});
 return {schemaVersion:3,bank:'Synthetic Community CU',accountType:'personal',bonus:250,opened:'2026-01-31',minHoldDays:0,earlyCloseFee:0,closeRuleBasis:'bonus',closeRestrictionType:'payout-only',closeRuleText:'Keep the account open until the bonus posts.',earlyTerminationFeeText:'No early account-closure fee applies.',payoutTimingText:'Bonus is paid within 60 calendar days after all requirements are met.',promoSourceUrl:'https://example-bank.test/promo',feeScheduleSourceUrl:'https://example-bank.test/fees',termsVerifiedAt:'2026-10-14',tcSourceRaw:promo,feeScheduleRaw:fees,churnable:true,churnability:'repeatable',churn:'1',churnBasis:'bonus',sourceEligibilityBasis:'bonus-received',churnPeriodValue:12,churnPeriodUnit:'months',eligibilityEvidenceText:'Not eligible if you received a checking bonus within the past 12 months.',eligibilityEvidenceSource:'official-promotion-terms',eligibilityRules:[{id:'bonus-12m',basis:'bonus-received',periodValue:12,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you received a checking bonus within the past 12 months.',evidenceSource:'official-promotion-terms'}],
 financialRules:{version:1,bonus:{amount:250,currency:'USD',text:'Selected $250 tier',evidence:ev('promotion','Receive a $250 bonus after three qualifying payroll direct deposits of $500 in three consecutive calendar months.')},accounts:[{id:'checking',label:'Checking',role:'primary',required:true,fee:{amount:0,currency:'USD',frequency:'none',waiver:null,evidence:ev('fee-schedule','Checking has no monthly maintenance fee.')}},{id:'share',label:'Share Savings',role:'companion',required:true,minimumBalance:{amount:50,text:'Retain $50 for membership.',evidence:ev('fee-schedule','Membership requires retaining $50 in Share Savings.')},fee:{amount:10,currency:'USD',frequency:'monthly',evidence:ev('fee-schedule','Share Savings has a $10 monthly maintenance fee.'),waiver:{operator:'all',evidence:ev('fee-schedule','The Share Savings fee is waived by maintaining a $50 minimum daily balance.'),conditions:[{id:'daily-balance',kind:'balance-hold',metric:'minimum-daily-balance',amount:50,period:'calendar-month',text:'Maintain at least $50 every day.',evidence:ev('fee-schedule','The Share Savings fee is waived by maintaining a $50 minimum daily balance.')}]}}}],requirements:[{id:'payroll',accountId:'checking',kind:'direct-deposit',amount:500,count:3,recurrence:{count:3,period:'calendar-month'},text:'Receive a qualifying $500 payroll direct deposit in each of three consecutive calendar months.',evidence:ev('promotion','Receive a $250 bonus after three qualifying payroll direct deposits of $500 in three consecutive calendar months.')}],payout:{text:'Bonus is paid within 60 calendar days after all requirements are met.',timing:{value:60,unit:'calendar-days',basis:'reqmet'},evidence:ev('promotion','Bonus is paid within 60 calendar days after all requirements are met.')},closure:{restrictionType:'payout-only',basis:'bonus',minHoldDays:0,earlyCloseFee:0,text:'Keep the account open until the bonus posts.',evidence:ev('promotion','Keep the account open until the bonus posts.'),feeEvidence:ev('fee-schedule','No early account-closure fee applies.')}}};
}
module.exports={fixture};
// v2 fixture: exact beginning-day balances and an explicitly unconfirmed closure fee.
function reviewFixture(){
 const e=fixture();e.financialRules.version=2;
 const quote='The $10 monthly fee is waived with either a $50 balance at the beginning of each day OR a $500 average beginning day balance during each statement period.';
 e.feeScheduleRaw+=' '+quote;e.closeRuleBasis='manual';e.closeRestrictionType='manual-review';e.closeRuleText='Keep the account open until the bonus posts. Closure fee unconfirmed; verify before closing.';e.earlyTerminationFeeText='Early-close fee unconfirmed.';
 e.financialRules.accounts[1].fee.waiver={operator:'any',evidence:{source:'fee-schedule',quote},conditions:[{id:'beginning',kind:'balance-hold',metric:'minimum-beginning-day-balance',amount:50,period:'statement-cycle',text:'Keep $50 at the beginning of every day.',evidence:{source:'fee-schedule',quote}},{id:'average',kind:'balance-hold',metric:'average-beginning-day-balance',amount:500,period:'statement-cycle',text:'Keep a $500 average beginning day balance.',evidence:{source:'fee-schedule',quote}}]};
 e.financialRules.closure={...e.financialRules.closure,restrictionType:'manual-review',basis:'manual',earlyCloseFee:null,text:e.closeRuleText,feeEvidence:{source:'fee-schedule',quote}};
 return e;
}
module.exports.reviewFixture=reviewFixture;

function arrivalFixture(){
 const e=fixture(),text='Bonus is paid between the 90th and 120th calendar day after account opening, provided the account stays open and in good standing.';
 e.opened='2026-08-10';e.financialRules.version=3;e.tcSourceRaw+=' '+text;e.payoutTimingText=text;
 e.financialRules.payout={text,evidence:{source:'promotion',quote:text},window:{basis:'opened',unit:'calendar-days',min:90,max:120}};
 return e;
}
module.exports.arrivalFixture=arrivalFixture;


// Saved legacy completion wording, isolated from any real account identity or dates.
function legacyArrivalFixture(){
 return {schemaVersion:1,bank:'Synthetic Legacy CU',accountType:'personal',bonus:100,opened:'2026-01-01',reqMet:'2026-01-10',bonusRecd:'',closed:'',analysis:null,analyzerHistory:[],fieldSources:{},payoutTimingText:'Each tracked bonus pays within 60 days after its requirements are met.',customTimers:[],checklist:[]};
}
module.exports.legacyArrivalFixture=legacyArrivalFixture;

function tierArrivalFixture(){
 const e=fixture(),text='After you have completed all requirements, we will deposit the bonus in your new checking account within 15 days.';
 e.financialRules.version=2;e.opened='2026-01-01';e.reqMet='2026-01-10';e.offerEnrollmentDate=e.couponEnrollmentDate='2026-01-01';
 e.tcSourceRaw=e.tcSourceRaw.replace(e.payoutTimingText,text)+' Receive qualifying deposits within 90 days of coupon enrollment. At day 90, the bonus tier will be determined based on qualifying deposits during the 90 days from coupon enrollment.';
 e.payoutTimingText=text;e.financialRules.requirements[0].timing={basis:'enrollment',value:90,unit:'calendar-days'};e.financialRules.requirements[0].evidence.quote=e.tcSourceRaw;
 e.financialRules.payout={text,timing:{basis:'qualifying-period-end',value:15,unit:'calendar-days'},evidence:{source:'promotion',quote:e.tcSourceRaw}};
 return e;
}
module.exports.tierArrivalFixture=tierArrivalFixture;
