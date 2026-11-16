// Calls real installed Forge client-side lint + bundler APIs. No CLI login,
// registration, upload, deploy, installation, credentials or server-side lint.
import {createRequire} from 'node:module';import {mkdir,cp,writeFile} from 'node:fs/promises';import path from 'node:path';
const rootRequire=createRequire(import.meta.url),forgeRequire=createRequire(rootRequire.resolve('@forge/cli/package.json'));
const {ConfigFile,FileSystemReader,FileSystemWriter,StatsigReader,CachedConf}=forgeRequire('@forge/cli-shared');
const {lint,problemCount,reportLintResults}=forgeRequire('@forge/lint');
const {NativeUIBundler,getNodeBundler,getEntryPoints,getWrapperProvider,createEntryPointsForResource}=forgeRequire('@forge/bundler');
const log={debug:message=>{if(String(message).includes('metadata'))console.log('BUNDLER_METADATA',message);},info:console.log,warn:console.warn,error:console.error};
const fsr=new FileSystemReader(),config=new ConfigFile(fsr,new FileSystemWriter());
const manifest=await config.readConfig();await mkdir('local-build',{recursive:true});
// Official default behavior for unavailable remote feature configuration. No
// runtime-deprecation freshness claim and no Statsig/account request is made.
class OfflineStatsig extends StatsigReader {async checkGate(){return null;}async getDynamicConfig(){return null;}}
const lintFiles=(await fsr.recursiveReadDir('./src',['node_modules','.git']));
console.log('Official @forge/lint CLIENT-SIDE mode; remote/deprecation configuration unavailable; standard CLI full lint NOT run.');
// The standard cache attempts a global AppData write. Use Forge's built-in
// memory cache for this isolated process; the actual public permission schemas
// are still fetched and every client-side linter still runs. No SDK file changes.
const originalCacheFactory=CachedConf.getCache;CachedConf.getCache=()=>CachedConf.memoryCache();
let results;
try{results=await lint(lintFiles,manifest,'development',log,new OfflineStatsig(),{linter:{mode:'client-side'}});}finally{CachedConf.getCache=originalCacheFactory;}
reportLintResults(log,results);const count=problemCount(results);
await writeFile('evidence/forge-client-lint.json',JSON.stringify({mode:'official-client-side-only',remoteConfiguration:'UNAVAILABLE_OFFICIAL_DEFAULT_FALLBACK',count,results},null,2));
console.log('CLIENT_LINT_COUNTS',JSON.stringify(count));
if(count.errors)process.exitCode=1;
console.log('Building unchanged Forge native UI with actual @forge/bundler (no aliases).');
// The convenience bundleResources() passes appDirectory:"", producing an SDK
// metadata realpath error. Use its public lower-level bundle() with the real app
// directory; compiler configuration and dependencies remain unmodified.
const nativeUiResults=[];
for(const resource of await config.getResources(['nativeUI'])){
 const result=await new NativeUIBundler(log).bundle({appDirectory:process.cwd(),entryPoints:createEntryPointsForResource(resource.key,resource.path,resource.entry)});
 await cp(result.outputDir,path.join('local-build/native-ui',resource.key),{recursive:true});nativeUiResults.push({key:resource.key,resourceType:resource.resourceType,metadata:result.metadata});
}
console.log('NATIVE_UI_BUNDLE_PASS',JSON.stringify(nativeUiResults.map(({key,resourceType})=>({key,resourceType}))));
console.log('Building actual resolver via Forge Node bundler. Runtime wrapper is fetched read-only from official Forge CDN; never executed.');
const backend=await getNodeBundler(log,getWrapperProvider({fileSystemReader:fsr}),config).bundle({appDirectory:process.cwd(),entryPoints:getEntryPoints(await config.getAppHandlers())});
await cp(backend.outputDir,'local-build/backend',{recursive:true});
for(const [name,content]of backend.additionalOutputs??[]){const target=path.join('local-build/backend',name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content);}
await writeFile('evidence/forge-bundle-metadata.json',JSON.stringify({nativeUi:nativeUiResults,backend:backend.metadata,platformExecution:'NOT_RUN'},(_k,v)=>v instanceof Set?[...v]:v,2));
console.log('BACKEND_BUNDLE_PASS; no registration, upload, hosted execution or Jira call.');
