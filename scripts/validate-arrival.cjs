'use strict';
// The generator uses the deployed engines, never a second date formula or bank defaults.
module.exports=function validateArrival(sandbox,parsed,reviewed,facts){
 const engine=sandbox.BTFinancialRules;
 const rule=engine.arrivalRule(reviewed);
 if(!rule)throw Error('Payout timing has no supported source-backed clock. Research the enrolled offer before delivering this import.');
 const expected=engine.estimatedArrival(parsed),range=engine.estimatedArrival(reviewed);
 if(JSON.stringify(range)!==JSON.stringify(expected))throw Error('Review/save projection changed the estimated bonus arrival.');
 const label=engine.arrivalLabel(range),arrivalFacts=facts.filter(f=>f.id==='arrival');
 if(arrivalFacts.length!==(label?1:0)||label&&arrivalFacts[0].text!==label)throw Error('AI arrival facts disagree with the canonical estimate.');
 const detail=sandbox.BT360.detailPanels(reviewed);
 if(label&&!detail.includes(label))throw Error('Account detail omitted the canonical arrival range.');
 if(label&&!sandbox.BT360.compactRow(reviewed).includes(label))throw Error('Account card omitted the canonical arrival range.');
 return {rule,range,label,reviewRoundtrip:true,aiContext:true,detailView:true,cardView:true};
};
