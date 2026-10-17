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


const multiRules={...schema,accounts:[
  {id:'checking',label:'Premium Checking',role:'primary',required:true},
  {id:'share',label:'Member Share Savings',role:'companion',required:true}
]};
const matched={...group,
  linkedAccounts:[{key:A,productId:'checking'},{key:B,productId:'share'}],
  activity:[...group.activity,
    {id:'companion-credit',accountKey:B,type:'directDeposit',
     amount:'2000.00',posted:NOW-60,reviewStatus:'reviewed',
     requirementId:'direct-deposit-main'}]
};
const matchedReport=evaluate(entry,matched,()=>({ok:true,mode:'structured',rules:multiRules}));
assert.equal(matchedReport.scopeVerified,true,'multi-product promo supports reviewed explicit checking/share account match');
assert.equal(matchedReport.requirements[0].applicable,true);
assert.equal(matchedReport.requirements[0].reviewedCount,1,'share savings activity must not inflate checking deposit count');
assert.equal(matchedReport.requirements[0].reviewedAmount,'500.10','share savings deposits must be excluded from checking progress');
assert.equal(matchedReport.requirements[0].candidateCount,2,'count only checking candidates');
assert.equal(matchedReport.requirements[0].verifiedMet,false,'matched product is still not proof of bank qualification');
const noShareLinked={...matched,linkedAccounts:[{key:A,productId:'checking'}]};
const partial=evaluate(entry,noShareLinked,()=>({ok:true,mode:'structured',rules:multiRules}));
assert.equal(partial.requirements[0].reviewedAmount,'500.10','candidate progress can be shown for matched checking while companion needs manual review');
const duplicateChecking={...matched,linkedAccounts:[{key:A,productId:'checking'},{key:B,productId:'checking'}]};
const ambiguousProduct=evaluate(entry,duplicateChecking,()=>({ok:true,mode:'structured',rules:multiRules}));
assert.equal(ambiguousProduct.scopeVerified,false,'same bank product matched to multiple provider accounts must not be inferred');
assert.equal(ambiguousProduct.requirements[0].manual,true,'ambiguous product mapping cannot create progress');
const unknownProduct={...matched,linkedAccounts:[{key:A,productId:'wrong-id'},{key:B,productId:'share'}]};
const unknownReport=evaluate(entry,unknownProduct,()=>({ok:true,mode:'structured',rules:multiRules}));
assert.equal(unknownReport.requirements[0].manual,true,'unknown product id must never silently count toward checking requirements');
const missingPrimary={...matched,missingAccounts:1};
assert.equal(evaluate(entry,missingPrimary,()=>({ok:true,mode:'structured',rules:multiRules})).requirements[0].manual,true);
assert.equal(JSON.stringify(state),snap?JSON.stringify(JSON.parse(snap).state):'','multi-product projection leaves saved bonus and bank records unchanged');


const scope={...group,linkedAccounts:[{key:A,productId:'checking'}],
  observations:[
    {id:'money1',accountKey:A,amount:'1000.00',posted:NOW-100,category:'transfer',transferOtherAccountKey:B},
    {id:'money2',accountKey:A,amount:'700.00',posted:NOW-101,category:'transfer',transferOtherAccountKey:A},
    {id:'purchase1',accountKey:A,amount:'-12.30',posted:NOW-120,paymentMethod:'debit_card',category:'groceries'},
    {id:'purchase2',accountKey:A,amount:'-20.00',posted:NOW-130,category:'shopping'},
    {id:'pendingPurchase',accountKey:A,amount:'-25.00',posted:NOW-150,pending:true,paymentMethod:'debit_card'}
]};
const coverage=[
  {at:Date.parse('2026-10-01T12:00:00Z')/1000,observedAt:NOW,balance:'1200.00',currency:'USD'},
  {at:Date.parse('2026-10-02T12:00:00Z')/1000,observedAt:NOW,balance:'900.00',currency:'USD'},
  {at:Date.parse('2026-10-03T12:00:00Z')/1000,observedAt:NOW,balance:'1100.00',currency:'USD'}
];
const scopedSchema={...schema,requirements:[
  {id:'hold',accountId:'checking',kind:'balance-hold',text:'Maintain minimum daily balance $1,000',
    amount:1000,metric:'minimum-daily-balance',timing:{basis:'opened',unit:'calendar-days',value:2}},
  {id:'fund',accountId:'checking',kind:'new-money',text:'Deposit $1,000 new money',amount:1000},
  {id:'card',accountId:'checking',kind:'transactions',text:'Make one debit-card purchase',count:1}
]};
const candidate=evaluate(entry,scope,()=>({mode:'structured',ok:true,rules:scopedSchema}),{
  accounts:[{key:A,bank:'Synthetic CU'},{key:B,bank:'Outside Credit Union'}],
  balanceHistory:{[A]:coverage}
});
assert.deepEqual(candidate.requirements.map(r=>r.verifiedMet),[false,false,false]);
const hold=candidate.requirements[0];
assert.equal(hold.balance.metric,'minimum-daily-balance');
assert.equal(hold.balance.status,'at risk','one sub-minimum observed point triggers risk');
assert.equal(hold.balance.holdEndDate,'2026-10-03');
assert.equal(hold.balance.coverageDays,3);
assert.equal(candidate.requirements[1].candidateCount,1,'same-bank internal funding excluded');
assert.equal(candidate.requirements[1].candidateAmount,'1000.00');
assert.equal(candidate.requirements[2].candidateCount,1,'posted debit only, not general shopping or pending');
assert.equal(candidate.requirements[2].candidateStatus,'review pending');
assert.equal(entry.reqMet,undefined,'candidate analysis never mutates milestones');
assert.equal(candidate.requirements[0].balance.safeMoveDate,'2026-10-03');
const sparse=evaluate(entry,scope,()=>({mode:'structured',ok:true,rules:scopedSchema}),{
  accounts:[{key:A,bank:'Synthetic CU'},{key:B,bank:'Synthetic CU'}],
  balanceHistory:{[A]:coverage.slice(0,1)}
});
assert.equal(sparse.requirements[0].balance.coverageComplete,false);
assert.equal(sparse.requirements[1].candidateCount,0,'intra-institution transfers never count as new money');
assert.equal(sparse.requirements[0].verifiedMet,false);
console.log('Candidate-only balance, external money and posted debit purchase rules passed');
