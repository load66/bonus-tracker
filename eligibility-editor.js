/* BonusTracker v3.4.65 — explicit per-offer eligibility clocks and multiple restrictions. */
(function(){
  'use strict';
  const G=window.BTEligibilityGate;
  const bases=[['account-closed','Account closed'],['bonus-received','Bonus received'],['account-opened','Account opened'],['offer-enrollment','Coupon / offer enrollment'],['account-ownership-ended','Last account ownership ended'],['bonus-offer-received','Bonus offer received']];
  const options=(rows,value)=>rows.map(([v,label])=>'<option value="'+v+'"'+(v===value?' selected':'')+'>'+label+'</option>').join('');
  const field=(id,label,html)=>'<div class="fg"><label for="'+id+'">'+esc(label)+'</label>'+html+'</div>';
  const input=(id,value,type,action)=>'<input id="'+id+'" type="'+type+'" value="'+esc(value??'')+'" onchange="'+action+'">';
  const current=()=>typeof modal!=='undefined'?modal:null;
  const rules=e=>Array.isArray(e?.eligibilityRules)?e.eligibilityRules:[];
  function changed(){const e=current();if(!e)return;e.eligibilityVerified=false;e.eligibilityVerifiedAt='';R();}
  function dateValid(s){const d=new Date(String(s)+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
  window.btEligibilityToggleRule=function(index,open){const e=current(),r=rules(e)[index];if(!e||!r)return;e._eligibilityOpenRules={...(e._eligibilityOpenRules||{}),[r.id]:!!open};};
  window.btEligibilitySetPeriod=function(key,value){const e=current();if(!e)return;const prior=G?.periodFromEntry(e);if(!e.churnPeriodValue)e.churnPeriodValue=prior?.value||0;if(!e.churnPeriodUnit)e.churnPeriodUnit=prior?.unit||'months';if(key==='value')e.churnPeriodValue=/^[1-9]\d*$/.test(value)?Number(value):0;else if(['days','months','years'].includes(value))e.churnPeriodUnit=value;e.churn='';e.churnable=true;e.churnability='repeatable';changed();};
  window.btEligibilitySetEnrollment=function(value){const e=current();if(!e)return;e.offerEnrollmentDate=value;e.couponEnrollmentDate=value;changed();};
  window.btEligibilityUseOpening=function(){const e=current();if(!e||!dateValid(e.opened||''))return;window.btEligibilitySetEnrollment(e.opened);};
  window.btEligibilitySetSpecialDate=function(value){const e=current();if(!e)return;e.eligibilityRules=[{...legacyRule(e),anchorDate:value}];changed();};
  window.btEligibilitySetNegative=function(value){const e=current();if(!e)return;if(value==='yes'||value==='no')e.closedWithNegativeBalance=value==='yes';else delete e.closedWithNegativeBalance;changed();};
  function legacyRule(e){const p=G?.periodFromEntry(e);return{id:'saved-restriction',basis:G?.normalizeBasis(e.sourceEligibilityBasis||e.churnBasis)||'',periodValue:p?.value||0,periodUnit:p?.unit||'months',evidenceText:e.eligibilityEvidenceText||'',evidenceSource:e.eligibilityEvidenceSource||'',scope:e.eligibilityScope||''};}
  window.btEligibilityAddRule=function(){const e=current();if(!e)return;const old=rules(e);e.eligibilityRules=old.length?old.map(r=>({...r})):([legacyRule(e)]);e.eligibilityRules.push({id:'restriction-'+Date.now().toString(36)+'-'+e.eligibilityRules.length,basis:'',periodValue:0,periodUnit:'months',evidenceText:'',evidenceSource:'',scope:e.eligibilityScope||''});changed();};
  window.btEligibilityEditRule=function(index,key,value){const e=current(),r=rules(e)[index];if(!r)return;
    if(key==='basis'){if(!bases.some(b=>b[0]===value))return;if(r.basis!==value){delete r.anchorDate;delete r.anchorFallback;}r.basis=value;}
    else if(key==='periodValue')r.periodValue=/^[1-9]\d*$/.test(value)?Number(value):0;
    else if(key==='periodUnit'){if(!['days','months','years'].includes(value))return;r.periodUnit=value;}
    else if(key==='condition')r.condition=value==='negative'?{type:'closed-with-negative-balance',expected:true}:null;
    else if(['anchorDate','evidenceText','evidenceSource','scope'].includes(key))r[key]=String(value).slice(0,10000);
    changed();
  };
  window.btEligibilityRemoveRule=function(index){const e=current();if(!e||rules(e).length<=1)return;e.eligibilityRules=e.eligibilityRules.filter((_,i)=>i!==index);changed();};
  window.btEligibilityEditorHtml=function(e){
    const rs=rules(e),basis=G?.normalizeBasis(e.sourceEligibilityBasis||e.churnBasis)||'',p=G?.periodFromEntry(e);
    let h='<div class="fg full"><b>'+esc(e.bank||'Account')+' · '+(e.accountType==='business'?'Business':'Personal')+' eligibility</b><div class="guided-field-help">Use the rules for this product and offer. A bank name alone does not establish eligibility.</div></div>';
    if(!rs.length){
      h+=field('elig-clock','Eligibility clock starts from','<select id="elig-clock" onchange="setModalChurnBasis(this.value);R()"><option value="">Choose from offer terms</option>'+options(bases,basis)+'</select>');
      h+=field('elig-period','Waiting period',input('elig-period',p?.value||'','number',"btEligibilitySetPeriod('value',this.value)").replace('type="number"','type="number" min="1" step="1"'));
      h+=field('elig-unit','Period unit','<select id="elig-unit" onchange="btEligibilitySetPeriod(\'unit\',this.value)">'+options([['days','Calendar days'],['months','Calendar months'],['years','Calendar years']],p?.unit||'months')+'</select>');
      h+='<div class="fg full"><div class="guided-field-help">Two-day safety buffer follows the saved restriction. Requirement deadlines do not receive extra days.</div></div>';
    }else{
      h+='<div class="fg full"><b>'+rs.length+' saved restriction'+(rs.length===1?'':'s')+'</b><div class="guided-field-help">Every applicable restriction must clear. The latest date controls; missing dates or unanswered conditions require review.</div></div>';
      rs.forEach((r,i)=>{const id='elig-rule-'+i,act=k=>"btEligibilityEditRule("+i+",'"+k+"',this.value)";
        h+='<details class="fg full eligibility-restriction" ontoggle="btEligibilityToggleRule('+i+',this.open)"'+((e._eligibilityOpenRules?.[r.id]??i===0)?' open':'')+'><summary>'+esc('Restriction '+(i+1)+': '+(r.periodValue||'—')+' '+(r.periodUnit||'months')+' · '+(bases.find(b=>b[0]===r.basis)?.[1]||'Choose clock'))+'</summary><div class="eligibility-rule-grid">';
        h+=field(id+'-clock','Restriction '+(i+1)+' clock','<select id="'+id+'-clock" onchange="'+act('basis')+'"><option value="">Choose clock</option>'+options(bases,r.basis)+'</select>');
        h+=field(id+'-period','Restriction '+(i+1)+' period',input(id+'-period',r.periodValue||'','number',act('periodValue')).replace('type="number"','type="number" min="1" step="1"'));
        h+=field(id+'-unit','Restriction '+(i+1)+' unit','<select id="'+id+'-unit" onchange="'+act('periodUnit')+'">'+options([['days','Calendar days'],['months','Calendar months'],['years','Calendar years']],r.periodUnit)+'</select>');
        h+=field(id+'-condition','Applies when','<select id="'+id+'-condition" onchange="'+act('condition')+'">'+options([['always','Always'],['negative','Closed with a negative balance']],r.condition?.type==='closed-with-negative-balance'?'negative':'always')+'</select>');
        if(['bonus-offer-received','account-ownership-ended'].includes(r.basis))h+=field(id+'-anchor',r.basis==='bonus-offer-received'?'Date this bonus offer was received':'Last ownership end date',input(id+'-anchor',r.anchorDate||'','date',act('anchorDate')));
        else if(r.anchorDate)h+=field(id+'-anchor','Saved date for this restriction',input(id+'-anchor',r.anchorDate,'date',act('anchorDate')));
        h+=field(id+'-scope','Product / customer scope',input(id+'-scope',r.scope||'','text',act('scope')));
        h+=field(id+'-source','Evidence source',input(id+'-source',r.evidenceSource||'','text',act('evidenceSource')));
        h+='<div class="fg full"><label for="'+id+'-quote">Exact eligibility wording</label><textarea id="'+id+'-quote" rows="3" onchange="'+act('evidenceText')+'">'+esc(r.evidenceText||'')+'</textarea></div>';
        if(rs.length>1)h+='<div class="fg full"><button type="button" class="btn-s" onclick="btEligibilityRemoveRule('+i+')">Remove restriction</button></div>';
        h+='</div></details>';
      });
    }
    if(!rs.length&&['bonus-offer-received','account-ownership-ended'].includes(basis))h+=field('elig-special-date',basis==='bonus-offer-received'?'Date this bonus offer was received':'Last ownership end date',input('elig-special-date','','date','btEligibilitySetSpecialDate(this.value)'));
    const enrollment=basis==='offer-enrollment'||rs.some(r=>r.basis==='offer-enrollment');
    if(enrollment){h+=field('elig-enrollment','Coupon / offer enrollment date',input('elig-enrollment',e.couponEnrollmentDate||e.offerEnrollmentDate||'','date','btEligibilitySetEnrollment(this.value)'));h+='<div class="fg"><button type="button" class="btn-s" onclick="btEligibilityUseOpening()"'+(!dateValid(e.opened||'')?' disabled':'')+'>Use opening date</button><div class="guided-field-help">Use this only when enrollment occurred at opening.</div></div>';}
    if(rs.some(r=>r.condition?.type==='closed-with-negative-balance'))h+=field('elig-negative','Was this account closed with a negative balance?','<select id="elig-negative" onchange="btEligibilitySetNegative(this.value)">'+options([['','Not answered'],['no','No'],['yes','Yes']],typeof e.closedWithNegativeBalance==='boolean'?(e.closedWithNegativeBalance?'yes':'no'):'')+'</select>');
    h+='<div class="fg full"><button type="button" class="btn-s" onclick="btEligibilityAddRule()">Add another restriction</button></div>';
    return h;
  };
  const collect=window.collectModalEntryData;
  if(typeof collect==='function')window.collectModalEntryData=function(){const out=collect.apply(this,arguments),e=current();if(out&&e){if(typeof e.closedWithNegativeBalance==='boolean')out.closedWithNegativeBalance=e.closedWithNegativeBalance;else delete out.closedWithNegativeBalance;}return out;};
})();
