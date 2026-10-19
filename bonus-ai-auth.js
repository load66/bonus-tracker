/* Persistent AI sign-in. Passwords are never retained; tracker records are untouched. */
(function(){
  'use strict';
  if(window.BTICloudBackup?.isLocalOnly?.()){
    window.BTBonusAuth={connected:()=>false,token:async()=>{throw Error('Online AI is disabled in iCloud-only mode.')},signIn:async()=>{throw Error('Online sign-in is disabled in iCloud-only mode.')},disconnect:()=>{}};
    return;
  }
  const URL='https://ppsljqaaanpkksxbpalk.supabase.co',KEY='sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n',STORE='bonus-ai-auth';
  let refreshPromise=null,revision=0;
  function session(){
    try{
      let raw=localStorage.getItem(STORE);
      if(!raw){raw=sessionStorage.getItem(STORE);if(raw){localStorage.setItem(STORE,raw);sessionStorage.removeItem(STORE);}}
      const s=JSON.parse(raw||'null');
      return typeof s?.access_token==='string'&&typeof s?.refresh_token==='string'&&Number.isFinite(s.expires_at)?s:null;
    }catch{return null;}
  }
  function clear(){revision++;try{localStorage.removeItem(STORE);sessionStorage.removeItem(STORE);}catch{}}
  async function exchange(grant,body){
    const version=revision,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch(URL+'/auth/v1/token?grant_type='+grant,{method:'POST',credentials:'omit',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const d=await r.json();
      if(!r.ok){
        const revoked=grant==='refresh_token'&&['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired','user_banned','user_not_found'].includes(d.error_code||d.code);
        if(revoked&&version===revision)clear();
        throw Error(revoked?'Your AI session ended. Sign in again.':grant==='password'&&r.status===400?'Could not sign in. Check your Trading Journal email and password.':'AI sign-in is temporarily unavailable. Try again.');
      }
      if(typeof d.access_token!=='string'||typeof d.refresh_token!=='string'||!Number.isFinite(Number(d.expires_in)))throw Error('AI sign-in returned an unsupported session.');
      if(version!==revision)throw Error('AI sign-in was cancelled.');
      const s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Number(d.expires_at)||Math.floor(Date.now()/1000)+Number(d.expires_in)};
      try{localStorage.setItem(STORE,JSON.stringify(s));sessionStorage.removeItem(STORE);}catch{throw Error('This browser cannot remember your AI sign-in. Allow site storage and try again.');}
      return s.access_token;
    }catch(e){if(e.name==='AbortError')throw Error('AI sign-in timed out. Try again.');throw e;}finally{clearTimeout(timer);}
  }
  async function token(force=false){
    const s=session();if(!s)throw Error('Sign in to use Ask AI for more.');
    if(!force&&s.expires_at>Date.now()/1000+60)return s.access_token;
    if(!refreshPromise){
      const refresh=async()=>{const latest=session();if(!latest)throw Error('Sign in to use Ask AI for more.');if(latest.access_token!==s.access_token&&latest.expires_at>Date.now()/1000+60)return latest.access_token;return exchange('refresh_token',{refresh_token:latest.refresh_token});};
      // Coordinate rotating refresh tokens across tabs when Web Locks is available.
      refreshPromise=(navigator.locks?.request?navigator.locks.request('bonus-ai-auth-refresh',refresh):refresh()).finally(()=>{refreshPromise=null;});
    }
    return refreshPromise;
  }
  async function signIn(email,password){const access=await exchange('password',{email,password});try{window.BTTermsHistory?.queueSync?.()}catch{}return access;}
  window.BTBonusAuth={connected:()=>!!session(),token,signIn,disconnect:clear};
})();
