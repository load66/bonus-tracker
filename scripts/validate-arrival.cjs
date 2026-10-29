'use strict';
// The generator uses the deployed engines, never a second date formula or bank defaults.
module.exports=function validateArrival(sandbox,parsed,reviewed,facts){
 const engine=sandbox.BTFinancialRules;
 const expected=engine.estimatedArrival(parsed),range=engine.estimatedArrival(reviewed);
 if(JSON.stringify(range)!==JSON.stringify(expected))throw Error('Review/save projection changed the estimated bonus arrival.');
 const label=engine.arrivalLabel(range),arrivalFacts=facts.filter(f=>f.id==='arrival');
 if(arrivalFacts.length!==(label?1:0)||label&&arrivalFacts[0].text!==label)throw Error('AI arrival facts disagree with the canonical estimate.');
 const detail=sandbox.BT360.detailPanels(reviewed);
 if(label&&!detail.includes(label))throw Error('Account detail omitted the canonical arrival range.');
 return {range,label,reviewRoundtrip:true,aiContext:true,detailView:true};
};
