import {build} from 'esbuild';import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/client',{recursive:true});await mkdir('dist/server',{recursive:true});
for(const f of ['index.html','app.mjs','style.css'])await copyFile(`src/client/${f}`,`dist/client/${f}`);
await build({entryPoints:['src/server/devvit.mjs'],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:'dist/server/index.cjs'});
console.log('Built real @devvit/web server bundle + static client. Reddit execution unverified.');
