let desk;
export const attachDesk=value=>{desk=value;};
export const requestSchema={type:'object',properties:{id:{type:'string',minLength:1,maxLength:80},digest:{type:'string',minLength:64,maxLength:64},revision:{type:'integer',minimum:0}},required:['id','digest','revision'],additionalProperties:false};
export function registerActions(actions){
 actions.register({name:'discover_services',description:'Read grounded synthetic service catalog with exact recipient and policy URLs.',effect:'read',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{if(!desk)throw new Error('Service desk not attached');return {synthetic:true,services:desk.discover()};}});
 actions.register({name:'create_synthetic_request',description:'Create only a local synthetic receipt bound to the exact staged preview. Never sends a ticket or email.',effect:'irreversible',inputSchema:requestSchema,execute:args=>desk.execute(args)});
}
