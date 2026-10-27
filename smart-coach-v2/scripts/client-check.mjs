import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const coachId = '11111111-1111-4111-8111-111111111111';
const session = { access_token: 'client-test-token', refresh_token: 'client-test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: coachId, aud: 'authenticated', role: 'authenticated', email: 'valeria@zummith.test' } };
const initialClient = { id: 'c1', primary_coach_id: coachId, name: 'Jeff Jara', email: 'jeffjara@gmail.com', phone: '88887777', birth_date: '1996-05-10', age: 30, weight: 78.2, height: 178, goal: 'Preparación de fuerza', notes: 'Priorizar técnica.', address: 'San José', portal_status: 'pending', portal_invited_at: null, created_at: '2026-09-13T12:00:00Z' };

await mkdir('docs/qa', { recursive: true });
const browser = await chromium.launch();

async function setup(viewport, options = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript((value) => localStorage.setItem('zummith-auth', JSON.stringify(value)), session);
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  let client = structuredClone(initialClient);
  const clientList = options.clientList || [client];
  let routines = [{ id: 'r1', coach_id: coachId, client_id: 'c1', name: 'Base de fuerza', objective: 'Mejorar fuerza general', training_days_count: 3, duration_weeks: 6, start_date: '2026-09-01', end_date: '2026-10-12', notes: null, created_at: '2026-09-01T12:00:00Z' }];
  let measurements = [
    { id: 'm1', client_id: 'c1', date: '2026-09-10', weight: 78.2, height: 178, bmi: 24.68, body_fat_percentage: 16.4, muscle_mass: 61.2, visceral_fat: 7, metabolic_age: 29, calories: 2240, bone_mass: 3.1, water_percentage: 57.4, waist: 81, hips: 96, chest: 102, arms: 36, legs: 58, calf: 38, thigh: 56, notes: 'Control inicial', created_at: '2026-09-10T12:00:00Z' },
    { id: 'm0', client_id: 'c1', date: '2026-08-10', weight: 80.1, height: 178, bmi: 25.28, body_fat_percentage: 17.2, muscle_mass: 60.5, notes: 'Punto de partida', created_at: '2026-08-10T12:00:00Z' }
  ];
  let sheets = [{ id: 's1', coach_id: coachId, client_id: 'c1', program_title: 'Temporada 2026', mesocycle_title: 'Acumulación', macrocycle_title: 'Macrociclo principal', frequency_text: '4 veces por semana', split_text: 'Superior e inferior', training_days_text: 'Lunes, martes, jueves y viernes', day_labels: [], week_plans: [], workouts: [{ title: 'Sesión A' }], created_at: '2026-09-08T12:00:00Z' }];
  let trainingHistoryReads = 0;
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/auth/v1/recover**', (route) => {
    writes.push('portal:email');
    return route.fulfill({ status: 200, json: {} });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    const method = request.method();
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const json = (body, status = 200) => route.fulfill({ status, json: body });

    if (table === 'coaches') {
      if (url.searchParams.has('email')) return json([]);
      return json({ id: coachId, name: 'Valeria Mora', email: session.user.email, role: 'coach', account_type: options.accountType || 'independent', coach_plan: options.plan || 'standard', next_plan_payment_date: options.paymentDate || null, brand_color: '#CCFF00' });
    }
    if (table === 'clients') {
      if (method === 'POST') { client = { ...request.postDataJSON(), id: 'c2', created_at: new Date().toISOString() }; writes.push('client:create'); return json({ id: client.id }, 201); }
      if (method === 'PATCH') { Object.assign(client, request.postDataJSON()); writes.push('client:update'); return json([{ id: client.id }]); }
      if (url.searchParams.has('email')) {
        const searchedEmail = url.searchParams.get('email')?.replace(/^eq\./, '');
        const matchingClient = searchedEmail === client.email ? client : null;
        return request.headers()['accept']?.includes('vnd.pgrst.object')
          ? json(matchingClient || {}, matchingClient ? 200 : 406)
          : json(matchingClient ? [client] : []);
      }
      return json(id ? (clientList.find((row) => row.id === id) || client) : clientList);
    }
    if (table === 'delete_owned_independent_client') { writes.push('client:delete-safe'); return json({ client_deleted: true, auth_users_deleted: 1 }); }
    if (table === 'admin_ensure_auth_user_for_email') { writes.push('portal:prepare'); return json('22222222-2222-4222-8222-222222222222'); }
    if (table === 'independent_client_portal_access') { writes.push('portal:link'); return json({}, 201); }
    if (table === 'routines') {
      if (method === 'POST') { const row = { ...request.postDataJSON(), id: 'r2', created_at: new Date().toISOString() }; routines.unshift(row); writes.push('routine:create'); return json({ id: row.id }, 201); }
      if (method === 'PATCH') { routines = routines.map((row) => row.id === id ? { ...row, ...request.postDataJSON() } : row); writes.push('routine:update'); return route.fulfill({ status: 204 }); }
      if (method === 'DELETE') { routines = routines.filter((row) => row.id !== id); writes.push('routine:delete'); return route.fulfill({ status: 204 }); }
      return json(routines);
    }
    if (table === 'routine_days') return json(options.proHistory ? [
      { id: 'd1', day_name: 'Fuerza superior', day_number: 1 },
      { id: 'd2', day_name: 'Pierna', day_number: 2 }
    ] : [], 201);
    if (table === 'measurements') {
      if (method === 'POST') { measurements.unshift({ ...request.postDataJSON(), id: 'm2', created_at: new Date().toISOString() }); writes.push('measurement:create'); return json([{ id: 'm2' }], 201); }
      if (method === 'PATCH') { measurements = measurements.map((row) => row.id === id ? { ...row, ...request.postDataJSON() } : row); writes.push('measurement:update'); return json([{ id }]); }
      if (method === 'DELETE') { measurements = measurements.filter((row) => row.id !== id); writes.push('measurement:delete'); return json([{ id }]); }
      return json(measurements);
    }
    if (table === 'competitor_sheets') {
      if (method === 'POST') { sheets.unshift({ ...request.postDataJSON(), id: 's2', created_at: new Date().toISOString() }); writes.push('competitor:create'); return json({}, 201); }
      if (method === 'PATCH') { sheets = sheets.map((row) => row.id === id ? { ...row, ...request.postDataJSON() } : row); writes.push('competitor:update'); return route.fulfill({ status: 204 }); }
      if (method === 'DELETE') { sheets = sheets.filter((row) => row.id !== id); writes.push('competitor:delete'); return route.fulfill({ status: 204 }); }
      return json(sheets);
    }
    if (table === 'training_sessions') {
      trainingHistoryReads += 1;
      return json(options.proHistory ? [
        { id: 'ts1', routine_day_id: 'd1', session_date: '2026-09-20', status: 'completed', started_at: '2026-09-20T12:00:00Z', updated_at: '2026-09-20T13:00:00Z' },
        { id: 'ts2', routine_day_id: 'd2', session_date: '2026-09-20', status: 'in_progress', started_at: '2026-09-20T14:00:00Z', updated_at: '2026-09-20T14:30:00Z' }
      ] : []);
    }
    if (table === 'training_session_sets') return json(options.proHistory ? [
      { id: 'set1', training_session_id: 'ts1', routine_day_id: 'd1', exercise_name: 'Press banca', exercise_order: 0, set_number: 1, actual_reps: 8, rir: 2, load: 80, load_unit: 'kg' },
      { id: 'set2', training_session_id: 'ts1', routine_day_id: 'd1', exercise_name: 'Press banca', exercise_order: 0, set_number: 2, actual_reps: 7, rir: 1, load: 80, load_unit: 'kg' },
      { id: 'set3', training_session_id: 'ts2', routine_day_id: 'd2', exercise_name: 'Sentadilla', exercise_order: 0, set_number: 1, actual_reps: 6, rir: 3, load: 100, load_unit: 'kg' }
    ] : []);
    return json([]);
  });
  return { context, page, errors, writes, getTrainingHistoryReads: () => trainingHistoryReads };
}

