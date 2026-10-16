'use strict';
const assert=require('node:assert/strict');
const {summarize,evidenceType,openingTimestamp}=require('../bonus-evidence-core.js');
const NOW=1792134000, A='a'.repeat(64), B='b'.repeat(64), C='c'.repeat(64);
const entry=(id,bank='First Community',opened='2026-10-01',closed='')=>({id,bank,opened,closed,reqMet:'',bonusRecd:''});
const row=(id,amount,signals,posted=NOW-100,pending=false,kind='deposit')=>({id,amount,signals,posted,pending,kind,description:'Untrusted <img src=x onerror=alert(1)>'});
const state={
  connected:true,lastSuccess:NOW,
  accounts:[
    {key:A,name:'Checking',bank:'First Community',currency:'USD'},
    {key:B,name:'Savings',bank:'First Community',currency:'USD'},
    {key:C,name:'International',bank:'Foreign CU',currency:'EUR'}
  ],
  mappings:{
    [A]:{entryId:'offer-1',bank:'First Community',opened:'2026-10-01'},
    [B]:{entryId:'offer-1',bank:'First Community',opened:'2026-10-01'},
    [C]:{entryId:'offer-2',bank:'Foreign CU',opened:'2026-10-02'}
  },
  transactions:{
    [A]:{
      pay:row('pay','900.00',['possible_direct_deposit']),
      bonus:row('bonus','200.00',['possible_bonus','possible_direct_deposit'],NOW-120,false,'possible_bonus'),
      fee:row('fee','-8.00',['possible_fee']),
      reversal:row('rev','-200.00',['possible_reversal'],NOW-200,false,'possible_reversal'),
      pending:row('pending','150.00',['possible_direct_deposit'],NOW-100,true),
      before:row('before','300.00',['possible_bonus'],Date.parse('2026-09-30T23:59:59Z')/1000),
      wrong:row('wrong','-4.00',['possible_bonus','possible_direct_deposit']),
      upcoming:row('upcoming','600.00',['possible_bonus'],NOW+400),
      neutral:row('neutral','45.00',[])
    },
    [B]:{rec:row('rec','-4.00',['possible_recurring'])},
    [C]:{eur:row('eur','999.00',['possible_bonus'])}
  }
};
const tracked=[entry('offer-1'),entry('offer-2','Foreign CU','2026-10-02'),entry('offer-3','No Link Bank')];
const before=JSON.stringify({state,tracked});
const output=summarize(state,tracked,NOW);
assert.equal(output.openCampaigns,3);
assert.equal(output.linkedCampaigns,2);
assert.equal(output.unlinkedOpenCampaigns,1);
assert.deepEqual(output.counts,{bonus:1,directDeposit:1,fee:1,reversal:1,recurring:1},
  'each flagged posted USD entry is counted only once and only in matching cycle');
assert.equal(output.campaigns[0].entryId,'offer-1');
assert.equal(output.campaigns[0].linkedAccounts.length,2,'multiple correctly linked accounts share a campaign');
assert.equal(output.campaigns[0].activity.length,5,'no pending, future, before opening, wrong sign or unflagged activity');
assert.deepEqual(output.campaigns[0].pending.map(row=>row.type),
  ['reversal','fee','bonus','directDeposit','recurring'],
  'urgent reversals and fees must appear before routine deposits in the review inbox');
assert.deepEqual(output.campaigns[0].activity.map(row=>row.type),
  ['directDeposit','fee','recurring','bonus','reversal'],
  'source transaction history must remain newest-first independently of review priority');
assert.equal(output.campaigns.find(x=>x.entryId==='offer-2').unsupportedCurrency,1);
assert.equal(output.campaigns.find(x=>x.entryId==='offer-2').counts.bonus,0);
assert.equal(output.campaigns[0].counts.directDeposit,1,'bonus flagged as DD should not count twice');
assert.equal(output.staleSync,false);
assert.equal(JSON.stringify({state,tracked}),before,'read-only classifier must never mutate tracker or bank evidence');

