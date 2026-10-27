import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGlobalExerciseImageUrl, isLegacyExerciseSvgPlaceholder } from '../src/app/shared/global-exercise-media.ts';

const container = 'supabase_db_coachfitflow-original-compat';
const project = 'coachfitflow-original-compat';
const preservedTables = ['exercises', 'routines', 'routine_days', 'routine_day_exercises', 'routine_warmup_exercises', 'routine_week_configs', 'training_sessions', 'training_session_sets'];
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim();
const sqlJson = (value) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
export const normalizeExerciseName = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function seedEntries(manifest) {
  assert.equal(manifest.version, 'v1'); assert.equal(manifest.count, 245); assert.equal(manifest.exercises.length, 245);
  const ids = new Set(); const names = new Set();
  return manifest.exercises.map(({ id, name, muscleGroup, file }) => {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(!ids.has(id), 'Duplicate manifest UUID'); ids.add(id);
    assert.ok(typeof name === 'string' && name.trim(), 'Missing exercise name');
    assert.ok(typeof muscleGroup === 'string' && muscleGroup.trim(), 'Missing muscle group');
    const variant = normalizeExerciseName(name) + '\0' + normalizeExerciseName(muscleGroup);
    assert.ok(!names.has(variant), 'Duplicate normalized manifest name/group'); names.add(variant);
    assert.equal(file, id + '.webp');
    return { id, name, muscle_group: muscleGroup };
  });
}

export function buildSeedPlan(entries, snapshot) {
  const byId = new Map(snapshot.exercises.map((row) => [row.id, row]));
  const globalsByName = new Map(); const canonicalByName = new Map();
  for (const row of snapshot.exercises.filter((row) => row.source === 'global')) {
    const key = normalizeExerciseName(row.name);
    globalsByName.set(key, [...(globalsByName.get(key) || []), row]);
  }
  for (const entry of entries) { const key = normalizeExerciseName(entry.name); canonicalByName.set(key, [...(canonicalByName.get(key) || []), entry]); }
  const matches = []; const inserts = []; let groupDifferences = 0; let updatesNeeded = 0;
  const link = (row, entry) => {
    const collision = byId.get(entry.id);
    assert.ok(!collision || (collision.source === 'global' && !collision.coach_id && !collision.gym_id && collision.id === row?.id), 'Canonical UUID collision: ' + entry.id);
    if (!row) { inserts.push(entry); return; }
    assert.ok(!row.coach_id && !row.gym_id, 'Owned exercise cannot receive global media: ' + row.id);
    const previous = row.image_url?.trim() || '';
    assert.ok(!previous || isLegacyExerciseSvgPlaceholder(previous) || isGlobalExerciseImageUrl(previous), 'Real/custom image would be overwritten: ' + row.id);
    const image_url = '/assets/exercises/v1/' + entry.id + '.webp';
    matches.push({ id: row.id, image_url, canonical_id: entry.id });
    if (row.image_url !== image_url) updatesNeeded++;
    if (normalizeExerciseName(row.muscle_group) !== normalizeExerciseName(entry.muscle_group)) groupDifferences++;
  };
  for (const [name, candidates] of canonicalByName) {
    const localRows = globalsByName.get(name) || [];
    if (candidates.length === 1) {
      assert.ok(localRows.length <= 1, 'Duplicate normalized local global name: ' + name);
      link(localRows[0], candidates[0]); continue;
    }
    const used = new Set();
    for (const row of localRows) {
      const variants = candidates.filter((entry) => normalizeExerciseName(entry.muscle_group) === normalizeExerciseName(row.muscle_group));
      assert.ok(variants.length === 1 && !used.has(variants[0].id), 'Ambiguous name/group variant: ' + name);
      used.add(variants[0].id); link(row, variants[0]);
    }
    for (const candidate of candidates.filter((entry) => !used.has(entry.id))) link(undefined, candidate);
  }
  assert.match(snapshot.rowsHash, /^[0-9a-f]{32}$/);
  return { matches, inserts, baselineHash: snapshot.rowsHash, summary: { manifestCount: entries.length, existingExercises: snapshot.exercises.length, matchedByName: matches.length, imagesToUpdate: updatesNeeded, toInsert: inserts.length, untouchedGlobalExtras: snapshot.exercises.filter((row) => row.source === 'global').length - matches.length, groupDifferences } };
}

