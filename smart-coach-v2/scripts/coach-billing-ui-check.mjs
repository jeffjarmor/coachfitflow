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

  await page.goto(new URL('/profile', appUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Billing & subscription' }).waitFor({ timeout: 20_000 });
  await page.getByText('Local test mode', { exact: false }).waitFor({ timeout: 10_000 });
  await capture('01-standard-desktop');

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

  await page.getByRole('button', { name: 'Subscribe to Pro' }).click();
  await page.getByRole('heading', { name: 'Review your subscription' }).waitFor();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: 'Simulate bank verification' }).waitFor();
  await capture('02-payment-desktop');
  await page.getByRole('button', { name: 'Simulate bank verification' }).click();
  await page.getByRole('heading', { name: 'Verify with your bank' }).waitFor();
  await page.getByText('Bank verification does not confirm that the payment was approved.').waitFor();
  await page.getByRole('button', { name: 'Simulate approved verification' }).click();
  await page.getByRole('heading', { name: 'Your Pro subscription is active' }).waitFor();
  await page.getByRole('button', { name: 'Return to billing' }).click();
  await capture('03-active-desktop');
  await page.getByRole('button', { name: 'Update payment method' }).first().click();
  await page.getByRole('button', { name: 'Use local test card' }).click();
  await page.getByRole('heading', { name: 'Card updated' }).waitFor();
  await page.getByRole('button', { name: 'Back to billing' }).click();

  await page.locator('details.simulator-tools summary').click();
  await page.getByRole('button', { name: 'Simulate failed renewal' }).click();
  await page.getByRole('heading', { name: 'Payment needs attention' }).waitFor();
  await capture('04-renewal-failed');
  await page.getByRole('button', { name: 'Try another test payment' }).click();
  await page.getByRole('button', { name: 'Simulate approved payment' }).click();
  await page.getByRole('heading', { name: 'Your Pro subscription is active' }).waitFor();
  await page.getByRole('button', { name: 'Return to billing' }).click();
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await page.getByRole('heading', { name: 'Cancel your subscription?' }).waitFor();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await page.getByRole('heading', { name: 'Cancellation scheduled' }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Return to billing' }).click();
  await page.getByRole('heading', { name: 'Billing', exact: true }).waitFor();
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
