import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const userId = '11111111-1111-4111-8111-111111111111';
const session = {
  access_token: 'admin-test-token',
  refresh_token: 'admin-test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'admin@zummith.test', user_metadata: { name: 'Admin Zummith' } }
};
const profile = { id: userId, name: 'Admin Zummith', email: session.user.email, role: 'admin', account_type: 'independent', coach_plan: 'standard', brand_color: '#CCFF00' };
const baseRecords = Array.from({ length: 22 }, (_, index) => ({
  id: `g${index + 1}`,
  name: index === 0 ? 'Sentadilla goblet' : `Ejercicio global ${index + 1}`,
  muscle_group: index % 2 ? 'Espalda' : 'Piernas',
  description: `Descripción de prueba ${index + 1}`,
  video_url: index === 0 ? 'https://youtube.com/watch?v=test' : null,
  image_url: null,
  source: 'global',
  coach_id: null,
  created_at: `2026-09-${String((index % 20) + 1).padStart(2, '0')}T12:00:00Z`,
  updated_at: null
}));

await mkdir('docs/qa', { recursive: true });
const browser = await chromium.launch();

async function assertLayout(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const overflow = await page.evaluate(() => ({
    hasOverflow: document.documentElement.scrollWidth > innerWidth,
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')]
      .map((element) => ({ selector: `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width }))
      .filter((item) => item.right > innerWidth + 1 || item.left < -1)
      .slice(0, 8)
  }));
  assert.equal(overflow.hasOverflow, false, `${name}: horizontal overflow ${JSON.stringify(overflow)}`);
  assert.equal(await page.evaluate(() => [...document.images].some((image) => image.complete && image.naturalWidth === 0)), false, `${name}: broken image`);
  await page.screenshot({ path: `docs/qa/${name}.png`, fullPage: true });
}

async function testSignup(viewport, name) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  let signupPayload;
  let signupUrl;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/auth/v1/signup**', async (route) => {
    signupUrl = route.request().url();
    signupPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      json: {
        user: { id: userId, email: signupPayload.email, identities: [{ id: 'identity-1' }], user_metadata: signupPayload.data },
        session: null
      }
    });
  });
  await page.goto(`${base}/signup`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.is-invalid').length === 4);
  assert.equal(await page.locator('.is-invalid').count(), 4);
  await page.locator('#signup-name').fill('Valeria Mora');
  await page.locator('#signup-email').fill('VALERIA@EXAMPLE.COM');
  await page.locator('#signup-password').fill('Entrena2026');
  await page.locator('#signup-confirmation').fill('Entrena2026');
  await assertLayout(page, `signup-form-${name}`);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByRole('heading', { name: 'Revisa tu correo.' }).waitFor();
  assert.equal(signupPayload.email, 'valeria@example.com');
  assert.equal(signupPayload.data.role, 'coach');
  assert.equal(signupPayload.data.account_type, 'independent');
  assert.match(new URL(signupUrl).searchParams.get('redirect_to') || '', /\/login\?registered=1$/);
  await assertLayout(page, `signup-confirmation-${name}`);
  assert.deepEqual(errors, []);
  await context.close();
}

async function setupAdmin(viewport, role = 'admin') {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript((value) => localStorage.setItem('zummith-auth', JSON.stringify(value)), session);
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  let records = structuredClone(baseRecords);
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    const method = request.method();
    const json = (body, status = 200) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, json: body });
    if (table === 'coaches') return json({ ...profile, role });
    if (table !== 'exercises') return json([]);

    if (method === 'POST') {
      const input = request.postDataJSON();
      const rows = Array.isArray(input) ? input : [input];
      assert.ok(rows.every((row) => row.source === 'global' && row.coach_id === null));
      if (Array.isArray(input)) {
        writes.push(`seed:${rows.length}`);
        records.push(...rows.map((row, index) => ({ ...row, id: `seed-${records.length + index}`, created_at: new Date().toISOString() })));
        return json(rows, 201);
      }
      writes.push('create');
      records.push({ ...input, id: 'created-global', created_at: new Date().toISOString() });
      return json({ id: 'created-global' }, 201);
    }
    const id = url.searchParams.get('id')?.replace('eq.', '');
    if (method === 'PATCH') {
      writes.push('update');
      records = records.map((row) => row.id === id ? { ...row, ...request.postDataJSON() } : row);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (method === 'DELETE') {
      writes.push('delete');
      records = records.filter((row) => row.id !== id);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    return json(records);
  });
  return { context, page, errors, writes };
}

async function testAdmin(viewport, name) {
  const { context, page, errors, writes } = await setupAdmin(viewport);
  await page.goto(`${base}/exercises/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Biblioteca global', level: 1 }).waitFor();
  assert.equal(await page.locator('.exercise-row:not(.skeleton-row)').count(), 18);
  assert.equal(await page.getByText('Página 1 de 2').isVisible(), true);
  await page.locator('#global-search').fill('Sentadilla');
  await page.waitForFunction(() => document.querySelectorAll('.exercise-row:not(.skeleton-row)').length === 1);
  await page.locator('#global-search').fill('');
  await page.getByRole('button', { name: 'Nuevo ejercicio global' }).click();
  await page.getByRole('button', { name: 'Guardar ejercicio' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.editor-dialog .is-invalid').length === 2);
  assert.equal(await page.locator('.editor-dialog .is-invalid').count(), 2);
  await page.locator('[formcontrolname="name"]').fill('Press global de prueba');
  await page.locator('[formcontrolname="muscleGroup"]').fill('Pecho');
  await page.locator('[formcontrolname="description"]').fill('Descripción global de prueba.');
  await page.getByRole('button', { name: 'Guardar ejercicio' }).click();
  await page.getByText('El ejercicio global se agregó a la biblioteca.').waitFor();
  assert.ok(writes.includes('create'));

  await page.locator('#global-search').fill('Sentadilla');
  const sentadilla = page.locator('.exercise-row').filter({ hasText: 'Sentadilla goblet' });
  await sentadilla.getByRole('button', { name: 'Editar' }).click();
  await page.locator('[formcontrolname="name"]').fill('Sentadilla goblet global');
  await page.getByRole('button', { name: 'Guardar ejercicio' }).click();
  await page.getByText('Los cambios del ejercicio se guardaron.').waitFor();
  assert.ok(writes.includes('update'));
  await page.locator('.exercise-row').filter({ hasText: 'Sentadilla goblet global' }).getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('button', { name: 'Eliminar ejercicio' }).click();
  await page.getByText(/se eliminó de la biblioteca global/).waitFor();
  assert.ok(writes.includes('delete'));
  await page.locator('#global-search').fill('');
  await assertLayout(page, `global-exercises-${name}`);

  await page.getByRole('link', { name: 'Carga inicial' }).click();
  await page.getByRole('heading', { name: 'Carga inicial', level: 1 }).waitFor();
  await assertLayout(page, `exercise-seed-${name}`);
  if (name === 'desktop') {
    await page.getByRole('button', { name: 'Agregar ejercicios faltantes' }).click();
    await page.getByRole('button', { name: 'Iniciar carga' }).click();
    await page.getByText(/Carga terminada:/).waitFor();
    assert.ok(writes.some((write) => write.startsWith('seed:')));
  }
  assert.deepEqual(errors, []);
  await context.close();
}

try {
  await testSignup({ width: 1440, height: 1000 }, 'desktop');
  await testSignup({ width: 390, height: 844 }, 'mobile');
  await testSignup({ width: 320, height: 740 }, 'small-mobile');
  await testAdmin({ width: 1440, height: 1000 }, 'desktop');
  await testAdmin({ width: 390, height: 844 }, 'mobile');
  await testAdmin({ width: 320, height: 740 }, 'small-mobile');

  const denied = await setupAdmin({ width: 1280, height: 800 }, 'coach');
  await denied.page.goto(`${base}/exercises/admin`, { waitUntil: 'networkidle' });
  await denied.page.waitForURL((url) => url.pathname === '/dashboard');
  assert.deepEqual(denied.errors, []);
  await denied.context.close();
  console.log('signup, admin CRUD, safe initial load, responsive layout and admin guard passed.');
} finally {
  await browser.close();
}
