import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4200';
const outputDirectory = 'docs/qa';
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

async function inspectPage(name, path, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (path === '/') {
    await page.locator('#producto').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
  }

  const metrics = await page.evaluate(() => ({
    title: document.title,
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    h1: document.querySelector('h1')?.textContent?.trim() || '',
    visibleButtons: [...document.querySelectorAll('.btn')].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length,
    brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
    layout: location.pathname === '/' ? (() => {
      const container = document.querySelector('.benefits .container');
      const section = document.querySelector('.benefits.section');
      const grid = document.querySelector('.product-card-list');
      const button = document.querySelector('.hero .btn-primary');
      const containerStyle = container ? getComputedStyle(container) : null;
      const sectionStyle = section ? getComputedStyle(section) : null;
      const gridStyle = grid ? getComputedStyle(grid) : null;
      const buttonStyle = button ? getComputedStyle(button) : null;
      return {
        containerWidth: container?.getBoundingClientRect().width || 0,
        containerPadding: containerStyle?.paddingLeft || '',
        sectionPadding: sectionStyle?.paddingTop || '',
        gridGap: gridStyle?.gap || '',
        buttonHeight: button?.getBoundingClientRect().height || 0,
        buttonRadius: buttonStyle?.borderRadius || '',
        buttonBackground: buttonStyle?.backgroundColor || '',
        buttonColor: buttonStyle?.color || '',
        bootstrapPrimary: getComputedStyle(document.documentElement).getPropertyValue('--bs-primary').trim(),
        bootstrapBodyBackground: getComputedStyle(document.documentElement).getPropertyValue('--bs-body-bg').trim()
      };
    })() : null
  }));

  await page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true });
  results.push({ name, ...metrics, horizontalOverflow: metrics.width > metrics.viewport, consoleErrors });
  await context.close();
}

await inspectPage('landing-desktop', '/', { width: 1440, height: 1000 });
await inspectPage('landing-laptop', '/', { width: 1024, height: 900 });
await inspectPage('landing-tablet', '/', { width: 768, height: 1024 });
await inspectPage('login-desktop', '/login', { width: 1440, height: 1000 });
await inspectPage('signup-desktop', '/signup', { width: 1440, height: 1000 });
await inspectPage('set-password-desktop', '/set-password', { width: 1440, height: 1000 });
await inspectPage('landing-mobile', '/', { width: 390, height: 844 });
await inspectPage('login-mobile', '/login', { width: 390, height: 844 });
await inspectPage('signup-mobile', '/signup', { width: 390, height: 844 });
await inspectPage('set-password-mobile', '/set-password', { width: 390, height: 844 });

const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
const mockSession = {
  access_token: 'visual-test-token',
  refresh_token: 'visual-test-refresh',
  expires_at: futureExpiry,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'valeria@zummith.test',
    user_metadata: { name: 'Valeria Mora' }
  }
};

const mockCoachProfile = {
  id: mockSession.user.id,
  name: 'Valeria Mora',
  email: mockSession.user.email,
  phone: '+506 8700 1426',
  logo_url: null,
  brand_color: '#CCFF00',
  role: 'coach',
  account_type: 'independent',
  coach_plan: 'standard',
  next_plan_payment_date: null
};
const relativeDate = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function inspectAuthRedirects() {
  const expectedOrigin = new URL(baseUrl).origin;

  const passwordContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const passwordPage = await passwordContext.newPage();
  await passwordPage.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(mockSession)
    });
  });
  await passwordPage.route('**/rest/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const payload = pathname.endsWith('/coaches') ? mockCoachProfile : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(payload)
    });
  });
  await passwordPage.goto(`${baseUrl}/login?returnUrl=${encodeURIComponent('https://zummith.com')}`, { waitUntil: 'domcontentloaded' });
  await passwordPage.locator('#email').fill(mockSession.user.email);
  await passwordPage.locator('#password').fill('local-test-password');
  await passwordPage.locator('button[type="submit"]').click();
  await passwordPage.waitForURL((url) => url.pathname === '/dashboard');
  const passwordDestination = passwordPage.url();
  await passwordContext.close();

  const oauthContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const oauthPage = await oauthContext.newPage();
  await oauthPage.route('**/auth/v1/authorize**', (route) => route.abort());
  await oauthPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  const oauthRequestPromise = oauthPage.waitForRequest((request) => request.url().includes('/auth/v1/authorize'));
  await oauthPage.getByRole('button', { name: 'Google' }).click().catch(() => null);
  const oauthRequest = await oauthRequestPromise;
  const oauthRedirectTo = new URL(oauthRequest.url()).searchParams.get('redirect_to') || '';
  await oauthContext.close();

  const passwordStaysLocal = new URL(passwordDestination).origin === expectedOrigin;
  const oauthStaysLocal = !!oauthRedirectTo && new URL(oauthRedirectTo).origin === expectedOrigin;
  results.push({
    name: 'auth-redirects',
    passwordDestination,
    oauthRedirectTo,
    passwordStaysLocal,
    oauthStaysLocal,
    redirectMismatch: !passwordStaysLocal || !oauthStaysLocal
  });
}

