import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Persistent, synthetic fixtures for the original-contract LOCAL copy only.
// Importing this module has no side effects. Run explicitly with --apply after
// the operator has verified the local catalog against production metadata.
export const API_URL = 'http://127.0.0.1:55321';
export const PROJECT_ID = 'coachfitflow-original-compat';
export const DEFAULT_NAMESPACE = 'coachfitflow-original-demo-v1';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const marker = 'coachfitflow-original-synthetic-v1';

export function costaRicaDay(reference = new Date(), offset = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(reference.getTime() + offset * 86_400_000));
}

export const ACCOUNT_DEFINITIONS = [
  ['admin', 'Andrea Cordero', 'admin', 'independent', 'paid'],
  ['coach_standard', 'Marco Solís', 'coach', 'independent', 'standard'],
  ['coach_pro', 'Valeria Rojas', 'coach', 'independent', 'paid'],
  ['owner', 'Daniela Mora', 'owner', 'gym', 'standard'],
  ['trainer', 'Andrés Vega', 'coach', 'gym', 'standard'],
  ['receptionist', 'Lucía Arias', 'coach', 'gym', 'standard'],
  ['independent_client', 'Sofía Méndez', 'independent_client'],
  ['gym_client', 'Camila Castro', 'gym_client'],
  ['coach_pro_expired', 'Esteban Quesada', 'coach', 'independent', 'paid'],
  ['owner_second', 'Gabriel Araya', 'owner', 'gym', 'standard']
];

export function validateTarget(status) {
  // No environment flag or status-file override can enable a hosted target.
  assert.ok(status?.API_URL === API_URL, 'El seed solo permite la copia local original en 127.0.0.1:55321.');
  assert.ok(typeof status.SERVICE_ROLE_KEY === 'string' && typeof status.ANON_KEY === 'string', 'Faltan las credenciales locales del status privado.');
  for (const [key, role] of [[status.SERVICE_ROLE_KEY, 'service_role'], [status.ANON_KEY, 'anon']]) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { /* Reject below. */ }
    assert.ok(claims?.role === role && claims?.ref !== 'bzhqprxolseyxuuwodqs', 'Las claves deben pertenecer al stack local, nunca a producción.');
  }
  return status;
}

