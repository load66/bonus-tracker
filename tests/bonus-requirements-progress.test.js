'use strict';
const assert=require('node:assert/strict');
const {evaluate,cents,decimal}=require('../bonus-requirements-progress.js');
const {summarize}=require('../bonus-evidence-core.js');
const NOW=1792134000, A='a'.repeat(64), B='b'.repeat(64);
const entry={id:'cycle',bank:'Synthetic CU',opened:'2026-10-01',closed:'',
             financialRules:{version:2}};
const amount=(id,value,posted=NOW-100,review=null)=>{
  return {id,amount:value,posted,kind:'other_deposit',signals:['possible_direct_deposit'],
          ...(review?{_review:review}:{})};
};
const state={
  lastSuccess:NOW,accounts:[{key:A,currency:'USD',name:'Checking'}],
  mappings:{[A]:{entryId:'cycle',bank:'Synthetic CU',opened:'2026-10-01'}},
  transactions:{[A]:{
    one:amount('one','500.10'),two:amount('two','250.00',NOW-200),
    three:amount('three','999.00',NOW-300),
    fee:{id:'fee',posted:NOW-100,amount:'-20.00',signals:['possible_fee'],kind:'withdrawal'},
    pending:{id:'pending',posted:NOW-100,amount:'1000.00',pending:true,signals:['possible_direct_deposit']}
  }},
  evidenceReviews:{[A]:{
    one:{status:'reviewed',requirementId:'direct-deposit-main'},
    two:{status:'reviewed',requirementId:null},
    three:{status:'dismissed'}
  }}
};
const schema={accounts:[{id:'checking',role:'primary',required:true}],
  requirements:[
    {id:'direct-deposit-main',accountId:'checking',kind:'direct-deposit',
     text:'Receive at least $1,500 in qualifying direct deposits.',amount:1500},
    {id:'balance',accountId:'checking',kind:'balance-hold',text:'Maintain balance.'}
  ]};
const validate=()=>({ok:true,mode:'structured',rules:schema});
const group=summarize(state,[entry],NOW).campaigns[0];
const snap=JSON.stringify({state,entry});
const r=evaluate(entry,group,validate);
assert.equal(r.mode,'structured');
assert.equal(r.scopeVerified,true);
assert.equal(r.requirements.length,2);
const dd=r.requirements[0];
assert.equal(dd.applicable,true);
assert.equal(dd.candidateCount,2,'dismissed, pending and non-DD transactions are excluded');
assert.equal(dd.candidateAmount,'750.10','candidate sum uses exact cents');
assert.equal(dd.reviewedCount,1,'reviewed without requirement association is not counted for this rule');
assert.equal(dd.reviewedAmount,'500.10');
assert.equal(dd.targetAmount,'1500');
assert.equal(dd.verifiedMet,false,'no inferred requirement completion');
assert.equal(r.requirements[1].manual,true,'balance holds require external verification');
assert.ok(r.notice.includes('Confirm deposit origin'));
assert.equal(JSON.stringify({state,entry}),snap,'evaluating progress must be pure');

const ambiguous={...group,linkedAccounts:[...group.linkedAccounts,{key:B}]};
const a=evaluate(entry,ambiguous,validate);
assert.equal(a.scopeVerified,false,'multiple account links cannot be assigned to a product by name');
assert.equal(a.requirements[0].candidateCount,0);
assert.equal(a.requirements[0].reviewedCount,0);
assert.equal(a.requirements[0].manual,true);

const companion=evaluate(entry,group,()=>({ok:true,mode:'structured',rules:{
  ...schema,accounts:[{id:'checking',role:'primary',required:true},{id:'savings',role:'companion',required:true}]
}}));
assert.equal(companion.scopeVerified,false,'multi-product rules require explicit account-product scoping');

const bad=evaluate(entry,group,()=>({mode:'invalid',ok:false}));
assert.equal(bad.mode,'manual');
assert.equal(bad.requirements.length,0);
assert.equal(evaluate(entry,group,null).mode,'manual');
assert.equal(evaluate({},null,validate).mode,'manual');
assert.equal(cents('9.999'),null,'no rounding unknown deposit precision');
assert.equal(decimal(cents('0.01')+cents('0.02')),'0.03');
assert.equal(cents('1e12'),null,'no notation / ambiguous precision');

const recurring=evaluate(entry,group,()=>({ok:true,mode:'structured',rules:{
  ...schema,requirements:[{id:'direct-deposit-main',accountId:'checking',kind:'direct-deposit',
    text:'Receive monthly deposits',amount:500,recurrence:{period:'calendar-month',count:3}}]
}}));
assert.equal(recurring.requirements[0].reviewedCalendarMonths,1);
assert.equal(recurring.requirements[0].verifiedMet,false,'recurring months are observations not payout confirmation');

console.log('Bonus requirement candidate engine passed: evidence-backed scope, exact cents, reviewed links, recurring periods, invalid rules, multi-product exclusions and no completion writes');
