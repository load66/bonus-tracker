'use strict';
const assert=require('node:assert/strict');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const {fixture}=require('./fixtures/financial-rules.cjs');
function entry(timing={basis:'opened',value:90,unit:'calendar-days'}){
 const e=fixture(),text='Receive $1,000 in qualifying direct deposits within 90 calendar days of opening.';
 Object.assign(e,{id:'SYN-DEADLINE',opened:'2026-09-12',offerEnrollmentDate:'2026-09-10',reqDays:3,requiredDaysText:'3 calendar days',checklist:[],customTimers:[]});
 e.tcSourceRaw+=' '+text;
 e.financialRules.requirements=[{id:'deposits',accountId:'checking',kind:'direct-deposit',amount:1000,text,timing,evidence:{source:'promotion',quote:text}}];
 return e;
}
try{
 const e=entry(),original=JSON.stringify(e),saved=JSON.stringify([...storage]);
 assert.equal(s.reqDeadline(e),'2026-12-11','Shared deadline must use the saved structured rule, not the legacy day counter');
 assert.equal(s.btNextActionForEntry(e).context.date,'2026-12-11','Action Center deadline disagrees with the canonical projection');
 assert.equal(s.btNextActionForEntry(e).task.context.date,'2026-12-11');
 assert.match(s.btNextActionForEntry(e).context.explanation,/90 calendar days/);
 assert.match(s.BT360.requirementRows(e).html,/Dec 11, 2026/);
 assert.match(s.BT360.timerRows(e),/Dec 11, 2026/);
 assert.match(s.BT360.detailPanels(e),/Requirements due Dec 11, 2026/);
 const enroll=entry({basis:'enrollment',value:90,unit:'calendar-days'});
 assert.equal(s.reqDeadline(enroll),'2026-12-09','Enrollment timing must not use opening date');
 assert.match(s.btRequirementDeadlineContext(enroll).explanation,/enrollment/i);
 delete enroll.offerEnrollmentDate;
 assert.equal(s.reqDeadline(enroll),null,'Missing enrollment must not fall back to opening');
 enroll.couponEnrollmentDate='2026-09-10';assert.equal(s.reqDeadline(enroll),'2026-12-09');
 enroll.offerEnrollmentDate='2026-09-11';assert.equal(s.reqDeadline(enroll),null,'Conflicting saved enrollment dates need review');
 for(const unit of ['business-days','calendar-months','statement-cycles']){
  const x=entry({basis:'opened',value:90,unit});
  assert.equal(s.reqDeadline(x),null,'Unsupported calendar must not use legacy days');
  assert.equal(s.btRequirementDeadlineContext(x).confirmed,false);
  assert.doesNotMatch(s.BT360.requirementRows(x).html,/due Sep|due Dec/);
 }
 for(const opened of ['2026-02-30','not-a-date','']){
  const x=entry();x.opened=opened;assert.equal(s.reqDeadline(x),null,'Invalid opening date was normalized into a deadline');
 }
 for(const value of [0,-1,1.5,'90',Infinity])assert.equal(s.reqDeadline(entry({basis:'opened',value,unit:'calendar-days'})),null);
 for(const [basis,field] of [['reqmet','reqMet'],['bonus','bonusRecd']]){
  const x=entry({basis,value:15,unit:'calendar-days'});
  assert.equal(s.reqDeadline(x),null);x[field]='2026-10-01';assert.equal(s.reqDeadline(x),'2026-10-16');
 }
 const untimed=entry();delete untimed.financialRules.requirements[0].timing;
 assert.equal(s.reqDeadline(untimed),null,'An untimed structured requirement must not inherit a legacy deadline');
 const multi=entry();multi.financialRules.requirements.push({...multi.financialRules.requirements[0],id:'funding',kind:'new-money',timing:{basis:'opened',value:30,unit:'calendar-days'}});
 assert.equal(s.reqDeadline(multi),'2026-10-12','Account summary should show earliest calculable requirement deadline');
 assert.equal(s.btRequirementDeadlineContext(multi,multi.financialRules.requirements[0]).date,'2026-12-11','Individual requirement must retain its own date');
 const legacy={bank:'Synthetic Legacy',opened:'2026-09-12',reqDays:90};
 assert.equal(s.reqDeadline(legacy),'2026-12-11');legacy.requiredDaysText='90 business days';assert.equal(s.reqDeadline(legacy),null);
 assert.equal(JSON.stringify(e),original,'Date projection changed saved facts');
 assert.equal(JSON.stringify([...storage]),saved,'Date projection wrote storage');
 console.log('Shared requirement dates passed: structured precedence, cross-view parity, exact anchors, unresolved calendars, invalid dates, legacy compatibility and no writes.');
 process.exit(0);
}catch(error){console.error(error);process.exit(1)}
