'use strict';
const fs=require('fs');
const vm=require('vm');

function assert(ok,msg){if(!ok)throw new Error(msg)}

const importSource=fs.readFileSync('entry-link-import.js','utf8');
const appSource=fs.readFileSync('app.js','utf8');
const eligibilityGate=require('../eligibility-gate.js');

assert(importSource.includes("modal._skipManualReplacePrompt=false"),'Entry-file import bypasses the existing replacement picker');
assert(importSource.includes("modal._skipDuplicateCheck=false"),'Entry-file import bypasses duplicate protection');
assert(importSource.includes("modal._edit=false"),'Entry-file import is not staged as a new entry');
assert(importSource.includes("modal.monthlyFeeChecked=false"),'Entry-file import can incorrectly pre-mark monthly fee review as checked');
assert(importSource.includes("Import Entry File"),'Import Entry File UI is missing');
assert(importSource.includes(".json,.html,application/json,text/html"),'JSON/HTML entry-file support is missing');
assert(importSource.includes('btConfirmDialog'),'Entry import did not adopt the in-app confirmation surface');
assert(!importSource.includes('window.confirm('),'Entry import still invokes native browser confirm');
assert(appSource.includes("if(!modal._edit&&!modal._skipManualReplacePrompt&&handleManualReplacementPicker(d,'manual',''))"),'saveEntry no longer routes new entries through the replacement picker');
assert(appSource.includes('function doReplacementPickerReplace()'),'Replace Old Entry action is missing');
assert(appSource.includes('function doReplacementPickerCreateSeparate()'),'Create Separate action is missing');
assert(appSource.includes('function doOverwrite()'),'Final replacement confirmation is missing');

