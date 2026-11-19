'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,s);
try{
 const catalog=s.BTCommunityCatalog;
 assert.equal(catalog.checkedAt,'2026-10-15');
 assert(catalog.reports.length>=20);
 assert.equal(new Set(catalog.reports.map(x=>x.id)).size,catalog.reports.length);
 for(const x of catalog.reports){
  assert.match(x.link,/^https:\/\/(www\.)?(reddit\.com|doctorofcredit\.com)\//);
  assert.equal(x.checkedAt,catalog.checkedAt);assert(x.method&&x.result&&x.product);
  assert(['worked','failed','mixed','pending','unknown'].includes(x.outcome));
  if(x.eventDate)assert.equal(s.dpValidDate(x.eventDate),x.eventDate);
  if(x.evidenceKind==='source-index')assert.equal(x.eventDate,'','Summary invented an event date');
 }
 const query=s.document.querySelector;s.document.querySelector=q=>q==='.research-filters'?{open:true}:query(q);assert(s.rTips().includes('class="research-filters" open'),'Open filter panel collapsed on render');s.document.querySelector=query;run('dpFiltersOpen=false');
 assert.equal(s.dpValidDate('2026-02-31'),'');assert.equal(s.dpValidDate('2026-09-29'),'2026-09-29');
 const before=JSON.stringify([...storage]);s.loadCommunityDatapoints();s.getCommunityDatapoints();s.rTips();s.rTermsStorage();
 assert.equal(JSON.stringify([...storage]),before,'Research view wrote storage');
 const custom={id:'user-report-1',bank:'Chase',method:'Synthetic method',result:'Still checking',link:'https://example.test/report',outcome:'pending',eventDate:'2026-09-28',reportedAt:'2026-09-29',product:'Synthetic personal offer',accountType:'personal',sourceName:'Independent forum',extraProvenance:'Preserve me'};
 s.saveCommunityDatapoints([custom]);
 assert.equal(s.loadCommunityDatapoints()[0].extraProvenance,custom.extraProvenance);
 const plan=s.stagePortableRestore({entries:[],communityDatapoints:s.loadCommunityDatapoints(),userDatapoints:[],bankReqs:{},phoneBook:[],profileEvents:[],offerHistory:{}});
 assert(plan,'Restore plan not created');
 const restored=JSON.parse(plan.writes.bt_community_datapoints_v1)[0];assert.equal(restored.eventDate,custom.eventDate);assert.equal(restored.reportedAt,custom.reportedAt);assert.equal(restored.extraProvenance,custom.extraProvenance);
 s.openCommunityDPEditor(custom.id);const editor=s.rDpEditor();assert(!editor.includes('textarea'));assert(!editor.includes('experience-optional'));assert(editor.includes('Result date (optional)'));assert(editor.includes('Deposit method'));assert(!editor.includes('dp-exp-product'));assert(!editor.includes('dp-exp-sourceName'));run("dpEditor.result='Updated result';saveDPEditor()");
 const edited=s.loadCommunityDatapoints()[0];assert.equal(edited.result,custom.result);assert.equal(edited.eventDate,custom.eventDate);assert.equal(edited.extraProvenance,custom.extraProvenance);
 const seed=run('defaultCommunityRows().find(isOfferReference)');
 assert(!s.untouchedCommunitySeed({...seed,privateNote:'My saved evidence'}),'Custom provenance treated as built-in seed');assert(!s.untouchedCommunitySeed({...seed,eventDate:'2026-09-29'}),'Dated personal edit treated as unchanged default');assert(!s.untouchedCommunitySeed({...seed,id:'my-own-report'}),'Personal report treated as built-in seed');
 s.saveCommunityDatapoints([seed,{...seed,id:'edited-seed',result:'My edited note'}]);
 assert(!s.getCommunityDatapoints().some(x=>x.id===seed.id),'Untouched offer reference remains in Datapoints');
 assert(s.getCommunityDatapoints().some(x=>x.id==='edited-seed'),'Personal edit was hidden');
 const archive=s.rTermsStorage();assert(archive.includes('Older offer references'));assert(archive.includes('not your enrolled terms'));
 const termsKey='bt_tc_archive_v1';
 storage.set(termsKey,JSON.stringify({synthetic:{bank:'Synthetic Bank',current:{bank:'Synthetic Bank',accountType:'personal',opened:'2026-01-01',tcSourceRaw:'Original <terms> evidence'},versions:Array.from({length:10},(_,i)=>({bank:'Synthetic Bank',opened:`2025-01-${String(i+1).padStart(2,'0')}`,tcSourceRaw:'Older evidence '+i}))}}));
 const storedBefore=storage.get(termsKey);
 const view=s.rTermsStorage();assert(view.includes('Older evidence 9'),'Older cycles were truncated');assert(view.includes('Original &lt;terms&gt; evidence'),'Terms evidence not escaped');assert.equal(storage.get(termsKey),storedBefore);
 run("storageSearch='Older evidence 9'");assert(s.rTermsStorage().includes('Synthetic Bank'),'Full-text historical search failed');run("storageSearch=''");
 run("entries=[{id:'CHASE-BIZ',bank:'Chase',accountType:'business',opened:'2026-01-01'}];dpFilters.scope='mine'");
 assert(!s.buildDatapointGroups().some(g=>g.community.some(x=>x.accountType==='personal')),'Business account matched personal reports');
 run("dpFilters.scope='all';dpFilters.result='mixed'");assert(s.buildDatapointGroups().every(g=>g.community.every(x=>x.outcome==='mixed')));
 run("dpFilters.result='all';dpFilters.dated='recent'");assert(s.buildDatapointGroups().every(g=>g.community.every(x=>!!s.dpReportDate(x))));run("resetDPFilters()");

 // Account-type filters must apply to the user's reports as well as public evidence.
 // Unknown audience may not be silently represented as personal or business.
 const audienceBackup=s.loadUserDatapoints();
 const communityBackup=s.loadCommunityDatapoints();
 s.saveCommunityDatapoints(['personal','business',''].map((type,i)=>({id:'audience-chase-'+i,bank:'Chase',accountType:type,method:'Synthetic payroll',outcome:'worked'})));
 const chaseGroups=s.buildDatapointGroups().filter(g=>g.bank==='Chase');
 assert(chaseGroups.some(g=>g.accountType==='unknown'&&g.community.some(x=>x.id==='audience-chase-2')));
 assert(chaseGroups.some(g=>g.accountType==='business'&&g.community.some(x=>x.id==='audience-chase-1')));
 assert(chaseGroups.some(g=>g.accountType==='personal'&&g.community.some(x=>x.id==='audience-chase-0')));
 const oneChase=s.dpBankSections(chaseGroups);assert.equal(oneChase.length,1);assert.equal(oneChase[0].types.length,3);assert(oneChase[0].community.some(x=>x.id==='audience-chase-2'));
 s.saveCommunityDatapoints(communityBackup);

 s.saveUserDatapoints([
  {id:'synthetic-audience-personal',bank:'Synthetic Personal Records',method:'Payroll',accountType:'personal',outcome:'pending'},
  {id:'synthetic-audience-business',bank:'Synthetic Business Records',method:'Payroll',accountType:'business',outcome:'pending'},
  {id:'synthetic-audience-unknown',bank:'Synthetic Unclassified Records',method:'ACH',accountType:'',outcome:'pending'}
 ]);
 run("dpFilters.type='business';dpFilters.view='personal';dpFilters.scope='all'");
 const businessReports=s.buildDatapointGroups().flatMap(g=>g.user);
 assert(businessReports.some(x=>x.id==='synthetic-audience-business'),'Business evidence was hidden');
 assert(businessReports.every(x=>x.accountType==='business'),'Personal or unknown user evidence leaked into Business filter');
 run("dpFilters.type='personal'");
 const personalReports=s.buildDatapointGroups().flatMap(g=>g.user);
 assert(personalReports.some(x=>x.id==='synthetic-audience-personal'),'Personal evidence was hidden');
 assert(personalReports.every(x=>x.accountType==='personal'),'Business or unknown user evidence leaked into Personal filter');
 run("dpFilters.type='all'");
 assert.equal(s.buildDatapointGroups().flatMap(g=>g.user).length,3,'All results lost unknown-audience evidence');
 run("resetDPFilters()");
 run("dpFilters.type='unknown'");
 assert.equal(s.buildDatapointGroups().flatMap(g=>g.user).length,1);
 assert(s.buildDatapointGroups().every(g=>g.accountType==='unknown'));
 run("dpFilters.type='all';window.bt366GroupData=undefined");
 const grouped=s.rTips();assert.equal(s.bt366GroupData,true);
 assert(!grouped.includes('dp-account-type'));assert(!grouped.includes('Type not specified'));
 assert(grouped.includes('dp-bank'));
 assert.equal(s.dpAccountLabel(''),'Type not specified');
 run("resetDPFilters()");
 s.saveUserDatapoints(audienceBackup);

 s.saveCommunityDatapoints([custom]);
 run("entries=[{id:'CHASE-P',bank:'Chase',opened:'2026-01-01',notes:'Keep financial record'}];saveReq('Chase',{completeBonusText:'Keep requirement'})");
 const protectedBefore=run('JSON.stringify({entries,reqs:loadReqs(),terms:loadTermsArchive()})');
 s.deleteDPBankGroup(s.datapointBankKey('Chase'),encodeURIComponent('Chase'));run('cfm.action()');
 assert.equal(run('JSON.stringify({entries,reqs:loadReqs(),terms:loadTermsArchive()})'),protectedBefore,'Deleting reports changed account or terms');
 assert.equal(s.loadCommunityDatapoints().length,0);
 const malicious=s.renderCommunityReport({id:'x\");window.pwned=true;//',method:'<img src=x onerror=alert(1)>',result:'<script>bad</script>',link:'javascript:alert(1)',outcome:'unknown'});
 assert(!malicious.includes('href="javascript:'));assert(malicious.includes('&lt;img'));assert(!malicious.includes('<script>'));assert(!malicious.includes('Result not recorded'));assert(!malicious.includes('research-dates'));
 const minimal=s.renderCommunityReport({id:'minimal',method:'Payroll',outcome:'worked',link:'https://example.test/source',product:'Hidden product',result:'Hidden note',eventDate:'2026-01-01'});assert(minimal.includes('Counted'));assert(minimal.includes('https://example.test/source'));assert(!minimal.includes('Hidden product'));assert(!minimal.includes('Hidden note'));assert(minimal.includes('datetime="2026-01-01"'));
 assert.equal(s.dpSimpleOutcome({outcome:'failed'}),"Didn't count");assert.equal(s.dpSimpleOutcome({outcome:'worked'},true),'Not confirmed');assert.equal(s.dpSimpleOutcome({outcome:'mixed'}),'Mixed results');
 // Personal outcomes are explicit, dated, cycle-specific and independently recoverable.
 run("entries=[{id:'TRUST',bank:'Synthetic Trust Bank',accountType:'business',opened:'2026-01-01',dataPoint:'Employer payroll',checklist:[{text:'Qualifying direct deposit',done:false}],customTimers:[{id:'dd',text:'Direct deposit received',date:'2026-10-01',done:false}]}];saveUserDatapoints([])");
 const legacy=s.normalizeUserDatapoint({bank:'Synthetic Trust Bank',method:'Legacy method',date:'2026-01-01'});
 assert.equal(legacy.confirmedByUser,false);assert.equal(legacy.outcome,'unknown');assert.equal(legacy.eventDate,'');
 s.addDD('Synthetic Trust Bank','Employer payroll',100,'2026-02-01',{entryId:'TRUST',accountType:'business'});
 let personal=s.loadUserDatapoints();assert.equal(personal.length,1);assert.equal(personal[0].outcome,'pending');assert.equal(personal[0].confirmedByUser,false);
 s.toggleCk('TRUST',0);assert.equal(run('dpEditor.evidenceStage'),'requirement');assert.equal(run('dpEditor.eventDate'),'');
 run("dpEditor.method='Employer payroll';dpEditor.outcome='worked';dpEditor.eventDate='2026-02-01';dpEditor.confirmedByUser=false;saveDPEditor()");
 assert.equal(s.loadUserDatapoints()[0].confirmedByUser,false,'Unchecked attestation became trusted');
 run('dpEditor.confirmedByUser=true;saveDPEditor()');personal=s.loadUserDatapoints();assert.equal(personal[0].confirmedByUser,true);assert.equal(personal[0].accountType,'business');assert.equal(personal[0].cycleOpened,'2026-01-01');
 // Editing a note must not fabricate a newer confirmation date.
 const dated=s.loadUserDatapoints();dated[0].confirmedAt='2026-02-03';dated[0].lastConfirmedAt='2026-02-03';s.saveUserDatapoints(dated);
 s.openUserDPEditor(dated[0].id);run("dpEditor.note='Clarified deposit note';saveDPEditor()");
 assert.equal(s.loadUserDatapoints()[0].confirmedAt,'2026-02-03','Note-only edit rewrote confirmation provenance');
 assert.equal(s.loadUserDatapoints()[0].lastConfirmedAt,'2026-02-03','Note-only edit advanced confirmation recency');
 s.addDD('Synthetic Trust Bank','Employer payroll',100,'2026-02-02',{entryId:'TRUST',accountType:'business'});
 assert.equal(s.loadUserDatapoints().length,2,'Repeated payout duplicated cycle evidence');assert.equal(s.loadUserDatapoints()[1].confirmedByUser,false,'Fresh report overwrote imported evidence');assert.equal(s.loadUserDatapoints()[0].eventDate,'2026-02-01');
 run("entries[0].dataPoint='';reviewCycleExperience('TRUST','bonus')");assert.equal(run('dpEditor.method'),'','A new report must not copy a prior deposit source');assert.equal(run('dpEditor.confirmedByUser'),false);assert.equal(run('dpEditor.eventDate'),'');s.closeDPEditor();
 s.openUserDPEditor(personal[0].id);assert.match(s.rDpEditor(),/If you change the source, result, date, or amount, confirm it again/);
 run("dpEditorMaterialChange('outcome','mixed');dpEditor.note='Several methods used'");
 assert.equal(run('dpEditor.confirmedByUser'),false,'Changing verified evidence retained the old attestation');
 run('saveDPEditor()');assert.equal(s.loadUserDatapoints()[0].outcome,'worked','Unconfirmed edit changed trusted outcome');
 run('dpEditor.confirmedByUser=true;saveDPEditor()');assert.equal(s.loadUserDatapoints()[0].outcome,'worked','Stale confirmation bypassed explicit re-attestation');
 run('dpEditor.confirmedByUser=true;dpEditor.reconfirmed=true;saveDPEditor()');
 personal=s.loadUserDatapoints();assert.equal(personal[0].outcome,'mixed');assert.equal(personal[0].revisions.at(-1).outcome,'worked');
 s.openUserDPEditor(personal[0].id);const newer=s.loadUserDatapoints();newer[0].note='Another tab correction';s.saveUserDatapoints(newer);run("dpEditor.note='stale correction';saveDPEditor()");assert.equal(s.loadUserDatapoints()[0].note,'Another tab correction');s.closeDPEditor();
 run("entries[0].opened='2026-05-01'");s.addDD('Synthetic Trust Bank','Employer payroll',100,'2026-06-01',{entryId:'TRUST',accountType:'business'});assert.equal(s.loadUserDatapoints().length,3,'New churn cycle replaced old evidence');
 s.toggleTimer('TRUST','dd');assert.equal(run('dpEditor.evidenceStage'),'requirement');s.closeDPEditor();
 const savedPoints=s.loadUserDatapoints();const recovery=s.stagePortableRestore({entries:[],userDatapoints:savedPoints,communityDatapoints:[],bankReqs:{},phoneBook:[],profileEvents:[],offerHistory:{}});
 assert.deepEqual(JSON.parse(recovery.writes.bt_user_datapoints_v1),JSON.parse(JSON.stringify(savedPoints)),'Recovery lost trust metadata or revisions');
 assert.equal(s.dpFreshness({checkedAt:s.td()}),'Date unknown','Source check date fabricated freshness');
 assert.equal(s.dpEvidenceDate({eventDate:'2099-01-01'}),'','Future evidence ranked as latest');
 assert(s.dpTrustRank({confirmedByUser:true,outcome:'worked'},'personal')<s.dpTrustRank({},'community'));
 assert.equal(s.dpMethodConflict({user:[{id:'a',method:'Payroll',outcome:'worked',confirmedByUser:true}],community:[{id:'b',method:'Payroll',outcome:'failed'}]},{id:'a',method:'Payroll',outcome:'worked'}),true);
 assert.notEqual(s.datapointBankKey('Synthetic Trust Bank'),s.datapointBankKey('Synthetic Transfer Bank'),'Bank-code collision merged unrelated institutions');
 const reportBeforeFailure=JSON.stringify(s.loadUserDatapoints());s.openUserDPEditor(s.loadUserDatapoints()[0].id);run("dpEditor.note='Must not survive failure'");
 const setItem=s.localStorage.setItem;let blocked=false;s.localStorage.setItem=function(k,v){if(k==='bt_user_datapoints_v1'&&!blocked){blocked=true;throw Error('Synthetic write failure')}return setItem.call(this,k,v)};
 s.saveDPEditor();s.localStorage.setItem=setItem;assert.equal(JSON.stringify(s.loadUserDatapoints()),reportBeforeFailure,'Failed report save changed evidence');assert(run('!!dpEditor'),'Failed save dismissed review');s.closeDPEditor();
 // Regression: an imported requirement and unconfirmed success must never autofill a new experience.
 run("entries=[{id:'BLANK-REPORT',bank:'Synthetic Report Bank',accountType:'personal',opened:'2026-01-01',dataPoint:'At least 2 Enhanced Direct Deposits totaling $3,000',bonusTitle:'Receive $325'}];saveUserDatapoints([{id:'bad-draft',entryId:'BLANK-REPORT',bank:'Synthetic Report Bank',accountType:'personal',cycleOpened:'2026-01-01',method:entries[0].dataPoint,outcome:'worked',eventDate:'2026-02-01',depositAmount:3000,confirmedByUser:false}])");
 const untouched=JSON.stringify(s.loadUserDatapoints());
 s.reviewCycleExperience('BLANK-REPORT','bonus');
 for(const key of ['method','outcome','eventDate','depositAmount','product','note'])assert.equal(run('dpEditor.'+key),'','Invented autofill: '+key);
 assert.equal(run('dpEditor.mode'),'new');assert.equal(run('dpEditor.confirmedByUser'),false);
 assert.equal(JSON.stringify(s.loadUserDatapoints()),untouched,'Opening review changed saved reports');
 const cleanForm=s.rDpEditor();assert.match(cleanForm,/Where did the money come from/);assert(!cleanForm.includes('At least 2 Enhanced'));assert.match(cleanForm,/autocomplete="off"/);assert.match(cleanForm,/Close report/);
 s.saveDPEditor();assert.equal(run('dpEditor.errorField'),'method');assert.equal(JSON.stringify(s.loadUserDatapoints()),untouched);
 run("dpEditorMaterialChange('method','Synthetic ACH')");s.saveDPEditor();assert.equal(run('dpEditor.errorField'),'outcome');
 run("dpEditorMaterialChange('outcome','worked')");s.saveDPEditor();assert.equal(run('dpEditor.errorField'),'eventDate');
 run("dpEditorMaterialChange('eventDate','2026-02-01');dpEditor.confirmedByUser=true;dpEditorMaterialChange('depositAmount','250.005')");
 assert.equal(run('dpEditor.confirmedByUser'),false,'Changed amount retained new-report attestation');
 run('dpEditor.confirmedByUser=true');s.saveDPEditor();assert.equal(run('dpEditor.errorField'),'depositAmount');
 run("dpEditorMaterialChange('depositAmount','250.00');dpEditor.confirmedByUser=true");s.saveDPEditor();
 assert.equal(s.loadUserDatapoints()[0].method,'Synthetic ACH');assert.equal(s.loadUserDatapoints()[0].confirmedByUser,true);assert(!('error' in s.loadUserDatapoints()[0]));
 s.reviewCycleExperience('BLANK-REPORT','requirement');const cancelBefore=JSON.stringify(s.loadUserDatapoints());s.closeDPEditor();assert.equal(JSON.stringify(s.loadUserDatapoints()),cancelBefore);
 s.openUserDPEditor('bad-draft');assert.equal(run('dpEditor.method'),'At least 2 Enhanced Direct Deposits totaling $3,000','Explicit edit must preserve original text for correction');s.closeDPEditor();
 console.log('Research tabs passed: catalog dates/provenance, non-destructive legacy routing, metadata restore/edit, historical search, identity filters, XSS and report-only deletion');
 process.exit(0);
}catch(e){console.error(e.stack);process.exit(1)}
