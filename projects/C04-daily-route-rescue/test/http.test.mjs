import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';
test('two independent HTTP sessions share a puzzle, isolate moves, reject stale/illegal input and reset',async()=>{
 const child=spawn(process.execPath,['src/server/local.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
 try{
 const [line]=await once(child.stdout,'data');const url=line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
 const a=await fetch(url+'/api/state'),b=await fetch(url+'/api/state'),cookie=a.headers.get('set-cookie').split(';')[0];const av=await a.json(),bv=await b.json();assert.deepEqual(av.puzzle,bv.puzzle);assert.notEqual(cookie,b.headers.get('set-cookie').split(';')[0]);
 const post=async body=>fetch(url+'/api/state',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({type:'move',cell:av.puzzle.start,revision:0,score:99999})).status,200);
 assert.equal((await post({type:'move',cell:av.puzzle.start,revision:0})).status,400);
 assert.equal((await post({type:'move',cell:99,revision:1})).status,400);
 const again=await(await fetch(url+'/api/state',{headers:{cookie}})).json();assert.equal(again.state.path.length,1);assert.equal(again.score,0);
 const untouched=await(await fetch(url+'/api/state',{headers:{cookie:b.headers.get('set-cookie').split(';')[0]}})).json();assert.deepEqual(untouched.state.path,[]);
 const reset=await(await post({type:'reset',revision:1})).json();assert.deepEqual(reset.state.path,[]);assert.equal(reset.state.revision,2);
 assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/app.mjs')).status,200);
 }finally{child.kill();await once(child,'exit');}
});
