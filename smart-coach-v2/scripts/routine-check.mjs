import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const authKey = process.env.ZUMMITH_TEST_AUTH_KEY || 'zummith-auth';
const coachId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const routineId = '33333333-3333-4333-8333-333333333333';
const session = {
  access_token: 'routine-test-token', refresh_token: 'routine-test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
  user: { id: coachId, aud: 'authenticated', role: 'authenticated', email: 'valeria@zummith.test', user_metadata: { name: 'Valeria Mora' } }
};
const profile = {
  id: coachId, name: 'Valeria Mora', email: session.user.email, role: 'coach',
  account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: '2027-12-31', brand_color: '#CCFF00'
};
const clients = [
  { id: clientId, name: 'Daniela Solís', email: 'daniela@example.com' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Andrés Vargas', email: 'andres@example.com' }
];
const exercises = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', name: 'Press banca', muscle_group: 'Pecho', source: 'global', image_url: '/assets/exercises-astra/strength.jpg', video_url: null, description: 'Press horizontal.', created_at: '2026-09-01T12:00:00Z' },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', name: 'Aperturas con mancuernas', muscle_group: 'Pecho', source: 'global', image_url: '/assets/exercises-astra/strength.jpg', video_url: null, description: 'Apertura controlada.', created_at: '2026-09-01T12:00:00Z' },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', name: 'Remo sentado', muscle_group: 'Espalda', source: 'global', image_url: '/assets/exercises-astra/training.jpg', video_url: null, description: 'Remo horizontal.', created_at: '2026-09-01T12:00:00Z' },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', name: 'Caminadora', muscle_group: 'Cardio', source: 'global', image_url: '/assets/exercises-astra/movement.jpg', video_url: null, description: 'Cardio suave.', created_at: '2026-09-01T12:00:00Z' }
];

await mkdir('docs/qa', { recursive: true });
const browser = await chromium.launch();

