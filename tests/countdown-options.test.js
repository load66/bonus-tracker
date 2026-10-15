'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,s);
const NativeDate=s.Date;s.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2035-01-01T12:00:00Z']))}static now(){return NativeDate.parse('2035-01-01T12:00:00Z')}};
try{
 const stored=storage.get('bt_e_v4');
 run(`modal={bank:'Example Bank',accountType:'business',opened:'2026-01-31',closed:'2026-08-05',bonusRecd:'2026-03-01',churn:'1',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'offer-enrollment',churnBasis:'enrollment',_wizardStep:1};`);
 let h=run('btEligibilityEditorHtml(modal)');
 for(const label of ['Example Bank · Business eligibility','Coupon / offer enrollment','Last account ownership ended','Bonus offer received','Calendar days','Calendar months','Calendar years','Use opening date','Add another restriction'])assert(h.includes(label),label);
 assert.equal(run('modal.offerEnrollmentDate'),undefined,'Rendering must not equate dates automatically');
 s.btEligibilityUseOpening();assert.equal(run('modal.offerEnrollmentDate'),'2026-01-31');assert.equal(run('modal.couponEnrollmentDate'),'2026-01-31');
 s.btEligibilitySetEnrollment('2026-02-04');assert.equal(run('modal.opened'),'2026-01-31','A different enrollment must not change opening');
 s.btEligibilitySetPeriod('value','6');s.btEligibilitySetPeriod('unit','months');assert.equal(run('modal.churnPeriodValue'),6);assert.equal(run('modal.churnPeriodUnit'),'months');
 run(`modal.opened='';modal.offerEnrollmentDate='';modal.couponEnrollmentDate='';`);s.btEligibilityUseOpening();assert.equal(run('modal.offerEnrollmentDate'),'','Missing opening must stay unknown');assert(/disabled/.test(run('btEligibilityEditorHtml(modal)')));
 run(`modal={bank:'Other Bank',accountType:'personal',opened:'2026-01-01',closed:'2027-02-01',bonusRecd:'2026-01-15',churnable:true,churnability:'repeatable',eligibilityRules:[{id:'bonus',basis:'bonus-received',periodValue:24,periodUnit:'months',scope:'consumer checking',evidenceText:'Not eligible if you received a checking bonus within the past 24 months.',evidenceSource:'saved-tc'},{id:'closure',basis:'account-closed',periodValue:12,periodUnit:'months',scope:'consumer checking',evidenceText:'Not available if you closed a checking account within the previous 12 months.',evidenceSource:'saved-tc'}]};`);
 const before=run('JSON.stringify(modal)');h=run('btEligibilityEditorHtml(modal)');assert(h.includes('2 saved restrictions')&&h.includes('latest date controls'));assert.equal(run('JSON.stringify(modal)'),before,'Rendering rewrote saved restrictions');
 assert.equal(run('nextReopen(modal)'),'2028-02-03','Latest restriction must control');
 s.btEligibilityAddRule();s.btEligibilityEditRule(2,'basis','account-closed');s.btEligibilityEditRule(2,'periodValue','3');s.btEligibilityEditRule(2,'periodUnit','years');s.btEligibilityEditRule(2,'condition','negative');s.btEligibilityEditRule(2,'evidenceText','Not available if an account was closed with a negative balance within the last 3 years.');s.btEligibilityEditRule(2,'evidenceSource','saved-tc');
 assert.equal(run('nextReopen(modal)'),'','Unknown conditional answer must block a final date');
 s.btEligibilitySetNegative('no');assert.equal(run('nextReopen(modal)'),'2028-02-03');
 run('syncModalFromEditDOM=()=>{}');const saved=s.collectModalEntryData();assert.equal(saved.closedWithNegativeBalance,false,'No answer lost during save');assert.equal(saved.eligibilityRules.length,3,'Save dropped a restriction');
 s.btEligibilitySetNegative('yes');assert.equal(run('nextReopen(modal)'),'2030-02-03');
 s.btEligibilityEditRule(0,'anchorDate','2026-04-01');s.btEligibilityEditRule(0,'basis','offer-enrollment');assert.equal(run('modal.eligibilityRules[0].anchorDate'),undefined,'Clock switch reused a different event date');
 s.btEligibilityEditRule(0,'evidenceText','</textarea><img src=x onerror=alert(1)>');assert(!run('btEligibilityEditorHtml(modal)').includes('<img src=x'),'Evidence escaped textarea');
 assert.equal(storage.get('bt_e_v4'),stored,'Editing saved live accounts without Save');
 console.log('Countdown editor passed: all clocks, explicit enrollment, exact periods, latest-date control, condition answers, save preservation, and safe text.');
 process.exit(0);
}catch(e){console.error(e);process.exit(1);}
