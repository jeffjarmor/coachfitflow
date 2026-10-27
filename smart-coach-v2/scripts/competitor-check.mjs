import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const coachId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const sheetId = '99999999-9999-4999-8999-999999999999';
const session = {
  access_token: 'competitor-test-token', refresh_token: 'competitor-test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
  user: { id: coachId, aud: 'authenticated', role: 'authenticated', email: 'valeria@zummith.test', user_metadata: { name: 'Valeria Mora' } }
};
const profile = {
  id: coachId, name: 'Valeria Mora', email: session.user.email, phone: '8888-7777', role: 'coach',
  account_type: 'independent', coach_plan: 'standard', next_plan_payment_date: null, brand_color: '#4f6500', logo_url: null
};
const clients = [
  { id: clientId, name: 'Daniela Solís', email: 'daniela@example.com' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Andrés Vargas', email: 'andres@example.com' }
];

await mkdir('docs/qa', { recursive: true });
const browser = await chromium.launch();

async function assertLayout(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length
  }));
  assert.equal(layout.overflow, false, `${name}: horizontal overflow ${JSON.stringify(layout)}`);
  assert.equal(layout.brokenImages, 0, `${name}: broken images`);
  await page.screenshot({ path: `docs/qa/${name}.png`, fullPage: true });
  await page.screenshot({ path: `docs/qa/${name}-viewport.png` });
}

async function setup(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true });
  await context.addInitScript((value) => localStorage.setItem('zummith-auth', JSON.stringify(value)), session);
  const page = await context.newPage();
  const saves = [];
  const deletes = [];
  const errors = [];
  let savedSheet = null;
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const resource = url.pathname.split('/').pop();
    const json = (body, status = 200) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, json: body });
    if (resource === 'save_competitor_sheet') {
      const body = request.postDataJSON();
      savedSheet = body.p_sheet;
      saves.push(structuredClone(savedSheet));
      return json(sheetId);
    }
    if (resource === 'coaches') return json(profile);
    if (resource === 'clients') return json(clients);
    if (resource === 'competitor_sheets') {
      if (request.method() === 'DELETE') {
        deletes.push(sheetId);
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (!savedSheet) return json([]);
      return json({
        id: sheetId, coach_id: coachId, client_id: savedSheet.client_id,
        program_title: savedSheet.program_title, mesocycle_title: savedSheet.mesocycle_title,
        macrocycle_title: savedSheet.macrocycle_title, frequency_text: savedSheet.frequency_text,
        split_text: savedSheet.split_text, training_days_text: savedSheet.training_days_text,
        day_labels: savedSheet.day_labels, week_plans: savedSheet.week_plans, workouts: savedSheet.workouts,
        created_at: '2026-09-23T12:00:00Z', updated_at: '2026-09-23T12:00:00Z',
        clients: { name: 'Daniela Solís' }
      });
    }
    return json([]);
  });
  return { context, page, saves, deletes, errors };
}

async function completeGeneral(page) {
  await page.locator('#program-title').fill('Preparación nacional 2026');
  await page.locator('#mesocycle-title').fill('Fuerza específica');
  await page.locator('#macrocycle-title').fill('Temporada nacional');
  await page.locator('#frequency-text').fill('4 veces por semana');
  await page.locator('#split-text').fill('Piernas y torso');
  await page.locator('#training-days-text').fill('Lunes, miércoles, viernes y sábado');
  await page.getByRole('button', { name: 'Agregar entreno' }).click();
  const rows = page.locator('.workout-row');
  await rows.nth(1).getByRole('button', { name: 'Mover entrenamiento arriba' }).click();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await rows.nth(0).getByLabel('Título', { exact: true }).fill('Piernas y potencia');
  await rows.nth(0).getByLabel('Subtítulo', { exact: true }).fill('Trabajo específico inferior');
  await rows.nth(0).getByLabel('Código', { exact: true }).fill('PIE-A');
  await rows.nth(1).getByLabel('Título', { exact: true }).fill('Torso y fuerza');
  await rows.nth(1).getByLabel('Código', { exact: true }).fill('TOR-B');
  await page.getByRole('button', { name: 'Agregar día' }).click();
  await page.getByRole('button', { name: 'Agregar semana' }).click();
  const assignments = page.locator('.schedule-grid select');
  await assignments.nth(0).selectOption('A');
  await assignments.nth(2).selectOption('B');
  await assignments.nth(4).selectOption('B');
  await assignments.nth(7).selectOption('A');
}