await inspectAuthRedirects();

async function inspectProtectedPage(name, path, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((session) => {
    localStorage.setItem('zummith-auth', JSON.stringify(session));
  }, mockSession);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('**/rest/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let payload = [];
    if (pathname.endsWith('/coaches')) {
      payload = mockCoachProfile;
    } else if (pathname.endsWith('/clients')) {
      payload = [
        { id: 'c1', name: 'Daniela Solís', email: 'daniela@example.com', goal: 'Fuerza general', created_at: '2026-09-08T12:00:00Z' },
        { id: 'c2', name: 'Andrés Jiménez', email: 'andres@example.com', goal: 'Mejorar movilidad', created_at: '2026-09-03T12:00:00Z' },
        { id: 'c3', name: 'Natalia Vargas', email: 'natalia@example.com', goal: 'Resistencia', created_at: '2026-08-27T12:00:00Z' }
      ];
    } else if (pathname.endsWith('/routines')) {
      payload = [
        { id: 'r1', client_id: 'c1', name: 'Base de fuerza', objective: 'Fuerza general', training_days_count: 4, duration_weeks: 6, start_date: relativeDate(-14), end_date: relativeDate(14), created_at: `${relativeDate(-14)}T12:00:00Z` },
        { id: 'r2', client_id: 'c2', name: 'Movilidad semanal', objective: 'Mejorar movilidad', training_days_count: 3, duration_weeks: 4, start_date: relativeDate(-25), end_date: relativeDate(3), created_at: `${relativeDate(-25)}T12:00:00Z` }
      ];
    } else if (pathname.endsWith('/exercises')) {
      payload = [
        { id: 'e1', name: 'Sentadilla goblet', muscle_group: 'Cuádriceps', source: 'global', image_url: null, video_url: 'https://youtube.com/watch?v=example1', description: 'Patrón de sentadilla con carga frontal.', created_at: '2026-08-10T12:00:00Z' },
        { id: 'e2', name: 'Remo Pendlay', muscle_group: 'Espalda', source: 'global', image_url: null, video_url: 'https://youtube.com/watch?v=example2', description: 'Remo estricto desde el suelo.', created_at: '2026-08-11T12:00:00Z' },
        { id: 'e3', name: 'Press de banca', muscle_group: 'Pecho', source: 'global', image_url: null, video_url: null, description: 'Movimiento compuesto de empuje horizontal.', created_at: '2026-08-12T12:00:00Z' },
        { id: 'e4', name: 'Plancha frontal', muscle_group: 'Core', source: 'global', image_url: null, video_url: null, description: 'Trabajo isométrico del tronco.', created_at: '2026-08-13T12:00:00Z' },
        { id: 'e5', name: 'Peso muerto rumano', muscle_group: 'Isquiotibiales', source: 'coach', image_url: null, video_url: 'https://youtube.com/watch?v=example3', description: 'Bisagra de cadera con énfasis posterior.', created_at: '2026-08-14T12:00:00Z' },
        { id: 'e6', name: 'Caminata del granjero', muscle_group: 'Full Body', source: 'coach', image_url: null, video_url: null, description: 'Carga bilateral para agarre y estabilidad.', created_at: '2026-08-15T12:00:00Z' }
      ];
    } else if (pathname.endsWith('/measurements')) {
      payload = [
        { id: 'm1', client_id: 'c1', date: '2026-09-10', weight: 68.4, height: 169, bmi: 23.9, created_at: '2026-09-10T12:00:00Z' },
        { id: 'm2', client_id: 'c2', date: '2026-09-07', weight: 79.2, height: 181, bmi: 24.2, created_at: '2026-09-07T12:00:00Z' }
      ];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    h1: document.querySelector('h1')?.textContent?.trim() || '',
    h1FontSize: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontSize : '',
    h1LineHeight: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).lineHeight : '',
    brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
    dashboardProgressMatches: location.pathname !== '/dashboard' || (
      document.querySelectorAll('.routine-progress-track').length === 2 &&
      document.querySelector('.routine-list > a:first-child strong')?.textContent?.trim() === 'Movilidad semanal' &&
      document.querySelector('.routine-list > a:first-child .routine-status')?.textContent?.includes('3 días restantes')
    )
  }));
  const expectedTitle = viewport.width <= 640
    ? { fontSize: '32px', lineHeight: '40px' }
    : { fontSize: '40px', lineHeight: '48px' };
  await page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true });
  results.push({
    name,
    ...metrics,
    typographyMatches: metrics.h1FontSize === expectedTitle.fontSize && metrics.h1LineHeight === expectedTitle.lineHeight,
    horizontalOverflow: metrics.width > metrics.viewport,
    consoleErrors
  });
  await context.close();
}

