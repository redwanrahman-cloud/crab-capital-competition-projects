import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';
test('synthetic HTTP adapter binds approval to revision, preserves stale history and suppresses inaccessible history',async()=>{
 const child=spawn(process.execPath,['preview/server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});try{
  const [line]=await once(child.stdout,'data'),url=line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];let cookie='';
  const post=async(path,body)=>{const response=await fetch(url+path,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;return {status:response.status,body:await response.json()};};
  const first=(await post('/api/invoke',{name:'refresh'})).body;assert.equal(first.state,'NEEDS_HUMAN_APPROVAL');const payload={expectedRevision:first.current.revision,deliberate:true};
  assert.equal((await post('/api/invoke',{name:'approve',payload})).status,200);assert.equal((await post('/api/invoke',{name:'refresh'})).body.state,'APPROVED');
  await post('/api/fixture',{action:'edit'});assert.equal((await post('/api/invoke',{name:'approve',payload})).status,400);const stale=(await post('/api/invoke',{name:'refresh'})).body;assert.equal(stale.state,'STALE');assert.equal(stale.approvals[0].snapshot.revision,first.current.revision);
  await post('/api/fixture',{action:'hide'});const hidden=(await post('/api/invoke',{name:'refresh'})).body;assert.equal(hidden.state,'UNKNOWN');assert.deepEqual(hidden.approvals,[]);assert.equal((await post('/api/invoke',{name:'approve',payload:{expectedRevision:hidden.current.revision,deliberate:true}})).status,400);
 }finally{child.kill();await once(child,'exit');}
});
