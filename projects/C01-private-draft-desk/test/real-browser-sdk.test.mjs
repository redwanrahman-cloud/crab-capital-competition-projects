import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
// Deliberately import the pinned BROWSER build. firebase/ai's Node export does
// not register chromeAdapterFactory and cannot establish this browser contract.
import * as browserSDK from '../node_modules/@firebase/ai/dist/esm/index.esm.js';
import { createFirebaseAdapter } from '../src/firebase-adapter.mjs';
const prompt='SYNTHETIC_PRIVATE_DRAFT_SENTINEL_NOT_REAL_USER_DATA';
let sequence=0;
function setup(t,languageModel){
 const previous={fetch:globalThis.fetch,window:globalThis.window,LanguageModel:globalThis.LanguageModel,isSecureContext:globalThis.isSecureContext};
 const requests=[],constructions=[];
 globalThis.window=globalThis;globalThis.isSecureContext=true;
 if(languageModel===undefined)delete globalThis.LanguageModel;else globalThis.LanguageModel=languageModel;
 globalThis.fetch=async(url,options)=>{requests.push({url:String(url),body:options?.body});throw Error('SYNTHETIC INTERCEPT: network is prohibited in this fixture');};
 const app=initializeApp({apiKey:'SYNTHETIC_PUBLIC_WEB_KEY',projectId:'crab-private-draft-desk',appId:'1:12345:web:abcdef'},'browser-contract-'+(++sequence));
 t.after(async()=>{await deleteApp(app);for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
 const sdk={...browserSDK,getGenerativeModel(...args){constructions.push(args[1]);return browserSDK.getGenerativeModel(...args);}};
 return {app,sdk,requests,constructions};
}
test('retained vendor counterexample: browser SDK 13.3 ONLY_ON_DEVICE without LanguageModel attempts cloud; fetch intercepted, never sent',async t=>{
 const f=setup(t);const ai=browserSDK.getAI(f.app,{backend:new browserSDK.GoogleAIBackend()});
 const unsafe=browserSDK.getGenerativeModel(ai,{mode:browserSDK.InferenceMode.ONLY_ON_DEVICE});
 await unsafe.initializeDeviceModel(); // Vendor no-op without Chrome adapter.
 await assert.rejects(unsafe.generateContent(prompt));
 assert.equal(f.requests.length,1);assert.ok(f.requests[0].body.includes(prompt));
});
for(const availability of [undefined,'unavailable',false,'malformed'])test(`guarded actual browser SDK refuses ${String(availability)} before local construction or draft transport`,async t=>{
 const languageModel=availability===undefined?undefined:{availability:async()=>availability,create:()=>assert.fail('No device model is created')};
 const f=setup(t,languageModel),adapter=await createFirebaseAdapter({firebaseApp:f.app,sdk:f.sdk});
 await assert.rejects(adapter.initializeLocal(),/unavailable/);await assert.rejects(adapter.generate('local',prompt),/unavailable/);
 assert.equal(f.constructions.length,0);assert.deepEqual(f.requests,[]);
});
test('guarded real browser SDK refuses a provider disappearing after genuine SDK initialization, before draft generation',async t=>{
 const languageModel={availability:async()=> 'available',create:()=>assert.fail('No generation/download is permitted')};
 const f=setup(t,languageModel),adapter=await createFirebaseAdapter({firebaseApp:f.app,sdk:f.sdk});
 await adapter.initializeLocal();assert.equal(f.constructions.length,1);
 delete globalThis.LanguageModel;
 await assert.rejects(adapter.generate('local',prompt),/unavailable/);assert.deepEqual(f.requests,[]);
});
test('local model is not captured while API missing; later explicit initialization captures current provider only',async t=>{
 const f=setup(t),adapter=await createFirebaseAdapter({firebaseApp:f.app,sdk:f.sdk});
 assert.equal(f.constructions.length,0);await assert.rejects(adapter.initializeLocal(),/unavailable/);
 globalThis.LanguageModel={availability:async()=> 'available',create:()=>assert.fail('No generation/download is permitted')};
 await adapter.initializeLocal();assert.equal(f.constructions.length,1);assert.deepEqual(f.requests,[]);
 globalThis.LanguageModel={availability:async()=> 'available',create:()=>assert.fail('Changed API must not be used')};
 await assert.rejects(adapter.generate('local',prompt),/unavailable/);assert.deepEqual(f.requests,[]);
});
test('fresh readiness is required after initialization and immediately before SDK generation',async t=>{
 let state='downloadable';const languageModel={availability:async()=>state,create:()=>assert.fail('No model download in this fixture')};
 const f=setup(t,languageModel),adapter=await createFirebaseAdapter({firebaseApp:f.app,sdk:f.sdk});
 // Simulate download without invoking Chrome: availability available at SDK init,
 // then disappears at the adapter's post-initialization verification.
 let reads=0;languageModel.availability=async()=>++reads===3?'unavailable':'available';
 await assert.rejects(adapter.initializeLocal(),/unavailable/);assert.deepEqual(f.requests,[]);
 reads=0;languageModel.availability=async()=>state;state='available';await adapter.initializeLocal();
 state='unavailable';await assert.rejects(adapter.generate('local',prompt),/unavailable/);assert.deepEqual(f.requests,[]);
});
