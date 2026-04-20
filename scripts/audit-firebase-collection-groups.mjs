#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_PROJECT_ID = 'smart-coach-e479b';
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'smart-coach-e479b-firebase-adminsdk-fbsvc-3b96a10fac.json'
);
const DEFAULT_OUTPUT_JSON = path.resolve(
  process.cwd(),
  'docs/migrations/firebase-collection-group-audit.json'
);

const CANDIDATE_COLLECTION_GROUPS = [
  'gyms',
  'gymClients',
  'gymStaff',
  'gym_staff',
  'clientGymMemberships',
  'client_gym_memberships',
  'membershipPlans',
  'membership_plans',
  'payments',
  'competitorSheets',
  'competitor_sheets',
  'clients',
  'coaches',
  'routines',
  'measurements',
  'exercises'
];

function parseArgs(argv) {
  const args = {
    serviceAccount: DEFAULT_SERVICE_ACCOUNT_PATH,
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    output: DEFAULT_OUTPUT_JSON,
    limit: 5
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--service-account') args.serviceAccount = path.resolve(process.cwd(), argv[++i]);
    if (token === '--project-id') args.projectId = argv[++i];
    if (token === '--output') args.output = path.resolve(process.cwd(), argv[++i]);
    if (token === '--limit') args.limit = Number(argv[++i]) || 5;
    if (token === '--help' || token === '-h') {
      console.log('Usage: node scripts/audit-firebase-collection-groups.mjs [--service-account <path>] [--project-id <id>] [--output <path>] [--limit <n>]');
      process.exit(0);
    }
  }

  return args;
}

function createJwtAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
}

async function getGoogleAccessToken(serviceAccount) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createJwtAssertion(serviceAccount)
    })
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data?.error_description || data?.error || 'Could not obtain Google token');
  }
  return data.access_token;
}

async function runAggregationCount(projectId, accessToken, collectionId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runAggregationQuery`;
  const payload = {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }]
      },
      aggregations: [{ alias: 'count', count: {} }]
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: text };
  }

  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {
    return { ok: false, error: `Invalid JSON: ${text}` };
  }

  const result = rows.find((r) => r.result?.aggregateFields?.count?.integerValue)?.result?.aggregateFields?.count?.integerValue;
  return { ok: true, count: Number(result || 0) };
}

async function runSampleQuery(projectId, accessToken, collectionId, limit) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const payload = {
    structuredQuery: {
      from: [{ collectionId, allDescendants: true }],
      limit,
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: text };
  }

  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {
    return { ok: false, error: `Invalid JSON: ${text}` };
  }

  const docs = rows
    .map((r) => r.document?.name)
    .filter(Boolean)
    .map((name) => name.replace(`projects/${projectId}/databases/(default)/documents/`, ''));

  return { ok: true, docs };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.serviceAccount)) {
    throw new Error(`Service account not found: ${args.serviceAccount}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(args.serviceAccount, 'utf8'));
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const results = [];

  for (const collectionId of CANDIDATE_COLLECTION_GROUPS) {
    const [countRes, sampleRes] = await Promise.all([
      runAggregationCount(args.projectId, accessToken, collectionId),
      runSampleQuery(args.projectId, accessToken, collectionId, args.limit)
    ]);

    results.push({
      collection_id: collectionId,
      count_ok: countRes.ok,
      count: countRes.ok ? countRes.count : null,
      count_error: countRes.ok ? null : countRes.error,
      sample_ok: sampleRes.ok,
      sample_paths: sampleRes.ok ? sampleRes.docs : [],
      sample_error: sampleRes.ok ? null : sampleRes.error
    });
  }

  const output = {
    generated_at: new Date().toISOString(),
    firebase_project_id: args.projectId,
    scanned_collection_groups: CANDIDATE_COLLECTION_GROUPS,
    results
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const detected = results.filter((r) => r.count_ok && (r.count || 0) > 0);
  console.log(`Collection-group audit completed. Output: ${args.output}`);
  console.log(`Detected non-empty groups: ${detected.length}`);
  for (const r of detected) {
    console.log(`- ${r.collection_id}: ${r.count}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
