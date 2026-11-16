import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fetchManifest, fetchText, resolveUrl} from '../vendor/runtime/remote.js';

const root=new URL('../',import.meta.url);
const site=new URL('https://judge.invalid/projects/C08-permission-aware-service-desk/');
const local=path=>readFile(new URL(path,root),'utf8');
const inSite=value=>{
 const url=new URL(value,site);
 assert.equal(url.origin,site.origin);
 assert.ok(url.pathname.startsWith(site.pathname),`Asset escaped project directory: ${url}`);
 return url;
};

test('static entry and first-party resources stay within a non-root deployment directory',async()=>{
 const html=await local('index.html');
 const refs=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match=>match[1]);
 assert.ok(refs.length>=5);
 for(const ref of refs){const url=inSite(ref);assert.ok(await local(url.pathname.slice(site.pathname.length)));}
 const app=await local('app.js');
 assert.match(app,/siteBase\s*=\s*new URL\('\.\/',\s*import\.meta\.url\)/);
 assert.match(app,/fetch\(new URL\('\.\/catalog\.json',\s*siteBase\)\)/);
 assert.match(app,/new Engine\(\{originUrl:siteBase\.href\}\)/);
 assert.doesNotMatch(app,/["']\/(?:catalog\.json|agent-manifest\.json|policies\/)/);
});

test('official manifest/network resolution and grounded catalog/policy sources survive a subpath',async t=>{
 const previous=globalThis.fetch,requests=[];
 globalThis.fetch=async input=>{
  const url=inSite(String(input));requests.push(url.href);
  const data=await local(url.pathname.slice(site.pathname.length));
  return new Response(data,{status:200});
 };
 t.after(()=>{globalThis.fetch=previous;});
 const {manifest,base}=await fetchManifest(site.href);
 assert.equal(base,site.href.slice(0,-1));
 const graph=JSON.parse(await fetchText(resolveUrl(base,manifest.networks[0].hocon)));
 assert.equal(graph.tools[0].name,manifest.networks[0].front_man);
 const actions=inSite(resolveUrl(base,manifest.actions.module));
 assert.match(await fetchText(actions.href),/registerActions/);
 const links=JSON.parse(await fetchText(resolveUrl(base,'./links.json')));
 assert.ok(links.networks.service_desk);
 const catalog=JSON.parse(await fetchText(new URL('./catalog.json',site).href));
 for(const service of catalog.services){const policy=inSite(service.source);assert.match(await fetchText(policy.href),/synthetic/i);}
 assert.ok(requests.every(url=>url.startsWith(site.href)));
 assert.equal(manifest.llm_router.mock,true);
 assert.equal(manifest.llm_router.base_url,'browser://mock');
 assert.equal(manifest.agent_mcp.available,false);
 assert.deepEqual(manifest.allowed_peers,[]);
});
