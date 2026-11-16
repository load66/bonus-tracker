'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox,storage}=require('./full-app-smoke.test.js'),run=s=>vm.runInContext(s,sandbox);
const row={id:'SYN-OVERVIEW-P-01',bank:'Synthetic Overview Bank',accountType:'personal',opened:'2026-01-02',
 reqMet:'',bonusRecd:'2026-04-01',closed:'',bonus:125,notes:'Exact personal <note> & details',
 tcSourceRaw:'Exact original <promotion>\nDo not replace with a summary.',
 feeScheduleRaw:'Exact original fees',checklist:[],
 customTimers:[{id:'old',text:'Bonus requirement due',date:'2026-03-01',done:false}]};
run('entries='+JSON.stringify([row])+';localStorage.setItem(SK,JSON.stringify(entries));');
const before=JSON.stringify([...storage]),saved=JSON.stringify(row);
const render=account=>sandbox.BT360.detailPanels(account),html=render(row);

assert.match(html,/bt3810-status/);
assert.match(html,/Bonus received/);
assert.match(html,/aria-label="Recorded account dates"/);
assert.match(html,/<dt>Requirements met<\/dt><dd class="is-missing">—<\/dd>/,'Missing completion date stays missing');
assert.match(html,/Apr 1, 2026/,'Saved payout date remains visible');
assert.match(html,/<h3>Fees<\/h3>/,'Relevant fee warnings remain compact');
assert.match(html,/Next bonus/);
assert.match(html,/Add eligibility rule/,'Unknown eligibility must request a rule instead of inventing a date');
assert.match(sandbox.BT360.detailFooter(row),/Record closure/,'Paid account can record an actual bank closure');
assert.match(sandbox.BT360.detailFooter(row),/>Edit<\/button>/,'Saved information stays editable');
assert.doesNotMatch(html,/<details\b|Documents &amp; activity|See saved requirements|Saved terms|Activity|Previous cycle reminders|Review rule|Advanced|Original terms missing/i,
 'Everyday bank detail cannot reintroduce advanced or redundant drawers');
assert.doesNotMatch(html,/<promotion>|<note>/,'Raw saved text must not inject into UI');
assert.equal(JSON.stringify(row),saved,'Rendering must not alter current account data');

const pending=render({...row,reqMet:'2026-03-10',bonusRecd:''});
assert.match(pending,/Waiting for bonus/);
assert.doesNotMatch(pending,/Record closure|Next bonus/,'Unpaid accounts must not skip to closure or a future cycle');
assert.match(sandbox.BT360.detailFooter({...row,reqMet:'2026-03-10',bonusRecd:''}),/Record bonus payment/);

const working=render({...row,reqMet:'',bonusRecd:'',checklist:[{id:'task',text:'Complete an actual bank task',done:false}]});
assert.match(working,/Requirements/);
assert.match(working,/Complete an actual bank task/);
assert.doesNotMatch(working,/Next bonus|Record closure/);
assert.match(sandbox.BT360.detailFooter({...row,reqMet:'',bonusRecd:''}),/Mark requirements done|Review requirements/);

const closed=render({...row,closed:'2026-05-01'});
assert.match(closed,/Closed/);
assert.match(closed,/May 1, 2026/);
assert.doesNotMatch(closed,/bt3810-fees|bt3810-requirements/,'Completed cycles do not show active fee or requirement panels');
assert.doesNotMatch(sandbox.BT360.detailFooter({...row,closed:'2026-05-01'}),/Record closure/);

for(const bank of ['Synthetic National Bank','Synthetic Credit Union','Synthetic Future Bank']){
 for(const state of [{reqMet:'',bonusRecd:''},{reqMet:'2026-03-01',bonusRecd:''},{reqMet:'2026-03-01',bonusRecd:'2026-04-01'}]){
  const account={...row,...state,id:'SYN-CONSISTENT-'+bank,bank};
  const copy=JSON.stringify(account),markup=render(account);
  assert.match(markup,/bt3810-status/);
  assert.match(markup,/aria-label="Recorded account dates"/);
  assert.doesNotMatch(markup,/Documents &amp; activity|Advanced|See saved requirements|Original terms missing/);
  assert.equal((markup.match(/class="bt3810-status/g)||[]).length,0,'Status is a standard card class, not a separate duplicate stage');
  assert.equal(JSON.stringify(account),copy,'Cross-bank rendering changed a saved account');
 }
}
const archiveMarkup=run('renderTermsCycle(entries[0])');
assert.match(archiveMarkup,/Exact original &lt;promotion&gt;/,'Original terms remain in Archive, unchanged and escaped');
assert.equal(run('entries[0].notes'),'Exact personal <note> & details','Personal notes remain in the original saved record');
const backup=run('JSON.stringify(buildPortableBackupPayload())');
assert(backup.includes('Exact original <promotion>')&&backup.includes('Bonus requirement due'),'Full backups must preserve hidden terms and reminders');
assert.match(sandbox.BT360.accountSaveStatus(row),/data-local-save="true">Saved on device/);
assert.match(sandbox.BT360.accountSaveStatus({...row,notes:'Unsaved edit'}),/Local save needs review/);
assert.equal(JSON.stringify([...storage]),before,'Detail, history and backup previews must not write financial data');
assert.equal(run('entries[0].reqMet'),'','Payout cannot fill an unknown completion date');

const oldCiti={id:'CIT-P-OLD',bank:'Citi',accountType:'personal',opened:'2025-01-01',closed:'2026-11-16',churnable:true,churnability:'repeatable',
 eligibilityRules:[{id:'old-rule',basis:'account-closed',periodValue:1,periodUnit:'years'}]};
const latestCiti={id:'CIT-P-LATEST',bank:'Citibank',accountType:'personal',opened:'2026-08-10',churn:'1',churnable:true,churnability:'repeatable',
 sourceEligibilityBasis:'account-closed',eligibilityText:'Must not have owned a Citi checking account in the last 365 days.'};
run('entries='+JSON.stringify([oldCiti,latestCiti]));
assert.equal(run('btEligibilityPolicyEntry(entries[0]).eligibilityPolicySourceEntryId'),'CIT-P-LATEST','A later account-opening rule did not replace an older rule from the same bank family');
assert.equal(run('btEligibilityPolicyEntry(entries[0]).eligibilityRules[0].periodValue'),365,'The latest Citi 365-day rule was not materialized in the policy overlay');
assert.equal(run('btEligibilityPolicyEntry(entries[0]).eligibilityRules[0].basis'),'account-ownership-ended','The latest Citi ownership rule kept the stale closure basis');
assert.equal(run('churnReadyDate(entries[0])'),'2027-11-18','Citi did not use exact 365 days plus the two-day planning buffer');
assert.equal(oldCiti.eligibilityRules[0].periodValue,1,'Latest-policy projection mutated historical account data');
console.log('Simple account overview passed: four lifecycle states, recorded-rule next cycle, no advanced UI, unchanged data, archived terms and portable backup.');
process.exit(0);
