import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const coachId = '11111111-1111-4111-8111-111111111111';
const session = { access_token: 'visual-test-token', refresh_token: 'visual-test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: coachId, aud: 'authenticated', role: 'authenticated', email: 'valeria@zummith.test' } };
const fixtures = [
  ['g1', 'Curl de bíceps con barra', 'Bíceps', 'Mantén los codos junto al cuerpo. Eleva la barra sin balancear el tronco y controla el descenso.'],
  ['g2', 'Peso muerto rumano', 'Isquiotibiales', 'Lleva la cadera hacia atrás manteniendo la espalda neutra. Siente el trabajo en la cadena posterior.'],
  ['g3', 'Crunch abdominal', 'Core', 'Eleva los hombros del suelo de forma controlada. Evita tirar del cuello con las manos.'],
  ['g4', 'Remo con mancuerna', 'Espalda', 'Apoya una mano sobre el banco. Lleva el codo hacia la cadera y controla el regreso.'],
  ['g5', 'Sentadilla goblet', 'Cuádriceps', 'Sostén la carga frente al pecho. Desciende manteniendo el apoyo completo de los pies.'],
  ['g6', 'Plancha con apoyo de antebrazos', 'Core', 'Mantén alineados hombros, cadera y tobillos. Respira de forma continua.']
].map(([id, name, muscle_group, description], index) => ({ id, name, muscle_group, description, source: 'global', image_url: null, video_url: index % 2 ? null : 'https://www.youtube.com/watch?v=example', created_at: `2026-09-0${index + 1}T12:00:00Z` }));
fixtures.push({ id: 'p1', name: 'Remo con pausa', muscle_group: 'Espalda', description: 'Sostén dos segundos en la parte alta.\nDesciende en tres segundos.', source: 'coach', coach_id: coachId, video_url: null, image_url: null, created_at: '2026-09-12T12:00:00Z' });
const browser = await chromium.launch();
await mkdir('docs/qa', { recursive: true });

async function setup(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript((value) => localStorage.setItem('zummith-auth', JSON.stringify(value)), session);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  let records = structuredClone(fixtures);
  let fail = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, json: new URL(route.request().url()).pathname.endsWith('/user') ? session.user : {} }));
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload = [];
    if (url.pathname.endsWith('/coaches')) payload = { id: coachId, name: 'Valeria Mora', email: session.user.email, role: 'coach', account_type: 'independent', coach_plan: 'standard' };
    if (url.pathname.endsWith('/exercises')) {
      if (fail) return route.fulfill({ status: 500, json: { message: 'Test failure' } });
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (request.method() === 'POST') {
        const input = request.postDataJSON();
        assert.equal(input.source, 'coach');
        assert.equal(input.coach_id, coachId);
        requests.push('create');
        const record = { ...input, id: 'new-id', created_at: new Date().toISOString() };
        records.push(record);
        payload = { id: record.id };
      } else if (request.method() === 'PATCH') {
        assert.equal(url.searchParams.get('coach_id'), `eq.${coachId}`);
        assert.equal(url.searchParams.get('source'), 'eq.coach');
        requests.push('update');
        records = records.map((row) => row.id === id ? { ...row, ...request.postDataJSON() } : row);
        return route.fulfill({ status: 200, json: [{ id }] });
      } else if (request.method() === 'DELETE') {
        assert.equal(url.searchParams.get('coach_id'), `eq.${coachId}`);
        assert.equal(url.searchParams.get('source'), 'eq.coach');
        requests.push('delete');
        records = records.filter((row) => row.id !== id);
        return route.fulfill({ status: 200, json: [{ id }] });
      } else {
        payload = id ? records.find((row) => row.id === id) : records;
        if (id && !payload) return route.fulfill({ status: 406, json: { message: 'Not found' } });
      }
    }
    return route.fulfill({ status: 200, json: payload });
  });
  return { context, page, errors, requests, fail: (value) => { fail = value; } };
}

