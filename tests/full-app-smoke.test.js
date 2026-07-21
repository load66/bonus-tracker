'use strict';
const fs=require('fs');
const vm=require('vm');

class ElementStub{
  constructor(tag='div'){
    this.tagName=String(tag).toUpperCase();this.children=[];this.style={setProperty(){}};this.dataset={};this.attributes={};this.value='';this.checked=false;this.textContent='';this._html='';this.id='';this.scrollTop=0;this.tabIndex=0;
    const classes=new Set();
    this.classList={add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:v=>classes.has(v)?(classes.delete(v),false):(classes.add(v),true),contains:v=>classes.has(v)};
  }
  set innerHTML(v){this._html=String(v)} get innerHTML(){return this._html}
  appendChild(x){this.children.push(x);return x} prepend(x){this.children.unshift(x);return x}
  remove(){} focus(){} blur(){} click(){} select(){} querySelector(){return null} querySelectorAll(){return []} closest(){return null} contains(){return false}
  setAttribute(k,v){this.attributes[k]=String(v)} getAttribute(k){return this.attributes[k]??null}
  addEventListener(){} removeEventListener(){}
}

const app=new ElementStub('div');app.id='app';
const document={
  head:new ElementStub('head'),body:new ElementStub('body'),documentElement:new ElementStub('html'),readyState:'complete',activeElement:null,
  createElement:t=>new ElementStub(t),createTextNode:t=>({textContent:String(t)}),getElementById:id=>id==='app'?app:null,
  querySelector:s=>s==='#app'||s==='.app'?app:null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}
};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),clear:()=>storage.clear(),key:i=>[...storage.keys()][i]||null,get length(){return storage.size}};
const errors=[];
const testConsole={
  log:console.log,
  warn:(...a)=>{errors.push('WARN '+a.map(String).join(' '));console.warn(...a)},
  error:(...a)=>{errors.push('ERROR '+a.map(String).join(' '));console.error(...a)}
};
class MutationObserverStub{constructor(cb){this.cb=cb}observe(){}disconnect(){}}
const sandbox={
  console:testConsole,document,localStorage,sessionStorage:localStorage,innerHeight:844,
  navigator:{userAgent:'iPhone Safari BonusTracker CI',serviceWorker:{register:()=>Promise.resolve({update(){}}),getRegistration:()=>Promise.resolve(null),addEventListener(){},removeEventListener(){},controller:null},clipboard:{writeText:()=>Promise.resolve()}},
  location:{href:'https://example.test/index.html',origin:'https://example.test',reload(){}},history:{pushState(){},replaceState(){}},
  alert(){},confirm(){return true},prompt(){return''},requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
  setTimeout,clearTimeout,setInterval,clearInterval,Blob,URL,Date,Math,JSON,Map,Set,WeakMap,WeakSet,Array,Object,String,Number,Boolean,RegExp,Error,TypeError,Promise,Intl,parseInt,parseFloat,isNaN,
  crypto:require('crypto').webcrypto,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),getComputedStyle:()=>({}),Event:class{},CustomEvent:class{},FileReader:class{readAsText(){this.result='';this.onload&&this.onload()}},HTMLElement:ElementStub,Node:ElementStub,MutationObserver:MutationObserverStub,
  visualViewport:{height:760,offsetTop:0,addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){}
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
vm.createContext(sandbox);

const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]);
const loaded=[];
for(const file of scripts){
  vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file,timeout:8000});
  loaded.push(file);
}

function assert(ok,msg){if(!ok)throw new Error(msg)}

