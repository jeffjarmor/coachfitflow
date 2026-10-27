import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildSeedPlan, buildSeedSql, normalizeExerciseName, seedEntries } from './seed-testing-exercise-media.mjs';

const manifest = JSON.parse(await readFile(new URL('../public/assets/exercises/v1/manifest.json', import.meta.url), 'utf8'));
const entries = seedEntries(manifest);
const legacyId = '00000000-0000-0000-0000-000000000000';
const snapshot = (exercises) => ({ exercises, rowsHash: 'a'.repeat(32) });
const oldRow = { id: legacyId, name: entries[0].name, muscle_group: entries[0].muscle_group, source: 'global', coach_id: null, gym_id: null, image_url: null };

test('portable manifest validates 245 unique UUIDs and canonical names', () => {
  assert.equal(entries.length, 245);
  const duplicate = structuredClone(manifest); duplicate.exercises[1] = duplicate.exercises[0];
  assert.throws(() => seedEntries(duplicate), /Duplicate/);
  const wrongFile = structuredClone(manifest); wrongFile.exercises[0].file = '../other.webp';
  assert.throws(() => seedEntries(wrongFile));
  assert.equal(normalizeExerciseName('  Elevación   LATERAL '), 'elevacion lateral');
});

test('name matching keeps legacy UUID and links to canonical image rather than duplicating', () => {
  const plan = buildSeedPlan(entries.slice(0, 2), snapshot([oldRow]));
  assert.deepEqual(plan.matches, [{ id: legacyId, canonical_id: entries[0].id, image_url: '/assets/exercises/v1/' + entries[0].id + '.webp' }]);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].id, entries[1].id);
  assert.equal(plan.summary.imagesToUpdate, 1);
  assert.equal(buildSeedPlan(entries.slice(0, 1), snapshot([{ ...oldRow, image_url: plan.matches[0].image_url }])).summary.imagesToUpdate, 0);
});

test('real images, owned records, duplicate names and UUID collisions abort preflight', () => {
  assert.throws(() => buildSeedPlan(entries, snapshot([{ ...oldRow, image_url: 'https://example.com/real.webp' }])), /overwritten/);
  assert.throws(() => buildSeedPlan(entries, snapshot([{ ...oldRow, coach_id: legacyId }])), /Owned/);
  assert.throws(() => buildSeedPlan(entries, snapshot([oldRow, { ...oldRow, id: '11111111-1111-1111-1111-111111111111' }])), /Duplicate/);
  assert.throws(() => buildSeedPlan(entries, snapshot([{ ...oldRow, id: entries[0].id, source: 'coach', coach_id: legacyId }])), /collision/);
});

test('duplicate canonical names select only an unambiguous matching muscle group', () => {
  const variants = [{ ...entries[0], name: 'Peso Muerto Piernas Rígidas', muscle_group: 'Isquiotibiales' }, { ...entries[1], name: 'Peso Muerto Piernas Rígidas', muscle_group: 'Espalda' }];
  const localRow = { ...oldRow, name: variants[0].name, muscle_group: 'Espalda' };
  const plan = buildSeedPlan(variants, snapshot([localRow]));
  assert.equal(plan.matches[0].canonical_id, variants[1].id);
  assert.equal(plan.matches[0].id, legacyId);
  assert.equal(plan.inserts[0].id, variants[0].id);
  assert.throws(() => buildSeedPlan(variants, snapshot([{ ...localRow, muscle_group: 'Piernas' }])), /Ambiguous/);
});

test('dry-run is read-only and contains no mutation statement', () => {
  const sql = buildSeedSql(buildSeedPlan(entries, snapshot([oldRow])));
  assert.match(sql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /ROLLBACK;\s*$/);
  assert.doesNotMatch(sql, /^\s*(?:INSERT INTO|UPDATE |DELETE FROM|CREATE |DROP |ALTER |TRUNCATE |LOCK TABLE)/m);
});

test('apply updates only image_url and inserts only missing global names', () => {
  const sql = buildSeedSql(buildSeedPlan(entries, snapshot([oldRow])), { apply: true });
  assert.match(sql, /UPDATE public\.exercises e SET image_url=m\.image_url\s+FROM/);
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(sql, /'global', NULL, NULL, NULL, NULL, NULL/);
  assert.match(sql, /fingerprints <> after_fingerprints/);
  assert.match(sql, /WHERE r\.id = ANY\(\$1\)/);
  assert.match(sql, /to_jsonb\(r\)-''image_url''-''updated_at'' ELSE to_jsonb\(r\)/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|CREATE |DROP |ALTER |TRUNCATE )/m);
});

test('SQL quotes catalog names without turning values into commands', () => {
  const plan = buildSeedPlan([{ ...entries[0], name: "L'entraînement" }], snapshot([]));
  assert.ok(buildSeedSql(plan).includes("L''entraînement"));
});
