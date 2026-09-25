'use strict';
const fs=require('fs');
function assert(ok,msg){if(!ok)throw new Error(msg)}
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('style.css','utf8');
const index=fs.readFileSync('index.html','utf8');
const feedback=fs.readFileSync('ui-feedback.js','utf8');
const entryImport=fs.readFileSync('entry-link-import.js','utf8');
const attention=fs.readFileSync('smart-attention.js','utf8');
for(const token of ['function bonusPipelineMetrics','Active bonus pipeline','Collected','Awaiting','In Progress','Action Needed','function renderActionCenter','function renderCardProgressLine']){
  assert(app.includes(token),'Professional dashboard/card architecture missing: '+token);
}
for(const token of ['function timelineRowsForEntry','Activity Timeline','account_opened','Requirements completed','Bonus received','Account closed']){
  assert(app.includes(token),'Activity timeline missing: '+token);
}
assert(app.includes("appendEntryHistory(e,e.checklist[i].done?'checklist_completed':'checklist_reopened'"),'Checklist changes are not logged to the activity timeline');
assert(app.includes("appendEntryHistory(e,changed.done?'timer_completed':'timer_reopened'"),'Timer changes are not logged to the activity timeline');
assert(app.includes('async function restoreFromObject(obj)'),'Restore confirmation flow is not asynchronous');
assert(!app.includes('window.confirm('),'Native window.confirm remains in app.js');
assert(!entryImport.includes('window.confirm('),'Native window.confirm remains in entry import');
assert(entryImport.includes('confirmImportReview')&&entryImport.includes('btConfirmDialog'),'Entry import does not use the in-app review confirmation');
const feedbackPos=index.indexOf('./ui-feedback.js');
const appPos=index.indexOf('./app.js');
assert(feedbackPos>=0&&appPos>=0&&feedbackPos<appPos,'UI feedback layer must load before app.js');
for(const token of ["const VER='3.4.30-feedback1'",'window.alert=function','window.btConfirmDialog=confirmDialog']){
  assert(feedback.includes(token),'In-app feedback adapter missing: '+token);
}
for(const token of ['v3.4.30 professional operations UI','.ops-action-center','.ops-stats','.card-progressline','.bt-timeline-card','.bt-notice-host','.bt-confirm-overlay']){
  assert(css.includes(token),'Professional operations styling missing: '+token);
}
assert(attention.includes('btLifecycleStageForEntry')&&!attention.includes('btSemanticStateForEntry'),'Action Center is not driven directly by canonical lifecycle status');
console.log('Professional operations passed: dashboard, Action Center, cards, timeline, and in-app feedback are wired together');
