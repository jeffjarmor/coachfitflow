import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const status = loadStagingTarget();

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const coach = createClient(status.API_URL, status.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const email = `stage-coach-${suffix}@example.invalid`;
const clientEmail = `stage-client-${suffix}@${status.hosted ? 'zummith.com' : 'example.invalid'}`;
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
let coachId;
let secondCoachId;
let clientId;
let clientAuthId;
let accountDeleted = false;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function removeCoachAssets(id) {
  const bucket = coach.storage.from('assets');
  const folders = [`coaches/${id}`];
  const paths = [];
  while (folders.length) {
    const folder = folders.pop();
    let offset = 0;
    while (true) {
      const entries = checked(await bucket.list(folder, { limit: 100, offset }), 'Listar archivos');
      for (const entry of entries || []) {
        const path = `${folder}/${entry.name}`;
        if (entry.id) paths.push(path);
        else folders.push(path);
      }
      if (!entries || entries.length < 100) break;
      offset += entries.length;
    }
  }
  for (let index = 0; index < paths.length; index += 100) {
    checked(await bucket.remove(paths.slice(index, index + 100)), 'Retirar archivos');
  }
  return paths;
}

try {
  const created = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Crear entrenador Auth');
  coachId = created.user.id;
  checked(await admin.from('coaches').upsert({
    id: coachId, email, name: 'Entrenador Stage', role: 'coach', account_type: 'independent',
    coach_plan: 'paid', next_plan_payment_date: future
  }), 'Crear perfil Pro');
  assert.equal(checked(await coach.auth.signInWithPassword({ email, password }), 'Login Pro').user.id, coachId);

  const exercise = checked(await coach.from('exercises').insert({
    name: `Ejercicio Stage ${suffix}`, muscle_group: 'Full Body', source: 'coach', coach_id: coachId
  }).select('id,name').single(), 'Crear ejercicio');
  checked(await coach.from('clients').insert({
    primary_coach_id: coachId, name: 'Cliente Stage', email: clientEmail,
    age: 30, goal: 'Verificar V2'
  }), 'Crear cliente');
  const client = checked(await coach.from('clients').select('id')
    .eq('primary_coach_id', coachId).eq('email', clientEmail).single(), 'Leer cliente');
  clientId = client.id;

  const plan = {
    client_id: clientId, name: 'Rutina Stage', objective: 'Verificar escritura',
    duration_weeks: 4, start_date: today, end_date: future,
    warmup: { enabled: false, custom_text: null, exercise_ids: [] },
    days: [{ day_number: 1, day_name: 'Día Stage', muscle_groups: ['Full Body'], exercises: [{
      exercise_id: exercise.id, sets: 3, reps: '8', rest: '90 s', order_index: 0,
      block_type: 'single', block_id: null, block_position: null, week_configs: []
    }] }]
  };
  const routineId = checked(await coach.rpc('save_routine_plan', { p_coach_id: coachId, p_plan: plan }), 'Guardar rutina');
  checked(await coach.rpc('save_routine_plan', {
    p_coach_id: coachId, p_plan: { ...plan, id: routineId, name: 'Rutina Stage editada' }
  }), 'Editar rutina');

  const secondEmail = `stage-coach-other-${suffix}@example.invalid`;
  secondCoachId = checked(await admin.auth.admin.createUser({
    email: secondEmail, password, email_confirm: true
  }), 'Crear segundo entrenador').user.id;
  checked(await admin.from('coaches').upsert({
    id: secondCoachId, email: secondEmail, name: 'Otro entrenador Stage', role: 'coach',
    account_type: 'independent', coach_plan: 'standard'
  }), 'Crear perfil estándar');
  const otherCoach = createClient(status.API_URL, status.ANON_KEY, options);
  checked(await otherCoach.auth.signInWithPassword({ email: secondEmail, password }), 'Login segundo entrenador');
  assert.equal(checked(await otherCoach.from('clients').select('id').eq('id', clientId), 'RLS otro coach').length, 0);
  assert.ok((await otherCoach.rpc('save_routine_plan', { p_coach_id: coachId, p_plan: plan })).error,
    'Otro coach no debe escribir la rutina.');
  assert.ok((await otherCoach.rpc('delete_owned_independent_client', { p_client_id: clientId })).error,
    'Otro coach no debe eliminar el cliente.');
  console.log('Aislamiento entre entrenadores verificado.');

  const sheet = {
    client_id: clientId, program_title: 'Programa Stage', mesocycle_title: 'Base',
    macrocycle_title: 'Temporada Stage', frequency_text: 'Una vez por semana',
    split_text: 'Full Body', training_days_text: 'Lunes', day_labels: ['Lunes'],
    week_plans: [{ weekLabel: 'Semana 1', workouts: ['A'] }],
    workouts: [{ key: 'A', title: 'Entrenamiento A', subtitle: '', code: 'A', blocks: [{
      name: exercise.name, note: '', microcycles: [
        { series: '3', reps: '8' }, { series: '3', reps: '8' }, { series: '3', reps: '8' }
      ], rest: ['90 s', '90 s', '90 s']
    }] }]
  };
  const sheetId = checked(await coach.rpc('save_competitor_sheet', {
    p_coach_id: coachId, p_sheet: sheet
  }), 'Guardar competidor');
  checked(await coach.rpc('save_competitor_sheet', {
    p_coach_id: coachId, p_sheet: { ...sheet, id: sheetId, mesocycle_title: 'Base editada' }
  }), 'Editar competidor');

  const measurement = checked(await coach.from('measurements').insert({
    client_id: clientId, date: today, weight: 72, height: 175, bmi: 23.51
  }).select('id').single(), 'Guardar medición');
  checked(await coach.from('measurements').update({ weight: 71.5, bmi: 23.35 })
    .eq('id', measurement.id), 'Editar medición');

  clientAuthId = checked(await coach.rpc('admin_ensure_auth_user_for_email', {
    p_email: clientEmail, p_gym_id: null, p_client_id: clientId, p_role: 'independent_client',
    p_user_metadata: { role: 'independent_client', coach_id: coachId, client_id: clientId }
  }), 'Crear identidad Portal');
  checked(await coach.from('clients').update({ user_id: clientAuthId, portal_status: 'pending' })
    .eq('id', clientId), 'Vincular identidad Portal');
  checked(await coach.from('independent_client_portal_access').upsert({
    user_id: clientAuthId, coach_id: coachId, client_id: clientId
  }, { onConflict: 'user_id,client_id' }), 'Dar acceso Portal');
  if (status.hosted) {
    // Free-plan default SMTP only delivers to organization members. Generate
    // an Auth recovery link without sending mail to the synthetic recipient.
    const link = checked(await admin.auth.admin.generateLink({
      type: 'recovery', email: clientEmail,
      options: { redirectTo: 'http://127.0.0.1:4400/set-password?mode=invite' }
    }), 'Generar enlace Portal');
    assert.ok(link.properties?.action_link, 'Auth no generó el enlace de invitación.');
  } else {
    checked(await coach.auth.resetPasswordForEmail(clientEmail, {
      redirectTo: 'http://127.0.0.1:4300/set-password?mode=invite'
    }), 'Solicitar invitación local');
    const mail = await fetch(`${status.MAILPIT_URL}/api/v1/messages`);
    assert.equal(mail.ok, true, 'Mailpit no respondió.');
    const inbox = await mail.json();
    assert.ok(inbox.messages?.some(message => message.To?.some(recipient => recipient.Address === clientEmail)),
      'La invitación no apareció en Mailpit.');
  }
  console.log(`Auth, rutina, competidor, medición y ${status.hosted ? 'generación de enlace Portal' : 'invitación en Mailpit'} verificados en staging ${status.hosted ? 'alojado' : 'local'}.`);

  const portalPassword = `${randomBytes(18).toString('base64url')}Aa1!`;
  checked(await admin.auth.admin.updateUserById(clientAuthId, {
    password: portalPassword, email_confirm: true
  }), 'Activar cliente de pruebas');
  const portal = createClient(status.API_URL, status.ANON_KEY, options);
  checked(await portal.auth.signInWithPassword({ email: clientEmail, password: portalPassword }), 'Login Portal');
  const day = checked(await coach.from('routine_days').select('id').eq('routine_id', routineId).single(), 'Leer día');
  const session = checked(await portal.from('training_sessions').insert({
    routine_id: routineId, routine_day_id: day.id, client_id: clientId, coach_id: coachId,
    portal_scope: 'independent', session_date: today, status: 'completed'
  }).select('id').single(), 'Guardar sesión RIR');
  const trainingSet = checked(await portal.from('training_session_sets').insert({
    training_session_id: session.id, routine_day_id: day.id, exercise_id: exercise.id,
    exercise_name: exercise.name, exercise_order: 0, set_number: 1, actual_reps: 8, rir: 2
  }).select('id').single(), 'Guardar serie RIR');
  assert.equal(checked(await coach.from('training_session_sets').select('rir').eq('id', trainingSet.id).single(),
    'Coach lee RIR').rir, 2);

  checked(await admin.from('coaches').update({ next_plan_payment_date: '2000-01-01' }).eq('id', coachId),
    'Vencer Pro temporalmente');
  const expiredRead = checked(await portal.from('training_sessions').select('id').eq('id', session.id),
    'Leer sesión con Pro vencido');
  assert.equal(expiredRead.length, 0, 'El Portal no debe ver RIR con Pro vencido.');
  const expiredWrite = await portal.from('training_sessions').insert({
    routine_id: routineId, routine_day_id: day.id, client_id: clientId, coach_id: coachId,
    portal_scope: 'independent', session_date: today
  });
  assert.ok(expiredWrite.error, 'El Portal no debe escribir RIR con Pro vencido.');
  checked(await admin.from('coaches').update({ next_plan_payment_date: future }).eq('id', coachId),
    'Restaurar Pro temporal');
  console.log('RIR real y bloqueo del Portal con Pro vencido verificados.');

  const logoPath = `coaches/${coachId}/logo/stage-${suffix}.png`;
  const exerciseImagePath = `coaches/${coachId}/exercises/stage-${suffix}.png`;
  for (const path of [logoPath, exerciseImagePath]) {
    checked(await coach.storage.from('assets').upload(path, Buffer.from([137, 80, 78, 71]), {
      contentType: 'image/png', upsert: true
    }), 'Subir archivo de prueba');
  }
  checked(await coach.rpc('assert_current_coach_account_deletable'), 'Prevalidar cuenta');
  const deletion = checked(await coach.rpc('delete_owned_independent_client', { p_client_id: clientId }), 'Eliminar cliente');
  assert.equal(deletion.client_deleted, true);
  clientId = undefined;
  const paths = await removeCoachAssets(coachId);
  assert.deepEqual(paths.sort(), [exerciseImagePath, logoPath].sort());
  checked(await coach.rpc('delete_current_coach_account'), 'Eliminar cuenta');
  accountDeleted = true;
  assert.equal(checked(await admin.from('coaches').select('id').eq('id', coachId), 'Verificar coach').length, 0);
  const remainingFiles = checked(await admin.storage.from('assets').list(`coaches/${coachId}/logo`), 'Verificar Storage');
  assert.equal(remainingFiles.some(file => file.name === `stage-${suffix}.png`), false);
  console.log(`Storage, cliente y cuenta Auth eliminados correctamente en staging ${status.hosted ? 'alojado' : 'local'}.`);
} finally {
  if (!accountDeleted) {
    if (clientId) checked(await admin.from('clients').delete().eq('id', clientId), 'Limpieza cliente');
    if (coachId) {
      const { data: files } = await admin.storage.from('assets').list(`coaches/${coachId}/logo`);
      if (files?.length) await admin.storage.from('assets').remove(files.filter(file => file.id).map(file => `coaches/${coachId}/logo/${file.name}`));
      const { data: images } = await admin.storage.from('assets').list(`coaches/${coachId}/exercises`);
      if (images?.length) await admin.storage.from('assets').remove(images.filter(file => file.id).map(file => `coaches/${coachId}/exercises/${file.name}`));
      checked(await admin.from('exercises').delete().eq('coach_id', coachId), 'Limpieza ejercicios');
      checked(await admin.from('coaches').delete().eq('id', coachId), 'Limpieza coach');
      checked(await admin.auth.admin.deleteUser(coachId), 'Limpieza Auth coach');
    }
    if (clientAuthId) await admin.auth.admin.deleteUser(clientAuthId);
  }
  if (secondCoachId) {
    checked(await admin.from('coaches').delete().eq('id', secondCoachId), 'Limpieza segundo coach');
    checked(await admin.auth.admin.deleteUser(secondCoachId), 'Limpieza Auth segundo coach');
  }
}
