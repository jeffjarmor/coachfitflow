#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_PROJECT_ID = 'smart-coach-e479b';
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'smart-coach-e479b-firebase-adminsdk-fbsvc-3b96a10fac.json'
);

function parseArgs(argv) {
  const args = {
    serviceAccount: DEFAULT_SERVICE_ACCOUNT_PATH,
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    output: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--service-account') args.serviceAccount = path.resolve(process.cwd(), argv[++i]);
    if (token === '--project-id') args.projectId = argv[++i];
    if (token === '--output') args.output = path.resolve(process.cwd(), argv[++i]);
    if (token === '--help' || token === '-h') {
      console.log('Usage: node scripts/firebase-coach-workload.mjs [--service-account <path>] [--project-id <id>] [--output <path>]');
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
    throw new Error(data?.error_description || data?.error || 'Failed to obtain Google access token');
  }
  return data.access_token;
}

function parseDocId(fullName) {
  const parts = fullName.split('/');
  return parts[parts.length - 1];
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return !!value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('referenceValue' in value) return value.referenceValue;
  return null;
}

function fromFirestoreFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = fromFirestoreValue(value);
  }
  return out;
}

async function listFirestoreDocuments(projectId, accessToken, collectionPath) {
  const all = [];
  let pageToken = '';

  do {
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}`;
    const url = new URL(baseUrl);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();

    if (!res.ok) {
      const message = data?.error?.message || `Error listing ${collectionPath}`;
      throw new Error(message);
    }

    for (const doc of data.documents || []) {
      all.push({
        id: parseDocId(doc.name),
        path: doc.name,
        ...fromFirestoreFields(doc.fields || {})
      });
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return all;
}

function addCount(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceAccount = JSON.parse(fs.readFileSync(args.serviceAccount, 'utf8'));
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const coaches = await listFirestoreDocuments(args.projectId, accessToken, 'coaches');

  const clientsByCoach = new Map();
  const routinesByCoach = new Map();
  const measurementsByCoach = new Map();
  let totalClients = 0;
  let totalRoutines = 0;
  let totalMeasurements = 0;

  for (const coach of coaches) {
    const coachId = coach.id;
    const coachClients = await listFirestoreDocuments(
      args.projectId,
      accessToken,
      `coaches/${coachId}/clients`
    ).catch(() => []);
    const coachRoutines = await listFirestoreDocuments(
      args.projectId,
      accessToken,
      `coaches/${coachId}/routines`
    ).catch(() => []);

    addCount(clientsByCoach, coachId, coachClients.length);
    addCount(routinesByCoach, coachId, coachRoutines.length);
    totalClients += coachClients.length;
    totalRoutines += coachRoutines.length;

    for (const client of coachClients) {
      const clientMeasurements = await listFirestoreDocuments(
        args.projectId,
        accessToken,
        `coaches/${coachId}/clients/${client.id}/measurements`
      ).catch(() => []);
      addCount(measurementsByCoach, coachId, clientMeasurements.length);
      totalMeasurements += clientMeasurements.length;
    }
  }

  const rows = coaches
    .map((coach) => {
      const clientsCount = clientsByCoach.get(coach.id) || 0;
      const routinesCount = routinesByCoach.get(coach.id) || 0;
      const measurementsCount = measurementsByCoach.get(coach.id) || 0;
      return {
        coach_uid: coach.id,
        email: coach.email || null,
        name: coach.name || null,
        role: coach.role || null,
        account_type: coach.accountType || null,
        clients_count: clientsCount,
        routines_count: routinesCount,
        measurements_count: measurementsCount,
        workload_score: clientsCount + routinesCount + measurementsCount
      };
    })
    .sort((a, b) => b.workload_score - a.workload_score || a.coach_uid.localeCompare(b.coach_uid));

  const output = {
    generated_at: new Date().toISOString(),
    firebase_project_id: args.projectId,
    totals: {
      coaches: coaches.length,
      clients: totalClients,
      routines: totalRoutines,
      measurements: totalMeasurements
    },
    coaches: rows
  };

  if (args.output) {
    fs.writeFileSync(args.output, JSON.stringify(output, null, 2));
    console.log(`Saved: ${args.output}`);
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
