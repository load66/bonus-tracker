'use strict';
const fs=require('fs');
const vm=require('vm');

function assert(ok,msg){if(!ok)throw new Error(msg)}
function addD(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function addM(date,months){const d=new Date(date+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(months||0));return d.toISOString().slice(0,10)}
function dB(a,b){return Math.floor((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/864e5)}

const saved=[];
const sandbox={
  console,Date,Math,JSON,parseInt,
  addD,addM,dB,td:()=> '2026-08-18',
  setTimeout:()=>0,
  churnDecisionForEntry:e=>e?.churnable===false||e?.churnability==='not-repeatable'?'nonrepeatable':(e?.churnable===true||e?.churnability==='repeatable'||e?.churn?'repeatable':''),
  entries:[
    {id:'WFB-P-01',bank:'Wells Fargo',closed:'2026-08-18',bonusRecd:'2026-08-14',churn:'1',churnable:true,churnability:'repeatable',churnBasis:'closed',churnBufferDays:0},
    {id:'ARCH-01',bank:'FourLeaf',closed:'2026-08-18',churnable:false,churnability:'not-repeatable',churnBufferDays:99}
  ],
  SK:'bt_e_v4',sv:(k,v)=>saved.push([k,JSON.parse(JSON.stringify(v))])
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('churn-close-policy.js','utf8'),sandbox,{filename:'churn-close-policy.js'});

assert(sandbox.btChurnSafetyBufferDays===5,'Global churn safety buffer is not 5 days');
assert(sandbox.churnBufferDaysFor({churnable:true,churnability:'repeatable',churn:'1'})===5,'Repeatable bank did not receive 5-day buffer');
assert(sandbox.churnBufferDaysFor({churnable:false,churnability:'not-repeatable'})===0,'Non-repeatable offer incorrectly received churn buffer');
assert(sandbox.nextReopen({closed:'2026-08-18',churn:'1',churnable:true,churnability:'repeatable'})==='2027-08-23','1-year churn date is not close date + 1 year + 5 days');
assert(sandbox.churnReadyDate({closed:'2026-08-18',churn:'1',churnable:true,churnability:'repeatable'})==='2027-08-23','Churn-ready date does not include 5-day buffer');
assert(sandbox.daysLeft({closed:'2026-08-18',churn:'1',churnable:true,churnability:'repeatable'})===370,'Current Wells-style 1-year countdown should be 370 days on close date');
assert(sandbox.nextReopen({closed:'2026-01-01',churn:'180',churnable:true,churnability:'repeatable'})==='2026-07-05','180-day churn rule did not receive 5 extra safety days');
assert(sandbox.nextReopen({closed:'2026-03-05',churn:'2',churnable:true,churnability:'repeatable'})==='2028-03-10','2-year churn rule did not receive 5 extra safety days');
assert(sandbox.nextReopen({bonusRecd:'2026-08-14',churn:'1',churnable:true,churnability:'repeatable'})==='','Churn countdown started before confirmed account closure');
assert(sandbox.entries[0].churnBufferDays===5,'Existing closed repeatable entry was not migrated to 5-day buffer');
assert(sandbox.entries[0].churnTrackingPolicy==='confirmed-close-date-plus-5-day-buffer','Existing repeatable entry did not save the new tracking policy');
assert(sandbox.entries[1].churnBufferDays===0,'Non-repeatable saved entry retained a churn buffer');
assert(/5-day safety buffer/.test(sandbox.btFutureEligibilityText(sandbox.entries[0])),'Future eligibility text does not disclose the 5-day buffer');
assert(saved.length>0,'Existing-entry migration was not persisted');

const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8');
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(workflow.includes('node tests/churn-buffer.test.js'),'Pages deploy is not gated by the churn-buffer regression test');
assert(index.includes('./churn-close-policy.js?v=3.4.14-buffer5'),'Index does not force-refresh the 5-day churn policy');
assert(index.includes('./sw.js?v=3.4.14-buffer5'),'Index does not force-refresh the 5-day churn service worker');
assert(sw.includes("const V = 'bt-v3.4.14-buffer5'"),'Service worker cache version does not include the 5-day churn refresh');

console.log('Churn buffer passed: every repeatable bank uses confirmed close date + saved churn period + 5 safety days; non-repeatable offers remain excluded; deploy/cache gate is permanent');
