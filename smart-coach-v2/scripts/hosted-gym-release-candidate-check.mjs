import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
assert.equal(target.hosted, true, 'El RC multigimnasio solo puede ejecutarse contra staging alojado.');

const appRoot = new URL('..', import.meta.url).pathname;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const stages = [
  ['Build alojado', 'npm', ['run', 'build:hosted-staging']],
  ['Onboarding', 'node', ['scripts/hosted-gym-onboarding-check.mjs']],
  ['Fundación y permisos', 'node', ['scripts/hosted-gym-foundation-check.mjs']],
  ['Clientes, mediciones y rutinas', 'node', ['scripts/hosted-gym-operations-check.mjs']],
  ['Flujos UI de cliente y rutina', 'node', ['scripts/hosted-gym-ui-workflows-check.mjs']],
  ['Portal: series, RIR, historial y PDF', 'node', ['scripts/portal-training-staging-check.mjs']],
  ['Portal: mediciones, pagos y perfil', 'node', ['scripts/portal-measurements-staging-check.mjs']],
  ['Registro RIR', 'node', ['scripts/gym-rir-staging-check.mjs']],
  ['Pagos', 'node', ['scripts/hosted-gym-payments-check.mjs']],
  ['Personal y copropietarios', 'node', ['scripts/hosted-gym-staff-check.mjs']],
  ['Configuración y acceso', 'node', ['scripts/hosted-gym-settings-check.mjs']]
];

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function syntheticSnapshot() {
  const [coaches, clients, gyms, authUsers] = await Promise.all([
    admin.from('coaches').select('id').ilike('email', 'stage-%@example.invalid'),
    admin.from('clients').select('id').ilike('email', 'stage-%@example.invalid'),
    admin.from('gyms').select('id').ilike('name', '%stage%'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);
  return {
    coaches: checked(coaches, 'Contar coaches sintéticos').map((row) => row.id).sort(),
    clients: checked(clients, 'Contar clientes sintéticos').map((row) => row.id).sort(),
    gyms: checked(gyms, 'Contar gimnasios sintéticos').map((row) => row.id).sort(),
    authUsers: checked(authUsers, 'Contar usuarios Auth').users
      .filter((user) => user.email?.endsWith('@example.invalid'))
      .map((user) => user.id)
      .sort()
  };
}

function runStage(label, command, args) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`\n[RC gimnasio] ${label}`);
    const child = spawn(command, args, {
      cwd: appRoot,
      env: { ...process.env, ZUMMITH_STAGE: 'hosted' },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        console.log(`[RC gimnasio] ${label}: aprobado (${Math.round((Date.now() - startedAt) / 1000)} s)`);
        resolve();
        return;
      }
      reject(new Error(`${label} falló (${signal ? `señal ${signal}` : `código ${code}`}).`));
    });
  });
}

const baseline = await syntheticSnapshot();
let suiteError;

for (const [label, command, args] of stages) {
  try {
    await runStage(label, command, args);
  } catch (error) {
    suiteError = error;
    break;
  }
}

const after = await syntheticSnapshot();
assert.deepEqual(after, baseline, 'El RC debe restaurar el inventario sintético original de staging.');
if (suiteError) throw suiteError;

console.log('\nRC multigimnasio aprobado: 11 etapas completas y cero residuos sintéticos nuevos.');