const nodes={};
class ElementStub{
  constructor(tag='div'){
    this.tagName=String(tag).toUpperCase();this.children=[];this.style={};this.files=[];this.id='';this.type='';this.accept='';this.innerHTML='';this.textContent='';
  }
  addEventListener(name,fn){this['on'+name]=fn}
  appendChild(x){this.children.push(x);if(x.id)nodes[x.id]=x;return x}
  prepend(x){this.children.unshift(x);if(x.id)nodes[x.id]=x;return x}
  insertAdjacentElement(_where,x){this.children.push(x);if(x.id)nodes[x.id]=x;return x}
  click(){}
  remove(){}
}
const grid=new ElementStub('div');
const document={
  createElement:t=>new ElementStub(t),
  body:new ElementStub('body'),
  querySelector:s=>s==='.tgrid'?grid:null,
  getElementById:id=>nodes[id]||null
};
let modal=null,rendered=0,showTemplates=true,showInlineAZ=false,inlineResult='stale';
const sandbox={
  console,document,location:{hash:'',pathname:'/bonus-tracker/',search:''},history:{replaceState(){}},
  alert(){},confirm(){return true},TextDecoder,Uint8Array,atob,Date,JSON,Math,Promise,FileReader:function(){},setTimeout(){return 0},clearTimeout(){},
  normalizeTimerList:x=>Array.isArray(x)?x:[],
  BTEligibilityGate:eligibilityGate,
  churnDecisionForEntry:e=>e.churnable===false?'nonrepeatable':e.churn?'repeatable':'',
  normalizeLifecycleEntry:e=>({...e}),
  openAdd(){modal={bank:'',_edit:false};sandbox.modal=modal},
  R(){rendered++},td:()=> '2026-08-10',
  btRegisterPostRender:(name,fn)=>{sandbox.postRenderHook=fn;return true},
  get modal(){return modal},set modal(v){modal=v},
  get showTemplates(){return showTemplates},set showTemplates(v){showTemplates=v},
  get showInlineAZ(){return showInlineAZ},set showInlineAZ(v){showInlineAZ=v},
  get inlineResult(){return inlineResult},set inlineResult(v){inlineResult=v}
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(importSource,sandbox,{filename:'entry-link-import.js'});

const payload={
  bank:'Citi',accountType:'personal',bonus:325,churn:'1',churnable:true,churnability:'repeatable',
  churnBasis:'bonus',sourceEligibilityBasis:'bonus-received',churnPeriodValue:12,churnPeriodUnit:'months',
  eligibilityEvidenceText:'Not eligible if you received a Citi checking bonus within the past 12 months.',
  eligibilityEvidenceSource:'official-promotion-terms',
  opened:'2026-08-10',dataPoint:'2 Enhanced Direct Deposits totaling $3,000+ within 90 days',monthlyFeeChecked:true,feeChecked:true,customTimers:[]
};
const parsedJson=sandbox.btParseEntryFileText(JSON.stringify({kind:'BonusTrackerEntry',entry:payload}),'Citi.json');
assert(parsedJson.bank==='Citi'&&parsedJson.bonus===325,'JSON entry file did not parse');
assert(parsedJson.churnBasis==='bonus'&&parsedJson.eligibilityVerified===true&&parsedJson.churnPeriodValue===12&&parsedJson.churnPeriodUnit==='months','Imported repeatable entry did not preserve verified T&C churn evidence');
let rejected=false;
try{sandbox.btParseEntryFileText(JSON.stringify({kind:'BonusTrackerEntry',entry:{...payload,eligibilityEvidenceText:'',eligibilityEvidenceSource:''}}),'MissingEvidence.json')}catch(e){rejected=/Churn eligibility is not verified/.test(String(e.message))}
assert(rejected,'Import accepted a repeatable bonus with no T&C churn evidence');

rejected=false;
try{sandbox.btParseEntryFileText(JSON.stringify({kind:'BonusTrackerEntry',entry:{...payload,churnBasis:'opened',sourceEligibilityBasis:'account-opened'}}),'WrongBasis.json')}catch(e){rejected=/does not match/.test(String(e.message))}
assert(rejected,'Import accepted a churn basis that conflicts with the T&C wording');

const sixMonthPayload={...payload,churn:'',churnPeriodValue:6,churnPeriodUnit:'months',churnBasis:'opened',sourceEligibilityBasis:'account-opened',eligibilityEvidenceText:'Not eligible if you opened a checking account within the past 6 months.'};
const parsedSix=sandbox.btParseEntryFileText(JSON.stringify({kind:'BonusTrackerEntry',entry:sixMonthPayload}),'SixMonths.json');
assert(parsedSix.churnPeriodValue===6&&parsedSix.churnPeriodUnit==='months'&&parsedSix.eligibilityVerified===true,'Exact six-month cooldown did not import');


const strictV2={
  kind:'BonusTrackerEntry',
  schemaVersion:2,
  verification:{
    promoSourceUrl:'https://example-bank.test/promo',
    feeScheduleSourceUrl:'https://example-bank.test/fees',
    termsVerifiedAt:'2026-09-25'
  },
  entry:{
    ...payload,
    tcSourceRaw:'Citi checking bonus promotional terms. This offer is for eligible new consumer checking customers. Not eligible if you received a Citi checking bonus within the past 12 months. Complete the qualifying deposit requirements within 90 days after account opening. Bonus payout follows the promotional terms.',
    eligibilityRules:[
      {id:'bonus-12m',basis:'bonus-received',periodValue:12,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you received a Citi checking bonus within the past 12 months.',evidenceSource:'official-promotion-terms'}
    ]
  }
};
const parsedV2=sandbox.btParseEntryFileText(JSON.stringify(strictV2),'Citi-v2.json');
assert(parsedV2.schemaVersion===2&&parsedV2.eligibilityRules.length===1,'Strict JSON v2 did not preserve eligibility rules');
assert(parsedV2.promoSourceUrl&&parsedV2.feeScheduleSourceUrl&&parsedV2.termsVerifiedAt==='2026-09-25','Strict JSON v2 provenance was not preserved');

rejected=false;
try{
  sandbox.btParseEntryFileText(JSON.stringify({...strictV2,verification:{...strictV2.verification,feeScheduleSourceUrl:''}}),'MissingFeeSource.json')
}catch(e){rejected=/fee-schedule source URL/.test(String(e.message))}
assert(rejected,'Strict JSON v2 accepted a missing official fee-schedule source');

rejected=false;
try{
  const noRules={...strictV2,entry:{...strictV2.entry,eligibilityRules:[]}};
  sandbox.btParseEntryFileText(JSON.stringify(noRules),'MissingRules.json')
}catch(e){rejected=/eligibilityRules/.test(String(e.message))}
assert(rejected,'Strict JSON v2 accepted a repeatable bonus without eligibilityRules');

rejected=false;
try{
  const missingTc={...strictV2,entry:{...strictV2.entry,tcSourceRaw:''}};
  sandbox.btParseEntryFileText(JSON.stringify(missingTc),'MissingTC.json')
}catch(e){rejected=/full pasted T&C/.test(String(e.message))}
assert(rejected,'Strict JSON v2 accepted a missing full T&C source');

rejected=false;
try{
  const omittedRule={...strictV2,entry:{
    ...strictV2.entry,
    tcSourceRaw:'Citi checking bonus promotional terms. Not eligible if you received a checking bonus within the past 24 months. You are also not eligible if you closed a checking account within the past 12 months. Complete qualifying deposits within 90 days after account opening.',
    eligibilityRules:[
      {id:'bonus-24m',basis:'bonus-received',periodValue:24,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you received a checking bonus within the past 24 months.',evidenceSource:'official-promotion-terms'}
    ]
  }};
  sandbox.btParseEntryFileText(JSON.stringify(omittedRule),'OmittedRule.json')
}catch(e){rejected=/additional .* eligibility restriction|missing from eligibilityRules/.test(String(e.message))}
assert(rejected,'Strict JSON v2 accepted T&C containing an omitted second churn restriction');

const chaseTerms='Checking offer is not available to existing Chase checking customers. Both offers are not available to those whose accounts have been closed within 90 days or closed with a negative balance within the last 3 years. You can receive only one new checking account opening related bonus every two years from the last coupon enrollment date and only one bonus per account.';
const chaseV2={
  kind:'BonusTrackerEntry',
  schemaVersion:2,
  verification:{
    promoSourceUrl:'https://example-bank.test/chase-promo',
    feeScheduleSourceUrl:'https://example-bank.test/chase-fees',
    termsVerifiedAt:'2026-09-25'
  },
  entry:{
    bank:'Chase',accountType:'personal',bonus:300,opened:'2026-05-01',churnable:true,churnability:'repeatable',tcSourceRaw:chaseTerms,
    eligibilityRules:[
      {id:'closed90',basis:'account-closed',periodValue:90,periodUnit:'days',scope:'chase-checking',evidenceText:chaseTerms,evidenceSource:'official-promotion-terms'},
      {id:'closed3y',basis:'account-closed',periodValue:3,periodUnit:'years',scope:'chase-checking',condition:{type:'closed-with-negative-balance',expected:true},evidenceText:chaseTerms,evidenceSource:'official-promotion-terms'},
      {id:'coupon2y',basis:'offer-enrollment',periodValue:2,periodUnit:'years',scope:'chase-checking',anchorFallback:'account-opened',evidenceText:chaseTerms,evidenceSource:'official-promotion-terms'}
    ]
  }
};
const parsedChase=sandbox.btParseEntryFileText(JSON.stringify(chaseV2),'Chase-v2.json');
assert(parsedChase.eligibilityRules.length===3&&parsedChase.eligibilityRules.some(r=>r.basis==='offer-enrollment'&&r.anchorFallback==='account-opened'),'Strict JSON did not preserve Chase coupon enrollment fallback');
assert(parsedChase.eligibilityRules.some(r=>r.condition?.type==='closed-with-negative-balance'),'Strict JSON did not preserve Chase conditional negative-balance rule');

rejected=false;
try{
  const missingEnrollmentFallback={...chaseV2,entry:{...chaseV2.entry,eligibilityRules:chaseV2.entry.eligibilityRules.map(r=>r.id==='coupon2y'?({...r,anchorFallback:''}):r)}};
  sandbox.btParseEntryFileText(JSON.stringify(missingEnrollmentFallback),'ChaseMissingEnrollmentAnchor.json')
}catch(e){rejected=/enrollment rule needs an explicit enrollment date|anchorFallback account-opened/.test(String(e.message))}
assert(rejected,'Strict JSON accepted a coupon-enrollment rule without an explicit date or declared opening-date fallback');


const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
const parsedHtml=sandbox.btParseEntryFileText(`<a href="https://load66.github.io/bonus-tracker/#btadd=${encoded}">Add Citi</a>`,'Citi.html');
assert(parsedHtml.bank==='Citi'&&parsedHtml.opened==='2026-08-10','HTML entry file did not parse the embedded btadd payload');

const oldEntries=[{id:'CIT-P-01',bank:'Citi',opened:'2025-01-01',closed:'2025-03-01',churn:'1',churnable:true,churnability:'repeatable'}];
const before=JSON.stringify(oldEntries);
const staged=sandbox.btStageEntryPayload(parsedHtml,'entry-file','Citi.html');
assert(staged.status==='review','File import did not stop at review');
assert(modal&&modal.bank==='Citi'&&modal._edit===false,'Imported file did not open as a New Entry');
assert(modal._skipManualReplacePrompt===false,'Imported file disabled Replace Old Entry protection');
assert(modal._skipDuplicateCheck===false,'Imported file disabled duplicate protection');
assert(modal.monthlyFeeChecked===false&&modal.feeChecked===false,'Imported file incorrectly marked fee review as user-checked');
assert(modal.id==='','Imported file retained an external entry ID');
assert(showTemplates===false,'Quick Add panel stayed open after staging file');
assert(showInlineAZ===false&&inlineResult===null,'Stale analyzer UI survived entry-file staging');
assert(JSON.stringify(oldEntries)===before,'Staging an import changed an existing churn record before confirmation');
assert(rendered>0,'Entry-file staging did not render the review editor');

sandbox.postRenderHook();
assert(document.getElementById('bt_import_entry_file'),'Import Entry File button was not injected into Quick Add');
assert(document.getElementById('bt_import_entry_note'),'Replacement-safety explanation is missing from Quick Add');

console.log('Entry file import passed: legacy compatibility, strict verified JSON v2 provenance, enrollment anchors, conditional churn evidence, review-before-save, fee safety, and duplicate protection preserved');
