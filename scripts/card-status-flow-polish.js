/*
 * filename: scripts/card-status-flow-polish.js
 * version: unknown
 * purpose: Card status flow polish — Requirement Deadline wording + hide Effort. Version display is controlled only by index.html.
 * last-touched: unknown
 */
(function(){
  function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
  function isVisible(el){
    if(!el||!el.getBoundingClientRect)return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
  }
  function closestCard(el){
    let p=el;
    for(let i=0;p&&i<9;i++,p=p.parentElement){
      const txt=clean(p.textContent);
      const r=p.getBoundingClientRect?.();
      if(r&&r.width>220&&r.height>100&&/\$\d/.test(txt)&&/(OPENED|Opened|RECEIVED|Received|REQ MET|Req Met|HOLD UNTIL|Hold Until|Working|Countdown Active|Requirement Deadline)/.test(txt))return p;
    }
    return null;
  }
  function leafTextNodes(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
      const t=clean(n.nodeValue);
      if(!t)return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[]; let n;
    while((n=walker.nextNode()))nodes.push(n);
    return nodes;
  }
  function setTextNode(n,value){
    if(clean(n.nodeValue)!==value)n.nodeValue=value;
  }

  function cardPhase(card){
    const t=clean(card?.textContent||'').toLowerCase();
    if(/ready to churn|time to churn/.test(t))return 'readyChurn';
    if(/cooling down|churn eligible|days? left to churn/.test(t))return 'cooldown';
    if(/early closure fee|close fee countdown|safe close|hold until|hold \/ do not close/.test(t))return 'hold';
    if(/waiting for bonus/.test(t))return 'waitingBonus';
    if(/received/.test(t)&&/req met/.test(t))return 'waitingOrHold';
    if(/req met/.test(t)&&!/received/.test(t))return 'waitingBonus';
    return 'working';
  }

  function replaceCountdownWording(){
    leafTextNodes(document.body).forEach(n=>{
      const t=clean(n.nodeValue);
      if(t!=='Countdown Active')return;
      const card=closestCard(n.parentElement);
      const phase=card?cardPhase(card):'working';
      let next='Requirement Deadline';
      if(phase==='hold'||phase==='waitingOrHold')next='Hold / Do Not Close';
      if(phase==='cooldown')next='Cooling Down';
      if(phase==='readyChurn')next='Ready to Churn';
      if(phase==='waitingBonus')next='Waiting for Bonus';
      setTextNode(n,next);
    });
  }

  function normalizeRepeatedText(t){
    t=clean(t);
    const day=t.match(/\b(\d+d)\s+left\b/i)?.[1];
    if(!day)return t;
    if(/to finish bonus/i.test(t))return `${day} left to finish bonus`;
    if(/before safe close/i.test(t))return `${day} left before safe close`;
    return t;
  }

  function polishTimerLine(){
    leafTextNodes(document.body).forEach(n=>{
      let t=clean(n.nodeValue);
      if(!/\b\d+d left\b/i.test(t))return;
      const cleaned=normalizeRepeatedText(t);
      if(cleaned!==t){ setTextNode(n,cleaned); return; }
      if(/left to finish bonus|left before safe close|left until churn|to requirement deadline|churn eligible/i.test(t))return;
      const card=closestCard(n.parentElement);
      const all=clean(card?.textContent||'').toLowerCase();
      const m=t.match(/(\d+d)\s*left\b/i);
      if(!m)return;
      if(/early closure fee|close fee countdown|hold until/.test(all) || /early closure fee/i.test(t)){
        setTextNode(n,`${m[1]} left before safe close`);
        return;
      }
      setTextNode(n,`${m[1]} left to finish bonus`);
    });
  }

  function hideEffortBlocks(){
    const labels=Array.from(document.querySelectorAll('body *')).filter(el=>{
      if(!isVisible(el))return false;
      const t=clean(el.textContent);
      return t==='EFFORT' || t==='Effort';
    });
    labels.forEach(label=>{
      let block=label.parentElement;
      for(let i=0;block&&i<3;i++,block=block.parentElement){
        const t=clean(block.textContent);
        const r=block.getBoundingClientRect?.();
        if(!r)continue;
        if(/\bEFFORT\b/i.test(t)&&/(Easy|Medium|Hard|Low|High)/i.test(t)&&r.width<300&&r.height<140){
          block.style.display='none';
          block.setAttribute('data-bt-hidden-effort','1');
          return;
        }
      }
      label.style.display='none';
      label.setAttribute('data-bt-hidden-effort','1');
      let sib=label.nextElementSibling;
      if(sib&&/^(Easy|Medium|Hard|Low|High)$/i.test(clean(sib.textContent))){
        sib.style.display='none';
        sib.setAttribute('data-bt-hidden-effort','1');
      }
    });
  }

  function addStyle(){
    if(document.getElementById('bt_card_status_flow_style'))return;
    const st=document.createElement('style');
    st.id='bt_card_status_flow_style';
    st.textContent=`[data-bt-hidden-effort="1"]{display:none!important;}`;
    document.head.appendChild(st);
  }

  let running=false;
  function apply(){
    if(running)return;
    running=true;
    try{
      addStyle();
      replaceCountdownWording();
      polishTimerLine();
      hideEffortBlocks();
    }finally{
      setTimeout(()=>{running=false;},50);
    }
  }

  window.btCardStatusFlowPolishApply=apply;

  setTimeout(apply,150);
  setTimeout(apply,700);
  setTimeout(apply,1600);
  setTimeout(apply,3000);
  setInterval(apply,1800);
  const obs=new MutationObserver(()=>setTimeout(apply,0));
  setTimeout(()=>{try{obs.observe(document.body,{childList:true,subtree:true,characterData:true})}catch{}},300);
})();