await inspectProtectedPage('dashboard-desktop', '/dashboard', { width: 1440, height: 1000 });
await inspectProtectedPage('dashboard-mobile', '/dashboard', { width: 390, height: 844 });
await inspectProtectedPage('clients-desktop', '/clients', { width: 1440, height: 1000 });
await inspectProtectedPage('clients-mobile', '/clients', { width: 390, height: 844 });
await inspectProtectedPage('routines-mobile', '/routines', { width: 390, height: 844 });
await inspectProtectedPage('exercises-desktop', '/exercises', { width: 1440, height: 1000 });
await inspectProtectedPage('exercises-mobile', '/exercises', { width: 390, height: 844 });
await inspectProtectedPage('exercise-new-desktop', '/exercises/new', { width: 1440, height: 1000 });
await inspectProtectedPage('exercise-new-mobile', '/exercises/new', { width: 390, height: 844 });
await inspectProtectedPage('measurements-mobile', '/measurements', { width: 390, height: 844 });
await inspectProtectedPage('profile-desktop', '/profile', { width: 1440, height: 1000 });
await inspectProtectedPage('profile-mobile', '/profile', { width: 390, height: 844 });

async function inspectExerciseInteractions() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((session) => {
    localStorage.setItem('zummith-auth', JSON.stringify(session));
  }, mockSession);
  const page = await context.newPage();
  const consoleErrors = [];
  let createRequests = 0;
  let updateRequests = 0;
  let deleteRequests = 0;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const exercisePayload = [
    { id: 'e1', name: 'Sentadilla goblet', muscle_group: 'Cuádriceps', source: 'global', image_url: null, video_url: 'https://youtube.com/watch?v=example1', description: 'Patrón de sentadilla con carga frontal.', created_at: '2026-08-10T12:00:00Z' },
    { id: 'e2', name: 'Remo Pendlay', muscle_group: 'Espalda', source: 'global', image_url: null, video_url: null, description: 'Remo estricto desde el suelo.', created_at: '2026-08-11T12:00:00Z' },
    { id: 'e5', name: 'Peso muerto rumano', muscle_group: 'Isquiotibiales', source: 'coach', image_url: null, video_url: null, description: 'Bisagra de cadera.', created_at: '2026-08-14T12:00:00Z' }
  ];

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/coaches')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCoachProfile) });
      return;
    }
    if (!pathname.endsWith('/exercises')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (request.method() === 'POST') {
      createRequests += 1;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'created-exercise' }]) });
      return;
    }
    if (request.method() === 'PATCH') {
      updateRequests += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (request.method() === 'DELETE') {
      deleteRequests += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const requestUrl = new URL(request.url());
    const payload = requestUrl.searchParams.has('id')
      ? exercisePayload.find((exercise) => exercise.id === 'e5')
      : exercisePayload;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto(`${baseUrl}/exercises`, { waitUntil: 'networkidle' });
  const globalCards = await page.locator('.exercise-tile:not(.skeleton-tile)').count();
  const imageCount = await page.locator('.tile-image img').count();
  const imagesRendered = await page.locator('.tile-image img').evaluateAll((images) =>
    images.every((image) => image.complete && image.naturalWidth > 0)
  );

  await page.getByRole('tab', { name: /Mis ejercicios/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise-tile:not(.skeleton-tile)').length === 1);
  const coachCards = await page.locator('.exercise-tile:not(.skeleton-tile)').count();
  await page.locator('#astra-group').selectOption('Isquiotibiales');
  await page.waitForFunction(() => document.querySelectorAll('.exercise-tile:not(.skeleton-tile)').length === 1);
  const filteredCards = await page.locator('.exercise-tile:not(.skeleton-tile)').count();

  await page.getByRole('link', { name: 'Editar' }).click();
  await page.waitForURL((url) => url.pathname === '/exercises/e5/edit');
  await page.waitForFunction(() => document.querySelector('#astra-muscle')?.value === 'Isquiotibiales');
  await page.locator('#astra-name').fill('Peso muerto rumano con mancuernas');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.waitForURL((url) => url.pathname === '/exercises' && url.searchParams.get('result') === 'updated');
  await page.getByText('Los cambios del ejercicio se guardaron.').waitFor();

  await page.getByRole('button', { name: 'Ver detalles de Peso muerto rumano' }).click();
  await page.getByRole('button', { name: 'Eliminar ejercicio', exact: true }).click();
  await page.locator('.delete-dialog[open]').waitFor();
  const deleteDialogVisible = await page.locator('.delete-dialog[open]').isVisible();
  await page.locator('.delete-dialog[open]').getByRole('button', { name: 'Eliminar', exact: true }).click();

  await page.getByRole('link', { name: 'Nuevo ejercicio' }).first().click();
  await page.locator('#astra-name').fill('Press unilateral en polea');
  await page.locator('#astra-muscle').selectOption('Pecho');
  await page.locator('#astra-video').fill('https://youtube.com/watch?v=example4');
  await page.locator('#astra-instructions').fill('Empuje unilateral con control del tronco.');
  await page.getByRole('button', { name: 'Crear ejercicio' }).click();
  await page.waitForURL((url) => url.pathname === '/exercises' && url.searchParams.get('result') === 'created');
  await page.getByText('El ejercicio se agregó a tu biblioteca.').waitFor();

  results.push({
    name: 'exercise-interactions',
    globalCards,
    coachCards,
    filteredCards,
    imageCount,
    imagesRendered,
    deleteDialogVisible,
    createRequests,
    updateRequests,
    deleteRequests,
    consoleErrors,
    interactionsMatch: globalCards === 2
      && coachCards === 1
      && filteredCards === 1
      && imageCount === 2
      && imagesRendered
      && deleteDialogVisible
      && createRequests === 1
      && updateRequests === 1
      && deleteRequests === 1
  });
  await context.close();
}

await inspectExerciseInteractions();

const interactionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const interactionPage = await interactionContext.newPage();
await interactionPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
const primaryButton = interactionPage.locator('.hero .btn-primary').first();
const beforeHover = await primaryButton.evaluate((element) => getComputedStyle(element).transform);
const colorsBeforeHover = await primaryButton.evaluate((element) => ({
  background: getComputedStyle(element).backgroundColor,
  color: getComputedStyle(element).color
}));
await primaryButton.hover();
await interactionPage.waitForTimeout(220);
const afterHover = await primaryButton.evaluate((element) => getComputedStyle(element).transform);
const colorsAfterHover = await primaryButton.evaluate((element) => ({
  background: getComputedStyle(element).backgroundColor,
  color: getComputedStyle(element).color
}));
const bootstrapColors = await interactionPage.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  return {
    primary: root.getPropertyValue('--bs-primary').trim(),
    success: root.getPropertyValue('--bs-success').trim(),
    info: root.getPropertyValue('--bs-info').trim(),
    warning: root.getPropertyValue('--bs-warning').trim(),
    danger: root.getPropertyValue('--bs-danger').trim(),
    light: root.getPropertyValue('--bs-light').trim(),
    dark: root.getPropertyValue('--bs-dark').trim()
  };
});
const semanticTheme = await interactionPage.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const semanticVariables = {
    primarySubtle: root.getPropertyValue('--bs-primary-bg-subtle').trim(),
    successSubtle: root.getPropertyValue('--bs-success-bg-subtle').trim(),
    infoSubtle: root.getPropertyValue('--bs-info-bg-subtle').trim(),
    warningSubtle: root.getPropertyValue('--bs-warning-bg-subtle').trim(),
    dangerSubtle: root.getPropertyValue('--bs-danger-bg-subtle').trim()
  };
  const toRgb = (value) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
  const luminance = (value) => {
    const channels = toRgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    });
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (foreground, background) => {
    const first = luminance(foreground);
    const second = luminance(background);
    return Math.round(((Math.max(first, second) + .05) / (Math.min(first, second) + .05)) * 100) / 100;
  };
  const buttonContrast = {};
  for (const variant of ['primary', 'secondary', 'success', 'info', 'warning', 'danger', 'light', 'dark']) {
    const button = document.createElement('button');
    button.className = `btn btn-${variant}`;
    button.textContent = variant;
    button.style.position = 'fixed';
    button.style.left = '-9999px';
    document.body.append(button);
    const style = getComputedStyle(button);
    buttonContrast[variant] = {
      background: style.backgroundColor,
      color: style.color,
      ratio: contrast(style.color, style.backgroundColor)
    };
    button.remove();
  }
  return { semanticVariables, buttonContrast };
});
const themeMatches = bootstrapColors.primary.toLowerCase() === '#ccff00'
  && colorsBeforeHover.background === 'rgb(204, 255, 0)'
  && colorsBeforeHover.color === 'rgb(28, 38, 0)'
  && colorsAfterHover.background === 'rgb(28, 38, 0)'
  && colorsAfterHover.color === 'rgb(204, 255, 0)'
  && beforeHover === 'none'
  && afterHover !== 'none'
  && Object.values(semanticTheme.buttonContrast).every(({ ratio }) => ratio >= 4.5);
