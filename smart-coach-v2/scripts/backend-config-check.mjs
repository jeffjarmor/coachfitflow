import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { environment as original } from '../../smart-coach/src/environments/environment.prod.ts';
import { environment as development } from '../src/environments/environment.ts';
import { environment as production } from '../src/environments/environment.prod.ts';
import { environment as local } from '../src/environments/environment.local-staging.ts';
import { environment as hosted } from '../src/environments/environment.hosted-staging.ts';
import { environment as testing } from '../src/environments/environment.local-testing.ts';
import { environment as tunnel } from '../src/environments/environment.local-testing-tunnel.ts';

// Offline contract check: never signs in, reads user data or writes to a backend.
const root = new URL('..', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const angular = await json('angular.json');
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const build = angular.projects['smart-coach-v2'].architect.build;
const netlify = await readFile(new URL('netlify.toml', root), 'utf8');
const originalClient = await readFile(new URL('../../smart-coach/src/app/services/supabase.service.ts', import.meta.url), 'utf8');
const originalStorageKey = originalClient.match(/storageKey:\s*'([^']+)'/)?.[1];

assert.equal(production.production, true);
assert.equal(production.appUrl, original.appUrl, 'Conserva el dominio original durante el reemplazo.');
assert.deepEqual(production.supabase, original.supabase, 'Producción debe conservar la conexión original.');
assert.deepEqual(development.supabase, original.supabase);
assert.equal(production.auth.storageKey, originalStorageKey, 'El corte debe conservar las sesiones del original.');
assert.equal(development.auth.storageKey, production.auth.storageKey);
assert.equal(local.supabase.url, 'http://127.0.0.1:54321');
assert.equal(hosted.supabase.url, 'https://iyueiuonwvodksxlykyv.supabase.co');
assert.equal(testing.supabase.url, 'http://127.0.0.1:55321');
assert.equal(testing.production, false);
assert.equal(testing.appUrl, 'http://127.0.0.1:4350');
assert.equal(tunnel.appUrl, 'http://127.0.0.1:4351');
assert.equal(tunnel.supabase.url, `${tunnel.appUrl}/supabase`);
assert.equal(tunnel.supabase.publishableKey, testing.supabase.publishableKey);
assert.equal(tunnel.production, false);
assert.equal(new Set([production.auth.storageKey, local.auth.storageKey, hosted.auth.storageKey, testing.auth.storageKey, tunnel.auth.storageKey]).size, 5,
  'Cada backend debe conservar su propia sesión.');
for (const env of [development, production, local, hosted, testing, tunnel]) {
  const key = env.supabase.publishableKey;
  if (!key.startsWith('sb_publishable_')) {
    assert.equal(JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role, 'anon',
      'Angular solo puede contener una clave pública.');
  }
}
assert.equal(build.defaultConfiguration, 'production');
for (const [name, filename] of [
  ['production', 'environment.prod.ts'],
  ['local-staging', 'environment.local-staging.ts'],
  ['local-testing', 'environment.local-testing.ts'],
  ['local-testing-tunnel', 'environment.local-testing-tunnel.ts'],
  ['hosted-staging', 'environment.hosted-staging.ts']
]) {
  assert.ok(build.configurations[name].fileReplacements.some(item =>
    item.replace === 'src/environments/environment.ts' && item.with === `src/environments/${filename}`));
}
const outputPaths = [build.options.outputPath, ...['local-staging', 'hosted-staging', 'local-testing', 'local-testing-tunnel'].map(name => build.configurations[name].outputPath)];
assert.equal(new Set(outputPaths).size, 5, 'Los artefactos de testing, staging y producción deben estar separados.');
assert.equal(build.configurations['local-testing-tunnel'].sourceMap, false);
assert.ok(netlify.includes(`publish = "${build.options.outputPath}/browser"`));
assert.ok(netlify.includes('command = "npm run build:release"'));
assert.ok(netlify.includes('to = "/index.html"'));
assert.match(pkg.dependencies['@supabase/supabase-js'], /^\d+\.\d+\.\d+$/);
assert.equal(lock.packages[''].dependencies['@supabase/supabase-js'], pkg.dependencies['@supabase/supabase-js']);
assert.equal(lock.packages['node_modules/@supabase/supabase-js'].version, pkg.dependencies['@supabase/supabase-js']);
assert.equal(pkg.scripts['test:live-migration'], undefined, 'Las pruebas genéricas no deben escribir en producción.');
console.log('Backend OK: conexión y sesión original; staging aislado; build de producción y SDK reproducibles. Sin solicitudes a Supabase.');
