// SYNTHETIC loopback invoke adapter, not the Forge bridge or Jira API.
export async function invoke(name,payload){const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,payload})});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