assert.equal(evidenceType(row('x','-150',['possible_direct_deposit'])),null);
assert.equal(evidenceType(row('x','150',['possible_fee'])),null);
assert.equal(evidenceType(row('x','100',['possible_bonus'],NOW,true)),null);
assert.equal(evidenceType(row('x','50',[])),null);
assert.equal(openingTimestamp('2026-02-30'),null);
assert.equal(openingTimestamp('2026-10-01'),Date.parse('2026-10-01T00:00:00Z')/1000);

const invalid=summarize({
  ...state,
  mappings:{
    [A]:{entryId:'offer-1',bank:'Other',opened:'2026-10-01'},
    [B]:{entryId:'offer-1',bank:'First Community',opened:'2026-09-01'},
    [C]:{entryId:'deleted',bank:'Foreign CU',opened:'2026-10-02'}
  }
},tracked,NOW);
assert.equal(invalid.linkedCampaigns,0);
assert.equal(invalid.invalidLinks,3);
assert.equal(invalid.unlinkedOpenCampaigns,3,'a stale link does not count as a verified linked bank');

const missing=summarize({...state,missingAccounts:[A],lastSuccess:NOW-4*86400},tracked,NOW);
assert.equal(missing.staleSync,true);
assert.equal(missing.campaigns[0].missingAccounts,1);
assert.equal(missing.campaigns[0].counts.bonus,0,'missing account must not be presented as verified current activity');
assert.equal(missing.campaigns[0].counts.recurring,1);

const closed=summarize({...state,mappings:{[A]:{entryId:'offer-1',bank:'First Community',opened:'2026-10-01'}}},[entry('offer-1','First Community','2026-10-01','2026-10-10')],NOW);
assert.equal(closed.linkedCampaigns,0);
assert.equal(closed.invalidLinks,1,'closed campaigns are excluded from active review');
assert.equal(closed.openCampaigns,0);

const most={...state,transactions:{[A]:{}}};
for(let i=0;i<12;i++)most.transactions[A]['t'+i]=row('t'+i,'50.00',['possible_direct_deposit'],NOW-i-10);
const many=summarize(most,[entry('offer-1')],NOW);
assert.equal(many.campaigns[0].counts.directDeposit,12);
assert.equal(many.campaigns[0].latest.length,5,'compact activity card must stay bounded');
console.log('Bank bonus evidence classifier passed: exact-cycle linkage, directions, pending, currencies, privacy, invalid links, and no tracker mutations');


const reviewed={...state,evidenceReviews:{
  [A]:{
    pay:{status:'reviewed',reviewedAt:NOW,requirementId:'dd_first'},
    bonus:{status:'dismissed',reviewedAt:NOW,requirementId:null},
    fee:{status:'reviewed',reviewedAt:NOW,requirementId:null}
  }
}};
const reviewReport=summarize(reviewed,tracked,NOW);
assert.deepEqual(reviewReport.review,{unreviewed:2,reviewed:2,dismissed:1},
  'inbox receipts are categorized without removing historical bank evidence');
assert.equal(reviewReport.campaigns[0].pending.length,2,'resolved entries disappear from the outstanding queue');
assert.equal(reviewReport.campaigns[0].resolved.length,3,'previously reviewed or dismissed entries remain available');
assert.equal(reviewReport.campaigns[0].activity.find(a=>a.id==='pay').requirementId,'dd_first');
assert.equal(reviewReport.campaigns[0].activity.find(a=>a.id==='bonus').reviewStatus,'dismissed');
assert.equal(reviewReport.campaigns[0].activity.find(a=>a.id==='fee').reviewStatus,'reviewed');
assert.equal(JSON.stringify(reviewed),JSON.stringify({...state,evidenceReviews:reviewed.evidenceReviews}),
  'review projection must never write to private state or tracker records');
