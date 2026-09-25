'use strict';
const fs=require('fs'),vm=require('vm');
function assert(ok,msg){if(!ok)throw new Error(msg)}
const src=fs.readFileSync('smart-attention.js','utf8');
let entries=[
  {id:'ACT',bank:'Action Bank',bonus:500,opened:'2026-08-01',_stage:'ACTION_NEEDED'},
  {id:'RDY',bank:'Ready Bank',bonus:300,opened:'2026-08-01',bonusRecd:'2026-08-20',_stage:'READY_TO_CLOSE'},
  {id:'ELG',bank:'Eligible Bank',bonus:250,closed:'2026-01-01',_stage:'ELIGIBLE',_days:0},
  {id:'AWT',bank:'Await Bank',bonus:400,opened:'2026-08-01',reqMet:'2026-08-20',_stage:'AWAITING_BONUS'},
  {id:'PRG',bank:'Progress Bank',bonus:200,opened:'2026-08-01',_stage:'IN_PROGRESS'},
  {id:'CDN',bank:'Near Cooldown Bank',bonus:150,closed:'2026-02-01',_stage:'COOLDOWN',_days:20},
  {id:'FAR',bank:'Far Cooldown Bank',bonus:150,closed:'2026-02-01',_stage:'COOLDOWN',_days:120},
  {id:'ARC',bank:'Archive Bank',bonus:100,closed:'2026-02-01',_stage:'ARCHIVED'}
];
const labels={ACTION_NEEDED:'Action Needed',READY_TO_CLOSE:'Ready to Close',ELIGIBLE:'Eligible',AWAITING_BONUS:'Awaiting Bonus',IN_PROGRESS:'In Progress',COOLDOWN:'Cooldown',ARCHIVED:'Archived'};
const support={ACTION_NEEDED:'$500 DD overdue',READY_TO_CLOSE:'All close restrictions cleared',ELIGIBLE:'Eligible to reapply',AWAITING_BONUS:'Requirements complete · waiting for payout',IN_PROGRESS:'Complete bonus requirements',COOLDOWN:'Waiting for eligibility',ARCHIVED:'Completed · non-repeatable offer'};
const sandbox={
  window:null,globalThis:null,entries,
  btLifecycleStageForEntry:e=>({code:e._stage,label:labels[e._stage],support:support[e._stage]}),
  daysLeft:e=>e._days,
  daysUntilSafe:()=>0,
  td:()=> '2026-09-25',
  dB:(a,b)=>Math.floor((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5),
  reqDeadline:()=>'',Date,Math,Number,String,Array,Object,Set,Map,RegExp,console
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(src,sandbox,{filename:'smart-attention.js'});
const rows=sandbox.getAttentionSuggestions();
assert(sandbox.btSmartAttentionVersion==='3.4.30-action1','Action Center version missing');
assert(rows.map(x=>x.entryId).join(',')==='ACT,RDY,ELG,AWT,PRG,CDN','Lifecycle priority order is wrong: '+rows.map(x=>x.entryId).join(','));
assert(rows[0].stageCode==='ACTION_NEEDED'&&/overdue/i.test(rows[0].rsn),'Action Needed did not preserve lifecycle context');
assert(rows.find(x=>x.entryId==='RDY')?.action==='Close account','Ready to Close did not produce the correct next action');
assert(rows.find(x=>x.entryId==='ELG')?.action==='Review opportunity','Eligible did not produce a re-churn action');
assert(!rows.some(x=>x.entryId==='FAR'),'Long cooldown should stay out of the Action Center');
assert(!rows.some(x=>x.entryId==='ARC'),'Archived entry leaked into the Action Center');
console.log('Action Center passed: canonical lifecycle stages drive priority, next action, and cooldown visibility');