export async function validateLocalTarget() {
  const config = await readFile(path.join(homedir(), '.local/share/coachfitflow-testing/original-compat/supabase/config.toml'), 'utf8');
  assert.match(config, /^project_id\s*=\s*"coachfitflow-original-compat"\s*$/m, 'Unexpected local project');
  const section = (name) => config.match(new RegExp('^\\[' + name + '\\]([^]*?)(?=^\\[|$(?![^]))', 'm'))?.[1] || '';
  assert.match(section('api'), /^port\s*=\s*55321\s*$/m, 'Unexpected local API port');
  assert.match(section('db'), /^port\s*=\s*55322\s*$/m, 'Unexpected local DB port');
  assert.ok(!process.env.DOCKER_HOST || process.env.DOCKER_HOST.startsWith('unix://'), 'Only a local Docker socket is allowed');
  assert.match(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), /^unix:\/\//, 'Docker context must use a local socket');
  const fields = docker(['inspect', '--format', '{{.Name}}\n{{.State.Running}}\n{{index .Config.Labels "com.supabase.cli.project"}}\n{{.Config.Image}}\n{{json (index .NetworkSettings.Ports "5432/tcp")}}', container]).split('\n');
  assert.equal(fields[0], '/' + container); assert.equal(fields[1], 'true'); assert.equal(fields[2], project);
  assert.match(fields[3], /^(?:public\.ecr\.aws\/)?supabase\/postgres:/, 'Unexpected container image');
  assert.ok(JSON.parse(fields[4]).some((port) => port.HostPort === '55322'), 'Unexpected container DB port');
}

