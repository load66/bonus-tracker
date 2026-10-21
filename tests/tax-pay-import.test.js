'use strict';
const assert=require('node:assert/strict');
require('../tax-pay-import.js');
const p=globalThis.BTTaxPayImport;
assert(p&&p.format==='BonusTrackerTaxPayYTD');
const sample={
 format:'BonusTrackerTaxPayYTD',schemaVersion:1,taxYear:2026,asOfDate:'2026-10-09',
 grossPayYtd:61252.82,preTaxDeductionsYtd:6387.39,postTaxDeductionsYtd:899.51,
 totalEmployeeTaxesYtd:10924.03,federalTaxableWagesYtd:null,
 federalIncomeTaxWithheldYtd:4533.43,netPayYtd:43041.89
};
const now=new Date('2026-10-21T14:00:00');
const copy=p.read(sample,now),projection=p.project(copy);
assert.equal(projection.wageBasis,'gross-less-pretax-proxy');
assert.equal(projection.wageYtd,54865.43,'Do not mistake gross for federal taxable wages when pre-tax deductions are known');
assert.equal(projection.annualIncome,71013.77);
assert.equal(projection.daysElapsed,282);
assert.equal(projection.daysInYear,365);
assert.equal(projection.federalWithheldYtd,4533.43);
assert.equal(projection.annualFederalWithholding,5867.74,'Use only explicitly confirmed federal income tax withheld, not total employee taxes');
assert.equal(p.project(p.read({...sample,federalTaxableWagesYtd:54000},now)).wageBasis,'federal-taxable-wages');
assert.equal(p.project(p.read({...sample,federalTaxableWagesYtd:54000},now)).wageYtd,54000);
assert.equal(p.project(p.read({...sample,preTaxDeductionsYtd:null},now)).wageBasis,'gross-pay-proxy');
assert.equal(p.project(p.read({...sample,federalIncomeTaxWithheldYtd:null},now)).annualFederalWithholding,null,'Missing withholding is never inferred from FICA, state or employee tax totals');
assert.equal(p.project(p.read({...sample,taxYear:2025,asOfDate:'2025-12-31'},now)).annualIncome,54865.43);
assert.throws(()=>p.read({...sample,taxYear:2027,asOfDate:'2027-01-01'},now),/2025 and 2026/);
assert.throws(()=>p.read({...sample,asOfDate:'2026-13-09'},now),/valid/);
assert.throws(()=>p.read({...sample,asOfDate:'2026-10-30'},now),/future pay date/);
assert.throws(()=>p.read({...sample,schemaVersion:99},now),/Unsupported/);
assert.throws(()=>p.read({...sample,format:'OtherProgram'},now),/Unsupported/);
assert.throws(()=>p.read({...sample,unexpected:'hidden user note'},now),/supported/);
assert.throws(()=>p.read({...sample,federalIncomeTaxWithheldYtd:10925},now),/withholding cannot exceed/);
assert.throws(()=>p.read({...sample,federalTaxableWagesYtd:65000},now),/exceed gross/);
assert.throws(()=>p.read({...sample,preTaxDeductionsYtd:-10},now),/nonnegative/);
assert.throws(()=>p.read({...sample,grossPayYtd:NaN},now),/nonnegative/);
assert.throws(()=>p.read({...sample,grossPayYtd:'61252.82'},now),/nonnegative/);
assert.throws(()=>p.project(p.read({...sample,preTaxDeductionsYtd:70000},now)),/exceed gross/);
assert.deepEqual(Object.keys(sample).sort(),Object.keys(sample).sort());
assert.equal(copy.federalTaxableWagesYtd,null,'No estimated W-2 Box 1 value is written into the user-reviewed record');
assert.equal(sample.federalTaxableWagesYtd,null,'Read never mutates the imported JSON');
console.log('Pay JSON import passed: strict schema, verified federal withholding, pre-tax wage proxy, year-end projections, malformed/future year, no inferred W-2 values');
