// The pinned SDK TxClient.get returns the transaction, NOT a string (contrary
// to the prose docs example). Read with redis.get after WATCH and before MULTI.
export const redisUpdate=redis=>async(key,change)=>{
 const tx=await redis.watch(key);let queued=false;
 try{
  const raw=await redis.get(key),next=change(raw?JSON.parse(raw):null);
  await tx.multi();queued=true;
  await tx.set(key,JSON.stringify(next),{expiration:new Date(Date.now()+8*86400000)});
  const result=await tx.exec();queued=false;
  // Exactly one SET was queued. Missing acknowledgement fails closed.
  if(!Array.isArray(result)||result.length!==1||result[0]!=='OK')throw new Error('Concurrent move or storage failure; refresh and try again');
  return next;
 }catch(e){try{if(queued)await tx.discard();else await tx.unwatch();}catch{}throw e;}
};
