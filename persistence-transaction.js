/* BonusTracker persistence transaction core v1.0.0 — verified multi-key localStorage commit with rollback. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTPersistence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1.0.0';

  function uniqueKeys(keys){
    return Array.from(new Set((keys||[]).map(x=>String(x||'').trim()).filter(Boolean)));
  }
  function capture(storage,keys){
    if(!storage||typeof storage.getItem!=='function')throw new Error('Storage adapter is unavailable.');
    const out={};
    uniqueKeys(keys).forEach(key=>{
      const raw=storage.getItem(key);
      out[key]={exists:raw!==null,raw:raw===null?'':String(raw)};
    });
    return out;
  }
  function writeRaw(storage,key,raw){
    if(raw===null){
      storage.removeItem(key);
      if(storage.getItem(key)!==null)throw new Error('Storage delete verification failed for '+key);
      return;
    }
    const value=String(raw);
    storage.setItem(key,value);
    if(storage.getItem(key)!==value)throw new Error('Storage write verification failed for '+key);
  }
  function rollback(storage,snapshot){
    const errors=[];
    Object.entries(snapshot||{}).forEach(([key,state])=>{
      try{
        if(state&&state.exists)writeRaw(storage,key,state.raw);
        else writeRaw(storage,key,null);
      }catch(err){errors.push(key+': '+(err&&err.message?err.message:String(err)))}
    });
    if(errors.length)throw new Error('Rollback incomplete — '+errors.join('; '));
    return true;
  }
  function commit(storage,writes){
    if(!writes||typeof writes!=='object'||Array.isArray(writes))throw new Error('Transaction writes must be an object.');
    const keys=uniqueKeys(Object.keys(writes));
    const before=capture(storage,keys);
    try{
      keys.forEach(key=>{
        const raw=writes[key];
        if(raw!==null&&typeof raw!=='string')throw new Error('Transaction value for '+key+' must be a string or null.');
        writeRaw(storage,key,raw);
      });
      return{ok:true,keys,before};
    }catch(err){
      try{rollback(storage,before)}
      catch(rb){
        const e=new Error((err&&err.message?err.message:String(err))+'; '+(rb&&rb.message?rb.message:String(rb)));
        e.cause=err;e.rollbackError=rb;throw e;
      }
      throw err;
    }
  }

  return{VERSION,capture,commit,rollback};
});
