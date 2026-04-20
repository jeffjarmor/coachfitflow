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
    coachUid: '',
    output: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--service-account') args.serviceAccount = path.resolve(process.cwd(), argv[++i]);
    if (token === '--project-id') args.projectId = argv[++i];
    if (token === '--coach-uid') args.coachUid = argv[++i];
    if (token === '--output') args.output = path.resolve(process.cwd(), argv[++i]);
    if (token === '--help' || token === '-h') {
      console.log(
        'Usage: node scripts/build-phase2-coach-slice-from-firebase.mjs --coach-uid <uid> [--service-account <path>] [--project-id <id>] [--output <path>]'
      );
      process.exit(0);
    }
  }

  if (!args.coachUid) {
    throw new Error('Missing required --coach-uid');
  }

  if (!args.output) {
    args.output = path.resolve(
      process.cwd(),
      `docs/migrations/phase2-coach-slice-${args.coachUid}.json`
    );
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

function normalizeSource(source) {
  return String(source || 'global').toLowerCase() === 'coach' ? 'coach' : 'global';
}

function buildReferencedExercises(selectedRoutines, daysByRoutine) {
  const byId = new Map();

  const upsert = (id, payload) => {
    if (!id) return;
    if (!byId.has(id)) {
      byId.set(id, {
        firebase_exercise_id: id,
        name: payload.name || `Exercise ${id.slice(0, 6)}`,
        muscle_group: payload.muscle_group || 'General',
        source: normalizeSource(payload.source),
        video_url: payload.video_url || null,
        image_url: payload.image_url || null
      });
      return;
    }

    const current = byId.get(id);
    if (!current.video_url && payload.video_url) current.video_url = payload.video_url;
    if (!current.image_url && payload.image_url) current.image_url = payload.image_url;
    if (current.muscle_group === 'General' && payload.muscle_group) current.muscle_group = payload.muscle_group;
  };

  for (const routine of selectedRoutines) {
    for (const cardio of routine?.warmup?.cardioExercises || []) {
      upsert(cardio.exerciseId, {
        name: cardio.exerciseName,
        muscle_group: 'Cardio',
        source: 'global',
        video_url: null,
        image_url: null
      });
    }

    for (const day of daysByRoutine[routine.id] || []) {
      for (const ex of day?.exercises || []) {
        upsert(ex.exerciseId, {
          name: ex.exerciseName,
          muscle_group: ex.muscleGroup || 'General',
          source: normalizeSource(ex.exerciseSource),
          video_url: ex.videoUrl || null,
          image_url: ex.imageUrl || null
        });
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.firebase_exercise_id.localeCompare(b.firebase_exercise_id)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const serviceAccount = JSON.parse(fs.readFileSync(args.serviceAccount, 'utf8'));
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const clientsPath = `coaches/${args.coachUid}/clients`;
  const routinesPath = `coaches/${args.coachUid}/routines`;

  const [selectedClients, selectedRoutines] = await Promise.all([
    listFirestoreDocuments(args.projectId, accessToken, clientsPath),
    listFirestoreDocuments(args.projectId, accessToken, routinesPath)
  ]);

  const daysByRoutine = {};
  for (const routine of selectedRoutines) {
    const daysPath = `coaches/${args.coachUid}/routines/${routine.id}/days`;
    const days = await listFirestoreDocuments(args.projectId, accessToken, daysPath).catch(() => []);
    days.sort((a, b) => Number(a.dayNumber || 0) - Number(b.dayNumber || 0));
    daysByRoutine[routine.id] = days;
  }

  const measurementsByClient = {};
  for (const client of selectedClients) {
    const measurementsPath = `coaches/${args.coachUid}/clients/${client.id}/measurements`;
    const measurements = await listFirestoreDocuments(args.projectId, accessToken, measurementsPath).catch(() => []);
    measurements.sort((a, b) => {
      const aTime = new Date(a.date || a.createdAt || 0).getTime();
      const bTime = new Date(b.date || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    measurementsByClient[client.id] = measurements;
  }

  const referencedExercises = buildReferencedExercises(selectedRoutines, daysByRoutine);

  const output = {
    generated_at: new Date().toISOString(),
    firebase_project_id: args.projectId,
    coach_uid: args.coachUid,
    selected_clients: selectedClients,
    selected_routines: selectedRoutines,
    days_by_routine: daysByRoutine,
    measurements_by_client: measurementsByClient,
    referenced_exercises: referencedExercises
  };

  fs.writeFileSync(args.output, JSON.stringify(output, null, 2));

  console.log(`Saved: ${args.output}`);
  console.log(
    JSON.stringify(
      {
        coach_uid: args.coachUid,
        clients: selectedClients.length,
        routines: selectedRoutines.length,
        routine_days: Object.values(daysByRoutine).reduce((acc, arr) => acc + arr.length, 0),
        measurements: Object.values(measurementsByClient).reduce((acc, arr) => acc + arr.length, 0),
        referenced_exercises: referencedExercises.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
