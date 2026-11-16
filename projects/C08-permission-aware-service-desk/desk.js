const copy=x=>JSON.parse(JSON.stringify(x));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export async function hash(value){const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function verifyAudit(events){let prev='0'.repeat(64);for(let i=0;i<events.length;i++){const {hash:digest,...body}=events[i];if(body.sequence!==i+1||body.previous!==prev||await hash(body)!==digest)return false;prev=digest;}return true;}
export function createDesk(catalog,{clock=()=>Date.now(),id=()=>crypto.randomUUID()}={}){
 const services=freeze(copy(catalog.services));let revision=0,staged=null,result=null;const audit=[],used=new Set();let tail=Promise.resolve();
 const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 async function log(type,data){const body={sequence:audit.length+1,previous:audit.at(-1)?.hash??'0'.repeat(64),time:new Date(clock()).toISOString(),type,data:copy(data)};audit.push(freeze({...body,hash:await hash(body)}));}
 const state=()=>copy({revision,staged,result,audit});
 return {
  state,discover:()=>copy(services),
  stage:args=>serial(async()=>{
   if(args.expectedRevision!==revision)throw new Error('Stale revision; stage the current draft again');
   const service=services.find(s=>s.id===args.serviceId);if(!service)throw new Error('Unknown service');
   if(typeof args.assetTag!=='string'||!/^DEMO-[A-Z0-9-]{1,20}$/.test(args.assetTag))throw new Error('Use an invented DEMO- asset tag');
   if(typeof args.summary!=='string'||args.summary.trim().length<3||args.summary.length>200)throw new Error('Summary must be 3–200 characters');
   // This bounded fixture disallows common credential/PII patterns; users must
   // still provide synthetic text only. This is not a general PII classifier.
   if(/@|password|token|secret|api.?key|\b\d{8,}\b/i.test(args.summary))throw new Error('Synthetic non-sensitive text only; remove contact details or credentials');
   revision++;result=null;
   const body={id:id(),revision,expiresAt:clock()+120000,recipient:service.recipient,action:service.action,data:{assetTag:args.assetTag,summary:args.summary},source:service.source,catalogVersion:catalog.version,synthetic:true};
   staged=freeze({...body,digest:await hash(body)});await log('STAGED',staged);return state();
  }),
  decline:args=>serial(async()=>{if(!staged||staged.id!==args.id||staged.digest!==args.digest||staged.revision!==revision)throw new Error('Stale or changed review');await log('DECLINED',{id:staged.id,digest:staged.digest,source:staged.source});used.add(staged.id);staged=null;revision++;return state();}),
  execute:args=>serial(async()=>{
   const p=staged;if(!p||p.id!==args.id||p.digest!==args.digest||args.revision!==revision||p.revision!==revision||used.has(p.id))return {ok:false,reason:'Stale, changed or already consumed consent'};
   if(clock()>=p.expiresAt)return {ok:false,reason:'Review expired; stage a fresh request'};
   used.add(p.id);await log('APPROVED',{id:p.id,digest:p.digest,recipient:p.recipient,action:p.action,data:p.data,source:p.source});
   result=freeze({id:`LOCAL-${p.id}`,status:'SYNTHETIC_LOCAL_ONLY',recipient:p.recipient,action:p.action,data:p.data,source:p.source,proposalDigest:p.digest});
   await log('SYNTHETIC_RESULT',result);staged=null;revision++;return {ok:true,result:copy(result)};
  })
 };
}
