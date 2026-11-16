import test from 'node:test';import assert from 'node:assert/strict';import {puzzle,initial,evaluate,apply} from '../src/shared/game.mjs';
const day='2026-11-15',p=puzzle(day);
const baseline=[15,11,7,3,2,6,10,14,13,9,5,1,0,4,8,12];
test('exact frozen 2026-11-15 core baseline',()=>{
 assert.deepEqual(p,{day,id:'route-v1:2026-11-15',size:4,start:15,finish:12,rescues:[3,13,0]});
 let state=initial(day);for(const cell of baseline)state=apply(p,state,{type:'move',cell,revision:state.revision});
 assert.deepEqual(evaluate(p,state.path),{rescued:3,won:true,score:625});assert.equal(state.revision,16);
});
test('seed deterministic across calls, every daily board solvable',()=>{
 for(let i=0;i<365;i++){const d=new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),q=puzzle(d);assert.deepEqual(q,puzzle(d));
 function dfs(path){try{const r=evaluate(q,path);if(r.won)return path;}catch{return null;}const n=path.at(-1);for(const c of [n-4,n+4,n-1,n+1])if(c>=0&&c<16&&!path.includes(c)){const win=dfs([...path,c]);if(win)return win;}return null;}
 assert.ok(dfs([q.start]),d);
 }
});
test('illegal starts, jumps, diagonal, bounds, repeat, order and premature finish',()=>{
 for(const path of [[0],[15,13],[15,10],[15,16],[15,-1],[15,11,15],[15,14,13],[15,14,13,12],[15,'11'],Array(17).fill(15)])assert.throws(()=>evaluate(p,path),JSON.stringify(path));
 assert.throws(()=>evaluate(p,[15,11,7,3,2,1,0]),/order/);
 assert.throws(()=>evaluate(p,[15,14,10,9,8,12]),/hospital/);
});
test('reset clears route, increments revision and stale/forged actions fail',()=>{
 const s=apply(p,initial(day),{type:'move',cell:15,revision:0});assert.throws(()=>apply(p,s,{type:'move',cell:11,revision:0}),/Stale/);
 const reset=apply(p,s,{type:'reset',revision:1,score:999999});assert.deepEqual(reset.path,[]);assert.equal(reset.revision,2);assert.equal(reset.resets,1);assert.equal(evaluate(p,reset.path).score,0);
 assert.throws(()=>apply(p,s,{type:'score',revision:1}),/Unknown/);
 let win=initial(day);for(const cell of baseline)win=apply(p,win,{type:'move',cell,revision:win.revision});assert.throws(()=>apply(p,win,{type:'move',cell:8,revision:16}),/finished/);
});
