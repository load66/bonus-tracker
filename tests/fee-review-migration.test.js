'use strict';
const fs=require('fs');
const vm=require('vm');
function assert(ok,msg){if(!ok)throw new Error(msg)}

const src=fs.readFileSync('fee-review-migration.js','utf8');
let modal={monthlyFeeChecked:false,fieldSources:{}};
let entries=[
  {
    id:'CIT-P-01',bank:'Citi',bonus:325,opened:'2026-08-10',monthlyFeeChecked:true,
    dataPoint:'At least 2 Enhanced Direct Deposits totaling $3,000+ within 90 days',
    completeBonusText:'Receive 2 Enhanced Direct Deposits totaling $3,000 within 90 calendar days.'
  },
  {
    id:'CIT-P-02',bank:'Citi',bonus:325,opened:'2026-08-10',monthlyFeeChecked:true,
    feeVerificationSource:'user-confirmed',
    dataPoint:'At least 2 Enhanced Direct Deposits totaling $3,000+ within 90 days'
  },
  {id:'OTH-P-01',bank:'Other Bank',bonus:325,opened:'2026-08-10',monthlyFeeChecked:true,dataPoint:'$3,000 EDD within 90 days'}
];
const saves=[];
const sandbox={
  console,window:null,globalThis:null,entries,modal,SK:'bt_e_v4',
  sv:(k,v)=>saves.push([k,JSON.parse(JSON.stringify(v))]),
  td:()=> '2026-08-10',R(){},Date,JSON,Math,String,Number,Array,Object,RegExp,
  btModalSet(key,value){modal[key]=value==='yes'?true:value;modal.fieldSources=modal.fieldSources||{};modal.fieldSources[key]={kind:'manual'}},
  collectModalEntryData(){return{monthlyFeeChecked:!!modal.monthlyFeeChecked}}
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
sandbox.setTimeout=()=>0;
vm.createContext(sandbox);
vm.runInContext(src,sandbox,{filename:'fee-review-migration.js'});

assert(sandbox.btFeeReviewMigrationVersion==='3.4.14-feereview1','Fee-review migration version missing');
const changed=sandbox.btMigrateImportedFeeReview();
assert(changed===1,'Expected exactly one legacy imported Citi entry to be reset');
assert(sandbox.entries[0].monthlyFeeChecked===false,'Generated Citi entry still shows fee review as checked');
assert(sandbox.entries[0].feeVerificationSource==='needs-user-review','Generated Citi entry is not marked for user fee review');
assert(sandbox.entries[1].monthlyFeeChecked===true,'User-confirmed Citi fee review was incorrectly reset');
assert(sandbox.entries[2].monthlyFeeChecked===true,'Unrelated bank fee review was incorrectly reset');
assert(saves.length===1,'Fee-review migration did not persist exactly once');
assert(sandbox.btMigrateImportedFeeReview()===0,'Fee-review migration is not idempotent');

sandbox.btModalSet('monthlyFeeChecked','yes','bool');
assert(sandbox.modal.feeVerificationSource==='user-confirmed','Manual fee confirmation was not tagged as user-confirmed');
const saved=sandbox.collectModalEntryData();
assert(saved.feeVerificationSource==='user-confirmed','User fee confirmation was not preserved through entry save');

console.log('Fee review migration passed: legacy Citi import resets once, unrelated/user-confirmed entries are preserved, and future confirmation persists');
