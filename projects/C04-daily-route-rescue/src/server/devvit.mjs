import {createServer,getServerPort,context,redis,reddit} from '@devvit/web/server';
import {makeHandler} from './handler.mjs';
import {redisUpdate} from './redis-store.mjs';
// WATCH/MULTI binds revision validation and persistence atomically across workers.
const handler=makeHandler({identity:()=>context.userId,update:redisUpdate(redis)});
createServer(async(req,res)=>{
 if(req.method==='POST'&&req.url==='/internal/menu/create-post'){
  res.setHeader('Content-Type','application/json');try{const post=await reddit.submitCustomPost({title:'Daily Route Rescue — today’s dispatch',entry:'default'});res.end(JSON.stringify({navigateTo:`https://www.reddit.com/r/${context.subredditName}/comments/${post.id}`}));}catch{res.statusCode=500;res.end(JSON.stringify({showToast:'Could not create dispatch post'}));}return;
 }
 return handler(req,res);
}).listen(getServerPort());
