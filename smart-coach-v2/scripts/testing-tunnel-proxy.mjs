import assert from 'node:assert/strict';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Temporary access to the synthetic original-schema clone. This server never
// reads credentials and cannot select a different backend or build directory.
const HOST = '127.0.0.1';
const PORT = 4351;
const API = new URL('http://127.0.0.1:55321');
const APP = `http://${HOST}:${PORT}`;
const BUILD = fileURLToPath(new URL('../dist/smart-coach-v2-local-testing-tunnel/browser/', import.meta.url));
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
  '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm'
};
// Angular routes, with dynamic identifiers represented by one safe segment.
// Unknown file paths and unknown routes get a real 404, rather than index.html.
const SPA_ROUTES = [
  '', 'landing-nueva', 'forgot-password', 'login', 'signup', 'set-password', 'dashboard', 'gyms',
  'client/portal', 'client/routines', 'client/routines/:id', 'client/measurements', 'client/payments', 'client/profile',
  'gym/onboarding', 'gym/join', 'gym/dashboard', 'gym/dashboard/:id', 'gym/payments/:id', 'gym/staff/:id', 'gym/settings/:id',
  'gym/:id/clients', 'gym/:id/clients/new', 'gym/:id/clients/:id', 'gym/:id/clients/:id/edit',
  'gym/:id/routines', 'gym/:id/routines/new', 'gym/:id/routines/:id',
  'gym/:id/competitor/new', 'gym/:id/competitor/:id/edit',
  'gym/:id/exercises', 'gym/:id/exercises/new', 'gym/:id/exercises/:id/edit', 'gym/:id/measurements',
  'clients', 'clients/new', 'clients/:id', 'clients/:id/edit', 'routines', 'routines/new', 'routines/:id',
  'competitor/new', 'competitor/:id/edit', 'admin', 'admin/announcements', 'admin/activity', 'admin/maintenance',
  'admin/coaches', 'admin/coaches/:id', 'admin/coaches/:id/clients', 'admin/clients',
  'admin/clients/:id/:id', 'admin/clients/:id/:id/edit', 'admin/clients/:id/:id/routine/new', 'admin/clients/:id/:id/routine/:id',
  'exercises/admin', 'seed-exercises', 'exercises-astra', 'exercises-astra/new', 'exercises-astra/:id/edit',
  'exercises', 'exercises/new', 'exercises/:id/edit', 'measurements', 'profile'
].map(route => new RegExp(`^/${route.replaceAll(':id', '[A-Za-z0-9_-]+')}/?$`));

export function publicOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  assert.ok(url.protocol === 'https:' && /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)
    && !url.port && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
  'PUBLIC_TUNNEL_ORIGIN must be the exact HTTPS origin of a temporary trycloudflare.com tunnel.');
  return url.origin;
}

export function rewriteLocation(value, origin) {
  if (!origin || !value) return value;
  let url;
  try { url = new URL(value); } catch { return value; }
  if (url.origin === API.origin) return `${origin}/supabase${url.pathname}${url.search}${url.hash}`;
  if (url.origin === APP || url.origin === 'http://127.0.0.1:4350') return `${origin}${url.pathname}${url.search}${url.hash}`;
  return value;
}

export function classifyRequest(target) {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) return { status: 400 };
  const question = target.indexOf('?');
  const rawPath = question < 0 ? target : target.slice(0, question);
  const query = question < 0 ? '' : target.slice(question);
  let pathname;
  try { pathname = decodeURIComponent(rawPath); } catch { return { status: 400 }; }
  if (/[\\\x00-\x1f\x7f%]/.test(pathname) || /%2f|%5c/i.test(rawPath) || pathname.includes('//')
    || pathname.split('/').some(segment => segment.startsWith('.')) || /\.map$/i.test(pathname)) return { status: 403 };
  if (pathname === '/supabase' || pathname.startsWith('/supabase/')) {
    if (!rawPath.startsWith('/supabase/')) return { status: 400 };
    if (!/^\/supabase\/(auth|rest|storage)\/v1(?:\/|$)/.test(pathname)) return { status: 403 };
    if (/^\/supabase\/auth\/v1\/admin(?:\/|$)/i.test(pathname)) return { status: 403 };
    return { kind: 'proxy', upstreamPath: rawPath.slice('/supabase'.length) + query };
  }
  // These services must never fall through to SPA routing or a public asset.
  if (/^\/(?:auth|rest|storage|realtime|functions|graphql|pg|mail|inbucket|mailpit|studio|supabase)(?:\/|$)/i.test(pathname)) return { status: 403 };
  return { kind: 'static', pathname, spa: SPA_ROUTES.some(route => route.test(pathname)) };
}

