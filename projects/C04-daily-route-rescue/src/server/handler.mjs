import {puzzle,initial,apply,view} from '../shared/game.mjs';
export function makeHandler({identity,update,day=()=>new Date().toISOString().slice(0,10)}){
 return async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  try{
   const user=await identity(req,res);if(!user){res.statusCode=401;res.end(JSON.stringify({error:'Sign in to Reddit to save a route'}));return;}
   const today=day(),p=puzzle(today),key=`route:v1:${today}:${user}`;
   if(req.url!=='/api/state'||!['GET','POST'].includes(req.method)){res.statusCode=404;res.end(JSON.stringify({error:'Not found'}));return;}
   let action;
   if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw new Error('Request too large');}action=JSON.parse(body);}
   const state=await update(key,current=>action?apply(p,current??initial(today),action):current??initial(today));
   res.end(JSON.stringify(view(p,state)));
  }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
 };
}
