import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const repoRoot = new URL('../..', import.meta.url).pathname;
const hostedRef = 'iyueiuonwvodksxlykyv';
const hostedOrganization = 'dzkufamvbjzellugsstq';

function cli(args) {
  return JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.117.0', ...args, '--output-format', 'json'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }));
}

export function loadStagingTarget() {
  if (process.env.ZUMMITH_STAGE === 'hosted') {
    const project = cli(['projects', 'list']).projects.find(item => item.ref === hostedRef);
    assert.equal(project?.name, 'zummith-v2-staging', 'La prueba no encontró el proyecto de staging esperado.');
    assert.equal(project.organization_id, hostedOrganization, 'El proyecto no pertenece a la organización Free separada.');
    assert.equal(project.status, 'ACTIVE_HEALTHY', 'El proyecto de staging no está activo.');

    const keys = cli(['projects', 'api-keys', '--project-ref', hostedRef]).keys;
    const publishable = keys.find(key => key.type === 'publishable')?.api_key;
    const serviceRole = keys.find(key => key.name === 'service_role')?.api_key;
    assert.ok(publishable?.startsWith('sb_publishable_') && serviceRole,
      'Faltan las claves de staging; nunca uses claves de producción para esta prueba.');
    return {
      API_URL: `https://${hostedRef}.supabase.co`,
      ANON_KEY: publishable,
      SERVICE_ROLE_KEY: serviceRole,
      hosted: true
    };
  }

  assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Usa únicamente el destino local o hosted explícito.');
  const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.117.0', 'status', '-o', 'json'], {
    cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }));
  assert.equal(status.API_URL, 'http://127.0.0.1:54321', 'Esta prueba local solo puede usar Supabase CLI.');
  assert.ok(status.SERVICE_ROLE_KEY && status.ANON_KEY);
  return { ...status, hosted: false };
}
