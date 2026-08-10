'use strict';
const fs=require('fs');
const vm=require('vm');
function assert(ok,msg){if(!ok)throw new Error(msg)}

const src=fs.readFileSync('semantic-status.js','utf8');
const storage=[];
let entries=[
  {id:'CIT-P-01',bank:'Citi',opened:'2026-08-10',reqDays:90,dataPoint:'At least 2 Enhanced Direct Deposits totaling $3,000+ within 90 days',customTimers:[{id:'1',text:'$3,000 EDD requirement deadline',startDate:'2026-08-10',daysRequired:90,date:'2026-11-08',done:false}]},
  {id:'LEG-P-01',bank:'Legacy Bank',opened:'2026-08-10',customTimers:[{id:'2',text:'Bonus requirement deadline',startDate:'2026-08-10',daysRequired:90,date:'2026-11-08',done:false}]}
];
const I={target:'T',clockShield:'C',gift:'G',calendar:'D'};
const sandbox={
  console,window:null,globalThis:null,entries,I,SK:'bt_e_v4',
  sv:(k,v)=>storage.push([k,JSON.parse(JSON.stringify(v))]),
  td:()=> '2026-08-10',
  dB:(a,b)=>Math.floor((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5),
  fD:d=>new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
  reqDeadline:e=>e.opened&&e.reqDays?new Date(new Date(e.opened+'T00:00:00').getTime()+e.reqDays*864e5).toISOString().slice(0,10):'',
  esc:s=>String(s),
  status:e=>e.closed?'WAITING TO CHURN!':'CUSTOM TIMER',
  timerCountdownDays:t=>Math.floor((new Date(t.date+'T00:00:00')-new Date('2026-08-10T00:00:00'))/864e5),
  nextActiveTimer:e=>(e.customTimers||[]).find(t=>!t.done)||null,
  normalizeTimer:t=>({id:t.id||'x',text:t.text||'',startDate:t.startDate||'',daysRequired:Number(t.daysRequired||0),date:t.date||'',done:!!t.done}),
  normalizeTimerList:list=>(list||[]).map(t=>({id:t.id||'x',text:t.text||'',startDate:t.startDate||'',daysRequired:Number(t.daysRequired||0),date:t.date||'',done:!!t.done})),
  timerCategory:t=>{const s=String(t?.text||'').toLowerCase();if(/requirement|edd/.test(s))return'requirement';if(/funding/.test(s))return'funding';if(/hold|maintain/.test(s))return'hold';if(/payout/.test(s))return'payout';if(/open-by/.test(s))return'openby';return'custom'},
  displayStatusMeta:raw=>({label:raw,cls:'w',icon:''}),
  timerStatusMeta:e=>({label:'Deadline Active',cls:'buf',icon:'C'}),
  supportLine:()=> 'old support',
  statusBadgeHtml:()=> 'old badge',
  requirementSummaryForEntry:e=>e.dataPoint||'Pending',
  lifecycleSteps:e=>[
    {key:'opened',label:'Opened',done:!!e.opened,date:e.opened||''},
    {key:'req',label:'Direct Deposit',done:!!e.reqMet,date:e.reqMet||''},
    {key:'bonus',label:'Bonus',done:!!e.bonusRecd,date:e.bonusRecd||''},
    {key:'closed',label:'Closed',done:!!e.closed,date:e.closed||''}
  ],
  normalizeLifecycleEntry:e=>({...e,customTimers:sandbox.normalizeTimerList(e.customTimers||[])}),
  collectModalEntryData:()=>({bank:'Citi',customTimers:[{text:'$3,000 EDD requirement deadline',date:'2026-11-08'}]}),
  tcV3MakeSuggestedTimers:()=>[{text:'Maintain required balance / hold check',date:'2026-10-09'}],
  hydrateTimersFromOpened:e=>{e.customTimers=e.customTimers||[];return e},
  R(){},
  setTimeout:fn=>{fn();return 0},clearTimeout(){},JSON,Date,Math,Set,String,Number,Array,Object,RegExp,parseInt
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(src,sandbox,{filename:'semantic-status.js'});

assert(sandbox.btSemanticStatusVersion==='3.4.14-semantic1','Semantic status patch version missing');
assert(sandbox.btSemanticTimerKind({text:'$3,000 EDD requirement deadline'})==='requirement','Citi EDD timer not classified as requirement');
assert(sandbox.btSemanticTimerKind({text:'Deposit new money / funding deadline'})==='funding','Funding timer misclassified');
assert(sandbox.btSemanticTimerKind({text:'Maintain required balance / hold check'})==='hold','Balance hold timer misclassified');
assert(sandbox.btSemanticTimerKind({text:'$325 bonus payout deadline'})==='payout','Payout timer misclassified');
assert(sandbox.btSemanticTimerKind({text:'Offer open-by deadline'})==='openby','Open-by timer misclassified');
assert(sandbox.btSemanticTimerKind({text:'Call bank about debit card'})==='custom','True custom timer lost custom status');

const normalized=sandbox.normalizeTimerList([{text:'Bonus requirement deadline',date:'2026-11-08'}]);
assert(normalized[0].kind==='requirement','Normalized timer did not persist semantic kind');
const citi=sandbox.entries[0];
assert(citi.customTimers[0].kind==='requirement','Existing Citi timer was not migrated to persisted requirement kind');
const state=sandbox.btSemanticStateForEntry(citi);
assert(state.label==='Requirement Due','Citi current stage is not Requirement Due');
assert(state.support==='90d left · Due Nov 8, 2026','Requirement support line is inconsistent: '+state.support);
const badge=sandbox.statusBadgeHtml(citi,null);
assert(/Requirement Due/.test(badge),'Card badge does not use Requirement Due');
assert(!/Custom Timer|Deadline Active/.test(badge),'Legacy generic timer label leaked into card badge');
const req=sandbox.requirementSummaryForEntry(citi);
assert(req==='$3,000 EDD total · 2 deposits · due Nov 8, 2026','Citi requirement summary is not concise/consistent: '+req);
const life=sandbox.lifecycleSteps(citi);
assert(life.find(x=>x.key==='req')?.label==='Requirement Due','Lifecycle requirement step is inconsistent with the card status');
assert(life.find(x=>x.key==='bonus')?.label==='Bonus Pending','Lifecycle bonus step is inconsistent with pending bonus state');
const collected=sandbox.collectModalEntryData();
assert(collected.customTimers[0].kind==='requirement','Saving an entry dropped persisted timer kind');
const suggested=sandbox.tcV3MakeSuggestedTimers({});
assert(suggested[0].kind==='hold','Analyzer suggested timer did not persist semantic kind');
assert(storage.length>0,'Migration did not persist upgraded legacy timers');

console.log('Semantic status passed: canonical timer kinds persist and card, summary, and lifecycle all use Requirement Due consistently');
