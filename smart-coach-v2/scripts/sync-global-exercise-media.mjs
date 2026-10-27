import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.resolve(appRoot, '../output');
const catalogRoot = path.join(outputRoot, 'zummith-prod-webp-completo');
const mediaRoot = path.join(appRoot, 'public/assets/exercises/v1');
const sharedRoot = path.join(appRoot, 'src/app/shared');
const expectedCount = 245;
const byteLimit = 150000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

// Inspect RIFF/WEBP animation headers without an image package or re-encoding.
export function inspectAnimatedWebp(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 12, 'Missing WebP header');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', 'Invalid RIFF header');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', 'Invalid WebP signature');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'Invalid RIFF size');
  let canvas = null;
  let loop = null;
  const frames = [];
  for (let offset = 12; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length, 'Truncated chunk header');
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end <= bytes.length, 'Truncated WebP chunk');
    if (type === 'VP8X') {
      assert.equal(canvas, null, 'Duplicate VP8X chunk');
      assert.equal(length, 10, 'Invalid VP8X length');
      assert.ok(bytes[start] & 0x02, 'WebP is not flagged as animated');
      canvas = { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
    } else if (type === 'ANIM') {
      assert.equal(loop, null, 'Duplicate animation chunk');
      assert.equal(length, 6, 'Invalid ANIM length');
      loop = bytes.readUInt16LE(start + 4);
    } else if (type === 'ANMF') {
      assert.ok(canvas && loop !== null && length > 16, 'Invalid animation frame');
      const x = bytes.readUIntLE(start, 3) * 2;
      const y = bytes.readUIntLE(start + 3, 3) * 2;
      const width = bytes.readUIntLE(start + 6, 3) + 1;
      const height = bytes.readUIntLE(start + 9, 3) + 1;
      assert.ok(x + width <= canvas.width && y + height <= canvas.height, 'Frame exceeds canvas');
      frames.push(bytes.readUIntLE(start + 12, 3));
    }
    offset = end + (length % 2);
    assert.ok(offset <= bytes.length, 'Missing chunk padding');
  }
  assert.ok(canvas && loop !== null && frames.length > 1, 'Missing animated WebP data');
  return { ...canvas, frames: frames.length, frame_durations_ms: frames, duration_ms: frames.reduce((a, b) => a + b, 0), loop };
}

function indexed(items, label) {
  const result = new Map();
  for (const item of items) {
    assert.match(item.production_id, uuid, label + ': invalid exercise UUID');
    assert.ok(!result.has(item.production_id), label + ': duplicate exercise UUID');
    result.set(item.production_id, item);
  }
  assert.equal(result.size, expectedCount, label + ': expected 245 exercises');
  return result;
}

function inside(root, relativeFile) {
  const file = path.resolve(root, relativeFile);
  assert.ok(file.startsWith(root + path.sep), 'Asset path escapes its source directory');
  return file;
}