export function buildSeedSql(plan, { apply = false } = {}) {
  const tables = 'ARRAY[' + preservedTables.map((name) => "'" + name + "'").join(',') + ']';
  const locks = apply ? 'LOCK TABLE public.exercises IN SHARE ROW EXCLUSIVE MODE;\nLOCK TABLE ' + preservedTables.slice(1).map((name) => 'public.' + name).join(', ') + ' IN SHARE MODE;' : '';
  return `BEGIN ISOLATION LEVEL REPEATABLE READ${apply ? '' : ' READ ONLY'};
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';
${locks}
DO $seed$
DECLARE
  matches jsonb := ${sqlJson(plan.matches)}; inserts jsonb := ${sqlJson(plan.inserts)};
  original_ids uuid[]; target_ids uuid[]; original_count bigint; total_count bigint; full_hash text;
  fingerprints jsonb := '{}'::jsonb; after_fingerprints jsonb := '{}'::jsonb;
  table_name text; fingerprint jsonb; row_filter text; row_value text; pass integer;
  inserted_count bigint := 0; updated_count bigint := 0;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[]), count(*), md5(coalesce(string_agg(md5(to_jsonb(e)::text), '' ORDER BY id), '')) INTO original_ids, original_count, full_hash FROM public.exercises e;
  IF full_hash <> '${plan.baselineHash}' THEN RAISE EXCEPTION 'Local exercises changed after preflight; retry dry-run'; END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO target_ids FROM jsonb_to_recordset(matches) AS m(id uuid);
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(matches) AS m(id uuid) LEFT JOIN public.exercises e ON e.id=m.id WHERE e.id IS NULL OR e.source::text <> 'global' OR e.coach_id IS NOT NULL OR e.gym_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM jsonb_to_recordset(inserts) AS p(id uuid) JOIN public.exercises e ON e.id=p.id) THEN
    RAISE EXCEPTION 'Invalid local match or canonical UUID collision; no changes allowed';
  END IF;
  FOR pass IN 1..2 LOOP
    FOREACH table_name IN ARRAY ${tables} LOOP
      row_filter := CASE WHEN table_name='exercises' THEN ' WHERE r.id = ANY($1)' ELSE '' END;
      row_value := CASE WHEN table_name='exercises' THEN 'CASE WHEN r.id=ANY($2) THEN to_jsonb(r)-''image_url''-''updated_at'' ELSE to_jsonb(r) END' ELSE 'to_jsonb(r)' END;
      EXECUTE format('SELECT jsonb_build_object(''count'', count(*), ''rowsHash'', md5(coalesce(string_agg(md5((%s)::text), '''' ORDER BY r.id), ''''))) FROM public.%I r%s', row_value, table_name, row_filter) INTO fingerprint USING original_ids, target_ids;
      IF pass=1 THEN fingerprints := fingerprints || jsonb_build_object(table_name, fingerprint);
      ELSE after_fingerprints := after_fingerprints || jsonb_build_object(table_name, fingerprint); END IF;
    END LOOP;
    IF pass=1 THEN
      ${apply ? `UPDATE public.exercises e SET image_url=m.image_url
      FROM jsonb_to_recordset(matches) AS m(id uuid, image_url text)
      WHERE e.id=m.id AND e.image_url IS DISTINCT FROM m.image_url;
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      INSERT INTO public.exercises (id, name, muscle_group, source, coach_id, gym_id, image_url, video_url, description)
      SELECT p.id, p.name, p.muscle_group, 'global', NULL, NULL, NULL, NULL, NULL
      FROM jsonb_to_recordset(inserts) AS p(id uuid, name text, muscle_group text)
      WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id=p.id)
      ON CONFLICT (id) DO NOTHING;
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
      IF inserted_count <> jsonb_array_length(inserts) OR updated_count <> ${plan.summary.imagesToUpdate} THEN RAISE EXCEPTION 'Unexpected mutation count; rolling back'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_to_recordset(matches) AS m(id uuid, image_url text) JOIN public.exercises e ON e.id=m.id WHERE e.image_url IS DISTINCT FROM m.image_url) THEN RAISE EXCEPTION 'Image link verification failed'; END IF;` : '-- Dry-run: no data mutation.'}
    END IF;
  END LOOP;
  IF fingerprints <> after_fingerprints THEN RAISE EXCEPTION 'Existing fields or related rows changed; rolling back'; END IF;
  SELECT count(*) INTO total_count FROM public.exercises;
  IF total_count <> original_count + inserted_count THEN RAISE EXCEPTION 'Unexpected exercise count; rolling back'; END IF;
  PERFORM set_config('zummith.media_seed_report', (${sqlJson(plan.summary)} || jsonb_build_object('mode', '${apply ? 'apply' : 'dry-run'}', 'inserted', inserted_count, 'updatedImageUrls', updated_count, 'totalExercises', total_count, 'existingFieldsAndRelationsPreserved', true, 'fingerprints', fingerprints))::text, true);
END $seed$;
SELECT current_setting('zummith.media_seed_report');
${apply ? 'COMMIT' : 'ROLLBACK'};
`;
}

export async function runSeed({ apply = false } = {}) {
  const manifest = JSON.parse(await readFile(new URL('../public/assets/exercises/v1/manifest.json', import.meta.url), 'utf8'));
  const entries = seedEntries(manifest);
  await validateLocalTarget();
  const psql = (sql) => docker(['exec', '-i', container, 'psql', '-X', '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', '-'], sql);
  const snapshot = JSON.parse(psql("BEGIN READ ONLY; SELECT jsonb_build_object('exercises', coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'muscle_group',muscle_group,'source',source,'coach_id',coach_id,'gym_id',gym_id,'image_url',image_url) ORDER BY id), '[]'::jsonb), 'rowsHash', md5(coalesce(string_agg(md5(to_jsonb(e)::text), '' ORDER BY id), ''))) FROM public.exercises e; ROLLBACK;"));
  const plan = buildSeedPlan(entries, snapshot);
  return JSON.parse(psql(buildSeedSql(plan, { apply })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node --experimental-strip-types scripts/seed-testing-exercise-media.mjs [--apply]\nDefault: read-only dry-run against local original-compat only.\n--apply: link matching global names through image_url and insert only missing names.\nExisting UUIDs, routine references, descriptions, videos and other fields are preserved.');
  } else {
    assert.ok(args.every((arg) => arg === '--apply'), 'Only --apply or --help is supported');
    console.log(JSON.stringify(await runSeed({ apply: args.includes('--apply') }), null, 2));
  }
}
