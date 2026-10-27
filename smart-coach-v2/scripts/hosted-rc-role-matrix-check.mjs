import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
assert.equal(target.hosted, true, 'Esta matriz RC solo puede ejecutarse contra el staging alojado aislado.');

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const adminApi = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);

const identities = [];
const coachIds = [];
const clientIds = [];
const exerciseIds = [];
const globalExerciseIds = [];
const assetPaths = [];

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createCoach(label, profile) {
  const email = `stage-rc-${label}-${suffix}@example.invalid`;
  const user = checked(await adminApi.auth.admin.createUser({ email, password, email_confirm: true }),
    `Crear Auth ${label}`).user;
  identities.push(user.id);
  coachIds.push(user.id);
  checked(await adminApi.from('coaches').insert({
    id: user.id,
    email,
    name: `RC ${label}`,
    role: profile.role || 'coach',
    account_type: 'independent',
    coach_plan: profile.plan,
    next_plan_payment_date: profile.paymentDate ?? null,
    brand_color: '#CCFF00'
  }), `Crear perfil ${label}`);
  const client = createClient(target.API_URL, target.ANON_KEY, options);
  checked(await client.auth.signInWithPassword({ email, password }), `Login ${label}`);
  return { id: user.id, email, client };
}

async function createOwnedExercise(owner, name) {
  const exercise = checked(await owner.client.from('exercises').insert({
    name, muscle_group: 'Full Body', source: 'coach', coach_id: owner.id
  }).select('id').single(), `Crear ejercicio ${name}`);
  exerciseIds.push(exercise.id);
  return exercise.id;
}

async function createOwnedClient(owner, label) {
  const email = `stage-rc-client-${label}-${suffix}@zummith.com`;
  checked(await owner.client.from('clients').insert({
    primary_coach_id: owner.id,
    name: `Cliente ${label}`,
    email,
    birth_date: '1995-04-20',
    age: 31,
    goal: 'Validar release candidate'
  }), `Crear cliente ${label}`);
  const row = checked(await owner.client.from('clients').select('id')
    .eq('primary_coach_id', owner.id).eq('email', email).single(), `Leer cliente ${label}`);
  clientIds.push(row.id);
  return row.id;
}

function routinePlan(clientId, exerciseId, label, blockType = 'single') {
  const blockId = blockType === 'single' ? null : randomUUID();
  const exercises = [{
    exercise_id: exerciseId,
    sets: 3,
    reps: '8-10',
    rest: '90 s',
    order_index: 0,
    block_type: blockType,
    block_id: blockId,
    block_label: blockType === 'single' ? null : 'A',
    block_position: blockType === 'single' ? null : 1,
    block_rest: blockType === 'single' ? null : '120 s',
    week_configs: [{ start_week: 1, end_week: 2, sets: 3, reps: '8', rest: '90 s' }]
  }];
  if (blockType !== 'single') exercises.push({ ...exercises[0], order_index: 1, block_position: 2 });
  return {
    client_id: clientId,
    name: `Rutina ${label}`,
    objective: 'Validar permisos RC',
    duration_weeks: 4,
    start_date: today,
    end_date: future,
    warmup: { enabled: false, custom_text: null, exercise_ids: [] },
    days: [{
      day_number: 1,
      day_name: 'Día RC',
      muscle_groups: ['Full Body'],
      exercises
    }]
  };
}

function competitorSheet(clientId, label) {
  return {
    client_id: clientId,
    program_title: `Programa ${label}`,
    mesocycle_title: 'Base',
    macrocycle_title: 'Temporada RC',
    frequency_text: 'Una vez por semana',
    split_text: 'Full Body',
    training_days_text: 'Lunes',
    day_labels: ['Lunes'],
    week_plans: [{ weekLabel: 'Semana 1', workouts: ['A'] }],
    workouts: [{
      key: 'A', title: 'Entrenamiento A', subtitle: '', code: 'A',
      blocks: [{
        name: 'Movimiento RC', note: '',
        microcycles: [{ series: '3', reps: '8' }, { series: '3', reps: '8' }, { series: '3', reps: '8' }],
        rest: ['90 s', '90 s', '90 s']
      }]
    }]
  };
}

