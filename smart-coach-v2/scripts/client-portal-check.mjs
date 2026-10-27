import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const authKey = process.env.ZUMMITH_TEST_AUTH_KEY || 'zummith-auth';
const userId = '33333333-3333-4333-8333-333333333333';
const coachId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const gymClientId = '44444444-4444-4444-8444-444444444444';
const gymId = '55555555-5555-4555-8555-555555555555';
const membershipId = '66666666-6666-4666-8666-666666666666';
const session = {
  access_token: 'portal-test-token', refresh_token: 'portal-test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
  token_type: 'bearer', user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'ana@example.test', user_metadata: { role: 'independent_client' } }
};
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const lastYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const browser = await chromium.launch();

async function makePage(viewport, paymentDate = nextYear, withGym = false) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: authKey, value: session });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, json: {} }));
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const json = value => route.fulfill({ status: 200, json: value });
    if (table === 'independent_client_portal_access') return json([{ client_id: clientId, coach_id: coachId, created_at: '2026-09-01T00:00:00Z' }]);
    if (table === 'client_portal_access') return json(withGym ? [{ client_gym_membership_id: membershipId, created_at: '2026-09-01T00:00:00Z' }] : []);
    if (table === 'client_gym_memberships') return json([{ id: membershipId, client_id: gymClientId, gym_id: gymId }]);
    if (table === 'gyms') return json([{ id: gymId, name: 'Gimnasio Norte' }]);
    if (table === 'coaches') return json([{ id: coachId, name: 'Entrenadora Valeria', account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: paymentDate }]);
    if (table === 'clients') return json(url.searchParams.get('id') === `eq.${gymClientId}`
      ? { name: 'Lucía Soto', goal: 'Mejorar movilidad' }
      : { name: 'Ana Rodríguez', goal: 'Ganar fuerza' });
    if (table === 'routines') {
      const isGym = url.searchParams.get('client_id') === `eq.${gymClientId}`;
      const row = {
        id: 'routine-1', name: isGym ? 'Movilidad diaria' : 'Fuerza base', objective: 'Mejorar fuerza general',
        training_days_count: 3, duration_weeks: 6, start_date: '2026-09-01', end_date: '2026-10-13',
        notes: 'Mantén una técnica controlada.', warmup_enabled: true, warmup_custom_text: 'Cinco minutos de movilidad.'
      };
      const requestedId = url.searchParams.get('id');
      return json(requestedId ? (requestedId === 'eq.routine-1' ? row : null) : [row]);
    }
    if (table === 'routine_days') return json([
      { id: 'day-1', day_number: 1, day_name: 'Tren superior', muscle_groups: ['Pecho', 'Espalda'], notes: null },
      { id: 'day-2', day_number: 2, day_name: 'Piernas', muscle_groups: ['Piernas'], notes: 'Descansa entre bloques.' }
    ]);
    if (table === 'routine_day_exercises') return json([
      { id: 'assignment-1', routine_day_id: 'day-1', exercise_id: 'exercise-1', sets: 3, reps: '8-10', rest: '90 s', notes: 'Mantén el torso estable.', order_index: 0, block_type: 'single', block_label: null, block_position: null, block_rest: null, video_url: 'https://example.com/technique' },
      { id: 'assignment-2', routine_day_id: 'day-2', exercise_id: 'exercise-2', sets: 4, reps: '12', rest: '60 s', notes: null, order_index: 0, block_type: 'biserie', block_label: 'A', block_position: 1, block_rest: '2 min', video_url: null }
    ]);
    if (table === 'exercises') return json([
      { id: 'exercise-1', name: 'Press de banca', muscle_group: 'Pecho', video_url: null },
      { id: 'exercise-2', name: 'Sentadilla', muscle_group: 'Piernas', video_url: null }
    ]);
    if (table === 'routine_week_configs') return json([
      { routine_day_exercise_id: 'assignment-1', start_week: 1, end_week: 3, sets: 3, reps: '8-10', rest: '90 s', notes: 'Progresar con calma.' }
    ]);
    if (table === 'measurements') return json([{
      id: 'measurement-1', date: '2026-09-20', weight: 68.4, body_fat_percentage: 23.5, muscle_mass: 46.2
    }]);
    return json([]);
  });
  return { context, page, errors };
}

