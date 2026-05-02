/*
 * filename: scripts/ui-stability-patch.js
 * version: 3.3.1
 * purpose: Safari crash-safe UI patch. No badge edits, no live modal rewriting, no fixed action footer.
 * last-touched: unknown
 */
(function(){
  const VER = '3.3.1';

  function entriesReady(){
    try { return Array.isArray(entries); } catch { return Array.isArray(window.entries); }
  }

  window.btSmokeCheck = function(){
    return {
      version: VER,
      appRoot: !!document.getElementById('app'),
      storageReady: typeof sv === 'function' && typeof SK !== 'undefined',
      entriesReady: entriesReady(),
      renderReady: typeof R === 'function',
      strictAnalyzerReady: typeof tcStrictAnalyze === 'function',
      autoFillReviewReady: typeof tcOpenAutoFillReview === 'function' && typeof tcCreateReviewedEntry === 'function',
      manualReviewReady: typeof openManualEntryReview === 'function'
    };
  };

  if (!document.getElementById('ui_stability_patch_style')) {
    const st = document.createElement('style');
    st.id = 'ui_stability_patch_style';
    st.textContent = `
      .tca-box .tm-pill{min-width:8px!important;width:8px!important;height:8px!important;padding:0!important;border-radius:999px!important;font-size:0!important;overflow:hidden!important;vertical-align:middle!important;margin-left:4px!important;display:inline-block!important}
      .tca-box .tm-pill::before{content:'';display:block;width:8px;height:8px;border-radius:999px}.tca-box .tm-pill.green::before{background:#10B981}.tca-box .tm-pill.amber::before{background:#F59E0B}.tca-box .tm-pill.red::before{background:#EF4444}
      .tcr-bg{align-items:flex-end!important;overflow:hidden!important}
      .tcr-sheet{max-height:calc(100dvh - max(env(safe-area-inset-top,0px),8px))!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;contain:paint!important;transform:translateZ(0)!important}
      .tcr-actions{position:static!important;display:flex!important;gap:10px!important;margin:16px 0 8px!important;padding:0 0 calc(10px + env(safe-area-inset-bottom,0px))!important;background:transparent!important;box-shadow:none!important;z-index:auto!important}
      .tcr-actions button{min-height:56px!important;border-radius:16px!important;flex:1!important}
      @media(max-width:700px){
        .tcr-sheet{max-width:100%!important;border-radius:22px 22px 0 0!important;padding:9px 12px calc(18px + env(safe-area-inset-bottom,0px))!important}
        .tcr-grid{grid-template-columns:1fr!important;gap:8px!important}
        .tcr-summary{grid-template-columns:1fr 1fr!important;gap:7px!important}
        .tcr-field,.tcr-field.wide{grid-column:1/-1!important;margin-bottom:9px!important}
        .tcr-field input,.tcr-field textarea,.tcr-field select{font-size:16px!important;min-height:52px!important;line-height:1.35!important;white-space:normal!important;text-overflow:clip!important;overflow:visible!important}
        .tcr-field textarea{min-height:132px!important;max-height:220px!important;overflow-y:auto!important;resize:none!important}
        .tcr-section{border-radius:18px!important;padding:12px!important;margin:10px 0!important}
        .tcr-hero{border-radius:20px!important;padding:13px!important}
        .tcr-hero h3{font-size:18px!important}
        .tcr-hero p{font-size:11px!important}
        .tcr-chip b{font-size:12px!important}
      }
    `;
    document.head.appendChild(st);
  }
})();