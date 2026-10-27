import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const productionProjectRef = 'bzhqprxolseyxuuwodqs';
if (process.env.ALLOW_PRODUCTION_MUTATIONS !== productionProjectRef) {
  throw new Error(
    'Esta prueba crea, modifica y elimina datos, identidades Auth y envía una invitación en producción. ' +
    `Requiere ALLOW_PRODUCTION_MUTATIONS=${productionProjectRef} antes de leer credenciales o conectar. ` +
    'Para validar V2 usa las suites test:local-staging o test:hosted-staging.'
  );
}

const email = process.env.ZUMMITH_TEST_EMAIL;
const passwordFromEnvironment = process.env.ZUMMITH_TEST_PASSWORD;
const redirectTo = process.env.ZUMMITH_TEST_REDIRECT_URL || 'http://127.0.0.1:4300/set-password?mode=invite';
if (!email) throw new Error('Define ZUMMITH_TEST_EMAIL para usar una cuenta de pruebas.');

async function readPassword() {
  if (passwordFromEnvironment) return passwordFromEnvironment;
  if (!process.stdin.isTTY) throw new Error('Ejecuta la prueba desde una terminal o define ZUMMITH_TEST_PASSWORD.');
  process.stdout.write('Contraseña de la cuenta de pruebas: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const value = await new Promise((resolve) => process.stdin.once('data', (chunk) => resolve(String(chunk).trim())));
  process.stdin.setRawMode(false);
  process.stdout.write('\n');
  return value;
}

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const supabase = createClient(
  `https://${productionProjectRef}.supabase.co`,
  'sb_publishable_WV7gKbHQEnaajeRlc3vMEA_AlHOoxwF',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let clientId = null;
let cleanupSucceeded = false;
try {
  const password = await readPassword();
  const session = checked(await supabase.auth.signInWithPassword({ email, password }), 'Inicio de sesión');
  const coachId = session.user.id;
  const databaseUserId = checked(await supabase.rpc('current_user_id'), 'Identidad de base de datos');
  assert.equal(databaseUserId, coachId, 'La sesión no está llegando a la base de datos.');
  const profile = checked(await supabase.from('coaches')
    .select('account_type,coach_plan,next_plan_payment_date')
    .eq('id', coachId).single(), 'Perfil de entrenador');
  assert.equal(profile.account_type, 'independent');
  assert.equal(profile.coach_plan, 'paid');
  assert.ok(profile.next_plan_payment_date && new Date(`${profile.next_plan_payment_date.slice(0, 10)}T23:59:59`) >= new Date());

  const suffix = Date.now().toString(36);
  const [local, domain] = email.split('@');
  const clientEmail = `${local}+v2rpc${suffix}@${domain}`;
  const testName = `Prueba Migración ${suffix}`;
  const exercise = checked(await supabase.from('exercises')
    .select('id,name').eq('source', 'global').limit(1).single(), 'Ejercicio global');
  checked(await supabase.from('clients').insert({
    primary_coach_id: coachId,
    name: testName,
    email: clientEmail,
    birth_date: '1995-04-20',
    age: 31,
    goal: 'Verificación de migración V2'
  }), 'Crear cliente de prueba');
  const client = checked(await supabase.from('clients').select('id')
    .eq('primary_coach_id', coachId).eq('email', clientEmail).single(), 'Leer cliente de prueba');
  clientId = client.id;
  console.log(`Cliente temporal creado: ${clientId}`);

  const routinePlan = {
    client_id: clientId,
    name: `Rutina de prueba ${suffix}`,
    objective: 'Verificar guardado atómico',
    duration_weeks: 4,
    start_date: '2026-09-24',
    end_date: '2026-10-22',
    notes: 'Dato temporal de prueba',
    warmup: { enabled: false, custom_text: null, exercise_ids: [] },
    days: [{ day_number: 1, day_name: 'Día de prueba', muscle_groups: ['Full Body'], exercises: [{
      exercise_id: exercise.id, sets: 3, reps: '8', rest: '90 s', order_index: 0,
      block_type: 'single', block_id: null, block_position: null, week_configs: []
    }] }]
  };
  const routineId = checked(await supabase.rpc('save_routine_plan', {
    p_coach_id: coachId, p_plan: routinePlan
  }), 'Crear rutina');
  const savedDay = checked(await supabase.from('routine_days').select('id')
    .eq('routine_id', routineId).single(), 'Leer día de rutina');
  checked(await supabase.rpc('save_routine_plan', {
    p_coach_id: coachId,
    p_plan: { ...routinePlan, id: routineId, name: `Rutina actualizada ${suffix}` }
  }), 'Actualizar rutina');
  const updatedDay = checked(await supabase.from('routine_days').select('id')
    .eq('routine_id', routineId).single(), 'Leer día tras actualización');
  assert.equal(updatedDay.id, savedDay.id, 'La edición debe conservar el ID del día para preservar RIR.');
  console.log('Rutina: creación, edición y conservación del día verificadas.');

  const sheet = {
    client_id: clientId, program_title: 'Prueba V2', mesocycle_title: 'Acumulación',
    macrocycle_title: 'Temporada de prueba', frequency_text: 'Una vez por semana',
    split_text: 'Full Body', training_days_text: 'Lunes', day_labels: ['Lunes'],
    week_plans: [{ weekLabel: 'Semana 1', workouts: ['A'] }],
    workouts: [{ key: 'A', title: 'Entrenamiento A', subtitle: '', code: 'A', blocks: [{
      name: exercise.name, note: '', microcycles: [
        { series: '3', reps: '8' }, { series: '3', reps: '8' }, { series: '3', reps: '8' }
      ], rest: ['90 s', '90 s', '90 s']
    }] }]
  };
  const sheetId = checked(await supabase.rpc('save_competitor_sheet', {
    p_coach_id: coachId, p_sheet: sheet
  }), 'Crear hoja de competidor');
  checked(await supabase.rpc('save_competitor_sheet', {
    p_coach_id: coachId, p_sheet: { ...sheet, id: sheetId, mesocycle_title: 'Acumulación actualizada' }
  }), 'Actualizar hoja de competidor');
  const savedSheet = checked(await supabase.from('competitor_sheets')
    .select('mesocycle_title').eq('id', sheetId).single(), 'Leer hoja de competidor');
  assert.equal(savedSheet.mesocycle_title, 'Acumulación actualizada');
  console.log('Competidor: creación, edición y lectura verificadas.');

  const measurement = checked(await supabase.from('measurements').insert({
    client_id: clientId, date: '2026-09-24', weight: 72, height: 175, bmi: 23.51,
    notes: 'Medición temporal de prueba'
  }).select('id').single(), 'Crear medición');
  checked(await supabase.from('measurements').update({ weight: 71.5, bmi: 23.35 })
    .eq('id', measurement.id).eq('client_id', clientId), 'Actualizar medición');
  const savedMeasurement = checked(await supabase.from('measurements').select('weight')
    .eq('id', measurement.id).single(), 'Leer medición');
  assert.equal(Number(savedMeasurement.weight), 71.5);
  console.log('Mediciones: creación, edición y lectura verificadas.');

  const authUserId = checked(await supabase.rpc('admin_ensure_auth_user_for_email', {
    p_email: clientEmail, p_gym_id: null, p_client_id: clientId,
    p_role: 'independent_client',
    p_user_metadata: { role: 'independent_client', coach_id: coachId, client_id: clientId }
  }), 'Preparar identidad del portal');
  const invitedAt = new Date().toISOString();
  checked(await supabase.from('clients').update({
    user_id: authUserId, portal_status: 'pending', portal_invited_at: invitedAt, updated_at: invitedAt
  }).eq('id', clientId).eq('primary_coach_id', coachId), 'Vincular identidad del cliente');
  checked(await supabase.from('independent_client_portal_access').upsert({
    user_id: authUserId, coach_id: coachId, client_id: clientId
  }, { onConflict: 'user_id,client_id' }), 'Crear acceso al portal');
  checked(await supabase.auth.resetPasswordForEmail(clientEmail, { redirectTo }), 'Enviar invitación');
  console.log(`Portal: identidad, acceso y solicitud de correo verificados para ${clientEmail}.`);

  const deletion = checked(await supabase.rpc('delete_owned_independent_client', {
    p_client_id: clientId
  }), 'Eliminar cliente temporal');
  assert.equal(deletion?.client_deleted, true);
  const remaining = checked(await supabase.from('clients').select('id').eq('id', clientId), 'Verificar limpieza');
  assert.equal(remaining.length, 0);
  cleanupSucceeded = true;
  console.log(`Limpieza: cliente y datos relacionados eliminados; identidades Auth eliminadas: ${deletion.auth_users_deleted}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (clientId && !cleanupSucceeded) {
    const result = await supabase.rpc('delete_owned_independent_client', { p_client_id: clientId });
    if (result.error) console.error(`Limpieza pendiente del cliente ${clientId}: ${result.error.message}`);
    else console.log(`Cliente temporal ${clientId} eliminado tras la prueba.`);
  }
  // persistSession is disabled; no local token remains when this process exits.
}
process.exit(process.exitCode ?? 0);