export async function validatedSourceAssets() {
  const plan = await json(path.join(outputRoot, 'zummith-prod-webp-plan.json'));
  const manifest = await json(path.join(catalogRoot, 'manifest.json'));
  assert.equal(plan.total_exercise_records, expectedCount);
  assert.equal(plan.generated_records, expectedCount);
  assert.equal(plan.remaining_records, 0);
  assert.equal(plan.max_bytes_exclusive, byteLimit);
  assert.equal(plan.scope, "public.exercises WHERE source = 'global'");
  assert.equal(manifest.scope, plan.scope);
  assert.equal(manifest.production_project, plan.production_project);
  assert.equal(manifest.total_exercises, expectedCount);
  assert.equal(manifest.limit_bytes_exclusive, byteLimit);
  const planned = indexed(plan.exercises, 'plan');
  const packaged = indexed(manifest.exercises, 'catalog');
  assert.deepEqual([...planned.keys()].sort(), [...packaged.keys()].sort(), 'Plan/catalog UUID mismatch');
  const batches = new Map();
  const assets = [];
  for (const id of [...planned.keys()].sort()) {
    const item = packaged.get(id);
    const plannedItem = planned.get(id);
    assert.equal(plannedItem.status, 'generated_verified', id + ': unverified exercise');
    assert.equal(item.file, 'webp/' + id + '.webp', id + ': catalog filename must use UUID');
    assert.equal(item.source_file, plannedItem.file, id + ': source path mismatch');
    assert.equal(item.source_batch, plannedItem.batch, id + ': batch mismatch');
    for (const field of ['name', 'muscle_group', 'slug', 'representation', 'bytes']) {
      assert.deepEqual(item[field], plannedItem[field], id + ': plan ' + field + ' mismatch');
    }
    const batchName = 'zummith-prod-webp-lote-' + String(item.source_batch).padStart(2, '0');
    if (!batches.has(batchName)) {
      const batch = await json(path.join(outputRoot, batchName, 'manifest.json'));
      assert.equal(batch.batch, item.source_batch, batchName + ': batch number mismatch');
      assert.equal(batch.scope, plan.scope, batchName + ': scope mismatch');
      assert.equal(batch.production_project, plan.production_project, batchName + ': source project mismatch');
      const batchIds = new Set();
      for (const exercise of batch.exercises) {
        assert.ok(!batchIds.has(exercise.production_id), batchName + ': duplicate UUID');
        batchIds.add(exercise.production_id);
      }
      batches.set(batchName, batch);
    }
    const batchItem = batches.get(batchName).exercises.find((exercise) => exercise.production_id === id);
    assert.ok(batchItem, id + ': missing batch manifest entry');
    assert.equal(path.join(batchName, batchItem.file), plannedItem.file, id + ': batch file mapping mismatch');
    for (const field of ['name', 'muscle_group', 'slug', 'representation', 'bytes', 'sha256', 'width', 'height', 'frames', 'frame_durations_ms', 'duration_ms', 'loop']) {
      assert.deepEqual(item[field], batchItem[field], id + ': batch ' + field + ' mismatch');
    }
    const bytes = await readFile(inside(catalogRoot, item.file));
    assert.equal(bytes.length, item.bytes, id + ': byte size mismatch');
    assert.ok(bytes.length < byteLimit, id + ': asset exceeds byte limit');
    assert.equal(digest(bytes), item.sha256, id + ': SHA-256 mismatch');
    assert.deepEqual(bytes, await readFile(inside(outputRoot, plannedItem.file)), id + ': batch/catalog byte mismatch');
    const header = inspectAnimatedWebp(bytes);
    for (const field of ['width', 'height', 'frames', 'frame_durations_ms', 'duration_ms', 'loop']) {
      assert.deepEqual(header[field], item[field], id + ': animation ' + field + ' mismatch');
    }
    const animation = plan.animation.exceptions?.[id] || plan.animation;
    assert.equal(header.width, animation.width ?? 576, id + ': unexpected canvas width');
    assert.equal(header.height, animation.height ?? 576, id + ': unexpected canvas height');
    assert.equal(header.frames, animation.unique_frames, id + ': plan frame count mismatch');
    assert.deepEqual(header.frame_durations_ms, Array(header.frames).fill(animation.frame_duration_ms), id + ': plan timing mismatch');
    assert.equal(header.loop, plan.animation.loop, id + ': plan loop mismatch');
    assets.push({ id, name: item.name, muscleGroup: item.muscle_group, file: id + '.webp', bytes: bytes.length, sha256: item.sha256, width: header.width, height: header.height, frames: header.frames, frameDurationsMs: header.frame_durations_ms, durationMs: header.duration_ms, loop: header.loop, contents: bytes });
  }
  assert.equal(batches.size, 22, 'Expected all 22 batches');
  assert.deepEqual([...batches.values()].flatMap((batch) => batch.exercises.map((item) => item.production_id)).sort(), [...planned.keys()].sort(), 'Batch UUID coverage mismatch');
  assert.equal(assets.reduce((total, item) => total + item.bytes, 0), manifest.total_webp_bytes);
  return assets;
}

