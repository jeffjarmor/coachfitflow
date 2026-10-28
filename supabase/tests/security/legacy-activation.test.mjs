import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual public V1 method without starting Angular or an Auth session.
// SQL authorization is tested separately; this records the frontend request contract.
const ts = (await import('../../../smart-coach-v2/node_modules/typescript/lib/typescript.js')).default;
const source = await readFile(process.env.AUTH_SERVICE_SOURCE || new URL('../../../smart-coach/src/app/services/auth.service.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
}).outputText, {
  exports,
  require: () => ({ Injectable: () => value => value, environment: { appUrl: 'https://example.invalid' } })
});

function setup({ links = [{ client_id: 'trusted-client' }], coach = false, linkError = null, user = true } = {}) {
  const calls = [];
  const service = Object.create(exports.AuthService.prototype);
  service.hasExistingCoachProfile = async () => coach;
  service.supabase = {
    auth: { getUser: async () => ({ data: { user: user ? { id: 'actor', email: 'actor@example.invalid',
      user_metadata: { client_id: 'forged-client', coach_id: 'forged-coach' } } : null }, error: null }) },
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select(value) { call.select = value; return query; },
        update(value) { call.update = value; return query; },
        upsert(value) { call.upsert = value; return query; },
        eq(...value) { call.filters.push(value); return query; },
        in(...value) { call.filters.push(value); return query; },
        then(resolve, reject) { return Promise.resolve({ data: links, error: linkError }).then(resolve, reject); }
      };
      return query;
    }
  };
  return { service, calls };
}

test('V1 activation uses existing links and never assigns identity from user metadata', async () => {
  const { service, calls } = setup();
  await service.activateIndependentClientAccessForCurrentUser();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'independent_client_portal_access');
  assert.equal(calls[0].select, 'client_id');
  assert.deepEqual(calls[0].filters, [['user_id', 'actor']]);
  assert.equal(calls.some(call => call.upsert), false);
  assert.equal(calls[1].table, 'clients');
  assert.equal(calls[1].update.portal_status, 'active');
  assert.equal('user_id' in calls[1].update, false);
  assert.deepEqual(calls[1].filters, [['id', ['trusted-client']], ['user_id', 'actor'], ['portal_status', 'pending']]);
});

test('V1 activation does not create links when no invitation exists', async () => {
  const { service, calls } = setup({ links: [] });
  await service.activateIndependentClientAccessForCurrentUser();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].select, 'client_id');
});

test('V1 activation keeps coach-session and missing-session behavior', async () => {
  const coach = setup({ coach: true });
  await coach.service.activateIndependentClientAccessForCurrentUser();
  assert.equal(coach.calls.length, 0);
  await assert.rejects(setup({ user: false }).service.activateIndependentClientAccessForCurrentUser(),
    /No hay sesión activa para completar la activación/);
});

test('V1 activation propagates failures without further mutations', async () => {
  const failure = new Error('Read failed');
  const { service, calls } = setup({ linkError: failure });
  await assert.rejects(service.activateIndependentClientAccessForCurrentUser(), error => error === failure);
  assert.equal(calls.length, 1);
});
