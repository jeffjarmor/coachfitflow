import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  appRoot, billingEnvFile, checkBillingEnvironment, ensureBillingEnvironment,
  localApiUrl, localAppUrl, repoRoot, supabaseCli
} from './billing-local-config.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm start [-- --check]\nStarts standard local Supabase, local billing functions and Angular at 127.0.0.1:4200.\n--check validates the local configuration without starting services or writing files.\nDocker data is preserved; no reset, remote migration or deployment is performed.');
} else if (args.some(arg => arg !== '--check')) {
  console.error('Unknown option. Use --help or --check.');
  process.exitCode = 1;
} else if (args.includes('--check')) {
  try {
    console.log(JSON.stringify({ apiUrl: localApiUrl, appUrl: localAppUrl, ...checkBillingEnvironment() }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  const children = new Set();
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Child already stopped. */ }
    }
    process.exitCode = code;
  };
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  const launch = (command, childArgs, cwd, label, quiet = false) => {
    const env = label === 'Angular'
      ? { ...process.env, CI: '1', NG_BUILD_MAX_WORKERS: process.env.NG_BUILD_MAX_WORKERS || '2' }
      : process.env;
    const child = spawn(command, childArgs, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    const report = chunk => {
      const text = chunk.toString();
      // Supabase startup prints local API credentials. Keep those out of the console.
      if (!quiet) process.stdout.write(`[${label}] ${text}`);
    };
    child.stdout.on('data', report);
    child.stderr.on('data', report);
    child.on('error', () => {
      console.error(`${label} could not start. Check Docker, Node and the local CLI installation.`);
      stop(1);
    });
    child.on('exit', code => {
      children.delete(child);
      if (!stopping && (code || label !== 'Supabase')) {
        console.error(`${label} exited with status ${code}.`);
        stop(1);
      }
    });
    return child;
  };
  try {
    for (const file of ['coach-billing/index.ts', 'coach-billing-webhook/index.ts']) {
      if (!existsSync(fileURLToPath(new URL(`../../supabase/functions/${file}`, import.meta.url)))) {
        throw new Error('Local billing function sources are missing.');
      }
    }
    const config = ensureBillingEnvironment();
    console.log(`Starting Docker local billing (${config.mode}). API: ${localApiUrl}`);
    console.log('Startup may take a few minutes the first time. Existing Docker data will be preserved.');
    const docker = launch('npx', [...supabaseCli, 'start', '--exclude', 'imgproxy,logflare,vector,supavisor'], repoRoot, 'Supabase', true);
    await new Promise((resolve, reject) => {
      docker.once('exit', code => code === 0 ? resolve() : reject(new Error('Local Supabase startup failed. Inspect Docker Desktop or run the local Supabase CLI for diagnostics.')));
      docker.once('error', reject);
    });
    if (!stopping) {
      launch('npx', [...supabaseCli, 'functions', 'serve', '--env-file', billingEnvFile], repoRoot, 'Billing functions');
      launch(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve', '--configuration', 'local-staging', '--host', '127.0.0.1', '--port', '4200'], appRoot, 'Angular');
      console.log(`Local app: ${localAppUrl}/profile#plan`);
      console.log('First-time setup: follow docs/BILLING_LOCAL.md to apply local migrations and create the test trainer.');
      console.log('Ctrl+C stops the development processes and leaves Supabase Docker data intact.');
    }
  } catch (error) {
    console.error(error.message);
    stop(1);
  }
}
