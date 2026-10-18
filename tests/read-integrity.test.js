'use strict';
const fs=require('fs');
const vm=require('vm');
function assert(ok,msg){if(!ok)throw new Error(msg)}

const stored=[{
  id:'HAR-P-01',bank:'Synthetic Harbor',accountType:'personal',bonus:300,opened:'2026-01-15',
  bonusRecd:'2026-10-10',reqMet:'',earlyCloseFee:null,closeBufferDays:3,minHoldDays:0,
  closeRestrictionType:'manual-review',customTimers:[],checklist:[],history:[],
  financialRules:{version:2,closure:{restrictionType:'manual-review',basis:'manual',minHoldDays:0,earlyCloseFee:null,text:'Fee not verified',evidence:'',feeEvidence:null}}
},{
  id:'NOR-P-01',bank:'Synthetic Northline',accountType:'personal',bonus:200,opened:'2020-01-01',closed:'2020-06-01',
  bonusRecd:'2020-04-01',reqMet:'2020-03-01',earlyCloseFee:0,closeBufferDays:3,churn:'1',churnable:true,churnability:'repeatable',
  customTimers:[],checklist:[],history:[]
},{
  id:'OLD-P-01',bank:'Synthetic Oldcopy',accountType:'personal',bonus:50,opened:'2024-01-01',
  bonusRecd:'2024-04-01',reqMet:'2024-04-01',earlyCloseFee:0,closeBufferDays:3,customTimers:[],checklist:[],history:[],
  financialRules:{version:2,closure:{restrictionType:'manual-review',basis:'manual',minHoldDays:0,earlyCloseFee:null,text:'Unknown fee',evidence:'',feeEvidence:null}}
}];
const original=JSON.stringify(stored);

class ElementStub{
  constructor(tag='div'){
    this.tagName=String(tag).toUpperCase();this.children=[];this.style={setProperty(){}};this.dataset={};this.attributes={};this.value='';this.checked=false;this.textContent='';this._html='';this.id='';this.scrollTop=0;this.tabIndex=0;
    const classes=new Set();
    this.classList={add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:v=>classes.has(v)?(classes.delete(v),false):(classes.add(v),true),contains:v=>classes.has(v)};
  }
  set innerHTML(v){this._html=String(v)} get innerHTML(){return this._html}
  set textContent(v){this._text=String(v)} get textContent(){return this._text||''}
  appendChild(x){this.children.push(x);return x} prepend(x){this.children.unshift(x);return x}
  remove(){} focus(){} blur(){} click(){} select(){} querySelector(){return null} querySelectorAll(){return []} closest(){return null} contains(){return false}
  setAttribute(k,v){this.attributes[k]=String(v)} getAttribute(k){return this.attributes[k]??null}
  addEventListener(){} removeEventListener(){}
}
const app=new ElementStub('div');app.id='app';
const document={
  head:new ElementStub('head'),body:new ElementStub('body'),documentElement:new ElementStub('html'),readyState:'complete',activeElement:null,
  createElement:t=>new ElementStub(t),createTextNode:t=>({textContent:String(t)}),getElementById:id=>id==='app'?app:null,
  querySelector:s=>s==='#app'||s==='.app'||s==='.scroll'?app:null,querySelectorAll:()=>[],eventListeners:[],addEventListener(type,fn,capture){this.eventListeners.push({type,fn,capture})},removeEventListener(){}
};
const storage=new Map();
storage.set('bt_e_v4',original);
storage.set('bt_data_schema_version','8');
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),clear:()=>storage.clear(),key:i=>[...storage.keys()][i]||null,get length(){return storage.size}};
const sandbox={
  console,document,localStorage,sessionStorage:localStorage,innerHeight:844,
  navigator:{userAgent:'iPhone Safari BonusTracker CI',serviceWorker:{register:()=>Promise.resolve({update(){}}),getRegistration:()=>Promise.resolve(null),addEventListener(){},removeEventListener(){},controller:null},clipboard:{writeText:()=>Promise.resolve()}},
  location:{href:'https://example.test/index.html',origin:'https://example.test',reload(){}},history:{pushState(){},replaceState(){}},
  alert(){},confirm(){return true},prompt(){return''},requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
  setTimeout,clearTimeout,setInterval,clearInterval,Blob,URL,Date,Math,JSON,Map,Set,WeakMap,WeakSet,Array,Object,String,Number,Boolean,RegExp,Error,TypeError,Promise,Intl,parseInt,parseFloat,isNaN,
  crypto:require('crypto').webcrypto,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),getComputedStyle:()=>({}),Event:class{},CustomEvent:class{},FileReader:class{readAsText(){this.result='';this.onload&&this.onload()}},HTMLElement:ElementStub,Node:ElementStub,MutationObserver:class{observe(){}disconnect(){}},
  visualViewport:{height:760,offsetTop:0,addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){}
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
vm.createContext(sandbox);
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]);
for(const file of scripts)vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file,timeout:8000});

