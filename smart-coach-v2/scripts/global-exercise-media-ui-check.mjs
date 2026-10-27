import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// All backend traffic is fulfilled locally. This check never signs in or saves
// exercises/routines against a real backend, including when a hosted URL is used.
const project = fileURLToPath(new URL('../', import.meta.url));
const repository = path.resolve(project, '..');
const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4370';
const authKey = process.env.ZUMMITH_TEST_AUTH_KEY || 'zummith-auth';
const mappingOnly = process.env.ZUMMITH_MEDIA_MAPPING_ONLY === '1';
const origin = new URL(base).origin;
const mediaPath = '/assets/exercises/v1';
const output = process.env.ZUMMITH_MEDIA_QA_OUTPUT || path.join(repository, 'output/zummith-v2-static-media-qa');
const publishedManifest = JSON.parse(await readFile(path.join(project, 'public/assets/exercises/v1/manifest.json'), 'utf8'));
const manifest = { exercises: publishedManifest.exercises.map((row) => ({ ...row, production_id: row.id, muscle_group: row.muscleGroup })) };
assert.equal(manifest.exercises.length, 245, 'Full global exercise catalog');
const coachId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const routineId = '33333333-3333-4333-8333-333333333333';
const dayId = '44444444-4444-4444-8444-444444444444';
const session = {
  access_token: 'mock-global-media-token', refresh_token: 'mock-global-media-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
  user: { id: coachId, aud: 'authenticated', role: 'authenticated', email: 'media-qa@zummith.test', user_metadata: { name: 'Media QA' } }
};
const profile = { id: coachId, name: 'Media QA', email: session.user.email, role: 'coach', account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: '2027-12-31' };
const legacySvg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fee2e2"/><text x="50" y="50" font-family="Arial" font-size="60" text-anchor="middle" dy=".35em">🏋️</text></svg>')}`;
const realOverride = '/assets/exercises-astra/strength.jpg?qa=global-override';
const customPhoto = '/assets/exercises-astra/training.jpg?qa=custom-photo';
const fixtureIds = ['bcf04802-483d-4abb-8b4d-ef5963db684c', '15963e87-39fb-456a-88a9-8d6297e5273f', 'd1d3c1fb-6ee6-4799-9fc0-21c09db022ca', 'e38a7932-df87-4951-9941-f7eef5446cdc', '85ff2fe9-04a6-4dfd-9455-9aef9fcb0ec2', 'd920f338-ff99-40de-bcd1-b8dcaeb1aa12'];
const sourceRows = fixtureIds.map((id) => manifest.exercises.find((row) => row.production_id === id));
assert.ok(sourceRows.every(Boolean), 'Fixtures use real catalog UUIDs');
const fixture = (entry, index) => ({
  id: entry.production_id, name: entry.name, muscle_group: entry.muscle_group,
  source: 'global', image_url: null, video_url: null,
  description: 'Ejercicio de prueba con medios locales. Conserva el movimiento completo.',
  created_at: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`
});
const fixtures = sourceRows.map(fixture);
fixtures[1].image_url = legacySvg;
fixtures[2].image_url = realOverride;
// Custom rows deliberately reuse known catalog UUIDs. Source must still prevent
// a whitelist hit from replacing a coach's media or requesting catalog assets.
Object.assign(fixtures[4], { source: 'coach', coach_id: coachId, name: 'Personalizado con fotografía', image_url: customPhoto });
Object.assign(fixtures[5], { source: 'coach', coach_id: coachId, name: 'Personalizado con SVG heredado', image_url: legacySvg });
const [globalEmpty, globalLegacy, globalOverride, global404, customReal, customLegacy] = fixtures;
const assetFor = (row) => `${mediaPath}/${row.id}.webp`;
const localRoutineExerciseId = '99999999-9999-4999-8999-999999999999';
const unknownCatalogUrl = `${mediaPath}/ffffffff-ffff-4fff-8fff-ffffffffffff.webp`;
assert.equal(manifest.exercises.some((row) => row.production_id === localRoutineExerciseId), false, 'Routine fixture uses a local ID outside the production whitelist');
const routineRows = fixtures.map((row, index) => ({
  id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`, routine_day_id: dayId,
  exercise_id: row === globalLegacy ? localRoutineExerciseId : row.id,
  exercises: {
    ...row, id: row === globalLegacy ? localRoutineExerciseId : row.id,
    image_url: row === global404 ? unknownCatalogUrl : [globalEmpty, globalLegacy, globalOverride, customLegacy].includes(row) ? assetFor(row) : row.image_url,
    video_url: `https://example.invalid/catalog-video/${index}`
  },
  sets: 3, reps: '10-12', rest: '60 s', image_url: row === global404 ? legacySvg : row.image_url,
  video_url: `https://example.invalid/snapshot-video/${index}`, notes: '', order_index: index, block_type: 'single', is_superset: false
}));
const referenceFor = (row) => ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos', 'Cuello'].includes(row.muscle_group)
  ? '/assets/exercises-astra/strength.jpg' : ['Piernas', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductores', 'Abductores', 'Pantorrillas'].includes(row.muscle_group)
    ? '/assets/exercises-astra/training.jpg' : '/assets/exercises-astra/movement.jpg';
const expectedFor = (row, surface = 'library') => row === globalEmpty || row === globalLegacy ? assetFor(row)
  : row === globalOverride ? realOverride : row === customReal ? customPhoto
    : row === customLegacy && surface === 'routine' ? legacySvg : referenceFor(row);
const report = { base, mode: mappingOnly ? 'routine-mapping' : 'full', startedAt: new Date().toISOString(), backend: 'mocked auth and REST; external requests blocked', staticAssets: [], viewports: [], screenshots: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch();

function webpInfo(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  let width, height;
  const frames = [];
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    assert.ok(data + size <= buffer.length, 'Complete WebP chunk');
    if (kind === 'VP8X') { width = 1 + buffer.readUIntLE(data + 4, 3); height = 1 + buffer.readUIntLE(data + 7, 3); }
    if (kind === 'ANMF') frames.push({ duration: buffer.readUIntLE(data + 12, 3), sha256: createHash('sha256').update(buffer.subarray(data, data + size)).digest('hex') });
    offset = data + size + size % 2;
  }
  return { width, height, frames };
}

async function checkStaticAssets() {
  const context = await browser.newContext();
  let next = 0;
  const records = new Array(manifest.exercises.length);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < manifest.exercises.length) {
      const index = next++;
      const item = manifest.exercises[index];
      const url = `${base}${mediaPath}/${item.production_id}.webp`;
      const response = await context.request.get(url, { timeout: 30000 });
      assert.equal(response.status(), 200, `Static asset ${item.production_id}`);
      assert.match(response.headers()['content-type'] || '', /^image\/webp(?:;|$)/i, `WebP MIME ${item.production_id}`);
      const buffer = await response.body();
      const info = webpInfo(buffer);
      assert.equal(info.width, item.width);
      assert.equal(info.height, item.height);
      assert.equal(info.frames.length, item.frames);
      assert.equal(createHash('sha256').update(buffer).digest('hex'), item.sha256, `Exact manifest asset ${item.production_id}`);
      assert.ok(new Set(info.frames.map((frame) => frame.sha256)).size > 1, 'Distinct encoded animation frames');
      records[index] = { id: item.production_id, status: response.status(), mime: response.headers()['content-type'], bytes: buffer.length, width: info.width, height: info.height, frames: info.frames.length };
    }
  }));
  report.staticAssets = records;
  const sampleResponse = await context.request.get(`${base}${assetFor(globalEmpty)}`);
  const sample = await sampleResponse.body();
  const page = await context.newPage();
  await page.goto(`${base}${assetFor(globalEmpty)}`, { waitUntil: 'load' });
  report.decodedAnimation = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    if (!('ImageDecoder' in globalThis)) return { supported: false };
    const decoder = new ImageDecoder({ data: bytes, type: 'image/webp' });
    await decoder.tracks.ready;
    const frames = [];
    for (const frameIndex of [0, 1]) {
      const { image } = await decoder.decode({ frameIndex });
      const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const digest = await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      frames.push({ width: canvas.width, height: canvas.height, sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') });
      image.close();
    }
    const frameCount = decoder.tracks.selectedTrack.frameCount;
    decoder.close();
    return { supported: true, frameCount, frames };
  }, sample.toString('base64'));
  assert.equal(report.decodedAnimation.supported, true, 'Chromium supports independent animation decoding');
  assert.ok(report.decodedAnimation.frameCount >= 3);
  assert.notEqual(report.decodedAnimation.frames[0].sha256, report.decodedAnimation.frames[1].sha256, 'Decoded frames visibly differ');
  await context.close();
}

