#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_PROJECT_ID = 'smart-coach-e479b';
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(
  process.cwd(),
  'smart-coach-e479b-firebase-adminsdk-fbsvc-3b96a10fac.json'
);
const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  'docs/migrations/phase1-identity-audit.json'
);
const DEFAULT_SUPABASE_URL = 'https://bzhqprxolseyxuuwodqs.supabase.co';

function parseArgs(argv) {
  const args = {
    serviceAccount: DEFAULT_SERVICE_ACCOUNT_PATH,
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    output: DEFAULT_OUTPUT_PATH,
    includeSupabase: true,
    supabaseUrl: process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      '',
    dryRun: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--service-account') args.serviceAccount = path.resolve(process.cwd(), argv[++i]);
    if (token === '--project-id') args.projectId = argv[++i];
    if (token === '--output') args.output = path.resolve(process.cwd(), argv[++i]);
    if (token === '--supabase-url') args.supabaseUrl = argv[++i];
    if (token === '--supabase-key') args.supabaseKey = argv[++i];
    if (token === '--no-supabase') args.includeSupabase = false;
    if (token === '--with-supabase') args.includeSupabase = true;
    if (token === '--not-dry-run') args.dryRun = false;
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/audit-firebase-supabase-identity-phase1.mjs [opciones]

Opciones:
  --service-account <path>   Ruta al JSON de service account Firebase
  --project-id <id>          Firebase project id
  --output <path>            Archivo JSON de salida del reporte
  --no-supabase              Solo audita Firebase (sin contraste Supabase)
  --with-supabase            Fuerza contraste con Supabase
  --supabase-url <url>       URL base de Supabase (https://xxx.supabase.co)
  --supabase-key <key>       Key de Supabase (ideal: service role)
  --help, -h                 Muestra esta ayuda

Notas:
  - Este script NO escribe datos en Firebase ni en Supabase.
  - Solo hace lectura y genera un reporte local.
`);
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

function normalizeEmail(value) {
  return (value || '').toString().trim().toLowerCase();
}

function indexByEmail(rows) {
  const map = new Map();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) continue;
    if (!map.has(email)) map.set(email, []);
    map.get(email).push(row);
  }
  return map;
}

function setToArray(value) {
  return Array.from(value || []).sort((a, b) => a.localeCompare(b));
}

async function fetchSupabaseTable({ baseUrl, apiKey, table, select, pageSize = 1000 }) {
  const rows = [];
  let start = 0;

  while (true) {
    const end = start + pageSize - 1;
    const url = `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    const res = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Range: `${start}-${end}`,
        Prefer: 'count=exact'
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[Supabase:${table}] ${res.status} ${text}`);
    }

    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }

  return rows;
}

async function auditFirebaseIdentities(args) {
  const serviceAccount = JSON.parse(fs.readFileSync(args.serviceAccount, 'utf8'));
  const accessToken = await getGoogleAccessToken(serviceAccount);

  const [coaches, gyms] = await Promise.all([
    listFirestoreDocuments(args.projectId, accessToken, 'coaches'),
    listFirestoreDocuments(args.projectId, accessToken, 'gyms')
  ]);

  const gymStaffAssignments = [];
  const ownerIds = new Set();

  for (const gym of gyms) {
    if (gym.ownerId) ownerIds.add(gym.ownerId);
    const staffDocs = await listFirestoreDocuments(args.projectId, accessToken, `gyms/${gym.id}/coaches`);
    for (const staff of staffDocs) {
      gymStaffAssignments.push({
        gymId: gym.id,
        coachId: staff.id,
        role: staff.role || null,
        canEditClients: typeof staff.canEditClients === 'boolean' ? staff.canEditClients : null,
        canCreateRoutines: typeof staff.canCreateRoutines === 'boolean' ? staff.canCreateRoutines : null,
        canViewPayments: typeof staff.canViewPayments === 'boolean' ? staff.canViewPayments : null,
        canManageStaff: typeof staff.canManageStaff === 'boolean' ? staff.canManageStaff : null
      });
    }
  }

  const uidSources = new Map();
  for (const coach of coaches) {
    uidSources.set(coach.id, new Set(['coaches_collection']));
  }
  for (const ownerId of ownerIds) {
    if (!uidSources.has(ownerId)) uidSources.set(ownerId, new Set());
    uidSources.get(ownerId).add('gym_owner_id');
  }
  for (const assignment of gymStaffAssignments) {
    if (!uidSources.has(assignment.coachId)) uidSources.set(assignment.coachId, new Set());
    uidSources.get(assignment.coachId).add('gym_staff_subcollection');
  }

  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const identities = setToArray(uidSources.keys()).map((uid) => {
    const coachDoc = coachById.get(uid);
    return {
      firebase_uid: uid,
      email: coachDoc?.email || null,
      name: coachDoc?.name || null,
      role: coachDoc?.role || null,
      accountType: coachDoc?.accountType || null,
      sources: setToArray(uidSources.get(uid))
    };
  });

  return {
    metadata: {
      firebase_project_id: args.projectId,
      generated_at: new Date().toISOString(),
      service_account_email: serviceAccount.client_email
    },
    coaches_collection: coaches,
    gyms_collection: gyms,
    gym_staff_subcollections: gymStaffAssignments,
    owner_ids: setToArray(ownerIds),
    identities
  };
}

function buildIdentityComparison(firebaseIdentities, supabaseCoaches) {
  const firebaseRows = firebaseIdentities.identities;
  const firebaseByEmail = indexByEmail(firebaseRows);
  const supabaseByEmail = indexByEmail(supabaseCoaches);

  const mappingCandidates = [];
  const missingInSupabase = [];
  const ambiguousByEmail = [];

  for (const fb of firebaseRows) {
    const email = normalizeEmail(fb.email);
    if (!email) {
      missingInSupabase.push({
        firebase_uid: fb.firebase_uid,
        reason: 'firebase_coach_without_email',
        firebase_name: fb.name || null
      });
      continue;
    }

    const fbSameEmail = firebaseByEmail.get(email) || [];
    const sbSameEmail = supabaseByEmail.get(email) || [];

    if (fbSameEmail.length > 1 || sbSameEmail.length > 1) {
      ambiguousByEmail.push({
        email,
        firebase_uids: fbSameEmail.map((r) => r.firebase_uid),
        supabase_ids: sbSameEmail.map((r) => r.id)
      });
      continue;
    }

    if (sbSameEmail.length === 0) {
      missingInSupabase.push({
        firebase_uid: fb.firebase_uid,
        email,
        reason: 'no_supabase_coach_with_same_email'
      });
      continue;
    }

    mappingCandidates.push({
      firebase_uid: fb.firebase_uid,
      supabase_coach_id: sbSameEmail[0].id,
      email
    });
  }

  const firebaseEmails = new Set(firebaseRows.map((r) => normalizeEmail(r.email)).filter(Boolean));
  const extraInSupabase = supabaseCoaches
    .filter((r) => {
      const email = normalizeEmail(r.email);
      return !!email && !firebaseEmails.has(email);
    })
    .map((r) => ({
      supabase_coach_id: r.id,
      email: r.email,
      role: r.role || null
    }));

  return {
    summary: {
      firebase_identity_count: firebaseRows.length,
      supabase_coach_count: supabaseCoaches.length,
      mapping_candidates_by_email: mappingCandidates.length,
      ambiguous_by_email: ambiguousByEmail.length,
      missing_in_supabase: missingInSupabase.length,
      extra_in_supabase: extraInSupabase.length
    },
    mapping_candidates_by_email: mappingCandidates,
    ambiguous_by_email: ambiguousByEmail,
    missing_in_supabase: missingInSupabase,
    extra_in_supabase: extraInSupabase
  };
}

async function loadSupabaseAudit(args) {
  if (!args.includeSupabase) {
    return {
      enabled: false,
      reason: 'Supabase comparison disabled by flag --no-supabase'
    };
  }

  if (!args.supabaseKey) {
    return {
      enabled: false,
      reason: 'Missing SUPABASE_SERVICE_ROLE_KEY or --supabase-key'
    };
  }

  const baseUrl = args.supabaseUrl.replace(/\/$/, '');

  const [coaches, gyms, gymStaff] = await Promise.all([
    fetchSupabaseTable({
      baseUrl,
      apiKey: args.supabaseKey,
      table: 'coaches',
      select: 'id,email,name,role,account_type'
    }),
    fetchSupabaseTable({
      baseUrl,
      apiKey: args.supabaseKey,
      table: 'gyms',
      select: 'id,name,owner_id,access_code'
    }),
    fetchSupabaseTable({
      baseUrl,
      apiKey: args.supabaseKey,
      table: 'gym_staff',
      select: 'id,gym_id,coach_id,role,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff,joined_at'
    })
  ]);

  return {
    enabled: true,
    url: baseUrl,
    coaches,
    gyms,
    gym_staff: gymStaff
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const firebase = await auditFirebaseIdentities(args);
  const supabase = await loadSupabaseAudit(args);

  const report = {
    mode: args.dryRun ? 'dry-run' : 'read-only',
    firebase,
    supabase
  };

  if (supabase.enabled) {
    report.identity_comparison = buildIdentityComparison(firebase, supabase.coaches);
  } else {
    report.identity_comparison = {
      summary: {
        skipped: true
      },
      reason: supabase.reason
    };
  }

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(report, null, 2), 'utf8');

  console.log('Phase 1 audit completed.');
  console.log(`Report: ${args.output}`);
  console.log(`Firebase identities detected: ${firebase.identities.length}`);
  if (supabase.enabled) {
    console.log(`Supabase coaches detected: ${supabase.coaches.length}`);
    console.log(`Mapping candidates by email: ${report.identity_comparison.summary.mapping_candidates_by_email}`);
  } else {
    console.log(`Supabase comparison skipped: ${supabase.reason}`);
  }
  console.log('No writes performed in Firebase or Supabase.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