try {
  const standard = await createCoach('standard', { plan: 'standard' });
  const pro = await createCoach('pro', { plan: 'paid', paymentDate: future });
  const expired = await createCoach('expired', { plan: 'paid', paymentDate: '2000-01-01' });
  const other = await createCoach('other', { plan: 'standard' });
  const platformAdmin = await createCoach('admin', { plan: 'standard', role: 'admin' });

  const standardExercise = await createOwnedExercise(standard, `Ejercicio estándar ${suffix}`);
  const proExercise = await createOwnedExercise(pro, `Ejercicio Pro ${suffix}`);
  const standardClientId = await createOwnedClient(standard, 'standard');
  const proClientId = await createOwnedClient(pro, 'pro');
  const expiredClientId = await createOwnedClient(expired, 'expired');

  const standardUpdate = checked(await standard.client.from('clients')
    .update({ phone: '88887777', notes: 'Edición RC en staging' })
    .eq('id', standardClientId).select('phone,notes').single(), 'Editar cliente estándar');
  assert.equal(standardUpdate.phone, '88887777');

  const measurements = Array.from({ length: 10 }, (_, index) => ({
    client_id: standardClientId,
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    weight: 72 - index * 0.2,
    height: 175,
    bmi: Number(((72 - index * 0.2) / 1.75 ** 2).toFixed(2)),
    body_fat_percentage: index % 2 ? null : 18 - index * 0.1,
    muscle_mass: index % 3 ? 56 + index * 0.1 : null,
    waist: index % 2 ? null : 82 - index * 0.2,
    notes: index === 9 ? 'Medición RC más reciente' : null
  }));
  checked(await standard.client.from('measurements').insert(measurements), 'Crear historial de mediciones');
  assert.equal(checked(await standard.client.from('measurements').select('id')
    .eq('client_id', standardClientId), 'Leer historial de mediciones').length, 10);

  const standardPlan = routinePlan(standardClientId, standardExercise, 'estándar');
  const standardRoutineId = checked(await standard.client.rpc('save_routine_plan', {
    p_coach_id: standard.id,
    p_plan: standardPlan
  }), 'Guardar rutina simple estándar');
  checked(await standard.client.rpc('save_routine_plan', {
    p_coach_id: standard.id,
    p_plan: { ...standardPlan, id: standardRoutineId, name: 'Rutina estándar editada' }
  }), 'Editar rutina simple estándar');

  const groupedStandard = await standard.client.rpc('save_routine_plan', {
    p_coach_id: standard.id,
    p_plan: routinePlan(standardClientId, standardExercise, 'agrupada estándar', 'biserie')
  });
  assert.ok(groupedStandard.error, 'El plan estándar no debe crear bloques avanzados.');
  assert.match(groupedStandard.error.message, /paid coach subscription required/i);

  const legacyPlan = routinePlan(standardClientId, standardExercise, 'biserie heredada', 'biserie');
  const legacyRoutineId = checked(await platformAdmin.client.rpc('save_routine_plan', {
    p_coach_id: standard.id,
    p_plan: legacyPlan
  }), 'Preparar biserie heredada');
  checked(await standard.client.rpc('save_routine_plan', {
    p_coach_id: standard.id,
    p_plan: { ...legacyPlan, id: legacyRoutineId, name: 'Biserie heredada editada' }
  }), 'Editar biserie heredada como plan estándar');

  const proGroupedId = checked(await pro.client.rpc('save_routine_plan', {
    p_coach_id: pro.id,
    p_plan: routinePlan(proClientId, proExercise, 'agrupada Pro', 'biserie')
  }), 'Guardar bloque avanzado Pro');
  assert.ok(proGroupedId);

  for (const [owner, ownedClientId, label] of [
    [standard, standardClientId, 'estándar'],
    [pro, proClientId, 'Pro']
  ]) {
    const sheet = competitorSheet(ownedClientId, label);
    const sheetId = checked(await owner.client.rpc('save_competitor_sheet', {
      p_coach_id: owner.id, p_sheet: sheet
    }), `Guardar competidor ${label}`);
    checked(await owner.client.rpc('save_competitor_sheet', {
      p_coach_id: owner.id, p_sheet: { ...sheet, id: sheetId, mesocycle_title: 'Base editada' }
    }), `Editar competidor ${label}`);
    checked(await owner.client.from('competitor_sheets').delete().eq('id', sheetId),
      `Eliminar competidor ${label}`);
  }

  const standardPortal = await standard.client.rpc('admin_ensure_auth_user_for_email', {
    p_email: `stage-standard-portal-${suffix}@zummith.com`,
    p_gym_id: null,
    p_client_id: standardClientId,
    p_role: 'independent_client',
    p_user_metadata: { role: 'independent_client' }
  });
  assert.ok(standardPortal.error, 'El plan estándar no debe habilitar Portal independiente.');

  const expiredPortal = await expired.client.rpc('admin_ensure_auth_user_for_email', {
    p_email: `stage-expired-portal-${suffix}@zummith.com`,
    p_gym_id: null,
    p_client_id: expiredClientId,
    p_role: 'independent_client',
    p_user_metadata: { role: 'independent_client' }
  });
  assert.ok(expiredPortal.error, 'El Pro vencido no debe habilitar Portal independiente.');

  assert.equal(checked(await other.client.from('clients').select('id').eq('id', standardClientId),
    'Aislamiento de lectura').length, 0);
  assert.equal(checked(await other.client.from('clients').update({ notes: 'No permitido' })
    .eq('id', standardClientId).select('id'), 'Aislamiento de edición').length, 0);
  assert.ok((await other.client.rpc('save_routine_plan', {
    p_coach_id: other.id,
    p_plan: standardPlan
  })).error, 'El segundo entrenador no debe escribir una rutina ajena.');
  assert.ok((await other.client.rpc('delete_owned_independent_client', {
    p_client_id: standardClientId
  })).error, 'El segundo entrenador no debe eliminar un cliente ajeno.');

  const profile = checked(await standard.client.from('coaches')
    .update({ phone: '70001111', brand_color: '#4F6500' })
    .eq('id', standard.id).select('phone,brand_color').single(), 'Editar perfil estándar');
  assert.equal(profile.brand_color, '#4F6500');
  const logoPath = `coaches/${standard.id}/logo/rc-${suffix}.png`;
  assetPaths.push(logoPath);
  checked(await standard.client.storage.from('assets').upload(logoPath, Buffer.from([137, 80, 78, 71]), {
    contentType: 'image/png', upsert: false
  }), 'Subir logo estándar');
  checked(await standard.client.storage.from('assets').upload(logoPath, Buffer.from([137, 80, 78, 71, 1]), {
    contentType: 'image/png', upsert: true
  }), 'Reemplazar logo estándar');

  const forbiddenGlobal = await standard.client.from('exercises').insert({
    source: 'global', coach_id: null, name: `Global prohibido ${suffix}`, muscle_group: 'Full Body'
  });
  assert.ok(forbiddenGlobal.error, 'Un coach no admin no debe crear ejercicios globales.');

  const globalExercise = checked(await platformAdmin.client.from('exercises').insert({
    source: 'global', coach_id: null, name: `Global RC ${suffix}`, muscle_group: 'Full Body',
    description: 'Creado por administrador real en staging.'
  }).select('id').single(), 'Admin crea ejercicio global');
  globalExerciseIds.push(globalExercise.id);
  const updatedGlobal = checked(await platformAdmin.client.from('exercises')
    .update({ description: 'Editado por administrador real en staging.' })
    .eq('id', globalExercise.id).select('description').single(), 'Admin edita ejercicio global');
  assert.match(updatedGlobal.description, /Editado/);
  assert.ok(checked(await platformAdmin.client.from('clients').select('id').eq('id', standardClientId),
    'Admin lee cliente').length === 1);
  checked(await platformAdmin.client.from('exercises').delete().eq('id', globalExercise.id),
    'Admin elimina ejercicio global');
  globalExerciseIds.splice(globalExerciseIds.indexOf(globalExercise.id), 1);

  checked(await standard.client.from('routines').delete().eq('id', standardRoutineId),
    'Eliminar rutina estándar');
  assert.equal(checked(await standard.client.from('routines').select('id').eq('id', standardRoutineId),
    'Verificar rutina eliminada').length, 0);

  console.log('Plan estándar: CRUD, mediciones, rutina simple, bloqueo de bloques nuevos y edición de biserie heredada verificados.');
  console.log('Plan Pro activo/vencido: bloques avanzados habilitados o rechazados según vigencia.');
  console.log('Segundo entrenador: lectura, edición, guardado y eliminación ajenos rechazados por RLS/RPC.');
  console.log('Administrador: lectura global y CRUD de ejercicios globales verificados con sesión real.');
} finally {
  if (assetPaths.length && coachIds.length) {
    await adminApi.storage.from('assets').remove(assetPaths);
  }
  for (const id of clientIds) await adminApi.from('clients').delete().eq('id', id);
  for (const id of exerciseIds) await adminApi.from('exercises').delete().eq('id', id);
  for (const id of globalExerciseIds) await adminApi.from('exercises').delete().eq('id', id);
  for (const id of coachIds) await adminApi.from('coaches').delete().eq('id', id);
  for (const id of identities) await adminApi.auth.admin.deleteUser(id);
}
