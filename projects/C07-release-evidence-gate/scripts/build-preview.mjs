import {createRequire} from 'node:module';import path from 'node:path';import {mkdir} from 'node:fs/promises';
const root=createRequire(import.meta.url),forge=createRequire(root.resolve('@forge/cli/package.json'));
const {getNativeUiBuildConfig,handleWebpackCompilationResult}=forge('@forge/bundler');const webpack=forge('webpack');
// Reuse the official JSX/webpack config with explicit synthetic host adapters.
// The real unaliased native UI bundle is produced by forge-local-check.mjs.
const config=getNativeUiBuildConfig([{name:'preview',path:'src/frontend.jsx'}]);
config.output={...config.output,path:path.resolve('local-build/synthetic-preview'),filename:'preview.js'};
config.plugins=[];config.resolve={...config.resolve,alias:{'@forge/react$':path.resolve('preview/react-adapter.jsx'),'@forge/bridge$':path.resolve('preview/bridge-adapter.mjs')}};
await mkdir(config.output.path,{recursive:true});const compiler=webpack(config);
try{await new Promise((resolve,reject)=>compiler.run((err,stats)=>{try{handleWebpackCompilationResult({debug:()=>{},info:console.log,warn:console.warn},err,stats);resolve();}catch(e){reject(e);}}));}finally{await new Promise((resolve,reject)=>compiler.close(e=>e?reject(e):resolve()));}
console.log('SYNTHETIC_PREVIEW_BUNDLE_PASS: same src/frontend.jsx; DOM/bridge aliases, no Atlassian host proof.');