const helperSource = String.raw`// Generated by scripts/sync-global-exercise-media.mjs. Edit its helperSource template.
import { GLOBAL_EXERCISE_MEDIA_IDS } from './global-exercise-media.manifest.mjs';

const globalExerciseIds = new Set<string>(GLOBAL_EXERCISE_MEDIA_IDS);

export function isGlobalExerciseImageUrl(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;
  const match = /^\/assets\/exercises\/v1\/([0-9a-f-]+)\.webp$/.exec(imageUrl);
  return !!match && globalExerciseIds.has(match[1]);
}

export function getGlobalExerciseImage(exerciseId: string | null | undefined, source?: string | null): string | null {
  if (source != null && source !== 'global') return null;
  if (!exerciseId || !globalExerciseIds.has(exerciseId)) return null;
  return '/assets/exercises/v1/' + exerciseId + '.webp';
}

function decodeSvgImage(value: string): string | null {
  const match = /^data:image\/svg\+xml((?:;[^,]*)?),(.*)$/is.exec(value);
  if (!match) return null;
  try {
    if (/;base64(?:;|$)/i.test(match[1])) {
      const bytes = Uint8Array.from(atob(decodeURIComponent(match[2])), (char) => char.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    return decodeURIComponent(match[2]);
  } catch { return null; }
}

/** Recognize only the old seed SVG: a 100×100 background and one emoji text node. */
export function isLegacyExerciseSvgPlaceholder(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;
  const svg = decodeSvgImage(imageUrl.trim());
  if (!svg) return false;
  const match = /^\s*<svg\b([^>]*)>\s*<rect\b([^>]*?)\s*\/>\s*<text\b([^>]*)>([^<]+)<\/text>\s*<\/svg>\s*$/i.exec(svg);
  if (!match) return false;
  const [, root, background, textAttributes, text] = match;
  if (!/\bviewBox\s*=\s*['"]0 0 100 100['"]/i.test(root)) return false;
  if (!/\bwidth\s*=\s*['"]100['"]/i.test(background) || !/\bheight\s*=\s*['"]100['"]/i.test(background)) return false;
  if (!/\bx\s*=\s*['"]50['"]/i.test(textAttributes) || !/\by\s*=\s*['"]50['"]/i.test(textAttributes)) return false;
  if (!/\bfont-size\s*=\s*['"]60['"]/i.test(textAttributes)) return false;
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(text) && !/[\p{L}\p{N}]/u.test(text);
}

/** Validate the supported browser image URL forms without requesting the image. */
export function isUsableExerciseImageUrl(imageUrl: string | null | undefined): boolean {
  const value = imageUrl?.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^data:image\/svg\+xml[;,]/i.test(value)) {
    const svg = decodeSvgImage(value);
    return !!svg && /^\s*(?:<\?xml[^>]*>\s*)?<svg\b(?:[^>]*\/>|[^>]*>[\s\S]*<\/svg>)\s*$/i.test(svg) && !isLegacyExerciseSvgPlaceholder(value);
  }
  const data = /^data:image\/(?:png|jpe?g|webp|gif|avif|bmp|x-icon)(;[^,]*)?,(.+)$/is.exec(value);
  if (data) {
    try {
      if (/;base64(?:;|$)/i.test(data[1] || '')) return atob(decodeURIComponent(data[2])).length > 0;
      return decodeURIComponent(data[2]).length > 0;
    } catch { return false; }
  }
  if (/^\/(?!\/)/.test(value) && !value.includes('\\')) return true;
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) ? !!url.hostname : url.protocol === 'blob:' && /^blob:https?:\/\//i.test(value);
  } catch { return false; }
}

export function resolveGlobalExerciseImage(exercise: { id?: string; exerciseId?: string; source?: string | null; imageUrl?: string | null }): string | null {
  // An assignment's id identifies the assignment. Its exerciseId identifies the media.
  const id = exercise.exerciseId ?? exercise.id;
  const staticImage = getGlobalExerciseImage(id, exercise.source);
  if (!staticImage) return null;
  return isUsableExerciseImageUrl(exercise.imageUrl) ? exercise.imageUrl!.trim() : staticImage;
}
`;

function supportSources(ids) {
  return new Map([
    ['global-exercise-media.manifest.mjs', '// Generated by scripts/sync-global-exercise-media.mjs. Do not edit.\nexport const GLOBAL_EXERCISE_MEDIA_IDS = Object.freeze(' + JSON.stringify(ids, null, 2) + ');\n'],
    ['global-exercise-media.manifest.d.mts', '// Generated by scripts/sync-global-exercise-media.mjs. Do not edit.\nexport declare const GLOBAL_EXERCISE_MEDIA_IDS: readonly string[];\n'],
    ['global-exercise-media.ts', helperSource]
  ]);
}

