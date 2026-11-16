import {createServer} from 'node:http';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {identity,snapshot,readiness,approve,appendApproval} from '../src/domain.mjs';
const sessions=new Map();
function session(req,res){let id=/gate_preview=([a-f0-9-]+)/.exec(req.headers.cookie??'')?.[1];if(!id||!sessions.has(id)){id=randomUUID();sessions.set(id,{version:1,available:true,history:[]});res.setHeader('Set-Cookie',`gate_preview=${id}; HttpOnly; SameSite=Strict; Path=/`);}return sessions.get(id);}
function current(s){return snapshot(identity('SYNTHETIC-SITE','100'),{id:'100',key:'DEMO-100',summary:'Synthetic release candidate',updated:'2026-11-15T00:00:00Z',links:[{id:'required-1'}]},[{requirementId:'required-1',state:s.available?'AVAILABLE':'UNKNOWN',issue:{id:'101',key:'DEMO-101',summary:`Synthetic regression evidence revision ${s.version}`,description:'Local fixture only; no Jira issue was read.',status:'SYNTHETIC-DONE',updated:`2026-11-15T00:00:${String(s.version).padStart(2,'0')}Z`,fixVersions:[]}}]);}
export const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'");
 try{
  if(req.method==='POST'&&['/api/invoke','/api/fixture'].includes(req.url)){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw new Error('Request too large');}const input=JSON.parse(body),s=session(req,res);res.setHeader('Content-Type','application/json');
   if(req.url==='/api/fixture'){if(input.action==='edit'){s.version++;}else if(input.action==='hide'){s.available=false;}else if(input.action==='restore'){s.available=true;}else throw new Error('Unknown fixture action');return res.end(JSON.stringify({synthetic:true}));}
   const snap=current(s);
   if(input.name==='approve'){const event=approve({current:snap,expectedRevision:input.payload?.expectedRevision,accountId:'SYNTHETIC-LOCAL-REVIEWER',deliberate:input.payload?.deliberate,at:new Date().toISOString(),eventId:randomUUID()});s.history=appendApproval(s.history,event);return res.end(JSON.stringify({recorded:true,synthetic:true}));}
   if(input.name!=='refresh')throw new Error('Unknown resolver');const state=readiness(snap,s.history);return res.end(JSON.stringify({current:snap,state:state.state,approvals:state.state==='UNKNOWN'?[]:state.history}));
  }
  const assets={'/':['preview/index.html','text/html'],'/style.css':['preview/style.css','text/css'],'/controls.mjs':['preview/controls.mjs','text/javascript'],'/preview.js':['local-build/synthetic-preview/preview.js','text/javascript']};const asset=assets[req.url];if(req.method!=='GET'||!asset){res.statusCode=404;return res.end('Not found');}res.setHeader('Content-Type',asset[1]);res.end(await readFile(new URL('../'+asset[0],import.meta.url)));
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}
});
server.listen(Number(process.env.PORT??3407),'127.0.0.1',()=>console.log('SYNTHETIC Release Evidence Gate preview http://127.0.0.1:'+server.address().port));
