/* Read-only evidence matching and explicit repair plans. No storage or network. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BTHistoryRepairCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const FIELDS=[['opened','Opening date'],['closed','Closing date'],['bonusRecd','Bonus received date'],['reqMet','Requirements completed date'],['couponEnrollmentDate','Coupon enrollment date'],['offerEnrollmentDate','Offer enrollment date'],['bonus','Received bonus amount'],['tcSourceRaw','Original promotion text'],['feeScheduleRaw','Original fee schedule'],['promoSourceUrl','Promotion source link'],['feeScheduleSourceUrl','Fee schedule source link']];
const DATES=new Set(FIELDS.slice(0,6).map(x=>x[0]));
const REQUIRED=new Set(['opened','tcSourceRaw','feeScheduleRaw','promoSourceUrl','feeScheduleSourceUrl']);
const clone=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const blank=x=>x===undefined||x===null||x==='';
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function valid(field,value,today){
 if(DATES.has(field))return validDate(value)&&value<=today;
 if(field==='bonus')return typeof value==='number'&&Number.isFinite(value)&&value>0;
 if(typeof value!=='string'||!value.trim())return false;
 if(/SourceUrl$/.test(field)){try{return ['http:','https:'].includes(new URL(value).protocol)}catch{return false}}
 return true;
}
function identity(row){return String(row.bank||'').toLowerCase().replace(/[^a-z0-9]/g,'')+'|'+(/^(b|business)$/i.test(String(row.accountType))?'business':'personal');}
function id(row){return String(row.entryId||row.id||'');}
function value(row,field){if(field==='tcSourceRaw')return row.tcSourceRaw||row.analysis?.rawText||'';if(field==='bonus')return Number(row.bonus||0);return row[field]??'';}
function targets(entries){
 const result=[];
 function add(raw,path,parent){
  if(!raw||typeof raw!=='object')return;
  const row={...raw,bank:raw.bank||parent?.bank||'',accountType:raw.accountType||parent?.accountType||'personal',entryId:raw.entryId||raw.id||parent?.entryId||parent?.id||''};
  result.push({key:path.join('.'),path,row,baseline:JSON.stringify(raw)});
  (Array.isArray(raw.previousCycles)?raw.previousCycles:[]).forEach((cycle,i)=>add(cycle,[...path,i],row));
 }
 (entries||[]).forEach((row,i)=>add(row,[i]));return result;
}
function collect(entries,archive,meta={kind:'local-account',label:'Saved account'}){
 const found=targets(entries).map(t=>({row:t.row,source:{...meta,path:t.key,recordId:id(t.row)}}));
 if(archive&&typeof archive==='object')Object.values(archive).forEach(bucket=>{
  if(!bucket||typeof bucket!=='object')return;
  [bucket.current,...(Array.isArray(bucket.versions)?bucket.versions:[])].forEach((raw,i)=>{
   if(!raw||typeof raw!=='object')return;
   const row={...raw,bank:raw.bank||bucket.bank||'',accountType:raw.accountType||bucket.accountType||'personal'};
   found.push({row,source:{...meta,kind:meta.kind==='local-account'?'local-archive':meta.kind,label:meta.kind==='local-account'?'Saved Archive revision':meta.label,path:'archive/'+String(raw.id||i),recordId:id(row),revisionId:raw.id||'',capturedAt:raw.capturedAt||raw.archivedAt||''}});
  });
 });return found;
}
function matches(a,b,identify=identity){
 if(!id(a)||id(a)!==id(b)||!a.bank||!b.bank||identify(a)!==identify(b))return false;
 // A reused account ID must not join different known opening cycles.
 if(validDate(a.opened)&&validDate(b.opened))return a.opened===b.opened;
 return ['bonusRecd','closed'].some(key=>validDate(a[key])&&a[key]===b[key]);
}
function analyze(entries,sources,{identify=identity,today=new Date().toISOString().slice(0,10)}={}){
 return {baseline:JSON.stringify(entries),today,rows:targets(entries).map(target=>{
  const matching=sources.filter(s=>!(s.source.kind==='local-account'&&s.source.path===target.key)&&matches(target.row,s.row,identify));
  const fields=FIELDS.map(([field,label])=>{
   const current=value(target.row,field),choices=[];
   for(const candidate of matching){
    const proposed=value(candidate.row,field);
    if(!valid(field,proposed,today)||(field==='bonus'&&!valid('bonusRecd',candidate.row.bonusRecd,today)))continue;
    let choice=choices.find(x=>same(x.value,proposed));if(!choice){choice={value:clone(proposed),sources:[]};choices.push(choice)}
    if(!choice.sources.some(s=>same(s,candidate.source)))choice.sources.push(clone(candidate.source));
   }
   const issues=[];
   if(blank(current)||(field==='bonus'&&current===0)){if(REQUIRED.has(field)||choices.length||(field==='bonusRecd'&&target.row.closed&&Number(target.row.bonus)>0))issues.push('Not recorded');}
   else if(!valid(field,current,today))issues.push('Needs correction');
   if(choices.length>1||(!blank(current)&&choices.some(x=>!same(x.value,current))))issues.push('Saved sources disagree');
   return {field,label,current,choices,issues};
  });
  return {...target,matchCount:matching.length,fields,issues:fields.filter(f=>f.issues.length).length};
 })};
}
function locate(entries,path){let row=entries[path[0]];for(const index of path.slice(1))row=row?.previousCycles?.[index];return row;}
function plan(entries,report,selections){
 if(JSON.stringify(entries)!==report.baseline)throw Error('Records changed. Refresh the review before applying repairs.');
 const next=clone(entries),changes=[],seen=new Set();
 for(const selection of selections){
  const target=report.rows.find(x=>x.key===selection.key),field=target?.fields.find(x=>x.field===selection.field);
  const choice=Number.isInteger(selection.index)&&field?.choices[selection.index];
  if(!target||!choice||!valid(field.field,choice.value,report.today)||seen.has(target.key+'|'+field.field))throw Error('Choose a recorded source value for each repair.');
  seen.add(target.key+'|'+field.field);
  if(same(choice.value,field.current))continue;
  const row=locate(next,target.path);row[field.field]=clone(choice.value);
  changes.push({key:target.key,path:target.path,field:field.field,label:field.label,before:field.current,value:clone(choice.value),sources:clone(choice.sources)});
 }
 if(!changes.length)throw Error('Select at least one different recorded value.');
 for(const target of report.rows){
  const row=locate(next,target.path),edited=new Set(changes.filter(c=>c.key===target.key).map(c=>c.field));
  for(const field of ['closed','bonusRecd','reqMet'])if((edited.has('opened')||edited.has(field))&&validDate(row.opened)&&validDate(row[field])&&row[field]<row.opened)throw Error('A confirmed event cannot be before the opening date. Review these dates together.');
 }
 return {next,changes};
}
return {FIELDS,validDate,valid,targets,collect,matches,analyze,plan,locate};
});