// Portable verification: depends only on files shipped inside smart-coach-v2.
// The source catalog under output/ is required only by the sync maintenance command.
export async function verifyShippedMedia() {
  const manifestPath = path.join(mediaRoot, 'manifest.json');
  const manifest = await json(manifestPath);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.version, 'v1');
  assert.equal(manifest.baseUrl, '/assets/exercises/v1/');
  assert.equal(manifest.byteLimitExclusive, byteLimit);
  assert.equal(manifest.count, expectedCount);
  assert.equal(manifest.exercises.length, expectedCount);
  const ids = manifest.exercises.map((item) => item.id);
  assert.equal(new Set(ids).size, expectedCount, 'Duplicate shipped exercise UUID');
  assert.deepEqual(ids, [...ids].sort(), 'Manifest order must be deterministic');
  const expectedFiles = ['manifest.json', ...manifest.exercises.map((item) => item.file)].sort();
  assert.deepEqual((await readdir(mediaRoot)).sort(), expectedFiles, 'Shipped asset file coverage mismatch');
  let totalBytes = 0;
  for (const item of manifest.exercises) {
    assert.match(item.id, uuid, 'Invalid shipped exercise UUID');
    assert.equal(item.file, item.id + '.webp', item.id + ': filename must use UUID');
    const bytes = await readFile(inside(mediaRoot, item.file));
    assert.ok(bytes.length < byteLimit, item.id + ': asset exceeds byte limit');
    assert.equal(bytes.length, item.bytes, item.id + ': shipped byte size mismatch');
    assert.equal(digest(bytes), item.sha256, item.id + ': shipped SHA-256 mismatch');
    const header = inspectAnimatedWebp(bytes);
    assert.ok([512, 576].includes(header.width), item.id + ': unsupported canvas width');
    assert.equal(header.height, header.width, item.id + ': canvas must be square');
    assert.equal(header.loop, 0);
    assert.ok([3, 6].includes(header.frames));
    assert.deepEqual(header, { width: item.width, height: item.height, frames: item.frames, frame_durations_ms: item.frameDurationsMs, duration_ms: item.durationMs, loop: item.loop }, item.id + ': shipped animation metadata mismatch');
    totalBytes += bytes.length;
  }
  assert.equal(manifest.totalBytes, totalBytes, 'Shipped total byte size mismatch');
  for (const [name, expected] of supportSources(ids)) {
    assert.equal(await readFile(path.join(sharedRoot, name), 'utf8'), expected, 'Generated helper/whitelist differs: ' + name);
  }
  return { count: manifest.count, totalBytes };
}

export async function syncGlobalExerciseMedia({ check = false } = {}) {
  // Complete all source validation before writing any application files.
  const assets = await validatedSourceAssets();
  const entries = assets.map(({ contents, ...item }) => item);
  const manifest = { schemaVersion: 1, version: 'v1', baseUrl: '/assets/exercises/v1/', count: entries.length, byteLimitExclusive: byteLimit, totalBytes: entries.reduce((total, item) => total + item.bytes, 0), exercises: entries };
  const outputs = new Map(assets.map((item) => [path.join(mediaRoot, item.file), item.contents]));
  outputs.set(path.join(mediaRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const [name, contents] of supportSources(assets.map((item) => item.id))) outputs.set(path.join(sharedRoot, name), contents);
  const existingFiles = await readdir(mediaRoot).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
  const expectedMediaNames = new Set([...assets.map((item) => item.file), 'manifest.json']);
  assert.deepEqual(existingFiles.filter((name) => !expectedMediaNames.has(name)), [], 'Unexpected files in versioned asset directory; review rather than deleting automatically');
  for (const [file, contents] of outputs) {
    if (check) {
      assert.deepEqual(await readFile(file), Buffer.from(contents), 'Generated file differs: ' + path.relative(appRoot, file));
    } else {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    }
  }
  return { count: assets.length, totalBytes: manifest.totalBytes, checked: check };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.every((arg) => arg === '--check'), 'Only --check is supported');
  const result = await syncGlobalExerciseMedia({ check: args.includes('--check') });
  console.log((result.checked ? 'Verified' : 'Synced') + ' ' + result.count + ' global exercise WebP assets (' + result.totalBytes + ' bytes).');
}