async function setup(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: authKey, value: session });
  const state = { context, requests: [], mutations: [], external: [], errors: [] };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, json: body });
    if (url.pathname.includes('/auth/v1/')) return json(url.pathname.endsWith('/user') ? session.user : session);
    if (url.pathname.includes('/rest/v1/')) {
      state.requests.push({ path: url.pathname, method: request.method() });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        state.mutations.push({ path: url.pathname, method: request.method() });
        return json({ message: 'This media check does not save data.' }, 409);
      }
      const resource = url.pathname.split('/').pop();
      if (resource === 'coaches') return json(profile);
      if (resource === 'clients') return json([{ id: clientId, name: 'Cliente de medios', email: 'client@zummith.test' }]);
      if (resource === 'exercises') return json(fixtures);
      if (resource === 'routines') return json({ id: routineId, coach_id: coachId, client_id: clientId, name: 'Rutina QA de imágenes', objective: 'Verificar medios completos', training_days_count: 1, duration_weeks: 4, start_date: '2026-10-22', end_date: '2026-11-19', notes: '', warmup_enabled: false, clients: { name: 'Cliente de medios' } });
      if (resource === 'routine_days') return json([{ id: dayId, routine_id: routineId, day_number: 1, day_name: 'Día de medios', muscle_groups: [...new Set(fixtures.map((row) => row.muscle_group))], notes: '' }]);
      if (resource === 'routine_day_exercises') return json(routineRows);
      return json([]);
    }
    if (url.pathname.startsWith(`${mediaPath}/`)) {
      state.requests.push({ path: url.pathname, method: request.method() });
      if (url.pathname === assetFor(global404)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Mock missing asset' });
    }
    if (url.origin !== origin) { state.external.push(url.origin); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => state.errors.push(error.message));
  return { ...state, page };
}