function buildSavedRows(plan) {
  const days = plan.days.map((day, index) => ({
    id: `55555555-5555-4555-8555-55555555555${index}`,
    routine_id: routineId,
    day_number: day.day_number,
    day_name: day.day_name,
    muscle_groups: day.muscle_groups,
    notes: day.notes
  }));
  const dayExercises = [];
  const weekConfigs = [];
  plan.days.forEach((day, dayIndex) => day.exercises.forEach((exercise, exerciseIndex) => {
    const id = `66666666-6666-4666-8666-${String(dayIndex * 10 + exerciseIndex).padStart(12, '0')}`;
    const catalog = exercises.find((item) => item.id === exercise.exercise_id);
    dayExercises.push({
      id, routine_day_id: days[dayIndex].id, exercise_id: exercise.exercise_id,
      sets: exercise.sets, reps: exercise.reps, rest: exercise.rest, notes: exercise.notes,
      is_superset: exercise.block_type !== 'single', video_url: exercise.video_url,
      image_url: exercise.image_url, order_index: exercise.order_index,
      block_type: exercise.block_type, block_id: exercise.block_id, block_label: exercise.block_label,
      block_position: exercise.block_position, block_rest: exercise.block_rest,
      exercises: catalog && { id: catalog.id, name: catalog.name, muscle_group: catalog.muscle_group, source: catalog.source, image_url: catalog.image_url, video_url: catalog.video_url }
    });
    exercise.week_configs.forEach((config, configIndex) => weekConfigs.push({
      id: `77777777-7777-4777-8777-${String(dayIndex * 100 + exerciseIndex * 10 + configIndex).padStart(12, '0')}`,
      routine_day_exercise_id: id,
      start_week: config.start_week, end_week: config.end_week, sets: config.sets,
      reps: config.reps, rest: config.rest, notes: config.notes
    }));
  }));
  return { days, dayExercises, weekConfigs };
}

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
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => ({ selector: `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }))
      .filter((item) => item.right > innerWidth + 1 || item.left < -1)
      .slice(0, 8)
  }));
  assert.equal(overflow.hasOverflow, false, `${name}: horizontal overflow ${JSON.stringify(overflow)}`);
  assert.equal(await page.evaluate(() => [...document.images].some((image) => image.complete && image.naturalWidth === 0)), false, `${name}: broken image`);
  await page.screenshot({ path: `docs/qa/${name}.png`, fullPage: true });
  await page.screenshot({ path: `docs/qa/${name}-viewport.png` });
}

async function setup(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: authKey, value: session });
  const page = await context.newPage();
  const errors = [];
  const saves = [];
  const deletes = [];
  const dialogs = [];
  let savedPlan = null;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, json: new URL(route.request().url()).pathname.endsWith('/user') ? session.user : {} }));

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split('/').pop();
    const json = (body, status = 200) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, json: body });
    if (resource === 'save_routine_plan') {
      const body = request.postDataJSON();
      savedPlan = body.p_plan;
      saves.push(structuredClone(savedPlan));
      return json(routineId);
    }
    if (resource === 'coaches') return json(profile);
    if (resource === 'clients') return json(clients);
    if (resource === 'exercises') return json(exercises);
    if (resource === 'routines') {
      if (request.method() === 'DELETE') {
        deletes.push(routineId);
        savedPlan = null;
        return json([{ id: routineId }]);
      }
      if (!savedPlan) return json([]);
      return json({
        id: routineId, coach_id: coachId, client_id: savedPlan.client_id,
        name: savedPlan.name, objective: savedPlan.objective,
        training_days_count: savedPlan.training_days_count, duration_weeks: savedPlan.duration_weeks,
        start_date: savedPlan.start_date, end_date: savedPlan.end_date, notes: savedPlan.notes,
        warmup_enabled: savedPlan.warmup.enabled, warmup_custom_text: savedPlan.warmup.custom_text,
        created_at: '2026-09-23T12:00:00Z', updated_at: '2026-09-23T12:00:00Z',
        clients: { name: 'Daniela Solís' }
      });
    }
    const rows = savedPlan ? buildSavedRows(savedPlan) : { days: [], dayExercises: [], weekConfigs: [] };
    if (resource === 'routine_days') return json(rows.days);
    if (resource === 'routine_day_exercises') return json(rows.dayExercises);
    if (resource === 'routine_week_configs') return json(rows.weekConfigs);
    if (resource === 'routine_warmup_exercises') {
      return json((savedPlan?.warmup.exercise_ids || []).map((id, index) => ({
        exercise_id: id, order_index: index, exercises: exercises.find((exercise) => exercise.id === id)
      })));
    }
    return json([]);
  });
  return { context, page, errors, saves, deletes, dialogs };
}

async function choose(page, label, option) {
  const control = page.getByRole('combobox', { name: label, exact: true });
  await control.scrollIntoViewIfNeeded();
  await control.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await control.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function waitForDay(page, index, exerciseCount) {
  await page.locator(`#routine-day-${index}[aria-current="step"]`).waitFor();
  await page.waitForFunction(count => document.querySelectorAll('.prescription-card').length === count, exerciseCount);
}

async function createRoutine(viewport, name) {
  const state = await setup(viewport);
  const { page, errors, saves, dialogs } = state;
  await page.goto(`${base}/routines/new?clientId=${clientId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Nueva rutina', exact: true }).waitFor();
  assert.equal(await page.locator('.client-options label.selected').count(), 1);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.locator('#routine-name').fill('Fuerza base de Daniela');
  await page.locator('#routine-objective').fill('Mejorar fuerza y técnica');
  await choose(page, 'Días por semana', '3 días');
  await page.locator('#routine-weeks').fill('6');
  await page.getByRole('button', { name: 'Continuar' }).click();

  const dayCards = page.locator('.day-setup');
  await dayCards.nth(0).getByRole('button', { name: 'Pecho', exact: true }).click();
  await dayCards.nth(1).getByRole('button', { name: 'Espalda', exact: true }).click();
  await dayCards.nth(2).getByRole('button', { name: 'Cardio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  const dayTabs = page.locator('.day-tabs button');
  assert.equal(await dayTabs.nth(0).getAttribute('aria-current'), 'step');
  assert.equal(await dayTabs.nth(1).isDisabled(), true);
  assert.equal(await dayTabs.nth(2).isDisabled(), true);
  await page.getByRole('button', { name: 'Siguiente día', exact: true }).click();
  await page.locator('#routine-validation').waitFor();
  assert.match(await page.locator('#routine-validation').textContent(), /Día 1/);
  assert.equal(await dayTabs.nth(0).getAttribute('aria-current'), 'step');
  const fields = await page.locator('.catalog-filters').evaluate(element => {
    const search = element.querySelector('.search-input-shell');
    const select = element.querySelector('.custom-select-trigger');
    const searchRect = search.getBoundingClientRect();
    const selectRect = select.getBoundingClientRect();
    return { searchHeight: searchRect.height, selectHeight: selectRect.height, searchWidth: searchRect.width, selectWidth: selectRect.width,
      searchFont: getComputedStyle(search.querySelector('input')).fontSize, selectFont: getComputedStyle(select).fontSize };
  });
  assert.equal(fields.searchHeight, 50);
  assert.equal(fields.selectHeight, fields.searchHeight);
  assert.ok(Math.abs(fields.searchWidth - fields.selectWidth) < 1);
  assert.equal(fields.searchFont, fields.selectFont);

  await page.locator('.catalog-list article').filter({ hasText: 'Press banca' }).getByRole('button', { name: 'Agregar' }).click();
  await page.locator('.catalog-list article').filter({ hasText: 'Aperturas con mancuernas' }).getByRole('button', { name: 'Agregar' }).click();
  await page.locator('.prescription-card').first().getByRole('button', { name: 'Crear biserie' }).click();
  await page.locator('.prescription-card').first().getByText('Progresión por semanas').click();
  await page.locator('.prescription-card').first().getByRole('button', { name: 'Agregar rango' }).click();

  await page.getByRole('button', { name: 'Siguiente día', exact: true }).click();
  await waitForDay(page, 1, 0);
  assert.equal(await dayTabs.nth(1).getAttribute('aria-current'), 'step');
  assert.equal(await dayTabs.nth(2).isDisabled(), true);
  await page.getByRole('navigation', { name: 'Navegación de mi cuenta', exact: true }).getByRole('link', { name: 'Clientes', exact: true }).first().click();
  await page.waitForURL(url => url.pathname === '/clients');
  assert.deepEqual(dialogs, [], 'Leaving a new routine must not show a browser confirmation.');
  await page.goto(`${base}/routines/new?clientId=${clientId}`, { waitUntil: 'networkidle' });
  await waitForDay(page, 1, 0);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForDay(page, 1, 0);
  assert.equal(await dayTabs.nth(1).getAttribute('aria-current'), 'step');
  assert.equal(await dayTabs.nth(0).locator('small').textContent(), '2 ejercicios');
  await page.locator('.catalog-list article').filter({ hasText: 'Remo sentado' }).getByRole('button', { name: 'Agregar' }).click();
  await page.getByRole('button', { name: 'Día anterior', exact: true }).click();
  await waitForDay(page, 0, 2);
  assert.equal(await page.locator('.prescription-card').count(), 2);
  await page.getByRole('button', { name: 'Siguiente día', exact: true }).click();
  await waitForDay(page, 1, 1);
  assert.equal(await page.locator('.prescription-card').count(), 1);
  await page.getByRole('button', { name: 'Siguiente día', exact: true }).click();
  await waitForDay(page, 2, 0);
  assert.equal(await dayTabs.nth(2).getAttribute('aria-current'), 'step');
  await page.locator('.catalog-list article').filter({ hasText: 'Caminadora' }).getByRole('button', { name: 'Agregar' }).click();
  await page.getByRole('checkbox', { name: 'Incluir' }).check();
  await choose(page, 'Agregar ejercicio', 'Caminadora');
  await page.locator('.warmup-content textarea').fill('Cinco minutos a intensidad suave.');
  await assertLayout(page, `routine-builder-${name}`);

  await page.getByRole('button', { name: 'Revisar rutina', exact: true }).click();
  await page.getByRole('heading', { name: 'Rutina lista para guardar' }).waitFor();
  await page.getByRole('button', { name: 'Guardar rutina' }).click();
  await page.waitForURL((url) => url.pathname === `/routines/${routineId}`);
  await page.getByRole('heading', { name: /Fuerza base de Daniela/, level: 1 }).waitFor();

  assert.equal(saves.length, 1);
  assert.equal(saves[0].days.length, 3);
  assert.deepEqual(saves[0].days.map(day => day.exercises.length), [2, 1, 1]);
  assert.equal(saves[0].days[0].exercises.length, 2);
  assert.equal(saves[0].days[0].exercises[0].block_type, 'biserie');
  assert.equal(saves[0].days[0].exercises[0].week_configs.length, 1);
  assert.deepEqual(saves[0].warmup.exercise_ids, [exercises[3].id]);
  await assertLayout(page, `routine-detail-${name}`);
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, [], 'Draft recovery and refresh must not display browser dialogs.');
  return state;
}

try {
  const desktop = await createRoutine({ width: 1440, height: 1000 }, 'desktop');
  await desktop.page.getByRole('button', { name: 'Editar rutina' }).click();
  await desktop.page.locator('.builder-progress button').filter({ hasText: 'Ejercicios' }).click();
  const aperturas = desktop.page.locator('.prescription-card').filter({ hasText: 'Aperturas con mancuernas' });
  await aperturas.getByRole('button', { name: 'Reemplazar' }).click();
  await desktop.page.locator('.catalog-list article').filter({ hasText: 'Caminadora' }).getByRole('button', { name: 'Usar' }).click();
  const caminadora = desktop.page.locator('.prescription-card').filter({ hasText: 'Caminadora' });
  await choose(caminadora, 'Mover a', 'Día 2');
  await desktop.page.locator('.builder-progress button').filter({ hasText: 'Revisión' }).click();
  await desktop.page.getByRole('button', { name: 'Guardar cambios' }).click();
  await desktop.page.getByText('Los cambios de la rutina se guardaron correctamente.').waitFor();
  assert.equal(desktop.saves.length, 2);
  assert.equal(desktop.saves[1].id, routineId);
  assert.equal(desktop.saves[1].days[0].exercises.length, 1);
  assert.equal(desktop.saves[1].days[1].exercises.length, 2);
  assert.equal(desktop.saves[1].days[1].exercises[1].exercise_id, exercises[3].id);
  await desktop.page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await desktop.page.getByRole('button', { name: 'Eliminar rutina' }).click();
  await desktop.page.waitForURL((url) => url.pathname === '/routines');
  assert.deepEqual(desktop.deletes, [routineId]);
  await desktop.context.close();

  const mobile = await createRoutine({ width: 390, height: 844 }, 'mobile');
  await mobile.context.close();
  const tablet = await createRoutine({ width: 768, height: 1024 }, 'tablet');
  await tablet.context.close();
  const smallMobile = await createRoutine({ width: 320, height: 740 }, 'small-mobile');
  await smallMobile.context.close();
  console.log('sequential days, draft recovery, aligned filters, create, progression, grouped blocks, warmup, edit, delete and responsive layouts passed.');
} finally {
  await browser.close();
}