function filteredHeaders(headers) {
  const hop = new Set([...HOP_HEADERS, ...String(headers.connection || '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !hop.has(name.toLowerCase())));
}

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
}

function finish(response, status) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(http.STATUS_CODES[status]);
}

function proxy(request, response, route, origin) {
  const headers = filteredHeaders(request.headers);
  headers.host = API.host;
  // Do not let forwarded host/scheme supplied by a visitor influence GoTrue.
  for (const key of Object.keys(headers)) if (key.startsWith('x-forwarded-') || key === 'forwarded') delete headers[key];
  const upstream = http.request({ hostname: API.hostname, port: API.port, method: request.method, path: route.upstreamPath, headers }, result => {
    const outgoing = filteredHeaders(result.headers);
    if (outgoing.location) outgoing.location = rewriteLocation(outgoing.location, origin);
    response.writeHead(result.statusCode || 502, outgoing);
    result.on('error', () => response.destroy());
    result.pipe(response);
  });
  upstream.setTimeout(60_000, () => upstream.destroy());
  upstream.on('error', () => finish(response, 502));
  request.on('aborted', () => upstream.destroy());
  request.on('error', () => upstream.destroy());
  response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
  // Body bytes, Authorization/apikey, cookies, Content-Type and queries are
  // streamed unchanged; the proxy never buffers or logs credentials/uploads.
  request.pipe(upstream);
}

async function serveFile(request, response, route, buildRoot) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return finish(response, 405);
  let filename = path.resolve(buildRoot, `.${route.pathname}`);
  try {
    filename = await realpath(filename);
    if (!filename.startsWith(buildRoot + path.sep) && filename !== buildRoot) return finish(response, 403);
    const info = await stat(filename);
    if (!info.isFile()) throw Object.assign(new Error('not-file'), { code: 'ENOENT' });
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return finish(response, 404);
    if (!route.spa) return finish(response, 404);
    filename = path.join(buildRoot, 'index.html');
  }
  // Check index.html too: no symlink may make any served file escape the build.
  filename = await realpath(filename);
  if (!filename.startsWith(buildRoot + path.sep)) return finish(response, 403);
  const info = await stat(filename);
  response.writeHead(200, { 'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size, 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') return response.end();
  const stream = createReadStream(filename);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

export async function createTestingTunnelServer() {
  assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted-stage targets are unsupported.');
  const origin = publicOrigin(process.env.PUBLIC_TUNNEL_ORIGIN);
  const buildRoot = await realpath(BUILD);
  assert.ok((await stat(path.join(buildRoot, 'index.html'))).isFile(), 'Build the local-testing-tunnel configuration first.');
  const hosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
  if (origin) hosts.add(new URL(origin).host);
  const server = http.createServer(async (request, response) => {
    securityHeaders(response);
    if (!hosts.has(request.headers.host?.toLowerCase())) return finish(response, 403);
    if (!METHODS.has(request.method)) return finish(response, 405);
    if (request.headers.origin && request.headers.origin !== APP && request.headers.origin !== `http://localhost:${PORT}`
      && request.headers.origin !== origin) return finish(response, 403);
    const route = classifyRequest(request.url);
    if (route.status) return finish(response, route.status);
    try {
      if (route.kind === 'proxy') proxy(request, response, route, origin);
      else await serveFile(request, response, route, buildRoot);
    } catch { finish(response, 500); }
  });
  server.headersTimeout = 30_000;
  server.requestTimeout = 120_000;
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  return server;
}

async function smoke() {
  let checks = 0;
  const probe = (requestPath, port = PORT) => new Promise((resolve, reject) => {
    const request = http.get({ hostname: HOST, port, path: requestPath }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'] }));
    });
    request.setTimeout(5000, () => request.destroy(new Error('Local proxy smoke timed out.')));
    request.on('error', reject);
  });
  for (const url of ['/', '/login', '/client/routines/00000000-0000-4000-8000-000000000000', '/gym/testing/clients']) {
    const result = await probe(url); assert.equal(result.status, 200); assert.match(result.type, /^text\/html/); checks++;
  }
  for (const url of ['/missing-asset.js', '/missing-route']) { assert.equal((await probe(url)).status, 404); checks++; }
  for (const url of ['/main.js.map', '/.env', '/%2e%2e/package.json', '/supabase/auth/v1/admin/users',
    '/supabase/auth/v1/%61dmin/users', '/supabase/auth/v1/%2e%2e/admin/users', '/supabase/functions/v1/anything', '/mailpit/']) {
    assert.equal((await probe(url)).status, 403); checks++;
  }
  for (const url of ['/supabase/auth/v1/settings', '/supabase/rest/v1/', '/supabase/storage/v1/bucket']) {
    // Read-only, credential-free endpoints. Local Kong versions differ in
    // anonymous responses, so compare the actual backend status/content type.
    const proxied = await probe(url), direct = await probe(url.slice('/supabase'.length), Number(API.port));
    assert.deepEqual(proxied, direct); checks++;
  }
  const origin = 'https://smoke-test.trycloudflare.com';
  assert.equal(publicOrigin(origin), origin); checks++;
  assert.throws(() => publicOrigin('https://example.com')); checks++;
  assert.equal(rewriteLocation(`${API.origin}/auth/v1/verify?type=recovery`, origin), `${origin}/supabase/auth/v1/verify?type=recovery`); checks++;
  assert.equal(rewriteLocation('http://127.0.0.1:4350/set-password#access_token=example', origin), `${origin}/set-password#access_token=example`); checks++;
  assert.equal(rewriteLocation('https://example.com/callback', origin), 'https://example.com/callback'); checks++;
  console.log(`Testing tunnel proxy: ${checks} read-only smoke checks passed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.slice(2).every(argument => argument === '--smoke'), 'Supported option: --smoke.');
  if (process.argv.includes('--smoke')) await smoke();
  else {
    const server = await createTestingTunnelServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
    console.log(`Synthetic testing app proxy listening on ${APP}; backend fixed to local original-schema clone.`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
