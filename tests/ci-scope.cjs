'use strict';
// Finance has been retired; every change receives the remaining full coverage.
function plan(event){return {financeOnly:false,areas:['bonus','cloud','ui'],browsers:event==='pull_request'?['chromium']:['chromium','webkit']};}
module.exports={plan};
