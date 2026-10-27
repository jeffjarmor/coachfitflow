import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const authKey = process.env.ZUMMITH_TEST_AUTH_KEY || 'zummith-auth';
const coachId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const gymId = '44444444-4444-4444-8444-444444444444';
const measurements = [
  { id: 'm3', date: '2026-10-14', weight: 64.3, body_fat_percentage: 21, muscle_mass: 25 },
  { id: 'm1', date: '2026-09-30', weight: 63.7, body_fat_percentage: 21.4, muscle_mass: 25 },
  { id: 'm2', date: '2026-10-07', weight: 64, body_fat_percentage: null, muscle_mass: 25 }
].map(row => ({ ...row, client_id: clientId, height: 168, bmi: 22.7 }));
const monthParts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', timeZone: 'America/Costa_Rica' }).formatToParts(new Date());
const month = `${monthParts.find(part => part.type === 'year').value}-${monthParts.find(part => part.type === 'month').value}`;
const payments = [
  ['p3', 'crc', 25000, `${month}-14`, 'paid'],
  ['p1', 'crc', 18000, `${month}-01`, 'paid'],
  ['p2', 'usd', 45, `${month}-08`, 'paid'],
  ['p4', 'crc', 5000, `${month}-14`, 'paid'],
  ['pending', 'crc', 999999, `${month}-14`, 'pending']
].map(([id, plan, amount, date, status]) => ({
  id, client_gym_membership_id: `membership-${plan}`, amount, currency: plan === 'crc' ? 'CRC' : 'USD',
  paid_date: `${date}T12:00:00`, due_date: `${date}T12:00:00`, created_at: `${date}T12:00:00`, status, method: 'cash'
}));
const artifacts = 'docs/qa';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch();

async function makePage(viewport, audience, rows = measurements) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'America/Costa_Rica' });
  const session = {
    access_token: 'chart-test-token', refresh_token: 'chart-test-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
    user: { id: audience === 'portal' ? userId : coachId, role: 'authenticated', aud: 'authenticated', email: 'chart@example.test' }
  };
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey, session });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || (message.type() === 'warning' && message.text().includes('[ECharts]'))) errors.push(message.text()); });
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, json: new URL(route.request().url()).pathname.endsWith('/user') ? session.user : {} }));
  await page.route('**/rest/v1/**', route => {
    const request = route.request();
    const table = new URL(request.url()).pathname.split('/').pop();
    const object = request.headers().accept?.includes('vnd.pgrst.object');
    const coach = { id: coachId, name: 'Valeria Mora', role: audience === 'admin' ? 'admin' : 'coach', account_type: audience === 'gym' ? 'gym' : 'independent', coach_plan: 'paid', next_plan_payment_date: '2099-01-01' };
    let data = [];
    if (table === 'independent_client_portal_access') data = audience === 'portal' ? [{ client_id: clientId, coach_id: coachId }] : [];
    if (table === 'coaches') data = object ? coach : [coach];
    if (table === 'clients') {
      const client = { id: clientId, primary_coach_id: coachId, name: 'Ana Rodríguez', goal: 'Ganar fuerza', email: 'ana@example.test' };
      data = object ? client : [client];
    }
    if (table === 'measurements') data = rows;
    if (table === 'gyms') data = audience === 'gym' ? [{ id: gymId, name: 'Gimnasio Norte', owner_id: coachId }] : [];
    if (table === 'membership_plans') data = ['crc', 'usd'].map(plan => ({ id: plan, gym_id: gymId, name: plan === 'crc' ? 'Mensual CRC' : 'Mensual USD', price: plan === 'crc' ? 25000 : 45, currency: plan.toUpperCase(), active: true }));
    if (table === 'client_gym_memberships') data = audience === 'gym' ? ['crc', 'usd'].map(plan => ({ id: `membership-${plan}`, client_id: clientId, membership_plan_id: plan, subscription_status: 'active', clients: { id: clientId, name: 'Ana Rodríguez' } })) : [];
    if (table === 'payments') data = payments;
    const ago = hours => new Date(Date.now() - hours * 3600000).toISOString();
    if (table === 'activity_logins' && request.method() === 'GET') data = [
      { timestamp: ago(1), user_id: coachId }, { timestamp: ago(24), user_id: coachId }, { timestamp: ago(24), user_id: userId }
    ];
    if (table === 'routines' && audience === 'admin') data = [{ created_at: ago(1) }, { created_at: ago(24) }];
    return route.fulfill({ status: 200, json: data });
  });
  return { page, context, errors };
}

