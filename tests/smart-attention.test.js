'use strict';
const fs=require('fs');const vm=require('vm');
function assert(ok,msg){if(!ok)throw new Error(msg)}
const src=fs.readFileSync('smart-attention.js','utf8');
let entries=[
{id:'RG1',bank:'Regions Bank',bonus:450,opened:'2026-08-01',closed:'',customTimers:[]},
{id:'ET1',bank:'E-trade',bonus:300,opened:'2026-08-01',closed:'',customTimers:[]},
{id:'WF1',bank:'Wells Fargo',bonus:400,opened:'2026-08-01',closed:'',customTimers:[]},
{id:'EQ1',bank:'Equity Bank',bonus:400,opened:'2026-08-01',closed:'',customTimers:[]},
{id:'CI1',bank:'Citi',bonus:325,opened:'2026-08-10',closed:'',reqDays:90,dataPoint:'At least 2 Enhanced Direct Deposits totaling $3,000+ within 90 days',customTimers:[{text:'$3,000 EDD requirement deadline',kind:'requirement',date:'2026-11-08'}]},
{id:'OLD',bank:'Closed Bank',bonus:100,opened:'2026-01-01',closed:'2026-02-01',customTimers:[]}
];
const sandbox={window:null,globalThis:null,entries,td:()=> '2026-08-13',dB:(a,b)=>Math.floor((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5),reqDeadline:e=>'2026-11-08',
getAttentionSuggestions:()=>entries.slice(0,4).map((e,i)=>({bank:e.bank,entryId:e.id,dedupeKey:e.id,rsn:'Existing task',bonus:e.bonus,showBonus:true,days:17+i,pri:1,category:'timer'})),
btSemanticStateForEntry:e=>e.bank==='Citi'?{label:'Requirement Due',support:'87d left · Due Nov 8, 2026',kind:'requirement',timer:{date:'2026-11-08'}}:null,
Date,Math,Number,String,Array,Object,Set,Map,RegExp,console};
sandbox.window=sandbox;sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(src,sandbox,{filename:'smart-attention.js'});
const rows=sandbox.getAttentionSuggestions();
assert(rows.length===5,'Needs Attention must contain exactly one item for every open bank');
assert(rows.filter(x=>x.entryId==='CI1').length===1,'New Citi open entry is missing or duplicated');
const citi=rows.find(x=>x.entryId==='CI1');
assert(/Requirement Due/.test(citi.rsn)&&/87d left/.test(citi.rsn),'Citi smart attention reason is not tied to its current semantic deadline');
assert(!rows.some(x=>x.entryId==='OLD'),'Closed bank leaked into Needs Attention');
console.log('Smart attention passed: 5 open banks = 5 Needs Attention items, including Citi Requirement Due');
