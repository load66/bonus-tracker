#!/usr/bin/env node
'use strict';
// Validate in a private in-memory app. Never reads or writes a user's tracker storage.
const fs=require('node:fs'),path=require('node:path');
const input=process.argv[2];if(!input){console.error('Usage: node scripts/validate-entry.cjs ENTRY.json');process.exit(2);}
(async()=>{try{
 if(fs.statSync(input).size>2000000)throw Error('Entry exceeds the 2 MB validation limit.');
 const raw=fs.readFileSync(input,'utf8'),payload=JSON.parse(raw);
 if(payload.schemaVersion!==3)throw Error('New generated imports must use schemaVersion 3.');
 const root=path.resolve(__dirname,'..');process.chdir(root);
 const {sandbox}=require('../tests/full-app-smoke.test.js');
 const parsed=sandbox.btParseEntryFileText(raw,path.basename(input));
 sandbox.btConfirmDialog=async()=>true;
 await sandbox.btImportEntryFileObject({name:path.basename(input),text:async()=>raw});
 const roundtrip=sandbox.collectModalEntryData();
 if(!roundtrip)throw Error('Entry review did not produce a valid record.');
 const retained=['bank','accountType','bonus','opened','reqMet','bonusRecd','closed','payoutTimingText','reqDays','couponEnrollmentDate','offerEnrollmentDate','closeRuleBasis','closeRestrictionType','tcSourceRaw','feeScheduleRaw','promoSourceUrl','feeScheduleSourceUrl','termsVerifiedAt','completeBonusText','requiredDaysText','monthlyFeeWaiverText','avoidMonthlyFeeText','promoCodeText','earlyTerminationFeeText','eligibilityEvidenceText'];
 for(const key of retained)if(parsed[key]!==undefined&&roundtrip[key]!==parsed[key])throw Error('Review/save projection changed '+key+'; correct the import wording or projection before delivery.');
 if(JSON.stringify(roundtrip.eligibilityRules)!==JSON.stringify(parsed.eligibilityRules))throw Error('Review/save projection changed eligibility rules.');
 if(JSON.stringify(roundtrip.financialRules)!==JSON.stringify(parsed.financialRules)||roundtrip.feeScheduleRaw!==parsed.feeScheduleRaw)throw Error('Review/save projection lost rule or fee-source data.');
 const verdict=sandbox.BTFinancialRules.validate(roundtrip);if(!verdict.ok)throw Error(verdict.issues.map(x=>x.message).join('; '));
 const facts=sandbox.BTBonusAI.contextFor(roundtrip);if(!facts.some(f=>f.id==='financialrules'))throw Error('AI context omitted the validated rule evaluation.');
 if(JSON.stringify({question:'x'.repeat(500),facts}).length>17500||facts.length>30)throw Error('AI context exceeds its input budget.');
 const arrival=require('./validate-arrival.cjs')(sandbox,parsed,roundtrip,facts);
 console.log(JSON.stringify({ok:true,schemaVersion:parsed.schemaVersion,ruleVersion:parsed.financialRules.version,bank:parsed.bank,accounts:parsed.financialRules.accounts.length,requirements:parsed.financialRules.requirements.length,warnings:verdict.warnings.map(x=>x.message),reviewRoundtrip:true,retainedFields:retained.filter(k=>parsed[k]!==undefined),sourceCharacters:{promotion:roundtrip.tcSourceRaw.length,fees:roundtrip.feeScheduleRaw.length},aiFacts:facts.length,arrival},null,2));
}catch(error){console.error('INVALID IMPORT: '+error.message);process.exitCode=1;}
})();

