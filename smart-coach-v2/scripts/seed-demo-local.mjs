import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// These fixtures are intentionally restricted to the local Supabase CLI.
const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.117.0', 'status', '-o', 'json'], {
  cwd: new URL('../..', import.meta.url),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore']
}));
assert.equal(status.API_URL, 'http://127.0.0.1:54321', 'Solo se permite Supabase local.');
assert.ok(status.SERVICE_ROLE_KEY && status.ANON_KEY, 'Faltan las claves locales.');
const password = process.env.DEMO_PASSWORD;
assert.ok(password && password.length >= 12, 'Define DEMO_PASSWORD (mínimo 12 caracteres).');

const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const today = new Date();
const isoDay = (offset) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const isoTime = (offset) => `${isoDay(offset)}T12:00:00.000Z`;
const uuid = (name) => {
  const hash = createHash('sha256').update(`coachfitflow-v2-local-demo:${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const upsert = async (table, rows) => {
  checked(await admin.from(table).upsert(rows, { onConflict: 'id' }), table);
  console.log(`${table}: ${rows.length}`);
};

const accounts = [
  ['admin', 'Admin Demo', 'admin.demo@coachfitflow.test', 'admin', 'independent', 'paid'],
  ['coach_standard', 'Marco Solís', 'coach.standard@coachfitflow.test', 'coach', 'independent', 'standard'],
  ['coach_pro', 'Valeria Rojas', 'coach.pro@coachfitflow.test', 'coach', 'independent', 'paid'],
  ['owner', 'Daniela Mora', 'duena.gym@coachfitflow.test', 'owner', 'gym', 'standard'],
  ['trainer', 'Andrés Vega', 'entrenador.gym@coachfitflow.test', 'coach', 'gym', 'standard'],
  ['receptionist', 'Lucía Arias', 'recepcion.gym@coachfitflow.test', 'coach', 'gym', 'standard'],
  ['independent_client', 'Sofía Méndez', 'cliente.independiente@coachfitflow.test', 'independent_client'],
  ['gym_client', 'Camila Castro', 'cliente.gym@coachfitflow.test', 'gym_client']
];
const users = new Map();
const existingUsers = [];
for (let page = 1; ; page++) {
  const data = checked(await admin.auth.admin.listUsers({ page, perPage: 1000 }), 'listar usuarios');
  existingUsers.push(...data.users);
  if (data.users.length < 1000) break;
}
for (const [key, name, email, role] of accounts) {
  const metadata = { name, full_name: name, role };
  const existing = existingUsers.find((user) => user.email?.toLowerCase() === email);
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: metadata, app_metadata: { role } })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata, app_metadata: { role } });
  users.set(key, checked(result, `usuario ${email}`).user.id);
}
console.log(`Usuarios: ${users.size}`);

await upsert('coaches', accounts.slice(0, 6).map(([key, name, email, role, accountType, coachPlan]) => ({
  id: users.get(key), name, email, role, account_type: accountType, coach_plan: coachPlan,
  next_plan_payment_date: coachPlan === 'paid' ? isoDay(25) : null,
  brand_color: key === 'owner' ? '#6D5AE6' : '#CCFF00'
})));

const gymId = uuid('gym');
await upsert('gyms', [{
  id: gymId, name: 'Gimnasio Horizonte Demo', email: 'hola@horizonte.test',
  phone: '2222-0101', address: 'San José, Costa Rica (datos ficticios)',
  brand_color: '#6D5AE6', access_code: 'DEMO2026', owner_id: users.get('owner')
}]);
await upsert('gym_staff', [
  { id: uuid('staff-owner'), gym_id: gymId, coach_id: users.get('owner'), role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
  { id: uuid('staff-trainer'), gym_id: gymId, coach_id: users.get('trainer'), role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false },
  { id: uuid('staff-reception'), gym_id: gymId, coach_id: users.get('receptionist'), role: 'receptionist', can_edit_clients: false, can_create_routines: false, can_view_payments: true, can_manage_staff: false }
]);

const planId = uuid('plan');
await upsert('membership_plans', [{ id: planId, gym_id: gymId, name: 'Plan mensual demo', price: 28000, currency: 'CRC', description: 'Acceso mensual ficticio', active: true }]);
const clients = [
  ['independent_portal', 'Sofía Méndez', 'cliente.independiente@coachfitflow.test', users.get('independent_client'), users.get('coach_pro'), 'Ganar fuerza', 29, 64, 165],
  ['independent_extra', 'Diego Navarro', 'diego.demo@coachfitflow.test', null, users.get('coach_pro'), 'Mejorar resistencia', 34, 78, 176],
  ['standard_extra', 'Paula Jiménez', 'paula.demo@coachfitflow.test', null, users.get('coach_standard'), 'Acondicionamiento general', 27, 59, 160],
  ['gym_portal', 'Camila Castro', 'cliente.gym@coachfitflow.test', users.get('gym_client'), null, 'Reducir grasa corporal', 31, 71, 168],
  ['gym_extra_1', 'José Vargas', 'jose.demo@coachfitflow.test', null, null, 'Ganar masa muscular', 37, 83, 179],
  ['gym_extra_2', 'Elena Porras', 'elena.demo@coachfitflow.test', null, null, 'Mejorar movilidad', 42, 68, 162]
];
await upsert('clients', clients.map(([key, name, email, userId, coachId, goal, age, weight, height]) => ({
  id: uuid(`client-${key}`), user_id: userId, primary_coach_id: coachId, name, email,
  phone: '8888-0101', age, weight, height, goal, address: 'San José, Costa Rica (demo)',
  notes: 'Perfil ficticio para revisar la interfaz.',
  portal_status: userId && coachId ? 'active' : 'pending',
  portal_invited_at: userId && coachId ? isoTime(-14) : null
})));

const memberships = [
  ['gym_portal', 'active', users.get('trainer'), 20],
  ['gym_extra_1', 'overdue', users.get('trainer'), -5],
  ['gym_extra_2', 'pending', users.get('owner'), 7]
];
await upsert('client_gym_memberships', memberships.map(([key, subscriptionStatus, coachId, dueOffset]) => ({
  id: uuid(`membership-${key}`), client_id: uuid(`client-${key}`), gym_id: gymId,
  assigned_coach_id: coachId, membership_plan_id: planId,
  subscription_status: subscriptionStatus, next_payment_due_date: isoTime(dueOffset),
  portal_status: key === 'gym_portal' ? 'active' : 'pending',
  portal_invited_at: key === 'gym_portal' ? isoTime(-14) : null
})));
await upsert('independent_client_portal_access', [{
  id: uuid('independent-access'), user_id: users.get('independent_client'),
  client_id: uuid('client-independent_portal'), coach_id: users.get('coach_pro')
}]);
await upsert('client_portal_access', [{
  id: uuid('gym-access'), user_id: users.get('gym_client'),
  client_gym_membership_id: uuid('membership-gym_portal')
}]);

const exercises = [
  ['Sentadilla con barra', 'Piernas'], ['Press de banca', 'Pecho'],
  ['Remo con mancuerna', 'Espalda'], ['Plancha frontal', 'Core'],
  ['Peso muerto rumano', 'Piernas']
];
await upsert('exercises', exercises.map(([name, muscleGroup]) => ({
  id: uuid(`exercise-${name}`), name, muscle_group: muscleGroup, source: 'global',
  description: 'Ejercicio de demostración para las rutinas ficticias.'
})));
const routines = [
  ['independent', 'Fuerza inicial', 'Ganar fuerza con técnica', 'independent_portal', users.get('coach_pro'), null],
  ['gym', 'Programa funcional', 'Acondicionamiento general', 'gym_portal', users.get('trainer'), uuid('membership-gym_portal')],
  ['standard', 'Base aeróbica', 'Mejorar condición física', 'standard_extra', users.get('coach_standard'), null]
];
await upsert('routines', routines.map(([key, name, objective, clientKey, coachId, membershipId]) => ({
  id: uuid(`routine-${key}`), coach_id: coachId, client_id: uuid(`client-${clientKey}`),
  client_gym_membership_id: membershipId, name, objective, training_days_count: 2,
  duration_weeks: 8, start_date: isoDay(-7), end_date: isoDay(49),
  notes: 'Rutina ficticia para revisión visual.', warmup_enabled: true,
  warmup_custom_text: '5 minutos de caminata y movilidad articular.'
})));
const routineDays = routines.flatMap(([key]) => [
  { id: uuid(`day-${key}-1`), routine_id: uuid(`routine-${key}`), day_number: 1, day_name: 'Día 1 · Tren inferior', muscle_groups: ['Piernas', 'Core'] },
  { id: uuid(`day-${key}-2`), routine_id: uuid(`routine-${key}`), day_number: 2, day_name: 'Día 2 · Tren superior', muscle_groups: ['Pecho', 'Espalda'] }
]);
await upsert('routine_days', routineDays);
const dayExercises = routines.flatMap(([key]) => [
  [1, 0, 'Sentadilla con barra', 3, '8-10'],
  [1, 1, 'Plancha frontal', 3, '30 segundos'],
  [2, 0, 'Press de banca', 3, '8-10'],
  [2, 1, 'Remo con mancuerna', 3, '10-12']
].map(([day, order, name, sets, reps]) => ({
  id: uuid(`day-exercise-${key}-${day}-${order}`), routine_day_id: uuid(`day-${key}-${day}`),
  exercise_id: uuid(`exercise-${name}`), sets, reps, rest: '90 segundos',
  order_index: order, block_type: 'single', notes: 'Controlar la técnica.'
})));
await upsert('routine_day_exercises', dayExercises);

await upsert('measurements', [
  ['independent_portal', null, -30, 65.4, 165, 25.1],
  ['independent_portal', null, -2, 64.0, 165, 24.3],
  ['gym_portal', 'gym_portal', -45, 73.2, 168, 31.0],
  ['gym_portal', 'gym_portal', -3, 71.0, 168, 29.1],
  ['gym_extra_1', 'gym_extra_1', -8, 83.0, 179, 22.0],
  ['standard_extra', null, -6, 59.0, 160, 26.0]
].map(([clientKey, membershipKey, offset, weight, height, bodyFat]) => ({
  id: uuid(`measurement-${clientKey}-${offset}`), client_id: uuid(`client-${clientKey}`),
  client_gym_membership_id: membershipKey ? uuid(`membership-${membershipKey}`) : null,
  date: isoDay(offset), weight, height, bmi: Number((weight / ((height / 100) ** 2)).toFixed(2)),
  body_fat_percentage: bodyFat, muscle_mass: 28.4, waist: 77, hips: 96,
  notes: 'Medición ficticia de seguimiento.'
})));
await upsert('payments', [
  ['gym_portal', -30, 'paid', 28000, 'tarjeta'],
  ['gym_portal', 20, 'pending', 28000, null],
  ['gym_extra_1', -5, 'overdue', 28000, null],
  ['gym_extra_2', 7, 'pending', 28000, null]
].map(([key, offset, status, amount, method]) => ({
  id: uuid(`payment-${key}-${offset}`), client_gym_membership_id: uuid(`membership-${key}`),
  amount, currency: 'CRC', method, due_date: isoTime(offset),
  paid_date: status === 'paid' ? isoTime(offset) : null, status,
  notes: 'Pago ficticio de demostración.', created_by: users.get('owner')
})));

await upsert('training_sessions', [
  ['independent', 'independent_portal', users.get('coach_pro'), null, 'independent'],
  ['gym', 'gym_portal', users.get('trainer'), uuid('membership-gym_portal'), 'gym']
].map(([key, clientKey, coachId, membershipId, scope]) => ({
  id: uuid(`session-${key}`), routine_id: uuid(`routine-${key}`), routine_day_id: uuid(`day-${key}-1`),
  client_id: uuid(`client-${clientKey}`), coach_id: coachId, client_gym_membership_id: membershipId,
  portal_scope: scope, session_date: isoDay(-2), status: 'completed',
  started_at: isoTime(-2), completed_at: isoTime(-2)
})));
await upsert('training_session_sets', ['independent', 'gym'].flatMap((key) => [1, 2, 3].map((setNumber) => ({
  id: uuid(`session-set-${key}-${setNumber}`), training_session_id: uuid(`session-${key}`),
  routine_day_id: uuid(`day-${key}-1`), exercise_id: uuid('exercise-Sentadilla con barra'),
  exercise_name: 'Sentadilla con barra', exercise_order: 0, set_number: setNumber,
  planned_reps: '8-10', actual_reps: 10 - setNumber, rir: 2, load: 30 + setNumber * 2,
  load_unit: 'kg'
}))));

for (const [key, , email] of accounts) {
  const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const data = checked(await client.auth.signInWithPassword({ email, password }), `login ${key}`);
  assert.equal(data.user?.id, users.get(key), `Usuario incorrecto: ${key}`);
  await client.auth.signOut();
}
console.log('Verificado: los 8 perfiles inician sesión con la contraseña indicada.');
console.log('Abre http://127.0.0.1:4300/login con npm run start:staging.');
