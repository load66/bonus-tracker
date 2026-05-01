/* ✅ Version 2.9.0 Newest update: Simple T&C summary now renders from the Unified Analyzer Engine. */
(function(){
  const VER='2.9.0';
  function rawText(){
    const v=Array.from(document.querySelectorAll('textarea')).map(a=>a.value||'').filter(v=>/bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking|terms/i.test(v));
    v.sort((a,b)=>b.length-a.length);return v[0]||'';
  }
  function card(){
    return Array.from(document.querySelectorAll('.tc-box,.az-area,.card'))
      .filter(el=>!el.querySelector('textarea,input,select'))
      .filter(el=>{const t=el.textContent||'';return t.length<5500&&t.includes('SIMPLE TERMS')&&(t.includes('HOW TO EARN')||t.includes('WHAT COUNTS'))})
      .sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null;
  }
  function run(){
    const raw=rawText();if(!raw||raw.length<200||typeof tcUnifiedSummaryHtml!=='function')return false;
    const box=card();if(!box)return false;
    box.dataset.unifiedSummary=VER;
    box.classList.add('tc-strict-card');
    box.style.height='auto';box.style.maxHeight='none';box.style.minHeight='0';box.style.overflow='visible';
    box.innerHTML=tcUnifiedSummaryHtml(raw);
    return true;
  }
  function sched(){[120,450,1000,1800].forEach(ms=>setTimeout(run,ms));}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&/analyz|fill from analyzer|paste|auto.?fill/i.test(b.textContent||''))sched()},true);
  window.tcUnifiedReplaceSimpleTerms=run;
  setTimeout(sched,600);
  const st=document.createElement('style');st.textContent=`.app-version::after{content:' · Unified';opacity:.78}.tc-strict-card{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}`;document.head.appendChild(st);
})();
