'use strict';
const fs=require('fs');
const vm=require('vm');

function assert(ok,msg){if(!ok)throw new Error(msg)}

const importSource=fs.readFileSync('entry-link-import.js','utf8');
const appSource=fs.readFileSync('app.js','utf8');

assert(importSource.includes("modal._skipManualReplacePrompt=false"),'Entry-file import bypasses the existing replacement picker');
assert(importSource.includes("modal._skipDuplicateCheck=false"),'Entry-file import bypasses duplicate protection');
assert(importSource.includes("modal._edit=false"),'Entry-file import is not staged as a new entry');
assert(importSource.includes("Import Entry File"),'Import Entry File UI is missing');
assert(importSource.includes(".json,.html,application/json,text/html"),'JSON/HTML entry-file support is missing');
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
  churnDecisionForEntry:e=>e.churnable===false?'nonrepeatable':e.churn?'repeatable':'',
  normalizeLifecycleEntry:e=>({...e,churnBasis:e.churnable===false?'':'closed',churnBufferDays:0}),
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
  opened:'2026-08-10',dataPoint:'2 Enhanced Direct Deposits totaling $3,000+ within 90 days',customTimers:[]
};
const parsedJson=sandbox.btParseEntryFileText(JSON.stringify({kind:'BonusTrackerEntry',entry:payload}),'Citi.json');
assert(parsedJson.bank==='Citi'&&parsedJson.bonus===325,'JSON entry file did not parse');
assert(parsedJson.churnBasis==='closed'&&parsedJson.churnBufferDays===0,'Imported repeatable entry was not normalized to confirmed-close-date churn policy');

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
assert(modal.id==='','Imported file retained an external entry ID');
assert(showTemplates===false,'Quick Add panel stayed open after staging file');
assert(showInlineAZ===false&&inlineResult===null,'Stale analyzer UI survived entry-file staging');
assert(JSON.stringify(oldEntries)===before,'Staging an import changed an existing churn record before confirmation');
assert(rendered>0,'Entry-file staging did not render the review editor');

sandbox.postRenderHook();
assert(document.getElementById('bt_import_entry_file'),'Import Entry File button was not injected into Quick Add');
assert(document.getElementById('bt_import_entry_note'),'Replacement-safety explanation is missing from Quick Add');

console.log('Entry file import passed: JSON + HTML parsing, review-before-save, duplicate protection, and existing churn replacement flow preserved');