async function assertImage(locator, row, { lazy = false, surface = 'library' } = {}) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(async (image) => { await image.decode().catch(() => {}); });
  await locator.page().waitForFunction(({ image, expected }) => image.getAttribute('src') === expected && image.complete && image.naturalWidth > 0,
    { image: await locator.elementHandle(), expected: expectedFor(row, surface) }).catch(async (error) => {
    const actual = await locator.evaluate((image) => ({ src: image.getAttribute('src'), complete: image.complete, width: image.naturalWidth }));
    throw new Error(`${row.name} (${surface}): expected ${expectedFor(row, surface)}, received ${JSON.stringify(actual)}`, { cause: error });
  });
  const image = await locator.evaluate((element) => ({ src: element.getAttribute('src'), naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, fit: getComputedStyle(element).objectFit, loading: element.loading, animationClass: element.classList.contains('static-exercise-animation') }));
  assert.equal(image.src, expectedFor(row, surface), `${row.name}: resolved URL`);
  assert.ok(image.naturalWidth > 0, `${row.name}: decoded image`);
  if (row === globalEmpty || row === globalLegacy) {
    assert.equal(image.naturalWidth, 576);
    assert.equal(image.naturalHeight, 576);
    assert.equal(image.fit, 'contain', `${row.name}: complete motion without cropping`);
    assert.equal(image.animationClass, true, `${row.name}: animation styling`);
    if (lazy) assert.equal(image.loading, 'lazy');
  }
  return image;
}

async function capture(page, filename) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${filename}: horizontal overflow`);
  const target = path.join(output, `${filename}.png`);
  await page.screenshot({ path: target, fullPage: !filename.includes('library-detail') });
  report.screenshots.push(target);
}

async function choose(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function checkRoutineDetail(page, name, checked) {
  await page.goto(`${base}/routines/${routineId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Rutina QA de imágenes/, level: 1 }).waitFor();
  for (const row of fixtures) await assertImage(page.locator('.exercise-view-row').filter({ has: page.getByText(row.name, { exact: true }) }).locator('img'), row, { lazy: true, surface: 'routine' });
  // The local dev server exposes Angular debug state. Inspect the mapped plan to
  // prove precedence and unchanged video/foreign-key fields, beyond rendered URLs.
  const mapped = await page.evaluate(() => {
    const component = globalThis.ng?.getComponent(document.querySelector('app-routine-builder'));
    return component?.draft().days[0].exercises.map(({ exerciseId, source, imageUrl, videoUrl }) => ({ exerciseId, source, imageUrl, videoUrl })) || null;
  });
  if (mappingOnly) assert.ok(mapped, 'Focused mapping check requires the local Angular dev server');
  if (mapped) {
    assert.deepEqual(mapped, fixtures.map((row, index) => ({
      exerciseId: row === globalLegacy ? localRoutineExerciseId : row.id, source: row.source,
      imageUrl: row === globalEmpty || row === globalLegacy ? assetFor(row) : row === global404 ? legacySvg : row.image_url,
      videoUrl: routineRows[index].video_url
    })), 'Canonical global images replace only blank/seed snapshots; overrides, custom media, video and local IDs survive');
    checked.routineMapping = { checked: true, localExerciseIdPreserved: true, blankSnapshotUsesCatalog: true, legacySnapshotUsesCatalog: true, realSnapshotPreserved: true, customSnapshotPreserved: true, unknownCatalogUrlRejected: true, videoSnapshotPreserved: true };
  } else checked.routineMapping = { checked: false, reason: 'Angular debug state unavailable; rendered image assertions passed.' };
  await capture(page, `global-media-routine-detail-${name}`);
}