export function fixtureId(namespace, name) {
  const hash = createHash('sha256').update(`${marker}:${namespace}:${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const CLIENTS = [
  ['independent_portal', 'Sofía Méndez', 'coach_pro', null, 'Ganar fuerza', 29, 64, 165],
  ['independent_extra', 'Diego Navarro', 'coach_pro', null, 'Mejorar resistencia', 34, 78, 176],
  ['pro_natalia', 'Natalia Sánchez', 'coach_pro', null, 'Ganar masa muscular', 26, 58, 163],
  ['pro_luis', 'Luis Chaves', 'coach_pro', null, 'Retomar el entrenamiento', 41, 86, 181],
  ['pro_maria', 'María Fernanda Rojas', 'coach_pro', null, 'Mejorar fuerza y movilidad', 33, 67, 167],
  ['pro_raul', 'Raúl Vargas', 'coach_pro', null, 'Preparar carrera de 10 km', 38, 74, 174],
  ['standard_extra', 'Paula Jiménez', 'coach_standard', null, 'Acondicionamiento general', 27, 59, 160],
  ['standard_juan', 'Juan Carlos Méndez', 'coach_standard', null, 'Ganar fuerza', 45, 81, 177],
  ['standard_carla', 'Carla Montero', 'coach_standard', null, 'Mejorar postura', 30, 62, 164],
  ['standard_oscar', 'Óscar Porras', 'coach_standard', null, 'Reducir grasa corporal', 36, 89, 178],
  ['standard_alejandra', 'Alejandra Castro', 'coach_standard', null, 'Crear hábito de entrenamiento', 24, 56, 158],
  ['expired_mariana', 'Mariana Solís', 'coach_pro_expired', null, 'Mejorar fuerza', 32, 65, 166],
  ['expired_victor', 'Víctor Jiménez', 'coach_pro_expired', null, 'Mejorar condición física', 43, 84, 179],
  ['gym_portal', 'Camila Castro', 'trainer', 'horizonte', 'Reducir grasa corporal', 31, 71, 168],
  ['gym_extra_1', 'José Vargas', 'trainer', 'horizonte', 'Ganar masa muscular', 37, 83, 179],
  ['gym_extra_2', 'Elena Porras', 'owner', 'horizonte', 'Mejorar movilidad', 42, 68, 162],
  ['gym_sebastian', 'Sebastián Araya', 'trainer', 'horizonte', 'Acondicionamiento general', 28, 76, 175],
  ['gym_irene', 'Irene Calderón', 'owner', 'horizonte', 'Ganar fuerza', 35, 61, 161],
  ['gym_kevin', 'Kevin Hernández', 'trainer', 'horizonte', 'Mejorar resistencia', 23, 73, 173],
  ['north_andrea', 'Andrea Mora', 'owner_second', 'norte', 'Ganar fuerza', 39, 66, 165],
  ['north_david', 'David Ureña', 'owner_second', 'norte', 'Ganar masa muscular', 29, 79, 180],
  ['north_fabiola', 'Fabiola Castillo', 'owner_second', 'norte', 'Reducir grasa corporal', 34, 70, 163],
  ['north_pablo', 'Pablo Quesada', 'owner_second', 'norte', 'Mejorar condición física', 46, 88, 182],
  ['north_lorena', 'Lorena Alfaro', 'owner_second', 'norte', 'Crear hábito de entrenamiento', 27, 60, 160],
  ['north_manuel', 'Manuel Brenes', 'owner_second', 'norte', 'Retomar actividad física', 51, 85, 176]
];
const EXERCISES = [
  ['squat', 'Sentadilla con barra', 'Piernas'], ['press', 'Press de banca', 'Pecho'],
  ['row', 'Remo con mancuerna', 'Espalda'], ['plank', 'Plancha frontal', 'Core'],
  ['deadlift', 'Peso muerto rumano', 'Piernas'], ['lunge', 'Zancadas caminando', 'Piernas'],
  ['calf', 'Elevación de talones', 'Piernas'], ['pulldown', 'Jalón al pecho', 'Espalda'],
  ['shoulder', 'Press de hombros con mancuernas', 'Hombros'], ['curl', 'Curl de bíceps', 'Brazos'],
  ['legpress', 'Prensa de piernas', 'Piernas'], ['incline', 'Press inclinado con mancuernas', 'Pecho'],
  ['seatedrow', 'Remo sentado en polea', 'Espalda'], ['carry', 'Caminata del granjero', 'Core']
];
const DAYS = [
  ['Tren inferior', ['Piernas', 'Core'], [['squat', 3, '8-10', '120 s'], ['deadlift', 3, '8-10', '90 s'], ['lunge', 3, '10 por pierna', '75 s'], ['calf', 3, '12-15', '60 s'], ['plank', 3, '30-40 s', '45 s']]],
  ['Tren superior', ['Pecho', 'Espalda', 'Hombros'], [['press', 3, '8-10', '120 s'], ['row', 3, '10-12', '90 s'], ['pulldown', 3, '10-12', '75 s'], ['shoulder', 3, '8-10', '75 s'], ['curl', 2, '12-15', '60 s']]],
  ['Cuerpo completo', ['Piernas', 'Pecho', 'Espalda'], [['legpress', 3, '10-12', '90 s'], ['incline', 3, '10-12', '90 s'], ['seatedrow', 3, '10-12', '75 s'], ['lunge', 2, '10 por pierna', '60 s'], ['carry', 3, '30 m', '60 s']]]
];

export function buildFixtureIds(namespace = DEFAULT_NAMESPACE) {
  assert.match(namespace, /^[a-z0-9-]{3,40}$/, 'Namespace inválido.');
  const id = name => fixtureId(namespace, name);
  const routines = Object.fromEntries(CLIENTS.map(([key]) => [key, id(`routine-${key}`)]));
  routines.independent = routines.independent_portal;
  routines.gym = routines.gym_portal;
  routines.standard = routines.standard_extra;
  const routineDays = Object.fromEntries(Object.entries(routines).map(([key, routineId]) => [key, [0, 1, 2].map(day => id(`day-${routineId}-${day}`))]));
  return { gymId: id('gym-horizonte'), secondGymId: id('gym-norte'), gyms: { horizonte: id('gym-horizonte'), norte: id('gym-norte') },
    planId: id('plan-horizonte-monthly'), plans: { horizonte_monthly: id('plan-horizonte-monthly'), horizonte_quarterly: id('plan-horizonte-quarterly'), norte_monthly: id('plan-norte-monthly'), norte_personal: id('plan-norte-personal') },
    clients: Object.fromEntries(CLIENTS.map(([key]) => [key, id(`client-${key}`)])),
    memberships: Object.fromEntries(CLIENTS.filter(row => row[3]).map(([key]) => [key, id(`membership-${key}`)])),
    routines, routineDays, exercises: Object.fromEntries(EXERCISES.map(([key]) => [key, id(`exercise-${key}`)])), competitorSheetId: id('competitor-sheet') };
}

export function createManifest(namespace = DEFAULT_NAMESPACE, reference = new Date(), sharedPassword) {
  if (sharedPassword !== undefined) assert.ok(sharedPassword.length >= 12, 'DEMO_PASSWORD requiere al menos 12 caracteres.');
  const fixtures = buildFixtureIds(namespace);
  return { formatVersion: 1, fixtureNamespace: namespace, target: { apiUrl: API_URL, projectId: PROJECT_ID },
    createdAt: reference.toISOString(), referenceDate: reference.toISOString(), state: 'prepared', fixtures,
    accounts: Object.fromEntries(ACCOUNT_DEFINITIONS.map(([key, name, role, accountType, coachPlan]) => [key, {
      name, role, accountType: accountType ?? null, coachPlan: coachPlan ?? null,
      email: `${key}@${namespace}.cuentas.test`, password: sharedPassword ?? `${randomBytes(20).toString('base64url')}Aa1!`, userId: null
    }])) };
}

export function isOwnedUser(user, manifest) {
  const tag = user?.app_metadata?.synthetic_fixture;
  return tag?.marker === marker && tag.namespace === manifest.fixtureNamespace && tag.projectId === PROJECT_ID;
}

export function buildSeedData(manifest) {
  const f = manifest.fixtures, ns = manifest.fixtureNamespace, accounts = manifest.accounts;
  const id = name => fixtureId(ns, name), user = key => accounts[key].userId;
  const reference = new Date(manifest.referenceDate);
  const day = offset => costaRicaDay(reference, offset);
  const birthDate = (age, index) => {
    const today = day(0);
    const monthDay = `${String(1 + (index * 5) % 12).padStart(2, '0')}-${String(1 + (index * 11) % 28).padStart(2, '0')}`;
    const year = Number(today.slice(0, 4)) - age - (monthDay > today.slice(5) ? 1 : 0);
    return `${year}-${monthDay}`;
  };
  const time = offset => `${day(offset)}T12:00:00.000Z`;
  const round = value => Math.round(value * 100) / 100;
  const membershipStates = ['active', 'overdue', 'pending', 'inactive', 'active', 'active', 'active', 'active', 'overdue', 'active', 'pending', 'inactive'];
  const gymClients = CLIENTS.filter(row => row[3]);
  const plans = [
    [f.plans.horizonte_monthly, f.gymId, 'Mensual libre', 28000, 'Acceso a sala de musculación y clases grupales.'],
    [f.plans.horizonte_quarterly, f.gymId, 'Trimestral', 75000, 'Tres meses de acceso con evaluación inicial.'],
    [f.plans.norte_monthly, f.secondGymId, 'Mensual fuerza', 32000, 'Acceso libre y seguimiento de rutina.'],
    [f.plans.norte_personal, f.secondGymId, 'Entrenamiento acompañado', 48000, 'Acceso y dos sesiones de acompañamiento por semana.']
  ];
  const tables = {};
  tables.coaches = ACCOUNT_DEFINITIONS.filter(row => row[3]).map(([key, name, role, accountType, plan]) => ({
    id: user(key), name, email: accounts[key].email, role, account_type: accountType, coach_plan: plan,
    next_plan_payment_date: plan === 'paid' ? day(key === 'coach_pro_expired' ? -14 : 25) : null,
    brand_color: '#000000', created_at: time(-240), updated_at: time(-1)
  }));
  tables.gyms = [
    { id: f.gymId, name: 'Horizonte Fitness', email: 'recepcion@horizonte.pruebas.test', phone: '+506 2222 1040', address: 'San Pedro, Montes de Oca', owner_id: user('owner') },
    { id: f.secondGymId, name: 'Norte Fuerza', email: 'recepcion@nortefuerza.pruebas.test', phone: '+506 2260 2180', address: 'San Francisco, Heredia', owner_id: user('owner_second') }
  ].map((row, index) => ({ ...row, brand_color: '#CCFF00', access_code: `HF${id(`code-${index}`).replaceAll('-', '').slice(0, 6).toUpperCase()}`, created_at: time(-360 + index * 120), updated_at: time(-1) }));
  tables.gym_staff = [['owner', f.gymId, 'owner', true, true, true, true], ['trainer', f.gymId, 'trainer', true, true, false, false],
    ['receptionist', f.gymId, 'receptionist', false, false, true, false], ['owner_second', f.secondGymId, 'owner', true, true, true, true]]
    .map(([key, gymId, role, edit, routines, payments, staff]) => ({ id: id(`staff-${key}`), gym_id: gymId, coach_id: user(key), role,
      can_edit_clients: edit, can_create_routines: routines, can_view_payments: payments, can_manage_staff: staff, joined_at: time(-180) }));
  tables.membership_plans = plans.map(([planId, gymId, name, price, description]) => ({ id: planId, gym_id: gymId, name, price, currency: 'CRC', description, active: true }));
  tables.clients = CLIENTS.map(([key, name, coach, gym, goal, age, weight, height], index) => ({
    id: f.clients[key], name, email: key === 'independent_portal' ? accounts.independent_client.email : key === 'gym_portal' ? accounts.gym_client.email
      : `${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.')}@clientes.pruebas.test`,
    user_id: key === 'independent_portal' ? user('independent_client') : key === 'gym_portal' ? user('gym_client') : null,
    primary_coach_id: gym ? null : user(coach), phone: `+506 8${String(120 + index).padStart(3, '0')} ${String(1000 + index * 17)}`,
    age, weight, height, birth_date: birthDate(age, index), goal,
    address: ['San Pedro, Montes de Oca', 'Guadalupe, Goicoechea', 'San Francisco, Heredia', 'Curridabat, San José'][index % 4],
    notes: ['Prefiere entrenar por la mañana.', 'Revisar técnica antes de aumentar la carga.', 'Disponibilidad de lunes a viernes.', 'Progresar de forma gradual.'][index % 4],
    portal_status: key === 'independent_portal' ? 'active' : 'pending', portal_invited_at: key === 'independent_portal' ? time(-7) : null,
    created_at: time(-120 + index), updated_at: time(-1)
  }));
  tables.client_gym_memberships = gymClients.map(([key, , coach, gym], index) => {
    const status = membershipStates[index];
    return { id: f.memberships[key], client_id: f.clients[key], gym_id: f.gyms[gym], assigned_coach_id: user(coach),
      membership_plan_id: gym === 'horizonte' ? f.plans.horizonte_monthly : f.plans.norte_monthly,
      subscription_status: status, next_payment_due_date: status === 'inactive' ? null : time(status === 'overdue' ? -5 : status === 'pending' ? 5 : 20),
      portal_status: key === 'gym_portal' ? 'active' : 'pending', portal_invited_at: key === 'gym_portal' ? time(-7) : null,
      joined_at: time(-95 + index), created_at: time(-95 + index), updated_at: time(-1) };
  });
  tables.independent_client_portal_access = [{ id: id('independent-access'), user_id: user('independent_client'), client_id: f.clients.independent_portal, coach_id: user('coach_pro') }];
  tables.client_portal_access = [{ id: id('gym-access'), user_id: user('gym_client'), client_gym_membership_id: f.memberships.gym_portal }];
  tables.exercises = EXERCISES.map(([key, name, muscle]) => ({ id: f.exercises[key], name, muscle_group: muscle, source: 'global',
    description: key === 'plank' ? 'Mantén abdomen activo y respiración continua.' : 'Realiza el movimiento con control y sin perder la postura.' }));
  tables.routines = CLIENTS.map(([key, , coach, gym, goal], index) => {
    let weeks = key === 'independent_portal' ? 8 : key === 'gym_portal' ? 12 : key === 'standard_extra' ? 4 : [4, 8, 12][index % 3];
    const start = key === 'independent_portal' ? -35 : key === 'gym_portal' ? -42 : -7 - (index % 3) * 7;
    const inactive = gym && tables.client_gym_memberships.find(row => row.client_id === f.clients[key]).subscription_status === 'inactive';
    if (inactive) weeks = 4;
    const startOffset = inactive ? -weeks * 7 - 14 : start;
    return { id: f.routines[key], client_id: f.clients[key], coach_id: user(coach), client_gym_membership_id: gym ? f.memberships[key] : null,
      name: ['Fuerza de base', 'Condición y movilidad', 'Progresión de fuerza'][index % 3], objective: goal, training_days_count: 3,
      duration_weeks: weeks, start_date: day(startOffset), end_date: day(startOffset + weeks * 7 - 1),
      notes: 'Mantén 2 repeticiones en reserva y registra las cargas de cada sesión.', warmup_enabled: true,
      warmup_custom_text: '6 minutos de bicicleta y movilidad de cadera, hombros y tobillos.', created_at: time(startOffset), updated_at: time(-1) };
  });
  tables.routine_days = CLIENTS.flatMap(([key]) => DAYS.map(([name, muscleGroups], index) => ({ id: f.routineDays[key][index], routine_id: f.routines[key], day_number: index + 1, day_name: name, muscle_groups: muscleGroups })));
  tables.routine_day_exercises = CLIENTS.flatMap(([key]) => DAYS.flatMap(([, , exercises], dayIndex) => exercises.map(([exercise, sets, reps, rest], order) => ({
    id: id(`assignment-${key}-${dayIndex}-${order}`), routine_day_id: f.routineDays[key][dayIndex], exercise_id: f.exercises[exercise], sets, reps, rest,
    order_index: order, block_type: 'single', notes: exercise === 'squat' ? 'Usa una carga que permita mantener 2 RIR.' : 'Controla la fase de descenso.'
  }))));
  tables.routine_week_configs = tables.routine_day_exercises.filter((_, index) => index % 5 === 0).map(row => ({
    id: id(`progression-${row.id}`), routine_day_exercise_id: row.id, start_week: 1, end_week: 4, sets: row.sets, reps: row.reps, rest: row.rest,
    notes: 'Aumenta ligeramente la carga al completar todas las repeticiones con 2 RIR.'
  }));
  tables.measurements = CLIENTS.flatMap(([key, , , gym, goal, , weight, height], index) => Array.from({ length: 6 }, (_, week) => {
    const losingFat = goal.includes('grasa');
    const measuredWeight = round(weight + (5 - week) * (losingFat ? 0.45 : -0.15));
    return { id: id(`measurement-${key}-${week}`), client_id: f.clients[key], client_gym_membership_id: gym ? f.memberships[key] : null,
      date: day(-35 + week * 7), weight: measuredWeight, height, bmi: round(measuredWeight / ((height / 100) ** 2)),
      body_fat_percentage: round(21 + index % 10 + (5 - week) * 0.2), muscle_mass: round(25 + index % 8 - (5 - week) * 0.08),
      waist: round(72 + index % 14 + (5 - week) * 0.3), hips: 93 + index % 11, notes: week === 5 ? 'Control de seguimiento. Buena adherencia al plan.' : 'Medición en condiciones similares al control anterior.', created_at: time(-35 + week * 7) };
  }));
  tables.payments = tables.client_gym_memberships.flatMap((membership, index) => {
    const price = index < 6 ? 28000 : 32000, status = membership.subscription_status;
    const rows = status === 'pending' ? [[5, 'pending']] : status === 'inactive' ? [[-60, 'paid']]
      : status === 'overdue' ? [[-65, 'paid'], [-35, 'paid'], [-5, 'overdue']] : [[-70, 'paid'], [-40, 'paid'], [-10, 'paid'], [20, 'pending']];
    return rows.map(([offset, paymentStatus]) => ({ id: id(`payment-${membership.id}-${offset}`), client_gym_membership_id: membership.id,
      amount: price, currency: 'CRC', method: paymentStatus === 'paid' ? index % 2 ? 'tarjeta' : 'sinpe' : null,
      due_date: time(offset), paid_date: paymentStatus === 'paid' ? time(offset - 1) : null, status: paymentStatus,
      notes: paymentStatus === 'paid' ? 'Mensualidad recibida.' : paymentStatus === 'overdue' ? 'Pendiente de confirmar pago.' : 'Próxima mensualidad.',
      created_by: user(index < 6 ? 'owner' : 'owner_second'), created_at: time(Math.min(offset - 7, 0)) }));
  });
  tables.training_sessions = [];
  tables.training_session_sets = [];
  for (const [routineKey, clientKey, coachKey, scope] of [['independent', 'independent_portal', 'coach_pro', 'independent'], ['gym', 'gym_portal', 'trainer', 'gym']]) {
    for (const [week, offset] of [-35, -32, -28, -25, -21, -18, -14, -11, -7, -4, -2, -1].entries()) {
      const sessionId = id(`session-${routineKey}-${week}`), inProgress = offset === -1, started = time(offset);
      tables.training_sessions.push({ id: sessionId, routine_id: f.routines[routineKey], routine_day_id: f.routineDays[routineKey][0],
        client_id: f.clients[clientKey], coach_id: user(coachKey), client_gym_membership_id: scope === 'gym' ? f.memberships.gym_portal : null,
        portal_scope: scope, session_date: day(offset), status: inProgress ? 'in_progress' : 'completed', started_at: started,
        completed_at: inProgress ? null : new Date(new Date(started).getTime() + 48 * 60_000).toISOString(), updated_at: started });
      for (const [order, exerciseKey] of ['squat', 'deadlift', 'lunge'].entries()) for (const setNumber of [1, 2, 3]) {
        if (inProgress && (order > 0 || setNumber > 1)) continue;
        tables.training_session_sets.push({ id: id(`set-${sessionId}-${order}-${setNumber}`), training_session_id: sessionId,
          routine_day_id: f.routineDays[routineKey][0], exercise_id: f.exercises[exerciseKey], exercise_name: EXERCISES.find(row => row[0] === exerciseKey)[1],
          exercise_order: order, set_number: setNumber, planned_reps: order === 2 ? '10 por pierna' : '8-10', actual_reps: setNumber === 3 ? 8 : 10,
          rir: setNumber === 3 ? 1 : 2, load: (scope === 'gym' ? 20 : 30) + Math.floor(week / 2) * 2.5 + order * 2.5,
          load_unit: 'kg', created_at: started, updated_at: started });
      }
    }
  }
  tables.competitor_sheets = [{ id: f.competitorSheetId, coach_id: user('coach_pro'), client_id: f.clients.independent_extra,
    client_gym_membership_id: null, program_title: 'Preparación de fuerza general', mesocycle_title: 'Acumulación · 4 semanas', macrocycle_title: 'Base de fuerza · 12 semanas',
    frequency_text: '3 sesiones por semana', split_text: 'Tren inferior / superior / cuerpo completo', training_days_text: 'Lunes, miércoles y viernes',
    day_labels: ['Lunes', 'Miércoles', 'Viernes'], week_plans: Array.from({ length: 4 }, (_, i) => ({ weekLabel: `Semana ${i + 1}`, workouts: ['A', 'B', 'C'] })),
    workouts: ['A', 'B', 'C'].map((key, index) => ({ key, title: DAYS[index][0], subtitle: 'Fase de acumulación', code: `FZA-${key}`, blocks: [{
      name: EXERCISES.find(row => row[0] === DAYS[index][2][0][0])[1], note: 'Completa las series con buena técnica y 2 RIR.',
      microcycles: ['10', '8-10', '8'].map(reps => ({ series: '3x', reps })), rest: ['90 s', '120 s', '120 s']
    }] })), created_at: time(-21), updated_at: time(-1) }];
  tables.coach_announcements = [
    ['all', 'Horario de asesorías', 'Las asesorías de seguimiento se realizan de lunes a viernes. Coordina el espacio con tu entrenador.', true, -2, 30],
    ['standard', 'Organiza tu primera semana', 'Asigna una rutina de base y registra el primer control de tus clientes para iniciar el seguimiento.', true, -3, 25],
    ['paid', 'Revisión del bloque de fuerza', 'Al finalizar el bloque, revisa las cargas registradas y ajusta la progresión de las próximas semanas.', true, 5, 20],
    ['all', 'Evaluación mensual', 'Recuerda registrar el control corporal mensual antes de actualizar el siguiente bloque.', true, -30, -10],
    ['all', 'Encuentro de entrenadores', 'Compartiremos experiencias de programación y seguimiento en el próximo encuentro.', false, null, null]
  ].map(([audience, title, message, active, start, end], index) => ({ id: id(`announcement-${index}`), audience, title, message, active, sort_order: index,
    starts_at: start === null ? null : `${day(start)}T06:00:00.000Z`,
    ends_at: end === null ? null : new Date(new Date(`${day(end)}T06:00:00.000Z`).getTime() + 86_399_999).toISOString(), created_by: user('admin') }));
  return tables;
}