setTimeout(()=>{
  try{
    assert(loaded.length===scripts.length,'Not every index script loaded');
    assert(sandbox.BT_APP_VERSION==='3.4.06',`Unexpected app version ${sandbox.BT_APP_VERSION}`);
    assert(sandbox.btReleaseVersion==='3.4.06',`Unexpected mobile release version ${sandbox.btReleaseVersion}`);
    assert(sandbox.tcV3FourLeafRulesVersion==='3.4.06',`Unexpected FourLeaf rule version ${sandbox.tcV3FourLeafRulesVersion}`);
    assert(sandbox.BTCloseRules?.VERSION==='3.4.04',`Unexpected close-rule core version ${sandbox.BTCloseRules?.VERSION}`);
    assert(app.innerHTML.length>1000,'Tracker did not render meaningful HTML');
    const report=sandbox.btRunFullRegressionTests();
    assert(report.ok,`Full regression failed: ${JSON.stringify(report)}`);
    assert(report.total>=17,`Full regression suite is incomplete: ${report.total}`);
    const wells='Wells Fargo business checking offer. To receive the $400 bonus, bonus offer code must be used when opening a new eligible business checking account by May 5, 2026. Eligible accounts include Initiate Business Checking, Navigate Business Checking or Optimize Business Checking. Deposit $2,500 or more by day 30 from account opening and maintain a minimum daily collected balance of $2,500 through day 60 after account opening. Bonus deposited within 30 days after the 60-day qualification period.';
    const wr=sandbox.tcV3Analyze(wells,{noGlobalFallback:true});
    assert(wr.bank==='Wells Fargo','Wells Fargo rule failed');
    assert(!(wr.bankRulesApplied||[]).includes('Chase Business Checking'),'Chase rule contaminated Wells Fargo analysis');
    const fourLeaf='FourLeaf Checking Up to $550 Bonus Offer. Open a Free Checking, Smart Checking, or Student Checking account between February 2, 2026 and December 31, 2026. Have a Qualifying Direct Deposit post within ninety (90) calendar days of account opening. A Qualifying Direct Deposit is a recurring electronic deposit of a paycheck, pension, or government benefits of $500.00 or more. The First Direct Deposit Bonus of $350 will be deposited within sixty (60) calendar days following the initial Qualifying Direct Deposit. Continue to have a Qualifying Direct Deposit for twelve (12) consecutive months for an additional $100 and twenty-four (24) consecutive months for another $100. The checking account must remain open and in good standing up to and including the date each bonus is deposited. You must not have previously received a new checking account opening related bonus from FourLeaf.';
    const fr=sandbox.tcV3Analyze(fourLeaf,{noGlobalFallback:true});
    assert(fr.bank==='FourLeaf','FourLeaf bank identification failed');
    assert(fr.bonus===550,'FourLeaf bonus amount failed');
    assert(fr.reqMoney===500&&fr.reqDays===90,'FourLeaf $500 / 90-day requirement failed');
    assert(fr.closeRestrictionType==='payout-only'&&Number(fr.minHoldDays||0)===0,'FourLeaf payout-only close rule failed');
    assert(fr.churnable===false&&fr.churnability==='not-repeatable','FourLeaf lifetime-like churn restriction failed');
    assert(/24 consecutive/i.test(fr.actionPlan||''),'FourLeaf 24-month milestone plan missing');
    const close=sandbox.BTCloseRules.sanitizeEntry({bank:'Chase Biz',accountType:'business',opened:'2026-05-07',reqMet:'2026-05-29',bonusRecd:'2026-07-14',minHoldDays:90,closeFeeCountdownDays:'90',closeRuleBasis:'bonus',closeBufferDays:5,closeRestrictionType:'payout-only',closeRuleText:'Keep the account open until the bonus posts.'});
    assert(close.minHoldDays===0,'Stale Chase close countdown survived');
    assert(sandbox.BTCloseRules.safeCloseDate(close)==='2026-07-14','Payout-only close date is incorrect');
    if(typeof sandbox.R==='function')sandbox.R();
    assert(app.innerHTML.length>1000,'Tracker failed to render after regression run');
    assert(!errors.some(x=>x.startsWith('ERROR ')),`Runtime console errors: ${errors.join(' | ')}`);
    console.log(`Full app smoke passed: ${scripts.length} runtime scripts · ${report.passed}/${report.total} regression checks · FourLeaf and mobile Safari release verified`);
  }catch(err){console.error(err.stack||err);process.exitCode=1}
},2200);
