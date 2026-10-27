import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const adminId = '11111111-1111-4111-8111-111111111111';
const coachId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const session = {
  access_token: 'admin-directory-token', refresh_token: 'admin-directory-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
  user: { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'admin@zummith.test', user_metadata: { name: 'Admin Zummith' } }
};
const admin = { id: adminId, name: 'Admin Zummith', email: session.user.email, phone: null, logo_url: null, brand_color: '#CCFF00', role: 'admin', account_type: 'independent', coach_plan: 'standard', next_plan_payment_date: null, created_at: '2026-01-01T12:00:00Z' };
const coach = { id: coachId, name: 'Valeria Coach', email: 'valeria@example.com', phone: '88887777', logo_url: null, brand_color: '#CCFF00', role: 'coach', account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: '2026-10-26', created_at: '2026-02-01T12:00:00Z' };
const client = { id: clientId, primary_coach_id: coachId, name: 'Carlos Cliente', email: 'carlos@example.com', phone: '87776666', birth_date: '1994-04-12', age: 32, weight: 82.5, height: 178, goal: 'Ganar fuerza', notes: 'Priorizar técnica', address: 'San José', created_at: '2026-03-01T12:00:00Z' };
const routine = { id: '44444444-4444-4444-8444-444444444444', client_id: clientId, coach_id: coachId, client_gym_membership_id: null, name: 'Fuerza base', objective: 'Mejorar patrones principales', start_date: '2026-09-01', end_date: '2026-10-01', created_at: '2026-09-01T12:00:00Z' };
const measurement = { id: '55555555-5555-4555-8555-555555555555', client_id: clientId, client_gym_membership_id: null, date: '2026-09-20', weight: 82.5, body_fat_percentage: 18, muscle_mass: 36 };

const appRoot = new URL('..', import.meta.url).pathname;
await mkdir(`${appRoot}/docs/qa`, { recursive: true });
const browser = await chromium.launch();

async function setup(viewport, role = 'admin') {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript((value) => localStorage.setItem('zummith-auth', JSON.stringify(value)), session);
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    const method = request.method();
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const fulfill = (json, status = 200) => route.fulfill({ status, headers, json });
    if (method === 'PATCH') {
      writes.push({ table, payload: request.postDataJSON() });
      return fulfill([{ id: url.searchParams.get('id')?.replace(/^eq\./, '') || coachId }]);
    }
    if (table === 'coaches') {
      const requestedId = url.searchParams.get('id')?.replace('eq.', '');
      const current = requestedId === coachId ? coach : { ...admin, role };
      return fulfill(requestedId ? current : [{ ...admin, role }, coach]);
    }
    if (table === 'clients') return fulfill([client]);
    if (table === 'routines') return fulfill([routine]);
    if (table === 'measurements') return fulfill([measurement]);
    if (table === 'gym_staff' || table === 'client_gym_memberships') return fulfill([]);
    if (table === 'exercises') return fulfill([]);
    if (table === 'coach_announcements' || table === 'training_sessions') return fulfill([]);
    return fulfill([]);
  });
  return { context, page, errors, writes };
}

async function assertLayout(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const overflow = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert.ok(overflow.documentWidth <= overflow.width + 1, `${name}: horizontal overflow ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${appRoot}/docs/qa/${name}.png`, fullPage: true });
}

async function testDirectory(viewport, name) {
  const { context, page, errors, writes } = await setup(viewport);

  await page.goto(`${base}/admin/coaches`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Entrenadores', level: 1 }).waitFor();
  await page.getByText('Valeria Coach').waitFor();
  await assertLayout(page, `admin-coaches-${name}`);

  await page.goto(`${base}/admin/coaches/${coachId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Valeria Coach', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await page.getByText('El plan de la cuenta se actualizó correctamente.').waitFor();
  assert.ok(writes.some((write) => write.table === 'coaches' && write.payload.coach_plan === 'paid'));

  await page.goto(`${base}/admin/coaches/${coachId}/clients`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Clientes de Valeria Coach', level: 1 }).waitFor();
  await page.getByText('Carlos Cliente').waitFor();

  await page.goto(`${base}/admin/clients`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Todos los clientes', level: 1 }).waitFor();

  await page.goto(`${base}/admin/clients/${coachId}/${clientId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Carlos Cliente', level: 1 }).waitFor();
  await page.getByText('Fuerza base').waitFor();
  await assertLayout(page, `admin-client-detail-${name}`);

  await page.goto(`${base}/admin/clients/${coachId}/${clientId}/edit`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Editar perfil', level: 2 }).waitFor();
  await page.locator('[formcontrolname="phone"]').fill('89998888');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForURL((url) => url.pathname === `/admin/clients/${coachId}/${clientId}`);
  assert.ok(writes.some((write) => write.table === 'clients' && write.payload.phone === '89998888'));

  await page.goto(`${base}/admin/clients/${coachId}/${clientId}/routine/new`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Nueva rutina', level: 1 }).waitFor();
  assert.equal(await page.getByRole('radio', { name: /Carlos Cliente/ }).isChecked(), true);
  const adminNavigation = page.locator('a[href="/admin/coaches"]:visible').first();
  assert.equal(await adminNavigation.isVisible(), true);
  await adminNavigation.click();
  await page.waitForURL((url) => url.pathname === '/admin/coaches');
  assert.deepEqual(errors, []);
  await context.close();
}

try {
  await testDirectory({ width: 1440, height: 1000 }, 'desktop');
  await testDirectory({ width: 390, height: 844 }, 'mobile');

  const denied = await setup({ width: 1280, height: 800 }, 'coach');
  await denied.page.goto(`${base}/admin/coaches`, { waitUntil: 'networkidle' });
  await denied.page.waitForURL((url) => url.pathname === '/dashboard');
  assert.deepEqual(denied.errors, []);
  await denied.context.close();
  console.log('admin directories, detail, editing, routine context, responsive layout and guard passed.');
} finally {
  await browser.close();
}
