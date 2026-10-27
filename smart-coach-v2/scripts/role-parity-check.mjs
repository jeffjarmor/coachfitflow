import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

assert.equal(process.env.ZUMMITH_STAGE, undefined, 'This regression only runs on local Supabase.');
const target = loadStagingTarget();
assert.equal(target.API_URL, 'http://127.0.0.1:54321');
const options = {auth: {persistSession: false, autoRefreshToken: false}};
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const base = process.env.PARITY_APP_URL || 'http://127.0.0.1:4300';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const users = [], gymIds = [], clientIds = [], exerciseIds = [];
const checks = [];
const out = new URL('../docs/qa/role-parity/', import.meta.url);
await mkdir(out, {recursive: true});
let browser, server;
function checked(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
function check(value, label) { assert.ok(value, label); checks.push(label); }
async function createAccount(name, extra = {}) {
  const email = `parity-${name}-${suffix}@example.invalid`;
  const user = checked(await db.auth.admin.createUser({email, password, email_confirm: true, user_metadata: {name}}), 'create Auth').user;
  users.push(user.id);
  checked(await db.from('coaches').upsert({id: user.id, name: `Parity ${name}`, email, role: name === 'admin' ? 'admin' : 'coach', account_type: 'independent', ...extra}), 'create coach');
  const api = createClient(target.API_URL, target.ANON_KEY, options);
  const session = checked(await api.auth.signInWithPassword({email, password}), 'sign in').session;
  return {id: user.id, name, api, session};
}
async function open(account, width = 1440) {
  const ctx = await browser.newContext({viewport: {width, height: width < 500 ? 844 : 1000}, acceptDownloads: true});
  await ctx.addInitScript(session => localStorage.setItem('zummith-v2-local-auth', JSON.stringify(session)), account.session);
  const page = await ctx.newPage();
  page.on('pageerror', error => { checks.push(`BROWSER ERROR: ${error.message}`); });
  return {ctx, page};
}
async function goto(page, path) {
  await page.goto(`${base}${path}`, {waitUntil: 'networkidle'});
  await page.locator('h1, h2, form').first().waitFor();
  console.log(`NAV ${path} -> ${new URL(page.url()).pathname}`);
}
async function noOverflow(page, label) {
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
    console.log('OVERFLOW', await page.evaluate(() => [...document.querySelectorAll('main *')].map(el => ({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).filter(el => el.right > innerWidth + 1).slice(0,20)));
    await page.screenshot({path:new URL('overflow.png',out).pathname,fullPage:true});
  }
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label);
}
try {
  try { await fetch(`${base}/login`); }
  catch {
    server = spawn('./node_modules/.bin/ng', ['serve','--configuration','local-staging','--host','127.0.0.1','--port',new URL(base).port], {cwd: new URL('..', import.meta.url).pathname, stdio:'ignore'});
    for (let attempt=0; attempt<80; attempt++) { try { if ((await fetch(`${base}/login`)).ok) break; } catch {} await delay(500); }
  }
  const admin = await createAccount('admin');
  const owner = await createAccount('owner');
  const trainer = await createAccount('trainer');
  const reception = await createAccount('reception');
  const readonly = await createAccount('readonly');
  const standard = await createAccount('standard');
  const pro = await createAccount('pro', {coach_plan:'paid', next_plan_payment_date:'2099-01-01'});
  const expired = await createAccount('expired', {coach_plan:'paid', next_plan_payment_date:'2020-01-01'});
  const coowner = await createAccount('coowner');
  for (const name of ['A','B']) {
    const gym = checked(await admin.api.rpc('admin_create_gym', {p_request_id:randomUUID(),p_name:`Parity Gym ${name} ${suffix}`}), 'create gym')[0];
    gymIds.push(gym.gym_id);
    checked(await admin.api.rpc('admin_assign_gym_owner', {p_gym_id:gym.gym_id,p_coach_id:owner.id}), 'assign owner');
  }
  const gymId = gymIds[0];
  checked(await db.from('gym_staff').insert([
    {gym_id:gymId,coach_id:trainer.id,role:'trainer',can_edit_clients:true,can_create_routines:true},
    {gym_id:gymId,coach_id:reception.id,role:'receptionist',can_edit_clients:true,can_create_routines:false,can_view_payments:true},
    {gym_id:gymId,coach_id:readonly.id,role:'trainer',can_edit_clients:false,can_create_routines:false},
    {gym_id:gymId,coach_id:coowner.id,role:'owner',can_edit_clients:true,can_create_routines:true,can_view_payments:true,can_manage_staff:true}
  ].map(row => ({can_edit_clients:false,can_create_routines:false,can_view_payments:false,can_manage_staff:false,...row}))), 'seed staff');
  const client = checked(await db.from('clients').insert({name:`Parity Client ${suffix}`,email:`client-${suffix}@example.invalid`,age:30,goal:'Strength',primary_coach_id:trainer.id,weight:70,height:170}).select().single(), 'create shared client');
  clientIds.push(client.id);
  const memberships = checked(await db.from('client_gym_memberships').insert([
    {gym_id:gymId,client_id:client.id,assigned_coach_id:trainer.id},
    {gym_id:gymIds[1],client_id:client.id,assigned_coach_id:null}
  ]).select(), 'create contexts');
  const membership = memberships.find(row => row.gym_id === gymId);
  const plan = checked(await db.from('membership_plans').insert({gym_id:gymId,name:'Parity Mensual',price:10000,currency:'CRC'}).select().single(), 'create billing plan');
  checked(await owner.api.rpc('set_gym_client_membership_plan',{p_gym_id:gymId,p_client_id:client.id,p_plan_id:plan.id}), 'assign billing plan');
  const exercise = checked(await db.from('exercises').insert({name:'Parity Shared Exercise',muscle_group:'Piernas',source:'coach',coach_id:owner.id,gym_id:gymId}).select().single(), 'shared exercise');
  exerciseIds.push(exercise.id);
  const routineId = checked(await trainer.api.rpc('save_gym_routine_plan', {p_gym_id:gymId,p_plan:{client_id:client.id,name:'Parity Routine',objective:'Strength',duration_weeks:4,start_date:'2026-10-08',end_date:'2026-11-05',warmup:{enabled:true,custom_text:'Movilidad inicial',exercise_ids:[exercise.id]},days:[{day_number:1,day_name:'Piernas',muscle_groups:['Piernas'],notes:'Control del movimiento',exercises:[{exercise_id:exercise.id,sets:3,reps:'10-12',rest:'60 s',order_index:0,block_type:'single',week_configs:[{start_week:1,end_week:4,sets:3,reps:'10-12',rest:'60 s',notes:'Progresar con técnica'}]}]}]}}), 'create routine');
  browser = await chromium.launch({headless:true});
  for (const account of [admin,owner,coowner,trainer,reception,readonly,standard,pro,expired]) {
    const member = [owner,coowner,trainer,reception,readonly].includes(account);
    const {ctx,page} = await open(account);
    await goto(page, '/gym/onboarding');
    check(new URL(page.url()).pathname === '/gym/onboarding' === (account === admin), `${account.name}: only admin enters gym creation`);
    await goto(page, '/gyms');
    check((await page.getByRole('link',{name:'Crear gimnasio',exact:true}).count() > 0) === (account === admin), `${account.name}: create gym visibility`);
    await goto(page, '/clients');
    check(new URL(page.url()).pathname === (member ? `/gym/${gymId}/clients` : '/clients'), `${account.name}: active gym workspace`);
    if (member) {
      await goto(page, `/gym/dashboard/${gymId}`);
      check((new URL(page.url()).pathname === `/gym/dashboard/${gymId}`) === [owner,coowner].includes(account), `${account.name}: owner dashboard access`);
      await goto(page, '/clients/new');
      check((new URL(page.url()).pathname === `/gym/${gymId}/clients/new`) === (account !== readonly), `${account.name}: client creation permission`);
      await goto(page, `/gym/${gymId}/exercises`);
      await page.getByRole('tab',{name:/Mis ejercicios|Mi biblioteca/}).first().click();
      await page.getByText('Parity Shared Exercise',{exact:true}).waitFor();
      check(await page.getByText('Parity Shared Exercise',{exact:true}).count() > 0, `${account.name}: gym exercise library is shared`);
      await goto(page, '/profile');
      check((await page.getByRole('button',{name:'Salir del gimnasio',exact:true}).count() > 0) === ![owner,coowner].includes(account), `${account.name}: leave gym matches role`);
      if (account === reception || account === owner) {
        await goto(page, `/gym/payments/${gymId}`);
        await page.getByRole('button',{name:'Configurar',exact:true}).first().click();
        check(await page.locator('#membership-plan').isDisabled() === (account === reception), `${account.name}: plan assignment permission`);
        await page.getByRole('button',{name:'Cancelar',exact:true}).click();
        await page.getByRole('button',{name:'Finanzas',exact:true}).click();
        await page.locator('#finance-title').waitFor();
        check(await page.getByLabel('Período',{exact:true}).count() === 1, `${account.name}: finance view restored`);
      }
    }
    console.log(`PASS browser role ${account.name}`);
    await ctx.close();
  }
  const {ctx,page} = await open(admin,390);
  await goto(page,'/admin/clients');
  const links = page.locator(`a.client-row[href*="${client.id}"]`);
  check(await links.count() === 3, 'admin directory preserves independent and both gym contexts, including unassigned');
  const detailPath = `/admin/clients/${trainer.id}/${client.id}?membershipId=${membership.id}&gymId=${gymId}`;
  await goto(page, detailPath);
  check(await page.getByRole('button',{name:'Nueva medición',exact:true}).count() === 1,'admin can manage measurements');
  await noOverflow(page,'admin client mobile fits viewport');
  await page.screenshot({path:new URL('admin-client-mobile.png',out).pathname,fullPage:true});
  await page.getByRole('button',{name:'Nueva medición',exact:true}).click();
  await page.getByLabel('Peso (kg)',{exact:true}).fill('74');
  await page.getByRole('button',{name:'Guardar medición',exact:true}).click();
  await page.getByRole('button',{name:'Editar',exact:true}).first().waitFor();
  check(checked(await db.from('measurements').select('id').eq('client_id',client.id).eq('client_gym_membership_id',membership.id),'verify measurement').length === 1, 'admin creates measurement through UI');
  await page.getByRole('combobox',{name:'Cuenta de destino',exact:true}).click();
  await page.getByRole('option',{name: new RegExp('Parity pro ·')}).click();
  await page.getByRole('button',{name:'Clonar cliente',exact:true}).click();
  await page.waitForURL(url => url.pathname.startsWith(`/admin/clients/${pro.id}/`));
  const cloneId = new URL(page.url()).pathname.split('/').pop();
  clientIds.push(cloneId);
  check(checked(await db.from('routines').select('id').eq('client_id',cloneId),'verify clone routines').length === 1,'admin clones routines through UI');
  check(checked(await db.from('measurements').select('id').eq('client_id',cloneId),'verify clone measurements').length === 1,'admin clones measurements through UI');
  const cloneRoutine = checked(await pro.api.from('routines').select('*,routine_days(*,routine_day_exercises(*,exercise:exercises(*),routine_week_configs(*))),routine_warmup_exercises(*)').eq('client_id',cloneId).single(),'target reads cloned routine');
  const cloneExercise = cloneRoutine.routine_days[0].routine_day_exercises[0];
  exerciseIds.push(cloneExercise.exercise_id);
  check(cloneExercise.exercise?.coach_id === pro.id && cloneExercise.exercise?.gym_id === null && cloneExercise.exercise_id !== exercise.id,'clone copies private exercises into target independent library');
  check(cloneRoutine.routine_warmup_exercises.length === 1 && cloneRoutine.routine_warmup_exercises[0].exercise_id === cloneExercise.exercise_id,'clone includes warmup and reuses copied exercise');
  check(cloneExercise.routine_week_configs[0]?.notes === 'Progresar con técnica','clone preserves weekly prescription');
  const savedClone = checked(await pro.api.rpc('save_routine_plan', {p_coach_id:pro.id,p_plan:{
    ...cloneRoutine,
    warmup:{enabled:cloneRoutine.warmup_enabled,custom_text:cloneRoutine.warmup_custom_text,exercise_ids:cloneRoutine.routine_warmup_exercises.map(row=>row.exercise_id)},
    days:cloneRoutine.routine_days.map(day=>({...day,exercises:day.routine_day_exercises.map(row=>({...row,week_configs:row.routine_week_configs}))}))
  }}),'target edits cloned routine');
  check(savedClone === cloneRoutine.id,'target coach can save cloned routine with working sets and warmup');
  await goto(page,detailPath);
  await page.getByRole('link',{name:'Parity Routine',exact:true}).click();
  await page.getByRole('button',{name:'Descargar PDF',exact:true}).waitFor();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();
  const download = await downloadEvent;
  await download.saveAs(new URL('routine.pdf',out).pathname);
  check(download.suggestedFilename().endsWith('.pdf'),'routine directly downloads PDF');
  await noOverflow(page,'routine mobile fits viewport');
  await page.screenshot({path:new URL('routine-mobile.png',out).pathname,fullPage:true});
  await goto(page,'/gyms');
  await noOverflow(page,'gym administration mobile fits viewport');
  await page.screenshot({path:new URL('admin-gyms-mobile.png',out).pathname,fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:new URL('admin-gyms-desktop.png',out).pathname,fullPage:true});
  await ctx.close();
  check(!checks.some(label=>label.startsWith('BROWSER ERROR:')),'no browser runtime errors');
  await writeFile(new URL('results.json',out), JSON.stringify({date:new Date().toISOString(),target:'local',checks},null,2));
  console.log(`PASS ${checks.length} checks; local fixture cleanup follows.`);
} finally {
  await browser?.close();
  server?.kill();
  if (clientIds.length) await db.from('clients').delete().in('id',clientIds);
  if (gymIds.length) await db.from('gyms').delete().in('id',gymIds);
  if (exerciseIds.length) await db.from('exercises').delete().in('id',exerciseIds);
  for (const id of users.reverse()) { await db.from('coaches').delete().eq('id',id); await db.auth.admin.deleteUser(id); }
}
