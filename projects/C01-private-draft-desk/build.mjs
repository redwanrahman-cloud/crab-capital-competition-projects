import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/ui.mjs'], bundle: true, platform: 'browser', format: 'esm', target: 'chrome139',
  outfile: 'dist/assets/app.js', legalComments: 'linked', sourcemap: false, metafile: true, logLevel: 'warning' });
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html'); await copyFile('style.css', 'dist/style.css');
await writeFile('dist/build-meta.json', JSON.stringify(result.metafile, null, 2) + '\n');
console.log('Built browser Firebase app. No Firebase configuration, credential, model initialization or provider request occurred.');
