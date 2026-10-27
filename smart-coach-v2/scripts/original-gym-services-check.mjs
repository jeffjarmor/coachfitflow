import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

// Run against the isolated 60-migration copy of the original backend, never production.
assert.equal(process.env.ZUMMITH_STAGE, undefined);
const target = JSON.parse(readFileSync(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:55321');
const root = fileURLToPath(new URL('..', import.meta.url));
const bundleDir = `${root}/node_modules/.cache/original-services-check`;
mkdirSync(bundleDir, { recursive: true });
const bundle = `${bundleDir}/services-${randomUUID()}.mjs`;
await build({
  stdin: { contents: `
    import '@angular/compiler';
    import { createEnvironmentInjector } from '@angular/core';
    import { SupabaseService } from './src/app/core/auth/supabase.service';
    import { CoachDataService } from './src/app/core/data/coach-data.service';
    import { GymSettingsService } from './src/app/features/gyms/gym-settings.service';
    import { GymOnboardingService } from './src/app/features/gyms/gym-onboarding.service';
    import { GymPaymentsService } from './src/app/features/gyms/gym-payments.service';
    import { RoutineDataService } from './src/app/features/routines/routine-data.service';
    import { CompetitorDataService } from './src/app/features/competitor/competitor-data.service';
    export { emptyRoutinePlan, createRoutineExercise } from './src/app/features/routines/routine.models';
    export { createCompetitorSheet } from './src/app/features/competitor/competitor.models';
    export function services(client) {
      const injector = createEnvironmentInjector([
        {provide: SupabaseService, useValue: {client}}, CoachDataService, GymSettingsService,
        GymOnboardingService, GymPaymentsService, RoutineDataService, CompetitorDataService
      ]);
      return { injector, coach: injector.get(CoachDataService), settings: injector.get(GymSettingsService),
        onboarding: injector.get(GymOnboardingService), payments: injector.get(GymPaymentsService),
        routines: injector.get(RoutineDataService), competitor: injector.get(CompetitorDataService) };
    }
  `, resolveDir: root, loader: 'ts' },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle,
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true } }, logLevel: 'silent'
});
const { services, emptyRoutinePlan, createRoutineExercise, createCompetitorSheet } = await import(pathToFileURL(bundle).href);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(6).toString('hex');
const prefix = `original-services-${suffix}`;
const password = `${randomBytes(20).toString('base64url')}Aa1!`;
const users = [], gyms = [], clientIds = [], injectors = [], exerciseIds = [], logoUrls = [];
let checks = 0;
function checked(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code})`); return result.data; }
function check(condition, label) { assert.ok(condition, label); checks++; }
async function account(label, role = 'coach') {
  const email = `${prefix}-${label}@example.invalid`;
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }), `Create ${label}`).user;
  users.push(user.id);
  checked(await db.from('coaches').insert({ id: user.id, email, name: label, role, account_type: 'gym' }), 'Create coach');
  const api = createClient(target.API_URL, target.ANON_KEY, options);
  checked(await api.auth.signInWithPassword({ email, password }), `Sign in ${label}`);
  const data = services(api); injectors.push(data.injector);
  return { id: user.id, email, api, ...data };
}
try {
  const owner = await account('owner');
  const trainer = await account('trainer');
  const reception = await account('reception');
  const outsider = await account('outsider');
  const admin = await account('admin', 'admin');
  const gymId = randomUUID(); gyms.push(gymId);
  const gymInput = { name: `${prefix} Gym`, email: '', phone: '', address: '', brandColor: '#121212' };
  const created = await admin.onboarding.create(gymId, gymInput);
  const retried = await admin.onboarding.create(gymId, { ...gymInput, name: 'Retry must not create another gym' });
  check(created.id === gymId && retried.id === gymId && retried.accessCode === created.accessCode, 'Admin gym creation is retry-safe on the original table');
  await assert.rejects(() => outsider.onboarding.create(randomUUID(), gymInput), /Solo administración/); checks++;
  checked(await admin.api.rpc('admin_assign_gym_owner', { p_gym_id: gymId, p_coach_id: owner.id }), 'Assign original gym owner');
  checked(await db.from('gym_staff').insert([
    { gym_id: gymId, coach_id: trainer.id, role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false },
    { gym_id: gymId, coach_id: reception.id, role: 'receptionist', can_edit_clients: false, can_create_routines: false, can_view_payments: true }
  ]), 'Configure original staff permissions');
  await owner.settings.update(gymId, { ...gymInput, logoUrl: null, name: `${prefix} Updated` });
  const newCode = await owner.settings.rotateAccessCode(gymId);
  check(newCode.length === 6 && newCode !== created.accessCode, 'Owner settings and access-code rotation use original columns');
  await assert.rejects(() => outsider.settings.update(gymId, { ...gymInput, logoUrl: null })); checks++;
  await assert.rejects(() => outsider.settings.uploadLogo(gymId, new File(['denied'], 'logo.png', { type: 'image/png' })), /Solo el propietario/); checks++;
  const logo = await owner.settings.uploadLogo(gymId, new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }));
  logoUrls.push({ gymId, logo });
  check(logo.includes(`/assets/gyms/${gymId}/`), 'Gym logo uses the original assets bucket');
  await owner.settings.removeLogo(gymId, logo);
  check(checked(await db.storage.from('assets').list(`gyms/${gymId}`), 'List cleaned logo').filter((file) => file.id).length === 0, 'Gym logo removal stays in its owned prefix');
  const input = { name: `${prefix} Client`, email: `${prefix}-client@example.invalid`, phone: '', birthDate: '1994-02-18', weight: 75, height: 175, goal: 'Strength', notes: '', address: '' };
  await assert.rejects(() => reception.coach.createClient(reception.id, { ...input, email: `${prefix}-denied@example.invalid` }, gymId), /No tienes permiso/); checks++;
  const clientId = await owner.coach.createClient(owner.id, input, gymId); clientIds.push(clientId);
  let membership = checked(await db.from('client_gym_memberships').select('*').eq('gym_id', gymId).eq('client_id', clientId).single(), 'Read created membership');
  check(membership.assigned_coach_id === owner.id && membership.portal_status === 'pending' && membership.next_payment_due_date, 'Client creation preserves original pending membership and monthly due date');
  const planId = await owner.payments.savePlan(gymId, { name: 'Monthly', price: 100, currency: 'CRC', active: true, description: '' });
  await assert.rejects(() => trainer.payments.configureMembership(gymId, membership.id, { planId, dueDate: null, status: 'active' }, true), /Solo el propietario/); checks++;
  await assert.rejects(() => trainer.payments.deletePlan(gymId, planId), /No tienes permiso/); checks++;
  await trainer.coach.updateClient(clientId, trainer.id, { ...input, notes: 'Shared profile edited' }, gymId);
  await assert.rejects(() => trainer.coach.updateClient(clientId, trainer.id, { ...input, membershipPlanId: planId }, gymId), /Solo el propietario/); checks++;
  await owner.coach.updateClient(clientId, owner.id, { ...input, membershipPlanId: planId }, gymId);
  membership = checked(await db.from('client_gym_memberships').select('*').eq('id', membership.id).single(), 'Read assigned plan');
  check(membership.membership_plan_id === planId, 'Owner assigns plan through original membership update');
  await assert.rejects(() => reception.coach.updateClient(clientId, reception.id, input, gymId), /No tienes permiso/); checks++;
  await assert.rejects(() => reception.payments.registerPayment(gymId, membership.id, { amount: 100, currency: 'CRC', method: 'cash', paidDate: '2026-10-10', notes: '' }), /Tu acceso permite consultar pagos/); checks++;
  const paymentId = await owner.payments.registerPayment(gymId, membership.id, { amount: 100, currency: 'CRC', method: 'cash', paidDate: '2026-10-10', notes: 'Compatibility payment' });
  const paid = checked(await db.from('payments').select('*').eq('id', paymentId).single(), 'Read registered payment');
  const advanced = checked(await db.from('client_gym_memberships').select('*').eq('id', membership.id).single(), 'Read advanced due');
  check(paid.status === 'paid' && paid.created_by === owner.id && advanced.subscription_status === 'active' && advanced.next_payment_due_date > membership.next_payment_due_date, 'Payment stores receipt and advances original monthly membership');
  const exercise = checked(await db.from('exercises').insert({ name: `${prefix} Squat`, muscle_group: 'Piernas', source: 'global' }).select('id,name,muscle_group,source').single(), 'Create exercise'); exerciseIds.push(exercise.id);
  const exerciseItem = { id: exercise.id, name: exercise.name, muscleGroup: exercise.muscle_group, source: 'global' };
  const plan = emptyRoutinePlan(clientId, input.name);
  Object.assign(plan, { name: 'Original gym plan', objective: 'Strength', trainingDaysCount: 1, days: [plan.days[0]], warmup: { enabled: true, customText: 'Warm up', exercises: [exerciseItem] } });
  const dayExercise = createRoutineExercise(exerciseItem, 1);
  dayExercise.weekConfigs = [{ startWeek: 1, endWeek: 4, sets: 4, reps: '8', rest: '90 s', notes: 'Progress' }];
  plan.days[0].exercises = [dayExercise];
  const routineId = await trainer.routines.saveRoutine(plan, trainer.id, gymId);
  const routine = await trainer.routines.getRoutine(routineId, trainer.id, gymId);
  check(routine.clientGymMembershipId === membership.id && routine.coachId === trainer.id && routine.warmup.exercises.length === 1 && routine.days[0].exercises[0].weekConfigs.length === 1, 'Gym routine persists header, days, exercises, warmup and week progressions');
  const historySession = checked(await db.from('training_sessions').insert({ routine_id: routineId, routine_day_id: routine.days[0].id, client_id: clientId, coach_id: trainer.id, client_gym_membership_id: membership.id, portal_scope: 'gym', status: 'completed' }).select('*').single(), 'Create existing client training');
  const historySet = checked(await db.from('training_session_sets').insert({ training_session_id: historySession.id, routine_day_id: routine.days[0].id, exercise_id: exercise.id, exercise_name: exercise.name, exercise_order: 0, set_number: 1, actual_reps: 9, rir: 2, load: 75, load_unit: 'kg' }).select('*').single(), 'Create existing RIR set');
  routine.name = 'Edited original gym plan'; routine.days[0].exercises[0].reps = '6';
  await trainer.routines.saveRoutine(routine, trainer.id, gymId);
  const editedRoutine = await trainer.routines.getRoutine(routineId, trainer.id, gymId);
  check(editedRoutine.days[0].exercises[0].reps === '6', 'Author can edit an existing gym routine');
  check(editedRoutine.days[0].id === routine.days[0].id && editedRoutine.days[0].exercises[0].id === routine.days[0].exercises[0].id, 'Routine edit preserves existing day and exercise IDs');
  assert.deepEqual(checked(await db.from('training_sessions').select('*').eq('id', historySession.id).single(), 'Read preserved training'), historySession);
  assert.deepEqual(checked(await db.from('training_session_sets').select('*').eq('id', historySet.id).single(), 'Read preserved RIR set'), historySet);
  checks++;
  const extraExercises = checked(await db.from('exercises').insert([
    { name: `${prefix} Press`, muscle_group: 'Pecho', source: 'global' },
    { name: `${prefix} Row`, muscle_group: 'Espalda', source: 'global' }
  ]).select('id,name,muscle_group,source'), 'Create reorder exercises'); exerciseIds.push(...extraExercises.map((row) => row.id));
  const items = extraExercises.map((row) => ({ id: row.id, name: row.name, muscleGroup: row.muscle_group, source: 'global' }));
  editedRoutine.days[0].exercises.push(createRoutineExercise(items[0], 2));
  await trainer.routines.saveRoutine(editedRoutine, trainer.id, gymId);
  const beforeReorder = await trainer.routines.getRoutine(routineId, trainer.id, gymId);
  const oldIds = beforeReorder.days[0].exercises.map((item) => item.id);
  beforeReorder.days[0].exercises = [createRoutineExercise(items[1], 1), beforeReorder.days[0].exercises[1], beforeReorder.days[0].exercises[0]];
  await trainer.routines.saveRoutine(beforeReorder, trainer.id, gymId);
  const afterReorder = await trainer.routines.getRoutine(routineId, trainer.id, gymId);
  check(afterReorder.days[0].exercises[1].id === oldIds[1] && afterReorder.days[0].exercises[2].id === oldIds[0] && !oldIds.includes(afterReorder.days[0].exercises[0].id), 'Adding a new first exercise and reordering existing exercises preserves their explicit IDs');
  assert.deepEqual(checked(await db.from('training_session_sets').select('*').eq('id', historySet.id).single(), 'Read RIR after exercise reorder'), historySet); checks++;
  const beforeRejectedRemoval = checked(await db.from('routines').select('*').eq('id', routineId).single(), 'Snapshot routine before rejected day removal');
  await assert.rejects(() => trainer.routines.saveRoutine({ ...routine, name: 'Must remain unchanged', days: [] }, trainer.id, gymId), /entrenamientos registrados/); checks++;
  assert.deepEqual(checked(await db.from('routines').select('*').eq('id', routineId).single(), 'Read rejected day-removal header'), beforeRejectedRemoval);
  check(checked(await db.from('routine_days').select('id').eq('id', routine.days[0].id), 'Read protected day').length === 1 && checked(await db.from('training_session_sets').select('id').eq('id', historySet.id), 'Read protected RIR').length === 1, 'Removing a historical day fails before header or detail writes');
  await assert.rejects(() => owner.routines.saveRoutine({ ...routine, name: 'Cannot take author ownership' }, owner.id, gymId), /No tienes permiso/); checks++;
  check((await trainer.routines.getRoutine(routineId, trainer.id, gymId)).name === 'Edited original gym plan', 'Denied gym edit leaves header and details intact');
  const sheet = createCompetitorSheet(clientId, input.name);
  Object.assign(sheet, { programTitle: 'Compatibility', mesocycleTitle: 'Meso', macrocycleTitle: 'Macro', frequencyText: '3', splitText: 'Full body', trainingDaysText: 'M-W-F' });
  const sheetId = await trainer.competitor.saveSheet(sheet, trainer.id, gymId);
  sheet.id = sheetId; sheet.programTitle = 'Edited compatibility';
  await trainer.competitor.saveSheet(sheet, trainer.id, gymId);
  const savedSheet = await trainer.competitor.getSheet(sheetId, trainer.id, gymId);
  check(savedSheet.programTitle === 'Edited compatibility' && savedSheet.clientGymMembershipId === membership.id && savedSheet.coachId === trainer.id, 'Gym competitor sheet creates and updates with original author and membership');
  await assert.rejects(() => owner.competitor.saveSheet(sheet, owner.id, gymId), /No tienes permiso/); checks++;
  await assert.rejects(() => owner.coach.deleteClient(clientId, owner.id, gymId), /rutinas de otro entrenador/); checks++;
  check(checked(await db.from('client_gym_memberships').select('id').eq('id', membership.id), 'Check denied removal').length === 1, 'Removal with other-author training data fails before membership writes');
  await trainer.routines.deleteRoutine(routineId, trainer.id, gymId);
  await trainer.competitor.deleteSheet(sheetId, trainer.id, gymId);
  const otherGym = checked(await db.from('gyms').insert({ name: `${prefix} Other gym`, access_code: suffix, owner_id: outsider.id }).select('id').single(), 'Create hidden second gym'); gyms.push(otherGym.id);
  const otherMembership = checked(await db.from('client_gym_memberships').insert({ gym_id: otherGym.id, client_id: clientId, assigned_coach_id: outsider.id }).select('id').single(), 'Create shared second membership');
  const otherMeasurement = checked(await db.from('measurements').insert({ client_id: clientId, client_gym_membership_id: otherMembership.id, date: '2026-10-10', weight: 80, height: 175, bmi: 26.12 }).select('id').single(), 'Create isolated measurement');
  checked(await db.from('measurements').insert({ client_id: clientId, client_gym_membership_id: membership.id, date: '2026-10-10', weight: 75, height: 175, bmi: 24.49 }), 'Create scoped measurement');
  const ownerRoutine = { ...plan, id: undefined, name: 'Owner scoped routine' };
  const ownerRoutineId = await owner.routines.saveRoutine(ownerRoutine, owner.id, gymId);
  const ownerRoutineSaved = await owner.routines.getRoutine(ownerRoutineId, owner.id, gymId);
  checked(await db.from('training_sessions').insert({ routine_id: ownerRoutineId, routine_day_id: ownerRoutineSaved.days[0].id, client_id: clientId, coach_id: owner.id, client_gym_membership_id: membership.id, portal_scope: 'gym' }), 'Create scoped training session');
  await owner.competitor.saveSheet({ ...sheet, id: undefined }, owner.id, gymId);
  await owner.coach.deleteClient(clientId, owner.id, gymId);
  check(checked(await db.from('client_gym_memberships').select('id').eq('id', membership.id), 'Check removed membership').length === 0 && checked(await db.from('clients').select('id').eq('id', clientId), 'Check preserved client').length === 1, 'Gym removal deletes only membership and preserves potentially shared identity');
  check(checked(await db.from('client_gym_memberships').select('id').eq('id', otherMembership.id), 'Check other membership').length === 1 && checked(await db.from('measurements').select('id').eq('id', otherMeasurement.id), 'Check other measurement').length === 1, 'Gym removal preserves another gym membership and its measurements');
  check(checked(await db.from('routines').select('id').eq('id', ownerRoutineId), 'Check removed owned routine').length === 0 && checked(await db.from('training_sessions').select('id').eq('client_gym_membership_id', membership.id), 'Check removed training').length === 0, 'Removal clears owned dependent routines and training without leaving unscoped records');
  await assert.rejects(() => owner.coach.deleteCurrentCoachAccount(), /eliminación automática de cuentas no está disponible/); checks++;
  check(checked(await db.from('coaches').select('id').eq('id', owner.id), 'Check preserved account').length === 1, 'Unavailable self-deletion performs no destructive fallback');
} finally {
  if (clientIds.length) checked(await db.from('clients').delete().in('id', clientIds), 'Clean client fixtures');
  for (const { gymId } of logoUrls) {
    const files = checked(await db.storage.from('assets').list(`gyms/${gymId}`), 'List fixture logos');
    if (files.length) checked(await db.storage.from('assets').remove(files.filter((file) => file.id).map((file) => `gyms/${gymId}/${file.name}`)), 'Clean logos');
  }
  if (gyms.length) checked(await db.from('gyms').delete().in('id', gyms), 'Clean gym fixtures');
  if (exerciseIds.length) checked(await db.from('exercises').delete().in('id', exerciseIds), 'Clean exercises');
  if (users.length) checked(await db.from('coaches').delete().in('id', users), 'Clean coaches');
  for (const userId of users) checked(await db.auth.admin.deleteUser(userId), 'Clean Auth');
  for (const injector of injectors) injector.destroy();
  rmSync(bundle, { force: true });
}
console.log(`Original backend gym services: ${checks} checks passed on isolated port 55321; fixtures removed.`);