async function createSheet(viewport, name) {
  const state = await setup(viewport);
  const { page, saves, errors } = state;
  await page.goto(`${base}/competitor/new?clientId=${clientId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Prepara cada fase de competición.' }).waitFor();
  assert.equal(await page.locator('#competitor-client').inputValue(), clientId);
  await completeGeneral(page);
  await assertLayout(page, `competitor-general-${name}`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByRole('heading', { name: 'Entrenamiento A', exact: true }).waitFor();
  const firstBlock = page.locator('.exercise-block').first();
  await firstBlock.getByLabel('Ejercicio').fill('Sentadilla frontal');
  await page.getByRole('button', { name: 'Agregar ejercicio' }).click();
  const secondBlock = page.locator('.exercise-block').nth(1);
  await secondBlock.getByLabel('Ejercicio').fill('Salto al cajón');
  await secondBlock.getByRole('button', { name: 'Mover bloque arriba' }).click();
  await assertLayout(page, `competitor-workout-${name}`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByRole('heading', { name: 'Entrenamiento B', exact: true }).waitFor();
  await page.locator('.exercise-block').first().getByLabel('Ejercicio').fill('Press banca');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('heading', { name: 'Lista para guardar y exportar' }).waitFor();
  await assertLayout(page, `competitor-review-${name}`);
  await page.locator('.editor-footer').getByRole('button', { name: 'Guardar hoja' }).click();
  await page.waitForURL((url) => url.pathname === `/competitor/${sheetId}/edit`);
  await page.getByText('La hoja de competidor quedó guardada.').waitFor();

  assert.equal(saves.length, 1);
  assert.equal(saves[0].day_labels.length, 4);
  assert.equal(saves[0].week_plans.length, 2);
  assert.equal(saves[0].workouts.length, 2);
  assert.equal(saves[0].workouts[0].title, 'Piernas y potencia');
  assert.equal(saves[0].workouts[0].code, 'PIE-A');
  assert.equal(saves[0].workouts[0].blocks.length, 2);
  assert.equal(saves[0].workouts[0].blocks[0].name, 'Salto al cajón');
  assert.equal(saves[0].workouts[0].blocks[0].microcycles.length, 3);
  assert.deepEqual(errors, []);
  return state;
}

async function goToReview(page) {
  if (await page.getByRole('heading', { name: 'Lista para guardar y exportar' }).count()) return;
  await page.getByRole('heading', { name: 'Atleta y estructura general' }).waitFor();
  await page.locator('.editor-footer').getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('heading', { name: 'Entrenamiento A', exact: true }).waitFor();
  await page.locator('.editor-footer').getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('heading', { name: 'Entrenamiento B', exact: true }).waitFor();
  await page.locator('.editor-footer').getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('heading', { name: 'Lista para guardar y exportar' }).waitFor();
}

try {
  const desktop = await createSheet({ width: 1440, height: 1000 }, 'desktop');
  await goToReview(desktop.page);
  const downloadPromise = desktop.page.waitForEvent('download', { timeout: 10000 }).catch(async (error) => {
    const feedback = await desktop.page.locator('.feedback').allTextContents();
    const buttons = await desktop.page.getByRole('button').allTextContents();
    throw new Error(`PDF download did not start. Feedback: ${JSON.stringify(feedback)}. Buttons: ${JSON.stringify(buttons)}. Page errors: ${JSON.stringify(desktop.errors)}. ${error.message}`);
  });
  await desktop.page.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'Daniela_Solis_competidor.pdf');
  const stream = await download.createReadStream();
  let pdfBytes = 0;
  for await (const chunk of stream) pdfBytes += chunk.length;
  assert.ok(pdfBytes > 1000, `PDF too small: ${pdfBytes}`);

  await desktop.page.locator('.sheet-progress button').first().click();
  await desktop.page.locator('#macrocycle-title').fill('Temporada nacional ajustada');
  await goToReview(desktop.page);
  await desktop.page.locator('.editor-footer').getByRole('button', { name: 'Guardar cambios' }).click();
  await desktop.page.getByText('Los cambios de la hoja se guardaron correctamente.').waitFor();
  assert.equal(desktop.saves.length, 2);
  assert.equal(desktop.saves[1].macrocycle_title, 'Temporada nacional ajustada');
  await desktop.page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await desktop.page.getByRole('button', { name: 'Eliminar hoja' }).click();
  await desktop.page.waitForURL((url) => url.pathname === `/clients/${clientId}`);
  assert.deepEqual(desktop.deletes, [sheetId]);
  await desktop.context.close();

  const mobile = await createSheet({ width: 390, height: 844 }, 'mobile');
  await mobile.context.close();
  const smallMobile = await createSheet({ width: 320, height: 740 }, 'small-mobile');
  await smallMobile.context.close();
  console.log('competitor sheet structure, ordering, three microcycles, save/edit/delete, PDF download and responsive layouts passed.');
} finally {
  await browser.close();
}
