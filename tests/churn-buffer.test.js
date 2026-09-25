'use strict';
const fs=require('fs');
const vm=require('vm');

function assert(ok,msg){if(!ok)throw new Error(msg)}
function parts(date){const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],mo:+m[2],d:+m[3]}:null}
function addD(date,days){const p=parts(date);if(!p)return'';const d=new Date(Date.UTC(p.y,p.mo-1,p.d));d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function addM(date,months){const p=parts(date);if(!p)return'';const total=p.y*12+(p.mo-1)+Number(months||0),y=Math.floor(total/12),mo=((total%12)+12)%12,last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();return `${y}-${String(mo+1).padStart(2,'0')}-${String(Math.min(p.d,last)).padStart(2,'0')}`}
function dB(a,b){const x=parts(a),y=parts(b);return Math.round((Date.UTC(y.y,y.mo-1,y.d)-Date.UTC(x.y,x.mo-1,x.d))/864e5)}

const saved=[];
const sandbox={
  console,Date,Math,JSON,parseInt,
  addD,addM,dB,td:()=> '2026-08-18',
  setTimeout:()=>0,
  churnDecisionForEntry:e=>e?.churnable===false||e?.churnability==='not-repeatable'?'nonrepeatable':(e?.churnable===true||e?.churnability==='repeatable'||e?.churn?'repeatable':''),
  entries:[
    {id:'WFB-P-01',bank:'Wells Fargo',bonusRecd:'2026-08-14',closed:'2026-08-18',churn:'1',churnable:true,churnability:'repeatable',churnBasis:'bonus',sourceEligibilityBasis:'bonus-received'},
    {id:'ARCH-01',bank:'FourLeaf',closed:'2026-08-18',churnable:false,churnability:'not-repeatable',churnBufferDays:99}
  ],
  SK:'bt_e_v4',sv:(k,v)=>saved.push([k,JSON.parse(JSON.stringify(v))])
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('churn-close-policy.js','utf8'),sandbox,{filename:'churn-close-policy.js'});

assert(sandbox.btChurnSafetyBufferDays===5,'Global churn safety buffer is not 5 days');
assert(sandbox.churnBufferDaysFor({churnable:true,churnability:'repeatable',churn:'1',sourceEligibilityBasis:'bonus-received'})===5,'Verified repeatable bank did not receive 5-day buffer');
assert(sandbox.churnBufferDaysFor({churnable:true,churnability:'repeatable',churn:'1'})===0,'Unknown eligibility basis incorrectly received a buffer');
assert(sandbox.churnBufferDaysFor({churnable:false,churnability:'not-repeatable'})===0,'Non-repeatable offer incorrectly received churn buffer');

assert(sandbox.nextReopen({bonusRecd:'2026-08-14',closed:'2026-08-18',churn:'1',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'bonus-received'})==='2027-08-19','Bonus-received rule is not source date + 1 year + 5 days');
assert(sandbox.nextReopen({opened:'2026-01-31',closed:'2026-03-05',churn:'1',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'account-opened'})==='2027-02-05','Opened-date rule did not preserve month-end + 5 days');
assert(sandbox.nextReopen({closed:'2026-03-05',churn:'2',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'account-closed'})==='2028-03-10','Closed-date source rule did not receive 5 safety days');
assert(sandbox.nextReopen({bonusRecd:'2026-08-14',closed:'2026-08-18',churn:'1',churnable:true,churnability:'repeatable'})==='','Unknown eligibility basis incorrectly defaulted to account close');

assert(sandbox.entries[0].churnBasis==='bonus'&&sandbox.entries[0].sourceEligibilityBasis==='bonus-received'&&sandbox.entries[0].churnBufferDays===5,'Existing source-backed entry was not normalized correctly');
assert(sandbox.entries[0].churnTrackingPolicy==='source-bonus-received-plus-5-day-buffer','Source tracking policy was not persisted');
assert(sandbox.entries[1].churnBufferDays===0,'Non-repeatable saved entry retained a churn buffer');
assert(/bonus received date/.test(sandbox.btFutureEligibilityText(sandbox.entries[0]))&&/5-day safety buffer/.test(sandbox.btFutureEligibilityText(sandbox.entries[0])),'Future eligibility text does not disclose source basis + safety buffer');
assert(/needs review/.test(sandbox.btFutureEligibilityText({churn:'1',churnable:true,churnability:'repeatable'})),'Unknown basis is not surfaced for review');
assert(saved.length>0,'Existing-entry normalization was not persisted');

const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8');
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(workflow.includes('node tests/churn-buffer.test.js'),'Pages deploy is not gated by the churn-buffer regression test');
assert(index.includes('./churn-close-policy.js?v=3.4.18-restore1'),'Index does not force-refresh the source-accurate churn policy');
assert(index.includes('./sw.js?v=3.4.18-restore1'),'Index does not force-refresh the source-accurate service worker');
assert(sw.includes("const V = 'bt-v3.4.18-restore1'"),'Service worker cache version is stale');

console.log('Eligibility buffer passed: source terms choose bonus/open/close clock, unknown bases remain unresolved, and a 5-day safety buffer is added only after a verified basis');
