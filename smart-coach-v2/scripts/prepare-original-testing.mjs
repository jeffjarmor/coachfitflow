import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile, chmod } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// Only inspect/start the existing local clone. Never link a hosted project,
// reset a database, apply the repository's additional migrations, or print keys.
const workdir = join(homedir(), '.local/share/coachfitflow-testing/original-compat');
const config = await readFile(join(workdir, 'supabase/config.toml'), 'utf8').catch(() => null);
assert.ok(config, 'Falta la copia local. Consulta docs/TESTING_LOCAL.md para restaurar el directorio de testing.');
assert.match(config, /project_id\s*=\s*"coachfitflow-original-compat"/);
assert.match(config, /\[api\][\s\S]*?port\s*=\s*55321/);
const contract = JSON.parse(await readFile(new URL('./contracts/original-backend-contract.json', import.meta.url), 'utf8'));
const expectedVersions = contract.migrations.map(row => row.version).sort();
const actualFiles = (await readdir(join(workdir, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).map(name => name.split('_')[0]).sort();
assert.deepEqual(actualFiles, expectedVersions, 'El directorio local debe contener solamente las migraciones del original.');

function cli(args) {
  return execFileSync('npx', ['--yes', 'supabase@2.117.0', ...args, '--workdir', workdir], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  });
}

let status;
try { status = JSON.parse(cli(['status', '-o', 'json'])); }
catch {
  assert.ok(process.argv.includes('--start'), 'La copia local está detenida. Ejecuta npm run testing:database.');
  // This starts the persistent local containers; it does not reset their data.
  cli(['start', '--exclude', 'imgproxy,logflare,vector,supavisor,studio,postgres-meta,edge-runtime,realtime']);
  status = JSON.parse(cli(['status', '-o', 'json']));
}
assert.equal(status.API_URL, 'http://127.0.0.1:55321');
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
const history = execFileSync('docker', ['exec', 'supabase_db_coachfitflow-original-compat', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
  'select json_agg(version order by version) from supabase_migrations.schema_migrations;'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
assert.deepEqual(JSON.parse(history), expectedVersions, 'La base local debe conservar el historial del original, sin las migraciones adicionales.');
await mkdir(workdir, { recursive: true, mode: 0o700 });
await chmod(workdir, 0o700);
for (const file of [join(workdir, 'status.json'), join(tmpdir(), 'coachfitflow-original-compat-status.json')]) {
  await writeFile(file, JSON.stringify(status), { mode: 0o600 });
  await chmod(file, 0o600);
}
console.log('Testing local listo: API 127.0.0.1:55321; sesión y datos separados de producción.');
