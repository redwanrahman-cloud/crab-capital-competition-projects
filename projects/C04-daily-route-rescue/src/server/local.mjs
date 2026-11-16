import {createServer} from 'node:http';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {makeHandler} from './handler.mjs';
const states=new Map();
const api=makeHandler({identity:(req,res)=>{let id=/route_session=([a-f0-9-]+)/.exec(req.headers.cookie??'')?.[1];if(!id){id=randomUUID();res.setHeader('Set-Cookie',`route_session=${id}; HttpOnly; SameSite=Strict; Path=/`);}return id;},update:async(key,change)=>{const next=change(states.get(key));states.set(key,next);return next;}});
export const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/'))return api(req,res);
 const file={'/':'index.html','/app.mjs':'app.mjs','/style.css':'style.css'}[req.url];
 if(!file){res.statusCode=404;return res.end('Not found');}
 res.setHeader('Content-Type',file.endsWith('html')?'text/html':file.endsWith('css')?'text/css':'text/javascript');
 res.end(await readFile(new URL(`../client/${file}`,import.meta.url)));
});
server.listen(Number(process.env.PORT??3404),'127.0.0.1',()=>console.log(`SYNTHETIC local adapter: http://127.0.0.1:${server.address().port}`));
