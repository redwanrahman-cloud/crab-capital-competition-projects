import test from 'node:test';import assert from 'node:assert/strict';import {redisUpdate} from '../src/server/redis-store.mjs';
test('synthetic Redis adapter checks pinned SDK semantics and failed acknowledgement',async()=>{
 let stored='{"revision":0}',cleanup=0,result=['OK'];const calls=[];const tx={multi:async()=>calls.push('multi'),set:async(k,v)=>{stored=v;calls.push('set');},exec:async()=>result,unwatch:async()=>cleanup++,discard:async()=>cleanup++};
 const redis={watch:async()=>{calls.push('watch');return tx;},get:async()=>{calls.push('read');return stored;}};
 const update=redisUpdate(redis);assert.deepEqual(await update('a',s=>({revision:s.revision+1})),{revision:1});assert.deepEqual(calls,['watch','read','multi','set']);
 result=[];await assert.rejects(()=>update('a',s=>s),/storage failure/);assert.equal(cleanup,1);
 await assert.rejects(()=>update('a',()=>{throw new Error('Stale');}),/Stale/);assert.equal(cleanup,2);
});
