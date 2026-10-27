import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const portal = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const domain = target.hosted ? 'zummith.com' : 'example.invalid';
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const portalEmail = `stage-gym-client-${suffix}@${domain}`;
let coachId;
let portalId;
let gymId;
let clientId;
let exerciseId;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

try {
  coachId = checked(await admin.auth.admin.createUser({
    email: `stage-gym-coach-${suffix}@${domain}`, password, email_confirm: true
  }), 'Crear coach de gimnasio').user.id;
  portalId = checked(await admin.auth.admin.createUser({
    email: portalEmail, password, email_confirm: true
  }), 'Crear cliente de gimnasio').user.id;
  checked(await admin.from('coaches').insert({
    id: coachId, email: `stage-gym-coach-${suffix}@${domain}`, name: 'Coach Gym Stage',
    role: 'coach', account_type: 'gym'
  }), 'Crear perfil de gimnasio');
  gymId = checked(await admin.from('gyms').insert({
    name: 'Gym RIR Stage', access_code: `STAGE-RIR-${suffix}`, owner_id: coachId
  }).select('id').single(), 'Crear gimnasio').id;
  clientId = checked(await admin.from('clients').insert({
    user_id: portalId, primary_coach_id: coachId, name: 'Cliente Gym Stage',
    email: portalEmail, age: 30, goal: 'Prueba RIR de gimnasio'
  }).select('id').single(), 'Crear ficha de gimnasio').id;
  const membershipId = checked(await admin.from('client_gym_memberships').insert({
    client_id: clientId, gym_id: gymId, assigned_coach_id: coachId,
    subscription_status: 'active', portal_status: 'active'
  }).select('id').single(), 'Crear membresía').id;
  checked(await admin.from('client_portal_access').insert({
    user_id: portalId, client_gym_membership_id: membershipId
  }), 'Crear acceso gym Portal');
  exerciseId = checked(await admin.from('exercises').insert({
    name: `Ejercicio Gym Stage ${suffix}`, muscle_group: 'Full Body', source: 'coach', coach_id: coachId
  }).select('id').single(), 'Crear ejercicio gym').id;
  const routineId = checked(await admin.from('routines').insert({
    client_id: clientId, coach_id: coachId, client_gym_membership_id: membershipId,
    name: 'Rutina Gym Stage', objective: 'Verificar RIR heredado', training_days_count: 1, duration_weeks: 4
  }).select('id').single(), 'Crear rutina gym').id;
  const dayId = checked(await admin.from('routine_days').insert({
    routine_id: routineId, day_number: 1, day_name: 'Día Gym Stage'
  }).select('id').single(), 'Crear día gym').id;

  checked(await portal.auth.signInWithPassword({ email: portalEmail, password }), 'Login cliente gym');
  const sessionId = checked(await portal.from('training_sessions').insert({
    routine_id: routineId, routine_day_id: dayId, client_id: clientId, coach_id: coachId,
    client_gym_membership_id: membershipId, portal_scope: 'gym', status: 'completed'
  }).select('id').single(), 'Guardar sesión gym').id;
  const setId = checked(await portal.from('training_session_sets').insert({
    training_session_id: sessionId, routine_day_id: dayId, exercise_id: exerciseId,
    exercise_name: 'Ejercicio Gym Stage', exercise_order: 0, set_number: 1,
    actual_reps: 8, rir: 2
  }).select('id').single(), 'Guardar serie gym').id;
  assert.equal(checked(await portal.from('training_session_sets').select('rir').eq('id', setId).single(),
    'Leer RIR gym').rir, 2);
  console.log(`RIR de gimnasio heredado: escritura y lectura verificadas en staging ${target.hosted ? 'alojado' : 'local'}.`);
} finally {
  if (clientId) checked(await admin.from('clients').delete().eq('id', clientId), 'Limpiar ficha gym');
  if (exerciseId) checked(await admin.from('exercises').delete().eq('id', exerciseId), 'Limpiar ejercicio gym');
  if (gymId) checked(await admin.from('gyms').delete().eq('id', gymId), 'Limpiar gimnasio');
  if (coachId) checked(await admin.from('coaches').delete().eq('id', coachId), 'Limpiar coach gym');
  if (portalId) checked(await admin.auth.admin.deleteUser(portalId), 'Limpiar Auth cliente gym');
  if (coachId) checked(await admin.auth.admin.deleteUser(coachId), 'Limpiar Auth coach gym');
}