async function screenshot(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
  await page.screenshot({ path: `docs/qa/${name}.png`, fullPage: true });
}

try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }], ['small-mobile', { width: 320, height: 740 }]]) {
    const { context, page, errors, writes } = await setup(viewport);
    await page.goto(`${base}/clients`, { waitUntil: 'networkidle' });
    const clientLink = page.getByRole('link', { name: 'Abrir ficha de Jeff Jara' });
    await clientLink.waitFor();
    assert.match(await clientLink.getAttribute('href'), /\/clients\/c1$/);
    await screenshot(page, `clients-cards-${name}`);
    await clientLink.click();
    await page.getByRole('heading', { name: 'Jeff Jara', level: 1 }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 5);
    await screenshot(page, `client-detail-${name}`);

    const profileTab = page.getByRole('tab', { name: 'Perfil', exact: true });
    await profileTab.click();
    await page.locator('.profile-overview').waitFor();
    assert.equal(await page.getByText('Preparación de fuerza', { exact: true }).count(), 1);
    await screenshot(page, `client-profile-${name}`);

    const routinesTab = page.getByRole('tab', { name: /Rutinas/ });
    await profileTab.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#client-routines-tab')?.getAttribute('aria-selected') === 'true');
    assert.equal(await routinesTab.getAttribute('aria-selected'), 'true');

    await page.getByRole('link', { name: 'Nueva rutina' }).click();
    await page.waitForURL((url) => url.pathname === '/routines/new' && url.searchParams.get('clientId') === 'c1');
    await page.getByRole('heading', { name: 'Nueva rutina' }).waitFor();
    await page.goBack({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Jeff Jara', level: 1 }).waitFor();
    await page.getByRole('tab', { name: /Rutinas/ }).click();
    const routineLink = page.getByRole('link', { name: /Base de fuerza/ });
    assert.match(await routineLink.getAttribute('href'), /\/routines\/r1$/);

    await page.getByRole('tab', { name: /Mediciones/ }).click();
    await page.getByRole('heading', { name: 'Historial completo' }).waitFor();
    assert.equal(await page.locator('.measurement-summary-grid article').count(), 4);
    assert.match(await page.locator('.measurement-summary-grid article').first().textContent(), /↓ 1,9 kg/);
    await page.getByRole('button', { name: 'Grasa', exact: true }).click();
    assert.equal(await page.locator('.chart-frame').count(), 1);
    await page.locator('.measurement-row').first().getByText('Ver todos los indicadores').click();
    await page.getByText(/2.*240 kcal/).waitFor();
    await screenshot(page, `client-measurements-${name}`);
    await page.getByRole('button', { name: 'Nueva medición' }).click();
    await page.locator('#measurement-title').waitFor();
    await page.locator('[formcontrolname="weight"]').fill('79');
    await page.locator('[formcontrolname="height"]').fill('178');
    await page.getByRole('button', { name: 'Guardar medición' }).click();
    await page.getByText('La medición quedó guardada.').waitFor();
    assert.ok(writes.includes('measurement:create'));
    const createdMeasurement = page.locator('.measurement-row').filter({ hasText: '79 kg' });
    await createdMeasurement.getByRole('button', { name: 'Editar' }).click();
    await page.locator('[formcontrolname="weight"]').fill('80');
    await page.getByRole('button', { name: 'Guardar medición' }).click();
    await page.locator('.measurement-row').filter({ hasText: '80 kg' }).waitFor();
    assert.ok(writes.includes('measurement:update'));
    await page.locator('.measurement-row').filter({ hasText: '80 kg' }).getByRole('button', { name: 'Eliminar' }).click();
    await page.locator('.confirm-dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.locator('.measurement-row').filter({ hasText: '80 kg' }).waitFor({ state: 'detached' });
    assert.ok(writes.includes('measurement:delete'));

    await page.getByRole('tab', { name: /Competidor/ }).click();
    await page.getByRole('link', { name: 'Nueva hoja' }).click();
    await page.waitForURL((url) => url.pathname === '/competitor/new' && url.searchParams.get('clientId') === 'c1');
    await page.getByRole('heading', { name: 'Nueva hoja de competidor' }).waitFor();
    await page.goBack({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Jeff Jara', level: 1 }).waitFor();
    await page.getByRole('tab', { name: /Competidor/ }).click();
    const competitorLink = page.getByRole('link', { name: 'Editar' });
    assert.match(await competitorLink.getAttribute('href'), /\/competitor\/s1\/edit$/);

    await page.getByRole('tab', { name: /RIR/ }).click();
    await page.locator('#pro-title').waitFor();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: /Competidor/ }).getAttribute('aria-selected'), 'true');

    const profileEditAction = page.locator('.client-utilities').getByRole('button', { name: 'Editar', exact: true });
    await profileEditAction.click();
    await page.locator('#client-name').waitFor();
    assert.equal(new URL(page.url()).pathname, '/clients/c1');
    await page.locator('.profile-editor').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('.profile-overview').waitFor();
    assert.equal(new URL(page.url()).pathname, '/clients/c1');

    if (name === 'desktop') {
      await page.goto(`${base}/clients/c1/edit`, { waitUntil: 'networkidle' });
      await page.locator('#client-name').waitFor();
      assert.equal(await page.locator('.client-tabs').getByRole('tab', { name: 'Perfil', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.profile-subtabs').getByRole('tab', { name: 'Editar', exact: true }).getAttribute('aria-selected'), 'true');
      await page.locator('.profile-editor').getByRole('button', { name: 'Cancelar', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/clients/c1');
      await page.getByRole('heading', { name: 'Jeff Jara', level: 1 }).waitFor();
    }

    await profileEditAction.click();
    await page.locator('#client-name').waitFor();
    assert.equal(await page.locator('#client-name').inputValue(), 'Jeff Jara');
    await page.locator('#client-name').fill('Jeff Jara Campos');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.getByRole('heading', { name: 'Jeff Jara Campos', level: 1 }).waitFor();
    await page.getByText('Los cambios del cliente se guardaron.').waitFor();
    assert.equal(new URL(page.url()).pathname, '/clients/c1');
    assert.ok(writes.includes('client:update'));
    await page.getByRole('button', { name: 'Eliminar', exact: true }).first().click();
    await page.locator('#delete-title').waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(writes.includes('client:delete-safe'), false);
    await page.getByRole('button', { name: 'Eliminar', exact: true }).first().click();
    await page.locator('.confirm-dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.waitForURL('**/clients?result=deleted');
    await page.getByText('El cliente y su información relacionada se eliminaron correctamente.').waitFor();
    assert.ok(writes.includes('client:delete-safe'));
    assert.deepEqual(errors, []);
    console.log(`${name}: client navigation, complete routine and competitor handoffs, related CRUD, Pro gating, client edit/delete and responsive layout passed.`);
    await context.close();
  }

  {
    const manyClients = Array.from({ length: 23 }, (_, index) => ({
      ...initialClient,
      id: `c${index + 1}`,
      name: `Cliente ${String(index + 1).padStart(2, '0')}`,
      email: `cliente${index + 1}@zummith.test`,
      created_at: new Date(Date.UTC(2026, 8, 23 - index)).toISOString()
    }));
    const { context, page, errors } = await setup(
      { width: 1280, height: 900 },
      { clientList: manyClients }
    );
    await page.goto(`${base}/clients`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.client-card').count(), 10);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByText('Página 2 de 3').waitFor();
    const search = page.getByRole('searchbox', { name: 'Buscar cliente' });
    await search.fill('Cliente 23');
    await page.waitForTimeout(350);
    await page.getByText('Página 1 de 1').waitFor();
    assert.equal(await page.locator('.client-card').count(), 1);
    await page.getByRole('button', { name: 'Ayuda' }).click();
    await page.getByRole('dialog', { name: 'Guía de clientes' }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, errors } = await setup({ width: 390, height: 844 });
    await page.goto(`${base}/measurements`, { waitUntil: 'networkidle' });
    const measurementLink = page.getByRole('link', { name: /Jeff Jara/ }).first();
    assert.match(await measurementLink.getAttribute('href'), /\/clients\/c1\?tab=measurements$/);
    await measurementLink.click();
    await page.waitForFunction(() => document.querySelector('#client-measurements-tab')?.getAttribute('aria-selected') === 'true');
    await page.getByRole('heading', { name: 'Historial completo' }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, errors, getTrainingHistoryReads } = await setup(
      { width: 390, height: 844 },
      { plan: 'paid', paymentDate: '2026-10-23', proHistory: true }
    );
    await page.goto(`${base}/clients/c1?tab=rir`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Press banca' }).waitFor();
    assert.equal(await page.locator('.rir-session').count(), 1);
    assert.equal(await page.locator('.rir-exercise-card').count(), 2);
    await page.getByText('Día 1 · Fuerza superior').waitFor();
    await screenshot(page, 'client-rir-pro-mobile');
    const readsBeforeRefresh = getTrainingHistoryReads();
    await page.waitForTimeout(5200);
    assert.ok(getTrainingHistoryReads() > readsBeforeRefresh, 'RIR should refresh every five seconds while active');
    await page.getByRole('tab', { name: /Mediciones/ }).click();
    const readsAfterLeaving = getTrainingHistoryReads();
    await page.waitForTimeout(5200);
    assert.equal(getTrainingHistoryReads(), readsAfterLeaving, 'RIR refresh should stop after leaving the tab');
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, writes } = await setup(
      { width: 390, height: 844 },
      { plan: 'paid', paymentDate: '2026-10-23' }
    );
    await page.goto(`${base}/clients/new`, { waitUntil: 'networkidle' });
    await page.locator('#client-name').fill('Nueva Atleta');
    await page.locator('#client-email').fill('nueva@zummith.test');
    await page.locator('#client-birth').fill('1995-04-20');
    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await page.waitForURL((url) => url.pathname === '/clients/c2' && url.searchParams.get('portalInvite') === 'sent');
    await page.getByText('El cliente se creó y la invitación al portal fue enviada.').waitFor();
    assert.ok(writes.includes('client:create'));
    assert.ok(writes.includes('portal:prepare'));
    assert.ok(writes.includes('portal:link'));
    assert.ok(writes.includes('portal:email'));
    await context.close();
  }

  {
    const { context, page } = await setup(
      { width: 390, height: 844 },
      { plan: 'paid', paymentDate: '2026-09-01' }
    );
    await page.goto(`${base}/clients/c1`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /RIR/ }).click();
    await page.getByRole('heading', { name: 'Tu acceso Pro está pendiente' }).waitFor();
    await page.getByText('Renueva o confirma el pago').waitFor();
    await context.close();
  }
} finally {
  await browser.close();
}
