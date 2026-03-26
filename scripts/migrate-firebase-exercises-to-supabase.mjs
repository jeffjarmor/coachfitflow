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
    output: path.resolve(process.cwd(), 'docs/migrations/firebase-exercises-export.json'),
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--service-account') args.serviceAccount = path.resolve(process.cwd(), argv[++i]);
    if (token === '--project-id') args.projectId = argv[++i];
    if (token === '--output') args.output = path.resolve(process.cwd(), argv[++i]);
    if (token === '--dry-run') args.dryRun = true;
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
    throw new Error(data?.error_description || data?.error || 'No se pudo obtener access token de Google');
  }
  return data.access_token;
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

function parseDocId(fullName) {
  const parts = fullName.split('/');
  return parts[parts.length - 1];
}

async function listDocuments(projectId, accessToken, collectionPath) {
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
      const message = data?.error?.message || `Error listando ${collectionPath}`;
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

function normalizeExercise(doc, source, coachId = null) {
  const name = (doc.name || '').trim();
  const muscleGroup = (doc.muscleGroup || doc.muscle_group || '').trim();

  return {
    id: doc.id,
    name,
    muscle_group: muscleGroup,
    source,
    coach_id: coachId,
    image_url: doc.imageUrl || doc.image_url || null,
    video_url: doc.videoUrl || doc.video_url || null,
    description: doc.description || null,
    created_at: doc.createdAt || doc.created_at || new Date().toISOString(),
    updated_at: doc.updatedAt || doc.updated_at || doc.createdAt || doc.created_at || new Date().toISOString()
  };
}

function filterValid(records) {
  const valid = [];
  const invalid = [];

  for (const record of records) {
    if (!record.id || !record.name || !record.muscle_group) {
      invalid.push({ ...record, reason: 'missing_required_fields(id,name,muscle_group)' });
      continue;
    }
    valid.push(record);
  }

  return { valid, invalid };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceAccount = JSON.parse(fs.readFileSync(args.serviceAccount, 'utf8'));
  const accessToken = await getGoogleAccessToken(serviceAccount);

  console.log(`Proyecto Firebase: ${args.projectId}`);
  console.log('Extrayendo exercises_global...');
  const globalDocs = await listDocuments(args.projectId, accessToken, 'exercises_global');

  console.log('Extrayendo coaches...');
  const coachDocs = await listDocuments(args.projectId, accessToken, 'coaches');

  const coachExercises = [];
  for (const coach of coachDocs) {
    const coachId = coach.id;
    const docs = await listDocuments(args.projectId, accessToken, `coaches/${coachId}/exercises`);
    for (const doc of docs) {
      coachExercises.push({ coachId, doc });
    }
  }

  const normalizedGlobal = globalDocs.map((doc) => normalizeExercise(doc, 'global', null));
  const normalizedCoach = coachExercises.map(({ coachId, doc }) => normalizeExercise(doc, 'coach', coachId));
  const all = [...normalizedGlobal, ...normalizedCoach];
  const { valid, invalid } = filterValid(all);

  const report = {
    generated_at: new Date().toISOString(),
    firebase_project_id: args.projectId,
    totals: {
      global_docs: globalDocs.length,
      coaches: coachDocs.length,
      coach_exercises_docs: coachExercises.length,
      normalized: all.length,
      valid: valid.length,
      invalid: invalid.length
    },
    valid,
    invalid
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Export listo: ${args.output}`);
  console.log(`Global: ${globalDocs.length}, Coach: ${coachExercises.length}, Válidos: ${valid.length}, Inválidos: ${invalid.length}`);
  if (args.dryRun) {
    console.log('Dry run completado. No se realizó carga a Supabase.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

