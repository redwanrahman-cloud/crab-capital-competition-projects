import {createServer} from 'node:http';import {readFile,stat} from 'node:fs/promises';import {resolve,sep,extname} from 'node:path';
const root=resolve(import.meta.dirname),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.md':'text/plain','.txt':'text/plain'};
export const server=createServer(async(req,res)=>{
 try{if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end('Read-only static host');}
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),path=resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!path.startsWith(root+sep)||!types[extname(path)]||path.includes(sep+'test'+sep)||path.includes(sep+'evidence'+sep))throw new Error('Not found');
 const body=await readFile(path);res.setHeader('Content-Type',types[extname(path)]+'; charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
 if(extname(path)==='.json')res.setHeader('Access-Control-Allow-Origin','*');
 res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT??3408),'127.0.0.1',()=>console.log('SYNTHETIC service desk: http://127.0.0.1:'+server.address().port));