try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }]
  ]) {
    const { context, page, errors } = await makePage(viewport);
    await page.goto(`${base}/client/portal`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Hola, Ana.' }).waitFor();
    await page.getByRole('heading', { name: 'Fuerza base', level: 2 }).waitFor();
    const toggles = page.locator('.section-toggle');
    assert.equal(await toggles.count(), 4);
    assert.equal(await page.locator('#routines-toggle').getAttribute('aria-expanded'), 'true');
    const rows = await page.locator('.portal-section').evaluateAll(sections => sections.map(section => {
      const { x, y, width, bottom } = section.getBoundingClientRect();
      return { x, y, width, bottom };
    }));
    for (let index = 1; index < rows.length; index++) {
      assert.equal(rows[index].x, rows[0].x, `${name}: aligned rows`);
      assert.equal(rows[index].width, rows[0].width, `${name}: full-width rows`);
      assert.ok(rows[index].y >= rows[index - 1].bottom - 1, `${name}: vertically stacked rows`);
    }
    await page.locator('#routines-toggle').focus();
    await page.keyboard.press('Space');
    await page.locator('#routines-panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.section-panel:visible').count(), 0, `${name}: collapse all sections`);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#measurements-toggle').evaluate(element => element === document.activeElement), true, `${name}: hidden links skipped by keyboard`);
    await page.keyboard.press('Enter');
    await page.getByText('68,4 kg').waitFor();
    assert.equal(await page.locator('.section-panel:visible').count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Ver evolución' }).getAttribute('href'), '/client/measurements');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `docs/qa/client-portal-measurements-accordion-${name}.png`, fullPage: true });
    for (const [section, link, href] of [
      ['payments', 'Ver estado', '/client/payments'],
      ['profile', 'Ver información', '/client/profile']
    ]) {
      const toggle = page.locator(`#${section}-toggle`);
      await toggle.click();
      await page.locator(`#${section}-panel`).waitFor({ state: 'visible' });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('.section-panel:visible').count(), 1, `${name}: one expanded section`);
      assert.equal(await page.getByRole('link', { name: link }).getAttribute('href'), href);
      await toggle.click();
      await page.locator(`#${section}-panel`).waitFor({ state: 'hidden' });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('.section-panel:visible').count(), 0);
    }
    await page.locator('#routines-toggle').click();
    await page.locator('#routines-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#routines-panel').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `docs/qa/client-portal-${name}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Ver mis rutinas' }).click();
    await page.waitForURL(`${base}/client/routines`);
    await page.getByRole('heading', { name: 'Mis rutinas' }).waitFor();
    await page.screenshot({ path: `docs/qa/client-routines-${name}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Ver rutina Fuerza base' }).click();
    await page.waitForURL(`${base}/client/routines/routine-1`);
    await page.getByRole('heading', { name: 'Press de banca' }).waitFor();
    await page.getByText('Semanas 1–3').waitFor();
    await page.getByRole('button', { name: 'Piernas', exact: true }).click();
    await page.getByRole('heading', { name: 'Sentadilla' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: detail horizontal overflow`);
    await page.screenshot({ path: `docs/qa/client-routine-detail-${name}.png`, fullPage: true });
    await page.goto(`${base}/client/routines/not-this-client`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Esta rutina no está en tu perfil' }).waitFor();
    await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForURL(`${base}/client/portal`);
    await context.close();
    console.log(`${name}: resumen, lista, detalle, perfil y responsive verificados.`);
  }

  const { context, page, errors } = await makePage({ width: 390, height: 844 }, lastYear);
  await page.goto(`${base}/client/portal`, { waitUntil: 'networkidle' });
  await page.waitForURL(url => url.pathname === '/login' && url.searchParams.get('blocked') === 'coach-subscription-pending');
  await page.getByText('El acceso al portal está pausado').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Plan Pro vencido: acceso bloqueado y sesión cerrada.');

  const multi = await makePage({ width: 390, height: 844 }, nextYear, true);
  await multi.page.goto(`${base}/client/portal`, { waitUntil: 'networkidle' });
  await multi.page.getByRole('heading', { name: 'Hola, Lucía.' }).waitFor();
  await multi.page.getByRole('combobox', { name: 'Entrenador o gimnasio' }).click();
  await multi.page.getByRole('option', { name: 'Entrenadora Valeria' }).click();
  await multi.page.getByRole('heading', { name: 'Hola, Ana.' }).waitFor();
  assert.deepEqual(multi.errors, []);
  await multi.context.close();
  console.log('Dos perfiles: selección entre gimnasio e independiente verificada.');

  const gymOnly = await makePage({ width: 390, height: 844 }, lastYear, true);
  await gymOnly.page.goto(`${base}/client/portal`, { waitUntil: 'networkidle' });
  await gymOnly.page.getByRole('heading', { name: 'Hola, Lucía.' }).waitFor();
  assert.equal(await gymOnly.page.getByLabel('Entrenador o gimnasio').count(), 0);
  assert.deepEqual(gymOnly.errors, []);
  await gymOnly.context.close();
  console.log('Plan Pro vencido: acceso de gimnasio permanece disponible.');
} finally {
  await browser.close();
}
