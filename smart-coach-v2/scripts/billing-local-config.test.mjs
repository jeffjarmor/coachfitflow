import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkBillingEnvironment, ensureBillingEnvironment, parseBillingEnvironment, requireLocalStatus } from './billing-local-config.mjs';

test('local status rejects hosted, compatibility, missing and malicious API targets', () => {
  for (const API_URL of ['https://example.supabase.co', 'http://127.0.0.1:55321', 'http://127.0.0.1:54321.evil.test', undefined]) {
    assert.throws(() => requireLocalStatus({ API_URL, ANON_KEY: 'local', SERVICE_ROLE_KEY: 'local' }), /standard local/);
  }
  assert.throws(() => requireLocalStatus({ API_URL: 'http://127.0.0.1:54321' }), /standard local/);
  assert.equal(requireLocalStatus({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'local', SERVICE_ROLE_KEY: 'local' }).API_URL, 'http://127.0.0.1:54321');
});

test('explicit simulator mode is required and live keys are rejected without leaking them', () => {
  assert.equal(parseBillingEnvironment('').mode, 'onvo_test');
  assert.throws(() => parseBillingEnvironment('COACH_BILLING_MODE=simulator'), /requires/);
  assert.equal(parseBillingEnvironment('COACH_BILLING_MODE=simulator\nCOACH_BILLING_LOCAL_SIMULATOR=true').mode, 'simulator');
  for (const variable of ['ONVO_SECRET_KEY', 'ONVO_PUBLISHABLE_KEY']) {
    assert.throws(() => parseBillingEnvironment(`${variable}=onvo_live_do_not_disclose`), error => /Live ONVO keys/.test(error.message) && !error.message.includes('do_not_disclose'));
  }
  assert.throws(() => parseBillingEnvironment('COACH_BILLING_MODE=production'), /Unknown billing mode/);
});

test('environment creation is private and never overwrites an existing user configuration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zummith-billing-config-'));
  const path = join(directory, '.env.local');
  assert.equal(checkBillingEnvironment(path).mode, 'simulator');
  assert.equal(ensureBillingEnvironment(path).mode, 'simulator');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const chosen = 'COACH_BILLING_MODE=onvo_test\nONVO_PRICE_ID=chosen-test-price\n';
  writeFileSync(path, chosen);
  assert.equal(ensureBillingEnvironment(path).mode, 'onvo_test');
  assert.equal(readFileSync(path, 'utf8'), chosen);
  console.log(`Retained test scratch: ${directory}`);
});

test('launcher exposes a non-mutating local preflight and rejects production options', () => {
  const script = new URL('./start-billing-local.mjs', import.meta.url);
  const result = JSON.parse(execFileSync(process.execPath, [script.pathname, '--check'], { encoding: 'utf8' }));
  assert.equal(result.apiUrl, 'http://127.0.0.1:54321');
  assert.equal(result.appUrl, 'http://127.0.0.1:4200');
  assert.ok(['simulator', 'onvo_test'].includes(result.mode));
  const rejected = spawnSync(process.execPath, [script.pathname, '--production'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Unknown option/);
  assert.equal(rejected.stdout, '');
});