results.push({
  name: 'bootstrap-theme',
  bootstrapColors,
  ...semanticTheme,
  colorsBeforeHover,
  colorsAfterHover,
  beforeHover,
  afterHover,
  themeMatches
});
await interactionContext.close();

async function inspectProfileInteraction() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((session) => {
    localStorage.setItem('zummith-auth', JSON.stringify(session));
  }, mockSession);
  const page = await context.newPage();
  const consoleErrors = [];
  let currentProfile = { ...mockCoachProfile };
  let updateRequests = 0;
  let logoUploadRequests = 0;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!pathname.endsWith('/coaches')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    if (request.method() === 'PATCH') {
      updateRequests += 1;
      const update = request.postDataJSON();
      currentProfile = { ...currentProfile, ...update };
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(currentProfile)
    });
  });

  await page.route('**/storage/v1/object/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' || request.method() === 'PUT') logoUploadRequests += 1;
    const path = new URL(request.url()).pathname.split('/object/assets/')[1] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ Key: `assets/${path}` })
    });
  });

  await page.goto(`${baseUrl}/profile`, { waitUntil: 'networkidle' });
  const saveButton = page.getByRole('button', { name: 'Guardar cambios' });
  const saveDisabledInitially = await saveButton.isDisabled();

  await page.locator('#profile-name').fill('V');
  await page.locator('#profile-name').blur();
  const validationVisible = await page.getByText('El nombre debe tener al menos 2 caracteres.').isVisible();

  await page.locator('#profile-name').fill('Valeria Mora Rojas');
  await saveButton.click();
  await page.getByText('Tus cambios se guardaron correctamente.').waitFor();
  const headerNameUpdated = await page.locator('[data-coach-name]').textContent();

  await page.locator('#profile-logo').setInputFiles({
    name: 'valeria-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  });
  await page.locator('.logo-preview img').waitFor();
  const logoPreviewVisible = await page.locator('.logo-preview img').isVisible();
  await saveButton.click();
  await page.getByText('Tus cambios se guardaron correctamente.').waitFor();

  await page.locator('.danger-row button').click();
  await page.locator('.confirm-dialog').waitFor();
  const confirmationVisible = await page.locator('.confirm-dialog').isVisible();

  results.push({
    name: 'profile-interactions',
    saveDisabledInitially,
    validationVisible,
    updateRequests,
    logoUploadRequests,
    logoPreviewVisible,
    headerNameUpdated: headerNameUpdated?.trim(),
    confirmationVisible,
    consoleErrors,
    interactionsMatch: saveDisabledInitially
      && validationVisible
      && updateRequests === 2
      && logoUploadRequests === 1
      && logoPreviewVisible
      && headerNameUpdated?.trim() === 'Valeria Mora Rojas'
      && confirmationVisible
  });
  await context.close();
}

await inspectProfileInteraction();

await browser.close();
console.log(JSON.stringify(results, null, 2));

if (results.some((result) => result.horizontalOverflow || result.consoleErrors?.length || result.brokenImages || result.typographyMatches === false || result.themeMatches === false || result.dashboardProgressMatches === false || result.redirectMismatch || result.interactionsMatch === false)) {
  process.exitCode = 1;
}
