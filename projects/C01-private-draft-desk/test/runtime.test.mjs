import test from 'node:test';
import assert from 'node:assert/strict';
import * as actualAI from 'firebase/ai';
import * as actualAppCheck from 'firebase/app-check';
import { createBrowserRuntime, deviceAvailability, registeredDebugProvider, validateFirebaseConfig, CLOUD_MODEL, DEVICE_OPTIONS } from '../src/runtime.mjs';
import { DraftDesk, outgoingPrompt } from '../src/desk.mjs';
import { createDeskServer, CONTENT_SECURITY_POLICY } from '../server.mjs';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// All configuration, credentials, provider responses and model calls are inert
// SYNTHETIC fixtures. Only SDK function/enum exports are genuine imports.
const config={apiKey:'SYNTHETIC_PUBLIC_WEB_KEY',authDomain:'crab-private-draft-desk.firebaseapp.com',projectId:'crab-private-draft-desk',
 storageBucket:'crab-private-draft-desk.firebasestorage.app',messagingSenderId:'12345',appId:'1:12345:web:abcdef'};
function fixture({approved=false,exchangeOK=true,deviceFailure=false}={}){
 const events=[],requests=[],generations=[];
 const apps={initializeApp:(cfg,name)=>{events.push('app:'+name);return {name,options:cfg};}};
 const ai={...actualAI,getAI:app=>{events.push('ai:'+app.name);return app;},GoogleAIBackend:class{},getGenerativeModel:(app,options)=>{
  events.push({model:options,app:app.name});return {
   initializeDeviceModel:async progress=>{events.push('device-initialize');if(deviceFailure)throw Error('SYNTHETIC unavailable');progress?.(1);},
   generateContent:async prompt=>{generations.push({prompt,mode:options.mode});return {response:{text:()=> 'SYNTHETIC OUTPUT',
    inferenceSource:options.mode===actualAI.InferenceMode.ONLY_ON_DEVICE?actualAI.InferenceSource.ON_DEVICE:actualAI.InferenceSource.IN_CLOUD}};}
  };}};
 const appCheck={CustomProvider:class{constructor(o){this.getToken=o.getToken;}},initializeAppCheck:(app,options)=>{
  events.push('appcheck:'+app.name);assert.equal(options.isTokenAutoRefreshEnabled,false);return options.provider;},
  getToken:async(provider,force)=>{assert.equal(force,true);events.push('attest');return provider.getToken();}};
 const fetchImpl=async(url,options)=>{requests.push({url,options});return {ok:exchangeOK,status:exchangeOK?200:403,
  json:async()=>({token:'SYNTHETIC_ATTESTATION',ttl:'3600s'})};};
 const languageModel={availability:async()=> 'available',create:async()=>assert.fail('No real model download')};
 return {events,requests,generations,create:()=>createBrowserRuntime({firebaseConfig:config,allowRegisteredDebugToken:approved,hostname:'127.0.0.1',apps,ai,appCheck,fetchImpl,deviceEnvironment:()=>({secure:true,languageModel})})};
}
test('installed SDK exposes genuine hybrid and App Check contracts without initializing providers',()=>{
 for(const name of ['initializeAppCheck','getToken','CustomProvider'])assert.equal(typeof actualAppCheck[name],'function');
 assert.equal(actualAI.InferenceMode.ONLY_ON_DEVICE,'only_on_device');assert.equal(actualAI.InferenceSource.IN_CLOUD,'in_cloud');
 assert.equal(CLOUD_MODEL,'gemini-3.5-flash-lite');
});
test('runtime startup initializes only local app/model objects, no download, attestation or inference',async()=>{
 const f=fixture(),runtime=await f.create();assert.equal(runtime.cloudReady,false);assert.equal(f.requests.length,0);assert.equal(f.generations.length,0);
 assert.equal(f.events.includes('device-initialize'),false);assert.equal(f.events.filter(e=>typeof e==='string'&&e.startsWith('app:')).length,1);
 assert.equal(f.events.some(e=>e.model),false);await runtime.initializeLocal();
 const model=f.events.find(e=>e.model).model;assert.equal(model.mode,actualAI.InferenceMode.ONLY_ON_DEVICE);assert.deepEqual(model.onDeviceParams.createOptions,DEVICE_OPTIONS);
 await assert.rejects(runtime.adapter.generate('cloud','SYNTHETIC'),/blocked/);assert.equal(f.requests.length,0);
});
test('specific App Check approval gate rejects before any cloud setup/exchange',async()=>{
 const f=fixture(),runtime=await f.create();await assert.rejects(runtime.configureRegisteredDebugToken('a'.repeat(32)),/Captain approval/);
 assert.equal(f.events.includes('attest'),false);assert.equal(f.requests.length,0);
});
test('device failure sends no cloud or App Check request and preserves drafts',async()=>{
 const f=fixture({deviceFailure:true}),runtime=await f.create(),desk=new DraftDesk(runtime.adapter);desk.preserveOriginal('SYNTHETIC secret original');
 await assert.rejects(runtime.initializeLocal(),/unavailable/);await assert.rejects(desk.rewriteLocal(),/unavailable/);
 assert.equal(f.generations.length,0);assert.equal(f.requests.length,0);assert.equal(desk.state.result,null);assert.equal(desk.state.original,'SYNTHETIC secret original');
});
test('approved attestation precedes cloud getAI; only single-use approved excerpt becomes cloud prompt',async()=>{
 const f=fixture({approved:true}),runtime=await f.create(),desk=new DraftDesk(runtime.adapter);desk.preserveOriginal('SYNTHETIC private full draft');desk.editExcerpt('SYNTHETIC excerpt');
 assert.throws(()=>desk.approveCloud(),/App Check/);await runtime.configureRegisteredDebugToken('a'.repeat(32));assert.equal(runtime.cloudReady,true);
 assert.ok(f.events.indexOf('appcheck:private-draft-desk-cloud')<f.events.indexOf('ai:private-draft-desk-cloud'));assert.equal(f.requests.length,1);
 assert.deepEqual(JSON.parse(f.requests[0].options.body),{debugToken:'a'.repeat(32)});assert.equal(f.generations.length,0);
 desk.approveCloud();await desk.sendApprovedExcerpt();assert.deepEqual(f.generations,[{prompt:outgoingPrompt('SYNTHETIC excerpt'),mode:actualAI.InferenceMode.ONLY_IN_CLOUD}]);
 await assert.rejects(desk.sendApprovedExcerpt(),/explicitly approve/);assert.equal(f.generations.length,1);
});
test('rejected App Check leaves cloud blocked and never constructs a cloud model',async()=>{
 const f=fixture({approved:true,exchangeOK:false}),runtime=await f.create();await assert.rejects(runtime.configureRegisteredDebugToken('a'.repeat(32)),e=>e.code==='desk/app-check-http'&&e.httpStatus===403);
 assert.equal(runtime.cloudReady,false);assert.equal(f.events.some(e=>e.model?.mode===actualAI.InferenceMode.ONLY_IN_CLOUD),false);assert.equal(f.generations.length,0);
});
test('registered credential exchange validates token/TTL and sanitizes transport errors',async()=>{
 class CustomProvider{constructor(options){this.getToken=options.getToken;}}
 assert.throws(()=>registeredDebugProvider({config,debugToken:true,CustomProvider}),/registered debug/);
 const provider=registeredDebugProvider({config,debugToken:'b'.repeat(32),CustomProvider,fetchImpl:async()=>{throw Error('SYNTHETIC secret credential in network failure');}});
 await assert.rejects(provider.getToken(),error=>!error.message.includes('secret credential')&&/could not connect/.test(error.message));
 const invalid=registeredDebugProvider({config,debugToken:'b'.repeat(32),CustomProvider,fetchImpl:async()=>({ok:true,json:async()=>({token:'SYNTHETIC',ttl:'bad'})})});
 await assert.rejects(invalid.getToken(),/invalid attestation/);
});
test('browser availability is read-only and never creates/downloads a device model',async()=>{
 const calls=[];assert.equal(await deviceAvailability(null),'unavailable');
 assert.equal(await deviceAvailability({availability:async options=>{calls.push(options);return 'downloadable';},create:()=>assert.fail('No download')}),'downloadable');
 assert.deepEqual(calls,[DEVICE_OPTIONS]);
});
test('configuration whitelist excludes extras and binds the expected free project',()=>{
 assert.equal(Object.keys(validateFirebaseConfig({...config,secret:'DO_NOT_SERVE'})).length,6);
 assert.throws(()=>validateFirebaseConfig({...config,projectId:'other'}),/missing or invalid/);
 assert.throws(()=>validateFirebaseConfig({...config,appId:'1:999:web:abcdef'}),/missing or invalid/);
});
function request(server,url,{method='GET',host='127.0.0.1:4317'}={}){
 return new Promise((resolve,reject)=>{const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){resolve({status:this.status,headers:this.headers,body:body?.toString()});}};
  try{server.emit('request',{method,url,headers:{host}},res);}catch(e){reject(e);}});
}
test('server exposes only public six-field config and exact built assets; no writes or local credential files',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'desk-server-'));t.after(()=>rm(dir,{recursive:true,force:true}));const configPath=path.join(dir,'config.json');
 await writeFile(configPath,JSON.stringify({...config,secret:'SYNTHETIC_EXTRA_MUST_NOT_LEAVE'}));const server=createDeskServer({configPath,allowRegisteredDebugToken:false});
 const response=await request(server,'/runtime-config.json');assert.equal(response.status,200);assert.equal(response.body.includes('SYNTHETIC_EXTRA_MUST_NOT_LEAVE'),false);
 assert.equal(JSON.parse(response.body).allowRegisteredDebugToken,false);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.headers['content-security-policy'],CONTENT_SECURITY_POLICY);
 for(const url of ['/firebase-client-config.local.json','/firebase-client-config.local.js','/node_modules/firebase/package.json','/../package.json','/src/runtime.mjs'])assert.equal((await request(server,url)).status,404);
 assert.equal((await request(server,'/',{method:'POST'})).status,405);assert.equal((await request(server,'/',{host:'malicious.example'})).status,403);
});
test('source never activates SDK auto-debug flag or persists application draft/credential storage',async()=>{
 const source=(await readFile(new URL('../src/runtime.mjs',import.meta.url),'utf8'))+(await readFile(new URL('../src/ui.mjs',import.meta.url),'utf8'));
 assert.doesNotMatch(source,/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=/);assert.doesNotMatch(source,/console\.(log|warn|error)\(|localStorage|sessionStorage/);
});
