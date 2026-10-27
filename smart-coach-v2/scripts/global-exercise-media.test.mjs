import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GLOBAL_EXERCISE_MEDIA_IDS } from '../src/app/shared/global-exercise-media.manifest.mjs';
import { getGlobalExerciseImage, isGlobalExerciseImageUrl, isLegacyExerciseSvgPlaceholder, isUsableExerciseImageUrl, resolveGlobalExerciseImage } from '../src/app/shared/global-exercise-media.ts';
import { inspectAnimatedWebp, verifyShippedMedia } from './sync-global-exercise-media.mjs';

const id = GLOBAL_EXERCISE_MEDIA_IDS[0];
const secondId = GLOBAL_EXERCISE_MEDIA_IDS[1];
const unknownId = '00000000-0000-0000-0000-000000000000';
const expectedUrl = '/assets/exercises/v1/' + id + '.webp';
const legacySvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fee2e2"/><text x="50" y="50" font-family="Arial" font-size="60" text-anchor="middle" dy=".35em">🏋️</text></svg>';
const svgData = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

test('all 245 shipped assets, deterministic manifests and helper are internally complete and valid', async () => {
  assert.equal(GLOBAL_EXERCISE_MEDIA_IDS.length, 245);
  assert.equal(new Set(GLOBAL_EXERCISE_MEDIA_IDS).size, 245);
  assert.ok(Object.isFrozen(GLOBAL_EXERCISE_MEDIA_IDS));
  const result = await verifyShippedMedia();
  assert.equal(result.count, 245);
  const manifest = JSON.parse(await readFile(new URL('../public/assets/exercises/v1/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.exercises.map((item) => item.id), [...GLOBAL_EXERCISE_MEDIA_IDS]);
  assert.equal(manifest.exercises.filter((item) => item.frames === 3).length, 225);
  assert.equal(manifest.exercises.filter((item) => item.frames === 6).length, 20);
});

test('known exercise UUIDs resolve and unknown, missing or altered UUIDs do not', () => {
  for (const knownId of GLOBAL_EXERCISE_MEDIA_IDS) assert.equal(getGlobalExerciseImage(knownId), '/assets/exercises/v1/' + knownId + '.webp');
  for (const invalidId of [null, undefined, '', unknownId, '../' + id, id.toUpperCase(), ' ' + id]) assert.equal(getGlobalExerciseImage(invalidId), null);
});

test('global media URL recognition accepts only an exact path with a shipped UUID', () => {
  assert.equal(isGlobalExerciseImageUrl(expectedUrl), true);
  for (const url of [null, undefined, '', '/assets/exercises/v1/' + unknownId + '.webp', expectedUrl + '?v=1', 'https://example.com' + expectedUrl, ' ' + expectedUrl, expectedUrl.toUpperCase(), expectedUrl.replace('/v1/', '/v2/')]) assert.equal(isGlobalExerciseImageUrl(url), false);
});

test('explicit non-global sources never use global exercise media', () => {
  for (const source of ['custom', 'coach', 'gym', '', 'GLOBAL']) {
    assert.equal(getGlobalExerciseImage(id, source), null);
    assert.equal(resolveGlobalExerciseImage({ id, source, imageUrl: 'https://example.com/custom.webp' }), null);
  }
  for (const source of [undefined, null, 'global']) assert.equal(getGlobalExerciseImage(id, source), expectedUrl);
});

test('assignments resolve by exerciseId rather than their assignment UUID', () => {
  assert.equal(resolveGlobalExerciseImage({ id: unknownId, exerciseId: id, source: 'global' }), expectedUrl);
  assert.equal(resolveGlobalExerciseImage({ id: secondId, exerciseId: id }), expectedUrl);
  assert.equal(resolveGlobalExerciseImage({ id, exerciseId: unknownId }), null);
  assert.equal(resolveGlobalExerciseImage({ id, exerciseId: '' }), null);
  assert.equal(resolveGlobalExerciseImage({ id: unknownId }), null);
  assert.equal(resolveGlobalExerciseImage({}), null);
});

test('real overrides remain available for known global exercises', () => {
  const urls = ['https://example.com/custom.webp?version=2', 'http://localhost:4300/upload.png', '/uploads/exercise.webp', 'blob:https://example.com/00000000-0000-0000-0000-000000000000', 'data:image/png;base64,iVBORw0KGgo='];
  for (const imageUrl of urls) {
    assert.equal(isUsableExerciseImageUrl(imageUrl), true, imageUrl);
    assert.equal(resolveGlobalExerciseImage({ id, imageUrl }), imageUrl);
  }
  assert.equal(resolveGlobalExerciseImage({ id, imageUrl: '  https://example.com/custom.webp  ' }), 'https://example.com/custom.webp');
  assert.equal(resolveGlobalExerciseImage({ id: unknownId, imageUrl: urls[0] }), null);
});

test('blank, unsupported or malformed overrides fall back to the packaged exercise', () => {
  for (const imageUrl of [null, undefined, '', '  ', 'not an image URL', 'javascript:alert(1)', '//example.com/image.webp', 'data:text/html,hello', 'data:image/png;base64,@@@', 'data:image/svg+xml;base64,@@@', 'https://', 'https:example.com/image.webp', '/\\example.com/image.webp']) {
    assert.equal(isUsableExerciseImageUrl(imageUrl), false, String(imageUrl));
    assert.equal(resolveGlobalExerciseImage({ id, imageUrl }), expectedUrl);
  }
});

test('the exact legacy SVG emoji seed is replaced in base64 and URL-encoded forms', () => {
  for (const imageUrl of [svgData(legacySvg), svgData(legacySvg.replace('🏋️', '🇹🇷')), 'data:image/svg+xml,' + encodeURIComponent(legacySvg), 'data:image/svg+xml;charset=utf-8;base64,' + Buffer.from(legacySvg).toString('base64')]) {
    assert.equal(isLegacyExerciseSvgPlaceholder(imageUrl), true);
    assert.equal(isUsableExerciseImageUrl(imageUrl), false);
    assert.equal(resolveGlobalExerciseImage({ id, imageUrl }), expectedUrl);
  }
});

test('custom SVG artwork and textual SVG labels remain valid overrides', () => {
  const customSvgs = [
    '<svg viewBox="0 0 100 100"><path d="M0 0h100v100z"/><text>🏋️</text></svg>',
    '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>',
    legacySvg.replace('🏋️', 'AB'),
    legacySvg.replace('🏋️', 'Coach 🏋️'),
    '<?xml version="1.0"?><svg viewBox="0 0 100 100"><path d="M0 0h10"/></svg>'
  ];
  for (const svg of customSvgs) {
    const imageUrl = svgData(svg);
    assert.equal(isLegacyExerciseSvgPlaceholder(imageUrl), false);
    assert.equal(resolveGlobalExerciseImage({ id, imageUrl }), imageUrl);
    assert.equal(resolveGlobalExerciseImage({ id, source: 'custom', imageUrl }), null);
  }
});

// Optional one-off regression against an existing read-only production snapshot.
// Default CI/tests never require output/, credentials, or a database connection.
test('optional production snapshot resolves global seed placeholders and excludes coach media', { skip: !process.env.EXERCISE_MEDIA_PRODUCTION_SNAPSHOT }, async () => {
  const snapshot = JSON.parse(await readFile(process.env.EXERCISE_MEDIA_PRODUCTION_SNAPSHOT, 'utf8'));
  const globalExercises = snapshot.exercises.filter((exercise) => exercise.source === 'global');
  const coachExercises = snapshot.exercises.filter((exercise) => exercise.source === 'coach');
  assert.equal(globalExercises.length, 245);
  assert.equal(coachExercises.length, 253);
  for (const exercise of globalExercises) {
    assert.equal(resolveGlobalExerciseImage({ id: exercise.id, source: exercise.source, imageUrl: exercise.image_url }), '/assets/exercises/v1/' + exercise.id + '.webp', exercise.name);
  }
  for (const exercise of coachExercises) {
    assert.equal(resolveGlobalExerciseImage({ id: exercise.id, source: exercise.source, imageUrl: exercise.image_url }), null, exercise.name);
  }
});

test('WebP header inspection detects animation and rejects malformed or static assets', async () => {
  const bytes = await readFile(new URL('../public/assets/exercises/v1/' + id + '.webp', import.meta.url));
  const header = inspectAnimatedWebp(bytes);
  assert.equal(header.width, 576);
  assert.equal(header.height, 576);
  assert.ok([3, 6].includes(header.frames));
  assert.equal(header.loop, 0);
  assert.throws(() => inspectAnimatedWebp(Buffer.from('not a WebP')));
  const truncated = bytes.subarray(0, bytes.length - 1);
  assert.throws(() => inspectAnimatedWebp(truncated), /RIFF size/);
  const staticBytes = Buffer.from(bytes);
  const vp8x = staticBytes.indexOf('VP8X');
  staticBytes[vp8x + 8] &= ~0x02;
  assert.throws(() => inspectAnimatedWebp(staticBytes), /not flagged as animated/);
});
