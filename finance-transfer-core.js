/* Finances 3.4.95: finance-only transfer guard. Source bank evidence remains untouched. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceTransfer=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const destination=/\b(?:bank|fcu|credit\s*union|savings|checking|brokerage|investing|investment|ira|citibank|citi|u\.?\s*s\.?\s*bank|capital\s*one|chase|wells\s*fargo|bofa|bank\s*of\s*america|amex|american\s*express|discover|synchrony|lafayette|navy\s*federal|paypal|venmo|cash\s*app|zelle|x\s*money|one\s*pay|onepay|robinhood|fidelity|schwab|vanguard)\b/i;
  const investor=/\b(?:brokerage|investing|investment|ira|robinhood|fidelity|schwab|vanguard)\b/i;
  const issuer=/\b(?:capital\s*one|u\.?\s*s\.?\s*bank|citibank|citi|amex|american\s*express|discover|chase|synchrony|wells\s*fargo|bofa|bank\s*of\s*america|robinhood|fidelity|schwab|vanguard)\b/i;
  const bareIssuer=/^\s*(?:capital\s*one|u\.?\s*s\.?\s*bank|citibank|citi|amex|american\s*express|discover|chase|synchrony|wells\s*fargo|bofa|bank\s*of\s*america)\s*$/i;
  const payment=/\b(?:pmt|pymt|payment|autopay|epay|crcardpmt|ccpmt|cardmember\s*payment)\b/i;
  const housingMemo=/\b(?:mortgage|mortg|mtge?|home\s*mtg|home\s+loan|rent|landlord|apartment\s+lease|mr\.?\s*cooper|loancare|newrez|shellpoin(?:t)?|rocket\s+mortgage|pennymac|freedom\s+mortgage|dovenmuehle|cenlar|nationstar|lakeview\s+loan|carrington\s+mortgage|roundpoint|sps\s+servicing)\b/i;
  const investAction=/\b(?:contribution|contribute|deposit|funding|transfer|add\s*cash)\b/i;
  const fromTo=/^\s*(?:to|from)\s+(.+?)\s*$/i;
  const phone=/\b(?:t[-\s]?mobile|verizon|at&t|at\s*&\s*t)\b/i;
  const subscription=/\b(?:icloud|apple\s*(?:subscription|bill|\.com\/bill)|netflix|spotify)\b/i;
  const shopping=/\b(?:apple|amazon|walmart|target|costco|best buy|ebay|etsy)\b/i;
  const groceries=/\b(?:walmart|costco|aldi|kroger|grocery|whole foods|safeway)\b/i;
  const dining=/\b(?:restaurant|mcdonald|starbucks|chipotle|doordash|ubereats|grubhub|taco bell)\b/i;
  const gas=/\b(?:shell|exxon|chevron|quiktrip|casey'?s|gas station)\b/i;
  const amountCents=value=>{
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
    if(!m)return null;
    const v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
    return m[1]==='-'?-v:v;
  };
  function categorize(row){
    if(!row||['user','user_rule'].includes(row.categorySource))return null;
    const value=amountCents(row.amount),text=String(row.description||row.merchant||'').trim();
    if(value===null||value===0n||row.pending)return null;
    if((row.signals||[]).includes('matched_internal_transfer'))return {category:'transfer',signal:'matched_internal_transfer'};
    // Explicit mortgage/housing payments outrank generic issuer/payment markers.
    if(value<0n&&housingMemo.test(text))return {category:'housing'};
    if(value>0n&&
       (row.kind==='possible_bonus'||/\b(?:promotional\s+bonus|promotion(?:al)?\s+reward|bank\s+bonus|signup\s+bonus)\b/i.test(text)))
      return {category:'bonus',signal:'possible_bonus'};
    // A generic positive "Payment" from a linked financial account is not paycheck evidence.
    // Await a unique opposite-bank leg, or let the user confirm a transfer.
    const bank=String(row.account?.bank||row.bank||'');
    if(value>0n&&/^payment(?:\s+received)?$/i.test(text)&&
       /\b(?:x\s*money|bank|fcu|credit\s*union|robinhood|one\s*pay|onepay|checking|savings)\b/i.test(bank))
      return {category:'unreviewed',signal:'possible_transfer'};
    const direction=fromTo.exec(text);
    if(direction&&destination.test(direction[1]))
      return {category:'transfer',signal:investor.test(direction[1])?'investment_transfer':'transfer'};
    if(value<0n&&bareIssuer.test(text))return {category:'transfer',signal:'card_payment'};
    if(issuer.test(text)&&payment.test(text))return {category:'transfer',signal:'card_payment'};
    if(investor.test(text)&&investAction.test(text))return {category:'transfer',signal:'investment_transfer'};
    // 'possible_transfer' from a provider is not a confirmed transfer.
    // A generic Payment can be provisionally categorized as Income upstream.
    if((row.signals||[]).includes('possible_transfer'))return {category:'unreviewed',signal:'possible_transfer'};
    if(row.category==='transfer')return {category:'transfer',signal:'transfer'};
    if(value<0n&&(value%100n===0n||-value>=100000n)&&
       (direction||destination.test(text)))return {category:'unreviewed',signal:'possible_transfer'};
    if(value<0n){
      if(subscription.test(text))return {category:'subscription'};
      if(phone.test(text))return {category:'utilities'};
      if(groceries.test(text))return {category:'groceries'};
      if(dining.test(text))return {category:'dining'};
      if(gas.test(text))return {category:'transportation'};
      if(shopping.test(text))return {category:'shopping'};
    }
    return null;
  }
  function effective(row){
    // Confirmed user categories win over stale provider/automatic hints, across
    // both the ledger and all reports. This changes presentation only.
    if(row&&['user','user_rule'].includes(row.categorySource)){
      const category=row.category||'unreviewed';
      const signals=(row.signals||[]).filter(signal=>{
        if(signal==='matched_internal_transfer'||signal==='possible_transfer')return false;
        if(['transfer','card_payment','investment_transfer','plaid_transfer'].includes(signal)&&category!=='transfer')return false;
        if(['paycheck','possible_direct_deposit'].includes(signal)&&category!=='income')return false;
        if(signal==='possible_bonus'&&category!=='bonus')return false;
        if(signal==='possible_refund'&&category!=='refund')return false;
        return true;
      });
      return {...row,category,signals};
    }
    const match=categorize(row),signals=(row?.signals||[]).filter(signal=>
      match?.category!=='housing'||!['card_payment','possible_transfer','transfer','plaid_transfer'].includes(signal));
    if(match?.signal&&!signals.includes(match.signal))signals.push(match.signal);
    return {...row,category:match?.category||row?.category||'unreviewed',signals};
  }
  function label(row){
    const item=effective(row),signals=item.signals;
    if(signals.includes('card_payment'))return 'Card payment';
    if(signals.includes('investment_transfer'))return 'Investment transfer';
    if(item.category==='transfer')return 'Transfer';
    if(signals.includes('possible_transfer')&&item.category==='unreviewed')return 'Possible transfer';
    return null;
  }
  return Object.freeze({categorize,effective,label,amountCents});
});