function facts(rows){return JSON.stringify((rows||[]).map(e=>({bank:e.bank,bonusRecd:e.bonusRecd,reqMet:e.reqMet,earlyCloseFee:e.earlyCloseFee,closeBufferDays:e.closeBufferDays})).sort((a,b)=>a.bank.localeCompare(b.bank)))}
const run=code=>vm.runInContext(code,sandbox);
const liveEntries=()=>run('entries');
const liveFacts=facts(liveEntries());
assert(liveFacts===facts(JSON.parse(original)),'Startup changed financial facts before the first paint');
assert(localStorage.getItem('bt_e_v4')===original,'Startup wrote bt_e_v4');
assert(!/2026-10-10/.test(JSON.parse(localStorage.getItem('bt_e_v4'))[0].reqMet||''),'Startup copied the payout date into reqMet');

setTimeout(()=>{
  try{
    assert(localStorage.getItem('bt_e_v4')===original,'Delayed startup migration wrote bt_e_v4');
    const harbor=liveEntries().find(e=>e.bank==='Synthetic Harbor');
    assert(harbor&&harbor.reqMet==='', 'Live requirements date was fabricated');
    assert(harbor.earlyCloseFee===null,'Live null early-close fee was coerced');
    assert(harbor.closeBufferDays===3,'Live three-day buffer was rewritten');
    assert(facts(liveEntries())===liveFacts,'Startup replaced saved financial facts in memory');

    let cloudWrites=0;
    sandbox.btCloudBackupChanged=()=>{cloudWrites++};
    run("tab='archive'");sandbox.R();
    run("tab='tracker'");run('expanded='+JSON.stringify(harbor.id));sandbox.R();
    sandbox.sortE(liveEntries());
    if(typeof sandbox.switchMainTab==='function'){sandbox.switchMainTab('archive');sandbox.switchMainTab('tracker')}
    assert(localStorage.getItem('bt_e_v4')===original,'Rendering, sorting, or navigation wrote bt_e_v4');
    assert(cloudWrites===0,'Read-only navigation triggered cloud backup');

    const backup=sandbox.buildPortableBackupPayload();
    assert(localStorage.getItem('bt_e_v4')===original,'Portable backup rewrote accounts');
    assert(backup.entries.find(e=>e.bank==='Synthetic Harbor').earlyCloseFee===null,'Portable backup turned a null fee into a number');
    assert(backup.entries.find(e=>e.bank==='Synthetic Harbor').reqMet==='','Portable backup invented a requirements date');
    const snap=sandbox.BTCloudCore.snapshot(localStorage,['bt_e_v4'],{dashYear:2026,taxYear:2026},'3.6.32');
    assert(JSON.parse(JSON.parse(snap).storageSnapshot.bt_e_v4)[0].earlyCloseFee===null,'Cloud snapshot changed the null fee');
    assert(localStorage.getItem('bt_e_v4')===original,'Cloud snapshot generation rewrote accounts');
    assert(cloudWrites===0,'Backup generation triggered an account upload');

    const restored=sandbox.normalizeRestoredEntry(JSON.parse(JSON.stringify(harbor)));
    assert(restored.earlyCloseFee===null&&restored.reqMet===''&&restored.closeBufferDays===3,'Restore normalization changed null, blank, or buffer facts');
    const zero=sandbox.normalizeRestoredEntry({bank:'Synthetic Zero',earlyCloseFee:0,earlyTerminationFeeText:'None'});
    const positive=sandbox.normalizeRestoredEntry({bank:'Synthetic Fee',earlyCloseFee:25,earlyTerminationFeeText:'$25'});
    assert(zero.earlyCloseFee===0&&positive.earlyCloseFee===25,'Verified zero and positive fees were not preserved');

    run('modal='+JSON.stringify({...harbor,_edit:true,earlyTerminationFeeText:''}));
    const edited=sandbox.collectModalEntryData();
    assert(edited&&edited.earlyCloseFee===null&&edited.reqMet===''&&edited.closeBufferDays===3,'Editing a blank fee fabricated a value or date');
    assert(localStorage.getItem('bt_e_v4')===original,'Collecting an edit wrote storage before save');
    const cycled=sandbox.normalizeNewCycleData({bank:harbor.bank,earlyCloseFee:null,closeBufferDays:3,financialRules:harbor.financialRules},{...harbor});
    assert(cycled.earlyCloseFee===null&&cycled.closeBufferDays===3,'New-cycle normalization coerced the fee or buffer');

    const decision=sandbox.btEvaluateAccount(harbor);
    const stage=sandbox.btLifecycleStageForEntry(harbor);
    assert(decision.legacyStatus!=='SAFE TO CLOSE'&&sandbox.status(harbor)!=='SAFE TO CLOSE','Unresolved closure was labeled SAFE TO CLOSE');
    assert(stage.code!=='READY_TO_CLOSE'&&!/Ready to close/i.test(stage.label||''),'Manual-review closure was presented as Ready to Close');
    assert(decision.qualification.summary==='Bonus received — requirements completion date not recorded.','Missing requirements date was not disclosed');
    assert(sandbox.requirementSummaryForEntry(harbor)===decision.qualification.summary,'Detail and decision copy disagree');
    assert(decision.legacyStatus===sandbox.status(harbor)&&stage.raw===decision.legacyStatus,'Dashboard status and detail stage disagree');
    assert(!/Ready to close|SAFE TO CLOSE/i.test(sandbox.supportLine(harbor)||''),'Support copy still says the account is ready to close');

    const claw=sandbox.btEvaluateAccount({bank:'Synthetic Claw',bonusRecd:'2026-10-10',reqMet:'2026-09-01',opened:'2026-08-01',earlyCloseFee:40,closeRestrictionType:'explicit-clawback',minHoldDays:0,closeBufferDays:3});
    assert(claw.legacyStatus!=='SAFE TO CLOSE','Payout did not leave an unresolved clawback blocked');
    const legacy=liveEntries().find(e=>e.bank==='Synthetic Northline');
    assert(sandbox.status(legacy)==='WAITING TO CHURN!','Expired legacy cooldown was treated as verified eligibility');
    assert(sandbox.btLifecycleStageForEntry(legacy).code!=='ELIGIBLE','Expired legacy cooldown sorted or staged as eligible');
    const multi=sandbox.btEvaluateAccount({bank:'Synthetic Multi',closed:'2026-01-01',bonusRecd:'2025-06-01',churnable:true,churnability:'repeatable',eligibilityRules:[
      {id:'a',basis:'bonus-received',periodValue:24,periodUnit:'months',evidenceText:'No bonus within 24 months.',evidenceSource:'official-promotion-terms'},
      {id:'b',basis:'account-closed',periodValue:12,periodUnit:'months',evidenceText:'No closure within 12 months.',evidenceSource:'official-promotion-terms'}
    ]});
    assert(multi.repeat.status!=='eligible'&&multi.repeat.blockers.length===2,'Overlapping eligibility restrictions were collapsed or treated as eligible');
    assert(multi.legacyStatus!=='TIME TO CHURN!','Overlapping restrictions produced a ready-to-churn status');

    for(let i=0;i<12;i++){sandbox.status(harbor);sandbox.btLifecycleStageForEntry(harbor);sandbox.btEvaluateAccount(harbor)}
    assert(sandbox.__btStatusEval!==true,'Lifecycle evaluation stayed inside a status call');

    const beforeReview=localStorage.getItem('bt_e_v4');
    const findings=sandbox.btHistoricalIntegrityFindings(liveEntries());
    assert(findings.some(row=>row.bank==='Synthetic Oldcopy'&&row.issues.some(x=>x.proposed===null)),'Historical review did not report the suspect row without inventing a replacement');
    assert(localStorage.getItem('bt_e_v4')===beforeReview,'Historical review rewrote stored accounts');

    run('feeCheckPrompt='+JSON.stringify({entryId:harbor.id,bank:harbor.bank,step:'ask',months:6,feeAmount:null}));
    sandbox.feeCheckRemoveTimer();
    const removed=liveEntries().find(e=>e.bank==='Synthetic Harbor');
    assert(removed.earlyCloseFee===null,'Removing a timer stored a $0 early-close fee');
    assert(sandbox.status(removed)!=='SAFE TO CLOSE','Removing a timer marked the account safe to close');
    assert(!/Safe to Close/.test(run('cfm&&cfm.msg')||''),'Timer removal confirmation claims the account is safe to close');

    cloudWrites=0;
    removed.notes='Confirmed manual note';
    assert(sandbox.saveEntriesStrict(liveEntries())===true,'Authorized save did not persist');
    assert(cloudWrites===1,'Authorized save did not trigger cloud protection');
    const saved=JSON.parse(localStorage.getItem('bt_e_v4')).find(e=>e.bank==='Synthetic Harbor');
    assert(saved.notes==='Confirmed manual note'&&saved.earlyCloseFee===null&&saved.reqMet==='','Authorized save did not preserve the edited record');
    console.log('Read integrity passed');
    process.exit(0);
  }catch(err){console.error(err);process.exit(1)}
},1600);
