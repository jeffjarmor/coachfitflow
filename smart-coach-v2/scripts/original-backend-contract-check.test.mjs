import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ORIGINAL_PROJECT_ID, checkRpcContract, checkStorageContract, compareApplications,
  extractRpcCalls, extractStorageCalls, inputArguments, splitSqlArguments
} from './original-backend-contract-check.mjs';

const production = JSON.parse(await readFile(new URL('./contracts/original-backend-contract.json', import.meta.url), 'utf8'));
const snapshot = (functions = []) => ({ projectId: ORIGINAL_PROJECT_ID, migrations: production.migrations, functions });
const definition = (name, args = '', execute = true) => ({ name, arguments: args, executableByAuthenticated: execute });
const calls = source => extractRpcCalls(source, 'test-source.ts');

test('AST collects generic, multiline and shorthand RPC calls while ignoring comments', () => {
  const result = calls(`// api.rpc('not_a_call')
    api.rpc<Row[]>('save', { p_id, 'p_plan': plan });
    api.rpc(\`current_user_id\`);
    api['rpc']('legacy', { p_id });
  `);
  assert.deepEqual(result.map(({ name, arguments: args }) => ({ name, args })), [
    { name: 'save', args: ['p_id', 'p_plan'] }, { name: 'current_user_id', args: [] }, { name: 'legacy', args: ['p_id'] }
  ]);
  assert.equal(result[0].line, 2);
});

test('dynamic names, dynamic arguments and private schemas fail closed', () => {
  const metadata = snapshot([definition('save', 'p_id uuid')]);
  for (const source of ["api.rpc(fn, { p_id })", "api.rpc('save', payload)", "api.rpc('save', { ...payload })", "api.schema('private').rpc('save', { p_id })"]) {
    assert.equal(checkRpcContract(calls(source), metadata).length, 1, source);
  }
});

test('missing production RPCs are rejected even when local staging has them', () => {
  const result = checkRpcContract(calls("api.rpc('activate_current_client_portal_access')"), production);
  assert.equal(result.length, 1);
  assert.match(result[0].reason, /absent/);
});

test('signature matching rejects unknown and missing required arguments', () => {
  const metadata = snapshot([definition('save', 'p_id uuid, p_plan jsonb')]);
  assert.equal(checkRpcContract(calls("api.rpc('save', { p_id, p_plan })"), metadata).length, 0);
  assert.equal(checkRpcContract(calls("api.rpc('save', { p_id })"), metadata).length, 1);
  assert.equal(checkRpcContract(calls("api.rpc('save', { p_id, p_plan, p_new })"), metadata).length, 1);
});

test('optional defaults and overloaded signatures match named JSON arguments', () => {
  const metadata = snapshot([
    definition('load', 'p_id uuid, p_options jsonb DEFAULT \'{"labels":["a,b","c"]}\'::jsonb'),
    definition('load', 'p_slug text')
  ]);
  assert.equal(checkRpcContract(calls("api.rpc('load', { p_id })"), metadata).length, 0);
  assert.equal(checkRpcContract(calls("api.rpc('load', { p_slug })"), metadata).length, 0);
  assert.equal(checkRpcContract(calls("api.rpc('load')"), metadata).length, 1);
});

test('SQL argument parser retains commas inside types, quoted defaults and arrays', () => {
  assert.equal(splitSqlArguments("p_id uuid, p_amount numeric(8,2) DEFAULT 0, p_labels text[] DEFAULT ARRAY['a,b', 'c']").length, 3);
  assert.deepEqual(inputArguments('IN p_id uuid, OUT result text, INOUT "p_value" text DEFAULT NULL::text'), [
    { name: 'p_id', required: true }, { name: 'p_value', required: false }
  ]);
});

test('unconfirmed and revoked authenticated EXECUTE privileges are rejected', () => {
  assert.equal(checkRpcContract(calls("api.rpc('load')"), snapshot([definition('load', '', false)])).length, 1);
  assert.equal(checkRpcContract(calls("api.rpc('load')"), snapshot([{ name: 'load', arguments: '' }])).length, 1);
});

test('the gate rejects another project and a snapshot containing pending migrations', () => {
  assert.throws(() => checkRpcContract([], { ...snapshot(), projectId: 'staging' }), /original production/);
  assert.throws(() => checkRpcContract([], { ...snapshot(), migrations: [...production.migrations, { version: '20261010202940' }] }), /without the 18/);
});

test('comparison reports all original and V2 RPC differences', () => {
  assert.deepEqual(compareApplications(calls("a.rpc('shared');a.rpc('new');a.rpc('new')"), calls("a.rpc('shared');a.rpc('old')")), {
    v2: ['new', 'shared'], original: ['old', 'shared'], shared: ['shared'], onlyV2: ['new'], onlyOriginal: ['old']
  });
});

test('Storage resolves literals, module constants and original class fields', () => {
  const result = extractStorageCalls(`const BUCKET = 'assets';
    api.storage.from(BUCKET).upload(path, file);
    class Original { private bucket = 'assets'; run() { api.storage.from(this.bucket).getPublicUrl(path); } }
  `);
  assert.deepEqual(result.map(item => item.buckets), [['assets'], ['assets']]);
  assert.equal(checkStorageContract(result, production).length, 0);
});

test('Storage blocks unavailable gym-logos and unresolved dynamic buckets', () => {
  const result = extractStorageCalls(`api.storage.from('gym-logos'); api.storage.from(runtimeBucket);`);
  assert.equal(checkStorageContract(result, production).length, 2);
  assert.match(checkStorageContract(result, production)[0].reason, /gym-logos/);
});

test('the reviewed snapshot contains only the original schema and public bucket', () => {
  assert.equal(production.projectId, ORIGINAL_PROJECT_ID);
  assert.equal(production.migrations.length, 60);
  assert.equal(production.functions.length, 36);
  assert.deepEqual(production.buckets, [{ id: 'assets', public: true }]);
  assert.ok(production.functions.every(item => typeof item.executableByAuthenticated === 'boolean'));
  assert.equal(production.functions.some(item => item.name === 'save_gym_routine_plan'), false);
});
