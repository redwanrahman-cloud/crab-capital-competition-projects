import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createDesk,verifyAudit} from '../desk.js';import {ActionRegistry} from '../vendor/runtime/actions.js';import {attachDesk,registerActions} from '../site-actions.js';
const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));const input={serviceId:'device',assetTag:'DEMO-TEST',summary:'Invented display issue',expectedRevision:0};
test('exact preview, decline, new revision approval and source-linked tamper-evident audit',async()=>{
 const desk=createDesk(catalog);let s=await desk.stage(input),p=s.staged;assert.equal(p.recipient,'Local synthetic IT queue');assert.deepEqual(p.data,{assetTag:'DEMO-TEST',summary:'Invented display issue'});assert.equal(p.source,'./policies/device.html');
 await desk.decline(p);assert.equal(desk.state().result,null);assert.equal((await desk.execute(p)).ok,false);
 s=await desk.stage({...input,serviceId:'access',expectedRevision:2});p=s.staged;const receipt=await desk.execute(p);assert.equal(receipt.result.status,'SYNTHETIC_LOCAL_ONLY');assert.equal(receipt.result.recipient,'Local synthetic facilities queue');assert.equal(receipt.result.proposalDigest,p.digest);assert.equal((await desk.execute(p)).ok,false);
 const events=desk.state().audit;assert.equal(await verifyAudit(events),true);events[0].data.data.summary='tampered';assert.equal(await verifyAudit(events),false);assert.equal(await verifyAudit(desk.state().audit),true);
});
test('stale, modified, expired, replayed and concurrent consent fail closed',async()=>{
 let now=1000;const desk=createDesk(catalog,{clock:()=>now});const p=(await desk.stage(input)).staged;
 assert.equal((await desk.execute({...p,digest:'0'.repeat(64)})).ok,false);assert.equal((await desk.execute({...p,revision:99})).ok,false);
 const q=(await desk.stage({...input,summary:'Changed invented issue',expectedRevision:1})).staged;assert.equal((await desk.execute(p)).ok,false);now+=120001;assert.equal((await desk.execute(q)).ok,false);assert.equal(desk.state().result,null);
 const r=(await desk.stage({...input,expectedRevision:2})).staged;const results=await Promise.all([desk.execute(r),desk.execute(r)]);assert.deepEqual(results.map(x=>x.ok),[true,false]);assert.equal(desk.state().audit.filter(x=>x.type==='SYNTHETIC_RESULT').length,1);
});
test('staging rejects forged service, invalid revision and sensitive-pattern fixture',async()=>{
 const desk=createDesk(catalog);for(const override of [{serviceId:'forged'},{assetTag:'REAL-ASSET'},{summary:'password is demo'},{summary:'person@example.com'},{expectedRevision:4}])await assert.rejects(()=>desk.stage({...input,...override}));assert.deepEqual(desk.state().audit,[]);
});
test('official action registry schema rejects extra data; decline and mid-review revision change cannot execute',async()=>{
 const desk=createDesk(catalog);attachDesk(desk);const registry=new ActionRegistry(),scope={base:'http://127.0.0.1:3408',network:'service_desk'};registerActions({register:d=>registry.register(scope,d)});const ref=registry.catalog(scope).find(x=>x.name==='create_synthetic_request').ref;let p=(await desk.stage(input)).staged;
 const component=args=>({kind:'action',action:ref,arguments:args});const args={id:p.id,digest:p.digest,revision:p.revision};assert.throws(()=>registry.prepare(component({...args,recipient:'attacker'})),/Unexpected/);
 const plan=registry.prepare(component(args));assert.equal(await registry.execute(plan,async()=>false,'decline'),null);assert.equal(desk.state().result,null);
 const receipts=await registry.execute(plan,async items=>{assert.equal(items[0].origin,'http://127.0.0.1:3408');assert.deepEqual(items[0].arguments,args);await desk.stage({...input,expectedRevision:1});return true;},'stale');assert.equal(receipts[0].result.ok,false);assert.equal(desk.state().result,null);
});
