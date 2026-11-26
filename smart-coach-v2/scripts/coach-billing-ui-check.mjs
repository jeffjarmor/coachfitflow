import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const userFile = resolve(process.env.ZUMMITH_BILLING_USER_FILE || fileURLToPath(new URL('../../.local/onvo-billing/trainer.json', import.meta.url)));
const appUrl = new URL(process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200');
const isLoopback = (hostname) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname);
if (appUrl.protocol !== 'http:' || !isLoopback(appUrl.hostname)) {
  throw new Error('Billing UI checks require the local development app over loopback HTTP.');
}

const user = JSON.parse(await readFile(userFile, 'utf8'));
const apiUrl = new URL(user.apiUrl);
if (apiUrl.protocol !== 'http:' || !isLoopback(apiUrl.hostname) || apiUrl.port !== '54321') {
  throw new Error('Billing UI checks require a local Supabase API URL.');
}
if (!user.email || !user.password) throw new Error('The local billing test user is incomplete.');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const screenshots = await mkdtemp(join(tmpdir(), 'zummith-billing-visual-'));
const capture = name => page.screenshot({ path: join(screenshots, `${name}.png`), fullPage: true });
const externalPaymentRequests = [];
page.on('request', request => {
  const url = new URL(request.url());
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'api.onvopay.com' || url.hostname === 'sdk.onvopay.com') externalPaymentRequests.push(url.hostname);
});
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname.endsWith('.supabase.co') || url.hostname === 'api.onvopay.com' || url.hostname === 'sdk.onvopay.com') {
    await route.abort('blockedbyclient');
  } else {
    await route.continue();
  }
});

try {
  await page.goto(new URL('/login', appUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor();
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20_000 });

  const billingUrl = new URL('/functions/v1/coach-billing', apiUrl).toString();
  const [billingResponse] = await Promise.all([
    page.waitForResponse(response => response.url() === billingUrl
      && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'status', { timeout: 20_000 }),
    page.goto(new URL('/profile', appUrl).toString(), { waitUntil: 'domcontentloaded' })
  ]);
  if (!billingResponse.ok() || (await billingResponse.json()).mode !== 'simulator') {
    throw new Error('Billing UI checks require the local simulator. No billing actions were run.');
  }

  const nameInput = page.locator('#profile-name');
  const phoneInput = page.locator('#profile-phone');
  const originalName = await nameInput.inputValue();
  const originalPhone = await phoneInput.inputValue();
  await nameInput.fill(`${originalName} Billing Check`);
  await phoneInput.fill('+506 8888 8888');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByText('Tus cambios se guardaron correctamente.').waitFor({ timeout: 10_000 });
  if (await nameInput.inputValue() !== `${originalName} Billing Check` || await phoneInput.inputValue() !== '+506 8888 8888') {
    throw new Error('The profile did not retain its saved name and phone fields.');
  }
  await nameInput.fill(originalName);
  await phoneInput.fill(originalPhone);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByText('Tus cambios se guardaron correctamente.').waitFor({ timeout: 10_000 });

  await page.getByRole('navigation', { name: 'Secciones del perfil' }).getByRole('link', { name: 'Facturación', exact: true }).click();
  await page.getByRole('heading', { name: 'Tu plan', exact: true }).waitFor({ timeout: 20_000 });
  if (await page.locator('#plan .local-banner').count()) throw new Error('Billing displays a test mode banner.');
  await capture('01-standard-desktop');

  await page.getByRole('button', { name: 'Suscribirme a Pro' }).click();
  await page.getByRole('heading', { name: 'Revisa tu suscripción' }).waitFor();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await page.getByRole('button', { name: 'Simular verificación bancaria' }).waitFor();
  await capture('02-payment-desktop');
  await page.getByRole('button', { name: 'Simular verificación bancaria' }).click();
  await page.getByRole('heading', { name: 'Verifica el pago con tu banco' }).waitFor();
  await page.getByText('Después de la verificación bancaria, el pago sigue pendiente hasta recibir la confirmación.').waitFor();
  await page.getByRole('button', { name: 'Simular verificación aprobada' }).click();
  await page.getByRole('heading', { name: 'Ya puedes usar Pro' }).waitFor();
  await page.getByRole('button', { name: 'Volver a Facturación' }).click();
  await capture('03-active-desktop');
  await page.getByRole('button', { name: 'Actualizar método de pago' }).first().click();
  await page.getByRole('button', { name: 'Usar tarjeta de prueba local' }).click();
  await page.getByRole('heading', { name: 'Tarjeta actualizada' }).waitFor();
  await page.getByRole('button', { name: 'Volver a Facturación' }).click();

  await page.locator('details.simulator-tools summary').click();
  await page.getByRole('button', { name: 'Simular renovación fallida' }).click();
  await page.getByRole('heading', { name: 'Revisa el estado del pago' }).waitFor();
  await capture('04-renewal-failed');
  await page.getByRole('button', { name: 'Simular otro pago' }).click();
  await page.getByRole('button', { name: 'Simular pago aprobado' }).click();
  await page.getByRole('heading', { name: 'Ya puedes usar Pro' }).waitFor();
  await page.getByRole('button', { name: 'Volver a Facturación' }).click();
  await page.locator('details.subscription-actions summary').click();
  await page.getByRole('button', { name: 'Cancelar suscripción' }).click();
  await page.getByRole('heading', { name: '¿Quieres cancelar tu suscripción?' }).waitFor();
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await page.getByRole('heading', { name: 'Cancelación programada' }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Volver a Facturación' }).click();
  await page.getByRole('heading', { name: 'Tu plan', exact: true }).waitFor();
  await capture('05-canceled-mobile');
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (hasHorizontalOverflow) throw new Error('Billing view overflows horizontally at 390px.');
  if (externalPaymentRequests.length) throw new Error('Local simulation unexpectedly contacted ONVO.');
  process.stdout.write('Billing UI check passed: local simulator checkout, bank action, confirmed access, card replacement, failed renewal, cancellation, and 390px layout. External Supabase and ONVO requests were blocked.\n');
  console.log(`Screenshots: ${screenshots}`);
} catch (error) {
  await capture('failure').catch(() => {});
  console.error(`UI failure screenshot: ${join(screenshots, 'failure.png')}`);
  throw error;
} finally {
  await browser.close();
}
