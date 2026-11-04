import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
export const appRoot = fileURLToPath(new URL('..', import.meta.url));
export const billingEnvFile = fileURLToPath(new URL('../../supabase/functions/.env.local', import.meta.url));
export const localApiUrl = 'http://127.0.0.1:54321';
export const localAppUrl = 'http://127.0.0.1:4200';
export const supabaseCli = ['--yes', 'supabase@2.122.0'];

export function requireLocalStatus(status) {
  if (status?.API_URL !== localApiUrl || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error('Billing tests require the standard local Supabase Docker project on 127.0.0.1:54321.');
  }
  return status;
}

export function readLocalStatus() {
  let status;
  try {
    status = JSON.parse(execFileSync('npx', [...supabaseCli, 'status', '-o', 'json'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }));
  } catch {
    throw new Error('Local Supabase is unavailable. Run npm start with Docker Desktop running.');
  }
  return requireLocalStatus(status);
}

export function parseBillingEnvironment(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const mode = values.COACH_BILLING_MODE || 'onvo_test';
  if (!['simulator', 'onvo_test'].includes(mode)) throw new Error('Unknown billing mode. Use simulator or onvo_test.');
  if (mode === 'simulator' && values.COACH_BILLING_LOCAL_SIMULATOR !== 'true') {
    throw new Error('Local simulation requires COACH_BILLING_LOCAL_SIMULATOR=true.');
  }
  if (values.ONVO_SECRET_KEY?.startsWith('onvo_live_') || values.ONVO_PUBLISHABLE_KEY?.startsWith('onvo_live_')) {
    throw new Error('Live ONVO keys cannot be used by the local billing launcher.');
  }
  return { mode };
}

export function ensureBillingEnvironment(path = billingEnvFile) {
  if (!existsSync(path)) {
    const source = [
      '# Local Docker simulator. Replace these settings explicitly to use the ONVO sandbox.',
      'COACH_BILLING_MODE=simulator',
      'COACH_BILLING_LOCAL_SIMULATOR=true',
      `ONVO_WEBHOOK_SECRET=webhook_secret_local_${randomUUID()}`,
      `BILLING_ALLOWED_ORIGINS=${localAppUrl},http://localhost:4200,http://127.0.0.1:4300,http://localhost:4300`,
      ''
    ].join('\n');
    try {
      writeFileSync(path, source, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  return parseBillingEnvironment(readFileSync(path, 'utf8'));
}

export function checkBillingEnvironment(path = billingEnvFile) {
  return existsSync(path) ? parseBillingEnvironment(readFileSync(path, 'utf8')) : { mode: 'simulator' };
}