async function privatePath(path, required = true) {
  assert.ok(isAbsolute(path), 'Usa una ruta privada absoluta fuera del repositorio.');
  const parent = await realpath(dirname(path));
  if (!required) assert.ok(((await lstat(parent)).mode & 0o077) === 0, 'Guarda las credenciales en un directorio privado con permisos 0700.');
  const resolved = resolve(parent, relative(dirname(path), path));
  const rel = relative(await realpath(repoRoot), resolved);
  assert.ok(rel.startsWith('..') && !isAbsolute(rel), 'Las credenciales deben quedar fuera del repositorio.');
  try {
    const info = await lstat(resolved);
    assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o077) === 0, 'El archivo privado debe ser regular y tener permisos 0600.');
  } catch (error) { if (required || error.code !== 'ENOENT') throw error; }
  return resolved;
}

async function saveManifest(path, manifest) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}

function checked(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}

export async function seed({ statusPath, credentialsPath, namespace = DEFAULT_NAMESPACE, apply = false, password = process.env.DEMO_PASSWORD } = {}) {
  assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Este seed no admite staging alojado.');
  const status = validateTarget(JSON.parse(await readFile(await privatePath(statusPath), 'utf8')));
  const output = await privatePath(credentialsPath, false);
  let previous;
  try { previous = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = previous ?? createManifest(namespace, new Date(), password);
  assert.ok(manifest.formatVersion === 1 && manifest.fixtureNamespace === namespace && manifest.target?.apiUrl === API_URL && manifest.target?.projectId === PROJECT_ID,
    'El manifest pertenece a otro destino o namespace.');
  assert.deepEqual(manifest.fixtures, buildFixtureIds(namespace), 'Los identificadores del manifest no coinciden con su namespace.');
  for (const [key] of ACCOUNT_DEFINITIONS) assert.ok(manifest.accounts[key]?.password?.length >= 12, 'El manifest está incompleto. Conserva el archivo original.');
  if (!apply) {
    console.log(`Plan local: ${ACCOUNT_DEFINITIONS.length} cuentas, ${CLIENTS.length} clientes y 2 gimnasios. Sin escrituras. Ejecuta explícitamente con --apply para crear las cuentas.`);
    return { manifest, applied: false };
  }
  const admin = createClient(API_URL, status.SERVICE_ROLE_KEY, authOptions);
  const existingUsers = [];
  for (let page = 1; ; page++) {
    const data = checked(await admin.auth.admin.listUsers({ page, perPage: 1000 }), 'Comprobar cuentas locales');
    existingUsers.push(...data.users);
    if (data.users.length < 1000) break;
  }
  // Validate every account before the first mutation. Never take over an email,
  // reset a password, or rewrite Auth metadata belonging to an unknown user.
  for (const [key] of ACCOUNT_DEFINITIONS) {
    const account = manifest.accounts[key];
    const existing = existingUsers.find(user => user.email?.toLowerCase() === account.email.toLowerCase());
    if (existing) {
      assert.ok(previous && isOwnedUser(existing, manifest), 'Existe una cuenta ajena con un correo reservado por este seed. No se cambió su contraseña.');
      assert.ok(!account.userId || account.userId === existing.id, 'La identidad persistida no coincide. No se modificaron cuentas.');
      account.userId = existing.id;
    } else assert.ok(!account.userId, 'Falta una identidad del manifest existente. Usa un namespace nuevo para evitar reparar cuentas silenciosamente.');
  }
  const preview = buildSeedData({ ...manifest, accounts: Object.fromEntries(Object.entries(manifest.accounts).map(([key, value]) => [key, { ...value, userId: value.userId ?? fixtureId(namespace, `preview-user-${key}`) }])) });
  for (const [table, rows] of Object.entries(preview)) {
    if (table === 'coaches') continue;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const matches = checked(await admin.from(table).select('id').in('id', rows.slice(offset, offset + 100).map(row => row.id)), `Comprobar ${table}`);
      assert.ok(previous || !matches.length, 'Encontramos registros existentes sin su manifest original. No se escribieron datos.');
    }
  }
  await saveManifest(output, manifest);
  for (const [key] of ACCOUNT_DEFINITIONS) {
    const account = manifest.accounts[key];
    if (account.userId) continue;
    const result = checked(await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true,
      user_metadata: { name: account.name, full_name: account.name, role: account.role, account_type: account.accountType },
      app_metadata: { synthetic_fixture: { marker, namespace, projectId: PROJECT_ID } } }), `Crear cuenta ${key}`);
    account.userId = result.user.id;
    await saveManifest(output, manifest);
  }
  const tables = buildSeedData(manifest);
  for (const [table, rows] of Object.entries(tables)) {
    for (let offset = 0; offset < rows.length; offset += 200) checked(await admin.from(table).upsert(rows.slice(offset, offset + 200), { onConflict: 'id' }), `Cargar ${table}`);
    console.log(`${table}: ${rows.length}`);
  }
  for (const [key] of ACCOUNT_DEFINITIONS) {
    const account = manifest.accounts[key], client = createClient(API_URL, status.ANON_KEY, authOptions);
    const signedIn = checked(await client.auth.signInWithPassword({ email: account.email, password: account.password }), `Verificar acceso ${key}`);
    assert.ok(signedIn.user.id === account.userId, 'La verificación devolvió otra identidad.');
    checked(await client.auth.signOut({ scope: 'local' }), `Cerrar sesión de verificación ${key}`);
  }
  manifest.state = 'ready'; manifest.updatedAt = new Date().toISOString();
  manifest.counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
  await saveManifest(output, manifest);
  console.log(`Verificados ${ACCOUNT_DEFINITIONS.length} accesos locales. Credenciales privadas: ${output}`);
  return { manifest, applied: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => arg === '--apply'), 'Único argumento permitido: --apply. El destino se lee del status privado local.');
  await seed({ statusPath: process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json',
    credentialsPath: process.env.ORIGINAL_DEMO_CREDENTIALS_FILE || `${homedir()}/.local/share/coachfitflow-testing/original-demo-credentials.json`,
    namespace: process.env.ORIGINAL_DEMO_NAMESPACE || DEFAULT_NAMESPACE, apply: args.includes('--apply') });
}