async function inspectChart(page, chart) {
  await chart.locator('.chart-canvas svg').waitFor();
  await chart.locator('.chart-canvas svg path').first().waitFor({ state: 'attached' });
  const metrics = await chart.evaluate(element => {
    const canvas = element.querySelector('.chart-canvas');
    const svg = canvas.querySelector('svg');
    const style = getComputedStyle(element);
    return {
      label: canvas.getAttribute('aria-label'),
      width: canvas.getBoundingClientRect().width,
      svgWidth: svg.getBoundingClientRect().width,
      invalidGeometry: /NaN|Infinity/.test(svg.innerHTML),
      font: getComputedStyle(svg.querySelector('text')).fontFamily,
      themed: [...svg.querySelectorAll('path')].some(path => [style.getPropertyValue('--zm-accent-emphasis').trim(), style.getPropertyValue('--zm-ink').trim()].includes(path.getAttribute('stroke')) || [style.getPropertyValue('--zm-ink').trim()].includes(path.getAttribute('fill')))
    };
  });
  assert.ok(metrics.label?.includes('registros'));
  assert.ok(metrics.width > 150);
  assert.ok(Math.abs(metrics.width - metrics.svgWidth) < 2);
  assert.equal(metrics.invalidGeometry, false);
  assert.match(metrics.font, /Avenir/);
  assert.equal(metrics.themed, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

async function choose(page, name, option) {
  const control = page.getByRole('combobox', { name, exact: true });
  await control.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await control.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function inspectTooltip(page, chart) {
  const markerIndex = await chart.locator('svg path').evaluateAll(paths => {
    const style = getComputedStyle(document.documentElement);
    const indices = paths.flatMap((path, index) => path.getAttribute('fill') === style.getPropertyValue('--zm-accent').trim() && path.getAttribute('stroke') === style.getPropertyValue('--zm-ink').trim() ? [index] : []);
    return indices[Math.floor(indices.length / 2)] ?? -1;
  });
  assert.ok(markerIndex >= 0, 'Measurement markers are visible.');
  await chart.locator('svg path').nth(markerIndex).hover();
  await chart.locator('svg text').filter({ hasText: 'Peso:' }).waitFor();
  await page.mouse.move(0, 0);
}

try {
  for (const [size, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    for (const audience of ['portal', 'coach']) {
      const { page, context, errors } = await makePage(viewport, audience);
      await page.goto(base + (audience === 'portal' ? '/client/measurements' : `/clients/${clientId}?tab=measurements`), { waitUntil: 'networkidle' });
      const chart = page.locator('app-site-chart');
      await inspectChart(page, chart);
      await inspectTooltip(page, chart);
      await chart.getByText('Ver datos de la gráfica', { exact: true }).click();
      assert.equal(await chart.locator('tbody tr').count(), 3);
      assert.deepEqual(await chart.locator('tbody td').allTextContents(), ['63,7 kg', '64 kg', '64,3 kg']);
      const selector = page.getByRole('group', { name: 'Métrica de la gráfica' });
      await selector.getByRole('button', { name: 'Grasa', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('app-site-chart tbody tr td')?.textContent?.includes('21,4 %'));
      assert.equal(await chart.locator('tbody tr').count(), 2, 'Missing values are omitted instead of becoming zero.');
      await selector.getByRole('button', { name: 'Músculo', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('app-site-chart tbody tr td')?.textContent?.includes('25 kg'));
      assert.deepEqual(await chart.locator('tbody td').allTextContents(), ['25 kg', '25 kg', '25 kg']);
      await inspectChart(page, chart);
      await selector.getByRole('button', { name: 'Peso', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('app-site-chart tbody tr td')?.textContent?.includes('63,7 kg'));
      await chart.getByText('Ver datos de la gráfica', { exact: true }).click();
      await chart.screenshot({ path: `${artifacts}/charts-${audience}-${size}.png` });
      if (size === 'desktop') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => {
          const canvas = document.querySelector('.chart-canvas');
          return Math.abs(canvas.getBoundingClientRect().width - canvas.querySelector('svg').getBoundingClientRect().width) < 2;
        });
        await inspectChart(page, chart);
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`${audience} / ${size}: medidas, cambios de métrica, valores ausentes, serie constante, tema y responsive correctos.`);
    }
    const { page, context, errors } = await makePage(viewport, 'gym');
    await page.goto(`${base}/gym/payments/${gymId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Finanzas', exact: true }).click();
    await page.locator('.finance-chart').first().waitFor();
    assert.equal(await page.locator('app-site-chart').count(), 2, 'Currencies must remain separate.');
    const crc = page.getByRole('region', { name: 'Cobros por fecha · CRC', exact: true }).locator('app-site-chart');
    await inspectChart(page, crc);
    await crc.getByText('Ver datos de la gráfica', { exact: true }).click();
    assert.equal(await crc.locator('tbody tr').count(), 2);
    const crcNumbers = await crc.locator('tbody td').allTextContents();
    assert.ok(crcNumbers[0].replace(/\D/g, '').startsWith('18000'));
    assert.ok(crcNumbers[1].replace(/\D/g, '').startsWith('30000'), 'Payments on one date are summed; pending payments are excluded.');
    await crc.screenshot({ path: `${artifacts}/charts-finance-${size}.png` });
    await choose(page, 'Plan', 'Mensual USD');
    await page.locator('.finance-chart h3').filter({ hasText: 'USD' }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('app-site-chart').length === 1);
    await inspectChart(page, page.locator('app-site-chart'));
    await choose(page, 'Período', 'Año');
    await inspectChart(page, page.locator('app-site-chart'));
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`finance / ${size}: barras, agrupación cronológica, monedas separadas y filtros correctos.`);

    const admin = await makePage(viewport, 'admin');
    await admin.page.goto(base + '/admin/activity', { waitUntil: 'networkidle' });
    await admin.page.locator('.activity-charts').waitFor();
    const adminCharts = admin.page.locator('app-site-chart');
    assert.equal(await adminCharts.count(), 2);
    for (let index = 0; index < 2; index++) {
      const chart = adminCharts.nth(index);
      await inspectChart(admin.page, chart);
      await chart.getByText('Ver datos de la gráfica', { exact: true }).click();
      const values = (await chart.locator('tbody td').allTextContents()).map(Number);
      assert.equal(values.length, 7);
      assert.equal(values.reduce((sum, value) => sum + value, 0), index === 0 ? 3 : 2);
      await chart.getByText('Ver datos de la gráfica', { exact: true }).click();
    }
    assert.equal(await admin.page.locator('.activity-table tbody tr').count(), 7);
    assert.equal(await admin.page.locator('.activity-bar').count(), 0);
    const capture = size === 'mobile' ? admin.page.locator('.activity-charts > section').first() : admin.page.locator('.activity-charts');
    await capture.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await capture.screenshot({ path: `${artifacts}/charts-admin-${size}.png` });
    if (size === 'mobile') {
      const routinesChart = admin.page.locator('.activity-charts > section').last();
      await routinesChart.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await routinesChart.screenshot({ path: `${artifacts}/charts-admin-routines-${size}.png` });
    }
    assert.deepEqual(admin.errors, []);
    await admin.context.close();
    console.log(`admin / ${size}: inicios de sesión, rutinas, días sin actividad y tabla diaria correctos.`);
  }
  for (const rows of [[], [measurements[0]]]) {
    const { page, context, errors } = await makePage({ width: 390, height: 844 }, 'portal', rows);
    await page.goto(base + '/client/measurements', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Mis mediciones', exact: true }).waitFor();
    assert.equal(await page.locator('app-site-chart').count(), 0);
    if (rows.length) await page.getByText('Se necesitan al menos dos controles con este valor.').waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Estados sin mediciones o con un solo control correctos.');
} finally { await browser.close(); }