async function checkViewport(name, viewport) {
  const state = await setup(viewport);
  const { page } = state;
  const checked = { name, viewport, images: [] };
  try {
    if (mappingOnly) {
      await checkRoutineDetail(page, name, checked);
      assert.deepEqual(state.mutations, [], 'No mutations requested');
      assert.deepEqual(state.errors, [], 'No JavaScript runtime errors');
      assert.equal(state.requests.some((request) => request.path === unknownCatalogUrl), false, 'Unknown catalog URL never requested');
      checked.backendRequests = state.requests.filter((request) => request.path.includes('/rest/v1/')).length;
      checked.mutations = state.mutations;
      report.viewports.push(checked);
      return;
    }
    await page.goto(`${base}/exercises`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Una biblioteca. Más posibilidades.' }).waitFor();
    for (const row of fixtures.filter((row) => row.source === 'global')) {
      checked.images.push(await assertImage(page.getByRole('button', { name: `Ver detalles de ${row.name}`, exact: true }).locator('img'), row, { lazy: true }));
    }
    await capture(page, `global-media-library-${name}`);
    await page.getByRole('button', { name: `Ver detalles de ${globalEmpty.name}`, exact: true }).click();
    await page.locator('.exercise-dialog[open]').waitFor();
    await assertImage(page.locator('.exercise-dialog[open] .dialog-image img'), globalEmpty);
    await capture(page, `global-media-library-detail-${name}`);
    await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
    await page.getByRole('tab', { name: /Mis ejercicios/ }).click();
    for (const row of [customReal, customLegacy]) await assertImage(page.getByRole('button', { name: `Ver detalles de ${row.name}`, exact: true }).locator('img'), row);
    await capture(page, `global-media-custom-library-${name}`);

    await page.goto(`${base}/routines/new?clientId=${clientId}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Nueva rutina', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.locator('#routine-name').fill('Rutina QA de imágenes');
    await page.locator('#routine-objective').fill('Verificar los medios completos');
    await choose(page, 'Días por semana', '1 día');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    for (const group of new Set(fixtures.map((row) => row.muscle_group))) await page.locator('.day-setup').first().getByRole('button', { name: group, exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.locator('.catalog-list article').first().waitFor();
    await choose(page.getByRole('navigation', { name: 'Paginación de la biblioteca de ejercicios', exact: true }), 'Registros por página', '10');
    for (const row of fixtures) {
      const card = page.locator('.catalog-list article').filter({ has: page.getByText(row.name, { exact: true }) });
      await assertImage(card.locator('img'), row, { lazy: true, surface: 'routine' });
      await card.getByRole('button', { name: 'Agregar', exact: true }).click();
      const prescription = page.locator('.prescription-card').filter({ has: page.getByText(row.name, { exact: true }) });
      await assertImage(prescription.locator('.exercise-identity img'), row, { lazy: true, surface: 'routine' });
    }
    await capture(page, `global-media-routine-builder-${name}`);
    await checkRoutineDetail(page, name, checked);
    for (const row of [globalOverride, customReal, customLegacy]) assert.equal(state.requests.some((request) => request.path === assetFor(row)), false, `${row.name}: no static request`);
    assert.ok(state.requests.some((request) => request.path === assetFor(global404)), 'Missing static request exercised');
    assert.deepEqual(state.mutations, [], 'No mutations requested');
    assert.deepEqual(state.errors, [], 'No JavaScript runtime errors');
    checked.backendRequests = state.requests.filter((request) => request.path.includes('/rest/v1/')).length;
    checked.staticRequests = state.requests.filter((request) => request.path.startsWith(mediaPath));
    checked.blockedExternalOrigins = [...new Set(state.external)];
    checked.assertions = { globalEmptyUsesStatic: true, globalLegacyUsesStatic: true, globalOverridePreserved: true, customPhotoPreserved: true, customLegacyRoutinePreserved: true, customNoStaticRequests: true, missingStaticFallsBack: true, staticContainFraming: true, noMutations: true, noRuntimeErrors: true };
    report.viewports.push(checked);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `global-media-failure-${name}.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await state.context.close(); }
}

try {
  if (!mappingOnly) await checkStaticAssets();
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) await checkViewport(name, viewport);
  report.status = 'passed';
  console.log(mappingOnly
    ? 'Passed: desktop/mobile routine mapping with local global ID, blank and legacy snapshots, canonical catalog URL validation, real/custom overrides, unchanged video and foreign keys, and no backend mutations.'
    : `Passed: ${report.staticAssets.length} exact WebP assets, decoded animation, desktop/mobile Astra + details + routine selection/prescription/detail, real overrides, custom-source isolation, 404 fallback, contain framing, and no backend mutations.`);
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'global-media-ui-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
