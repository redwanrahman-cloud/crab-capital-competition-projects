import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {AgentNetwork,validateNetwork,filterSlyData} from '../vendor/runtime/kernel.js';import {parseHocon} from '../vendor/runtime/hocon.js';import {Engine,manifestAllowsPeer} from '../vendor/runtime/engine.js';import {consumeAgentBudget,consumeRemoteBudget,remoteIsInChain} from '../vendor/runtime/runner.js';import {scriptedInference} from '../scripted-inference.js';import {createDesk} from '../desk.js';import {attachDesk,registerActions} from '../site-actions.js';
const root=new URL('../',import.meta.url),network=JSON.parse(await readFile(new URL('service_desk.network.json',root))),manifest=JSON.parse(await readFile(new URL('agent-manifest.json',root)));
test('actual official parser/validator accepts graph and rejects malformed/missing reference',()=>{
 const parsed=parseHocon(JSON.stringify(network)),n=new AgentNetwork(parsed,'service_desk');assert.deepEqual(validateNetwork(n).errors,[]);assert.equal(n.findFrontMan(),'concierge');assert.equal(manifest.networks[0].front_man,n.findFrontMan());assert.throws(()=>parseHocon('{"tools":['));assert.ok(validateNetwork(new AgentNetwork({...network,tools:[{name:'concierge',tools:['missing']}]},'bad')).errors.length);
});
test('actual official browser engine loop delegates two agents and grounded site action with SYNTHETIC inference',async()=>{
 const base='http://127.0.0.1:3408',engine=new Engine({originUrl:base}),n=new AgentNetwork(network,'service_desk');
 // Offline engine harness: same official runner/context, local graph fixture;
 // browser loadTop + real HTTP manifest loading is checked separately in Chrome.
 engine.top={base,network:n,manifest,llm:{mock:true,chat:scriptedInference()}};engine.userRouter={baseUrl:'browser://mock',mock:true};
 const desk=createDesk(JSON.parse(await readFile(new URL('catalog.json',root))));attachDesk(desk);registerActions({register:d=>engine.actions.register({base,network:'service_desk'},d)});
 const result=await engine.runTurn('Discover synthetic service catalog');assert.match(result.text,/Local synthetic IT queue/);assert.match(result.text,/SYNTHETIC/);assert.equal(desk.state().result,null);
});
test('official deny-origin/private-data/budget/cycle helpers fail closed (focused checks, not full conformance)',()=>{
 assert.equal(manifestAllowsPeer('https://unapproved.invalid/network',manifest),false);assert.deepEqual(filterSlyData({secret:'fixture',permitted:'ok'},[]),{});assert.deepEqual(filterSlyData({secret:'fixture',permitted:'ok'},['permitted']),{permitted:'ok'});
 assert.match(consumeAgentBudget({agentCalls:1,maxAgentCalls:1,deadline:Date.now()+1000}),/limit/);assert.match(consumeRemoteBudget({remoteCalls:1,maxRemoteCalls:1,deadline:Date.now()+1000},'peer'),/limit/);assert.equal(remoteIsInChain('http://127.0.0.1:3408/service_desk','http://127.0.0.1:3408',['http://127.0.0.1:3408::service_desk']),true);
});
test('actual local HTTP public artifact paths, CORS, browser runtime and no-write host',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});try{const [line]=await once(child.stdout,'data');const url=line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];for(const path of ['/agent-manifest.json','/service_desk.network.json','/links.json']){const response=await fetch(url+path);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.ok(await response.json());}
 assert.equal((await fetch(url+'/vendor/runtime/engine.js')).status,200);assert.equal((await fetch(url+'/agent-manifest.json',{method:'POST'})).status,405);assert.match((await fetch(url+'/')).headers.get('content-security-policy'),/connect-src 'self'/);
 }finally{child.kill();await once(child,'exit');}
});

