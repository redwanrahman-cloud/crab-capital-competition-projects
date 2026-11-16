import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateFirebaseConfig } from './src/config.mjs';
export const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://firebasevertexai.googleapis.com https://firebaseappcheck.googleapis.com; img-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const files = new Map([
  ['/', ['dist/index.html', 'text/html']], ['/style.css', ['dist/style.css', 'text/css']],
  ['/assets/app.js', ['dist/assets/app.js', 'text/javascript']], ['/assets/app.js.LEGAL.txt', ['dist/assets/app.js.LEGAL.txt', 'text/plain']]
]);
export function createDeskServer({ configPath = new URL('./firebase-client-config.local.json', import.meta.url),
  allowRegisteredDebugToken = process.env.DRAFT_DESK_ALLOW_REGISTERED_DEBUG_TOKEN === '1' } = {}) {
  return createServer(async (req, res) => {
    const headers = { 'cache-control': 'no-store', 'content-security-policy': CONTENT_SECURITY_POLICY, 'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
    const host = req.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) { res.writeHead(403, headers); res.end('Localhost host required'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...headers, allow: 'GET, HEAD' }); res.end('Method not allowed'); return; }
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    try {
      if (pathname === '/runtime-config.json') {
        const firebaseConfig = validateFirebaseConfig(JSON.parse(await readFile(configPath, 'utf8')));
        res.writeHead(200, { ...headers, 'content-type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ firebaseConfig, allowRegisteredDebugToken })); return;
      }
      const file = files.get(pathname);
      if (!file) { res.writeHead(404, headers); res.end('Not found'); return; }
      const data = await readFile(new URL(file[0], import.meta.url));
      res.writeHead(200, { ...headers, 'content-type': `${file[1]}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(503, headers); res.end('Local build or public Firebase configuration unavailable. Run the build and check the local configuration.'); }
  });
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  createDeskServer().listen(4317, '127.0.0.1', () => console.log('Private Draft Desk localhost: http://127.0.0.1:4317 · no automatic model calls'));