async function capture(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode().catch(() => {}))); });
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: overflow`);
  assert.equal(await page.evaluate(() => [...document.images].some((img) => img.complete && img.naturalWidth === 0)), false, `${name}: broken image`);
  await page.screenshot({ path: `docs/qa/${name}.png`, fullPage: true });
}

try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }], ['small-mobile', { width: 320, height: 740 }]]) {
    const { context, page, errors, requests, fail } = await setup(viewport);
    await page.goto(`${base}/exercises`, { waitUntil: 'networkidle' });
    await page.locator('.exercise-tile').last().waitFor();
    assert.equal(await page.locator('.tile-open').count(), 5);
    const pagination = page.getByRole('navigation', { name: 'Paginación de ejercicios', exact: true });
    await pagination.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tile-open').length === 1);
    await pagination.getByRole('button', { name: 'Anterior', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tile-open').length === 5);
    const typography = await page.evaluate(() => {
      const read = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return [style.fontSize, style.lineHeight];
      };
      return {
        title: read('h1'),
        intro: read('.heading-copy > p'),
        cardTitle: read('.tile-copy > strong')
      };
    });
    assert.deepEqual(typography.title, viewport.width <= 640 ? ['32px', '40px'] : ['40px', '48px']);
    assert.deepEqual(typography.intro, ['20px', '28px']);
    assert.deepEqual(typography.cardTitle, viewport.width <= 640 ? ['16px', '24px'] : ['20px', '28px']);
    await capture(page, `astra-library-${name}`);
    await page.getByRole('button', { name: /Tren inferior/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tile-open').length === 2);
    await page.locator('#astra-search').fill('goblet');
    await page.waitForFunction(() => document.querySelectorAll('.tile-open').length === 1);
    await page.locator('.result-count button').click();
    await page.locator('#astra-group').click();
    await page.getByRole('option', { name: 'Core', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tile-open').length === 2);
    await page.getByLabel('Ordenar ejercicios').click();
    await page.getByRole('option', { name: 'Más recientes', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.tile-copy > strong')?.textContent?.includes('Plancha'));
    await page.locator('#astra-search').fill('no-coincidence');
    await page.locator('.empty-state').waitFor();
    await capture(page, `astra-empty-${name}`);
    await page.getByRole('button', { name: 'Ver todos', exact: true }).click();
    await page.getByRole('tab', { name: /Mis ejercicios/ }).click();
    await page.getByRole('button', { name: 'Ver detalles de Remo con pausa' }).click();
    await page.locator('.exercise-dialog[open]').waitFor();
    assert.match(await page.locator('.instructions').textContent(), /Desciende en tres segundos/);
    await page.screenshot({ path: `docs/qa/astra-detail-${name}.png` });
    await page.getByRole('button', { name: 'Eliminar ejercicio', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(requests.length, 0);
    await page.getByRole('button', { name: 'Cerrar detalle' }).click();
    await page.getByRole('link', { name: /Nuevo ejercicio/ }).click();
    await page.locator('#astra-name').waitFor();
    await page.getByRole('button', { name: 'Crear ejercicio' }).click();
    await page.locator('#astra-name-error').waitFor();
    await page.locator('#astra-name').fill('Press unilateral');
    await page.locator('#astra-muscle').click();
    await page.getByRole('option', { name: 'Pecho', exact: true }).click();
    await page.locator('#astra-instructions').fill('Mantén la cadera estable.');
    await page.locator('#astra-video').fill('https://www.youtube.com/watch?v=example');
    await capture(page, `astra-create-${name}`);
    await page.getByRole('button', { name: 'Crear ejercicio' }).click();
    await page.waitForURL('**/exercises?result=created');
    await page.getByRole('button', { name: 'Ver detalles de Press unilateral' }).click();
    await page.getByRole('link', { name: 'Editar ejercicio', exact: true }).click();
    await page.getByRole('combobox', { name: 'Grupo muscular', exact: true }).filter({ hasText: 'Pecho' }).waitFor();
    assert.equal(await page.locator('#astra-name').inputValue(), 'Press unilateral');
    assert.equal(await page.locator('#astra-instructions').inputValue(), 'Mantén la cadera estable.');
    await page.locator('#astra-name').fill('Press unilateral con pausa');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForURL('**/exercises?result=updated');
    await page.getByRole('button', { name: 'Ver detalles de Press unilateral con pausa' }).click();
    await page.getByRole('button', { name: 'Eliminar ejercicio', exact: true }).click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.locator('.notice.success').waitFor();
    assert.deepEqual(requests, ['create', 'update', 'delete']);
    await page.goto(`${base}/exercises/missing/edit`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('form').count(), 0);
    assert.equal(await page.locator('.error-notice').isVisible(), true);
    fail(true);
    await page.goto(`${base}/exercises`, { waitUntil: 'networkidle' });
    await page.locator('.notice.error').waitFor();
    fail(false);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.locator('.tile-open').first().waitFor();
    assert.deepEqual(errors, []);
    console.log(`${name}: layout, media, filters, sorting, detail, cancel delete, validation, create/edit/delete, missing record and retry passed.`);
    await context.close();
  }
} finally { await browser.close(); }
