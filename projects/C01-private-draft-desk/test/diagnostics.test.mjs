import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiagnostic, safeFailureText } from '../src/diagnostics.mjs';
import { registeredDebugProvider } from '../src/runtime.mjs';
const sensitive='SYNTHETIC_SECRET_NEVER_DISPLAY';
const config={messagingSenderId:'12345',appId:'1:12345:web:abcdef',apiKey:'SYNTHETIC_PUBLIC_KEY'};
class CustomProvider{constructor(options){this.getToken=options.getToken;}}
const provider=fetchImpl=>registeredDebugProvider({config,debugToken:'a'.repeat(32),CustomProvider,fetchImpl});

test('diagnostics use an exact code allowlist and ignore raw error messages/stacks/causes/config',()=>{
 const error={code:sensitive,message:sensitive,stack:sensitive,cause:{code:'appCheck/fetch-network-error'},customData:{token:sensitive,httpStatus:sensitive}};
 assert.deepEqual(safeDiagnostic(error),{code:'desk/unknown-error'});
 const text=safeFailureText('app-check',error);assert.equal(text.includes(sensitive),false);assert.match(text,/desk\/unknown-error/);
 assert.match(text,/No model request was sent during setup/);
});
for(const httpStatus of [400,401,403,404,429,500,503])test(`allowlisted HTTP diagnostic ${httpStatus} contains only fixed stage/code and numeric status`,async()=>{
 const p=provider(async()=>({ok:false,status:httpStatus,json:()=>assert.fail('Never ingest rejected response data')}));
 await assert.rejects(p.getToken(),error=>{
  assert.deepEqual(safeDiagnostic(error),{code:'desk/app-check-http',httpStatus});
  assert.match(safeFailureText('app-check',error),new RegExp('HTTP '+httpStatus));return true;
 });
});
test('malformed HTTP metadata never becomes diagnostic output',()=>{
 for(const value of ['403'+sensitive,sensitive,999,Infinity,NaN,null,{}]){
  const error={code:'appCheck/fetch-status-error',customData:{httpStatus:value},message:sensitive};
  assert.deepEqual(safeDiagnostic(error),{code:'appCheck/fetch-status-error'});assert.equal(safeFailureText('app-check',error).includes(sensitive),false);
 }
 assert.deepEqual(safeDiagnostic({code:'appCheck/fetch-status-error',customData:{httpStatus:403,raw:sensitive}}),{code:'appCheck/fetch-status-error',httpStatus:403});
});
test('network and response parse errors are sanitized at the source',async()=>{
 const cases=[
  {fetchImpl:async()=>{throw Error(sensitive);},code:'desk/app-check-network'},
  {fetchImpl:async()=>({ok:true,json:async()=>{throw Error(sensitive);}}),code:'desk/app-check-response-json'},
  {fetchImpl:async()=>({ok:true,json:async()=>null}),code:'desk/app-check-attestation'},
  {fetchImpl:async()=>({ok:true,json:async()=>({token:sensitive,ttl:sensitive})}),code:'desk/app-check-attestation'}
 ];
 for(const c of cases)await assert.rejects(provider(c.fetchImpl).getToken(),error=>{
  assert.equal(error.code,c.code);assert.equal(error.message.includes(sensitive),false);assert.equal(safeFailureText('app-check',error).includes(sensitive),false);return true;
 });
});
test('credential format rejection gets a fixed pre-exchange code without reflecting the credential',()=>{
 assert.throws(()=>registeredDebugProvider({config,debugToken:sensitive,CustomProvider}),error=>{
  assert.equal(error.code,'desk/app-check-credential-format');assert.equal(safeFailureText('app-check',error).includes(sensitive),false);return true;
 });
});
