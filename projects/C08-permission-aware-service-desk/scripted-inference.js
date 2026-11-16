// A deterministic test adapter, not a real LLM/provider. The official reference
// runner still builds schemas, delegates agents and dispatches registered tools.
export function scriptedInference(){return async({messages,tools})=>{
 const results=messages.filter(m=>m.role==='tool');const names=tools.map(t=>t.function.name);
 if(!results.length){const name=names.includes('triage')?'triage':names.includes('website_discover_services')?'website_discover_services':null;
  if(name)return {content:'',toolCalls:[{id:'fixture-'+name,function:{name,arguments:JSON.stringify(name==='triage'?{request:'Discover grounded synthetic services'}:{})}}],finishReason:'tool_calls'};
 }
 return {content:'SYNTHETIC inference · grounded tool result: '+(results.at(-1)?.content??'No service data available'),toolCalls:[],finishReason:'stop'};
};}
