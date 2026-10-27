import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

// Synthetic fixtures only. This suite uses the original 60-migration contract;
// it never applies migrations or accepts production/a hosted backend.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Only the isolated local original-schema stack is supported.');
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:55321', 'Independent regression cannot run against another backend.');
assert.ok(target.SERVICE_ROLE_KEY && target.ANON_KEY, 'Local fixture credentials are required.');

const root = fileURLToPath(new URL('..', import.meta.url));
const suffix = randomBytes(8).toString('hex');
const prefix = `original-independent-${suffix}`;
const password = `${randomBytes(24).toString('base64url')}Aa1!`;
const bundle = `${root}/node_modules/.cache/${prefix}.mjs`;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const users = [], clients = [], gyms = [], exercises = [], injectors = [], checks = [], cleanupErrors = [];
let make, failure;
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'unknown'})`);
  return result.data;
};
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
const day = offset => {
  const value = new Date(); value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
async function reject(operation, label) {
  await assert.rejects(operation);
  checks.push(label);
}
async function account(label, plan = 'standard', paymentDate = null, role = 'coach') {
  const email = `${prefix}-${label}@example.invalid`;
  const identity = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }), 'Create local Auth fixture').user;
  users.push(identity.id);
  checked(await db.from('coaches').upsert({ id: identity.id, email, name: `${prefix} ${label}`, role,
    account_type: 'independent', coach_plan: plan, next_plan_payment_date: paymentDate }), 'Create local coach fixture');
  const api = createClient(target.API_URL, target.ANON_KEY, options);
  checked(await api.auth.signInWithPassword({ email, password }), 'Sign in local fixture');
  const services = make(api); injectors.push(services.injector);
  return { id: identity.id, email, api, ...services };
}

try {
  await mkdir(`${root}/node_modules/.cache`, { recursive: true });
  await build({ stdin: { contents: `import '@angular/compiler';
    import {createEnvironmentInjector} from '@angular/core';
    import {SupabaseService} from './src/app/core/auth/supabase.service';
    import {CoachDataService} from './src/app/core/data/coach-data.service';
    import {RoutineDataService} from './src/app/features/routines/routine-data.service';
    import {CompetitorDataService} from './src/app/features/competitor/competitor-data.service';
    import {GymContextService} from './src/app/features/gyms/gym-context.service';
    import {GymStaffService} from './src/app/features/gyms/gym-staff.service';
    export {emptyRoutinePlan,createRoutineExercise} from './src/app/features/routines/routine.models';
    export {createCompetitorSheet} from './src/app/features/competitor/competitor.models';
    export {hasActiveIndependentPro} from './src/app/core/data/plan-access';
    export function make(client) {
      const injector=createEnvironmentInjector([{provide:SupabaseService,useValue:{client}},
        CoachDataService,RoutineDataService,CompetitorDataService,GymContextService,GymStaffService]);
      return {injector,coach:injector.get(CoachDataService),routines:injector.get(RoutineDataService),
        competitor:injector.get(CompetitorDataService),gyms:injector.get(GymContextService),staff:injector.get(GymStaffService)};
    }`, resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, packages: 'external',
    platform: 'node', format: 'esm', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } }, logLevel: 'silent' });
  const module = await import(pathToFileURL(bundle).href);
  make = module.make;
  const standard = await account('standard');
  const pro = await account('pro', 'paid', day(30));
  const expired = await account('expired', 'paid', day(-2));
  const other = await account('other');
  const owner = await account('owner');
  const admin = await account('admin', 'standard', null, 'admin');

  for (const [label, actor, active] of [['standard', standard, false], ['pro', pro, true], ['expired', expired, false]]) {
    const profile = await actor.coach.getProfile(actor.id);
    check(module.hasActiveIndependentPro(profile) === active, `${label}: profile resolves the current original plan entitlement`);
    const input = { name: `${prefix} client ${label}`, email: `${prefix}-client-${label}@example.invalid`,
      phone: '', birthDate: '1995-03-12', weight: 75, height: 175, goal: 'Strength', notes: '', address: 'Synthetic address' };
    const clientId = await actor.coach.createClient(actor.id, input); clients.push(clientId);
    const savedClient = await actor.coach.getClient(clientId, actor.id);
    check(savedClient.name === input.name && savedClient.address === input.address, `${label}: creates and reads its independent client`);
    await actor.coach.updateClient(clientId, actor.id, { ...input, notes: 'Updated by owning coach' });
    check((await actor.coach.getClient(clientId, actor.id)).notes === 'Updated by owning coach', `${label}: updates the owned client`);
    await reject(() => other.coach.getClient(clientId, other.id), `${label}: another coach cannot read the client`);
    await reject(() => other.coach.updateClient(clientId, other.id, { ...input, notes: 'Forbidden' }), `${label}: another coach cannot update the client`);
    await reject(() => other.coach.deleteClient(clientId, other.id), `${label}: another coach cannot delete the client`);

    const exerciseInput = { name: `${prefix} exercise ${label}`, muscleGroup: 'Piernas', description: 'Synthetic exercise', videoUrl: '', imageUrl: null };
    const exerciseId = await actor.coach.createCoachExercise(actor.id, exerciseInput); exercises.push(exerciseId);
    await actor.coach.updateCoachExercise(exerciseId, actor.id, { ...exerciseInput, description: 'Updated description' });
    const exercise = await actor.coach.getCoachExercise(exerciseId, actor.id);
    check(exercise.description === 'Updated description' && exercise.source === 'coach', `${label}: creates, reads and updates its private exercise`);
    check(!(await other.coach.getExercises(other.id)).some(row => row.id === exerciseId), `${label}: private exercise stays outside another coach's library`);
    await reject(() => other.coach.updateCoachExercise(exerciseId, other.id, exerciseInput), `${label}: another coach cannot update the exercise`);
    await reject(() => other.coach.deleteCoachExercise(exerciseId, other.id), `${label}: another coach cannot delete the exercise`);

    const plan = module.emptyRoutinePlan(clientId, input.name);
    Object.assign(plan, { name: `${prefix} routine ${label}`, objective: 'Strength', trainingDaysCount: 1, days: [plan.days[0]],
      warmup: { enabled: true, customText: 'Warm up', exercises: [exercise] } });
    plan.days[0].muscleGroups = ['Piernas'];
    plan.days[0].exercises = [module.createRoutineExercise(exercise, 1)];
    plan.days[0].exercises[0].weekConfigs = [{ startWeek: 1, endWeek: 4, sets: 4, reps: '8', rest: '90 s', notes: 'Progression' }];
    if (active) {
      const second = module.createRoutineExercise(exercise, 2), blockId = randomUUID();
      plan.days[0].exercises.push(second);
      for (const [index, item] of plan.days[0].exercises.entries()) Object.assign(item,
        { blockType: 'biserie', blockId, blockLabel: 'A', blockPosition: index + 1, blockRest: '90 s' });
    }
    const routineId = await actor.routines.saveRoutine(plan, actor.id);
    const routine = await actor.routines.getRoutine(routineId, actor.id);
    check(routine.coachId === actor.id && !routine.clientGymMembershipId && routine.warmup.exercises[0].id === exerciseId
      && routine.days[0].exercises[0].weekConfigs[0].sets === 4, `${label}: original routine RPC persists independent scope, warmup and weeks`);
    if (active) check(routine.days[0].exercises.every(item => item.blockType === 'biserie'), 'pro: grouped exercise prescriptions persist');
    routine.name = `${plan.name} edited`; routine.days[0].exercises[0].reps = '6';
    await actor.routines.saveRoutine(routine, actor.id);
    const editedRoutine = await actor.routines.getRoutine(routineId, actor.id);
    check(editedRoutine.name === routine.name && editedRoutine.days[0].id === routine.days[0].id
      && editedRoutine.days[0].exercises[0].reps === '6', `${label}: routine edit retains the existing day identity`);
    await reject(() => other.routines.getRoutine(routineId, other.id), `${label}: another coach cannot read the routine`);
    await reject(() => other.routines.saveRoutine(routine, other.id), `${label}: another coach cannot save the routine`);
    await reject(() => other.routines.deleteRoutine(routineId, other.id), `${label}: another coach cannot delete the routine`);

    const sheet = module.createCompetitorSheet(clientId, input.name);
    Object.assign(sheet, { programTitle: `${prefix} competition ${label}`, mesocycleTitle: 'Meso', macrocycleTitle: 'Macro',
      frequencyText: '3', splitText: 'Full body', trainingDaysText: 'M-W-F' });
    sheet.id = await actor.competitor.saveSheet(sheet, actor.id);
    sheet.programTitle += ' edited';
    await actor.competitor.saveSheet(sheet, actor.id);
    const savedSheet = await actor.competitor.getSheet(sheet.id, actor.id);
    check(savedSheet.programTitle === sheet.programTitle && savedSheet.coachId === actor.id && !savedSheet.clientGymMembershipId,
      `${label}: competitor RPC creates and updates the owned independent sheet`);
    await reject(() => other.competitor.saveSheet(sheet, other.id), `${label}: another coach cannot save the competitor sheet`);
    await reject(() => other.competitor.deleteSheet(sheet.id, other.id), `${label}: another coach cannot delete the competitor sheet`);

    const measurement = { date: day(0), weight: 75, height: 175, waist: 82, notes: 'Synthetic measurement' };
    await actor.coach.saveClientMeasurement(clientId, measurement);
    const measured = (await actor.coach.getClientMeasurements(clientId))[0];
    check(measured.weight === 75 && measured.bmi === 24.49, `${label}: saves and reads a measurement with calculated BMI`);
    await actor.coach.saveClientMeasurement(clientId, { ...measurement, weight: 76 }, measured.id);
    check((await actor.coach.getClientMeasurements(clientId))[0].weight === 76, `${label}: updates the owned measurement`);
    check((await other.coach.getClientMeasurements(clientId)).length === 0, `${label}: measurement is hidden from another coach`);
    await reject(() => other.coach.saveClientMeasurement(clientId, measurement, measured.id), `${label}: another coach cannot update the measurement`);
    await reject(() => other.coach.deleteClientMeasurement(clientId, measured.id), `${label}: another coach cannot delete the measurement`);

    const portalEmail = `${prefix}-portal-${label}@example.invalid`;
    const invitation = await actor.api.rpc('admin_ensure_auth_user_for_email', { p_email: portalEmail, p_gym_id: null,
      p_client_id: clientId, p_role: 'independent_client', p_user_metadata: { name: 'Synthetic portal identity' } });
    if (active) {
      const portalId = checked(invitation, 'Create eligible portal fixture'); users.push(portalId);
      check(checked(await db.auth.admin.getUserById(portalId), 'Read portal fixture').user.email === portalEmail,
        'pro: active plan can prepare an independent Portal identity through the existing RPC');
    } else check(!!invitation.error, `${label}: the original server rejects creating an independent Portal identity without current Pro`);

    await actor.coach.deleteClientMeasurement(clientId, measured.id);
    await actor.competitor.deleteSheet(sheet.id, actor.id);
    await actor.routines.deleteRoutine(routineId, actor.id);
    check((await actor.coach.getClientMeasurements(clientId)).length === 0
      && (await actor.coach.getClientRoutines(clientId, actor.id)).length === 0
      && (await actor.coach.getCompetitorSheets(clientId, actor.id)).length === 0, `${label}: owned measurement, routine and competitor deletions persist`);
    await actor.coach.deleteCoachExercise(exerciseId, actor.id);
    check(!(await actor.coach.getExercises(actor.id)).some(row => row.id === exerciseId), `${label}: deletes its unused private exercise`);
    await actor.coach.deleteClient(clientId, actor.id);
    check(checked(await db.from('clients').select('id').eq('id', clientId), 'Confirm client deletion').length === 0,
      `${label}: existing independent deletion RPC removes only its own client`);
  }

  const gymId = randomUUID(), accessCode = suffix.slice(0, 6).toUpperCase(); gyms.push(gymId);
  checked(await db.from('gyms').insert({ id: gymId, name: `${prefix} gym`, access_code: accessCode }), 'Create local staff fixture');
  checked(await admin.api.rpc('admin_assign_gym_owner', { p_gym_id: gymId, p_coach_id: owner.id }), 'Assign synthetic owner');
  await reject(() => other.gyms.joinByAccessCode(other.id, 'coach', `INVALID-${suffix}`), 'staff: invalid access code cannot create a membership');
  const joined = await other.gyms.joinByAccessCode(other.id, 'coach', ` ${accessCode.toLowerCase()} `);
  await reject(() => other.gyms.joinByAccessCode(other.id, 'coach', accessCode), 'staff: the original RPC rejects joining the same gym twice');
  check(joined.gym.id === gymId && joined.role === 'trainer'
    && checked(await db.from('gym_staff').select('coach_id').eq('gym_id', gymId).eq('coach_id', other.id), 'Read joined staff').length === 1,
    'staff: normalized access code joins once and a repeated attempt preserves one membership');
  await reject(() => other.staff.update(gymId, other.id, { role: 'owner' }), 'staff: a trainer cannot promote itself');
  await owner.staff.update(gymId, other.id, { role: 'receptionist' });
  const receptionist = (await other.gyms.loadAccessibleGyms(other.id, 'coach', true)).find(row => row.gym.id === gymId);
  check(receptionist.role === 'receptionist' && receptionist.permissions.canViewPayments
    && !receptionist.permissions.canCreateRoutines && !receptionist.permissions.canManageStaff,
    'staff: owner role changes apply the original receptionist permissions');
  await reject(() => other.staff.remove(gymId, owner.id), 'staff: reception cannot remove the primary owner');
  await reject(() => owner.staff.remove(gymId, owner.id), 'staff: primary owner cannot leave before reassignment');
  await other.staff.remove(gymId, other.id);
  check((await other.gyms.loadAccessibleGyms(other.id, 'coach', true)).every(row => row.gym.id !== gymId)
    && (await other.coach.getProfile(other.id)).accountType === 'independent',
    'staff: leaving revokes gym context and restores independent account type');
  check(checked(await db.auth.admin.getUserById(other.id), 'Read preserved staff Auth').user.id === other.id,
    'staff: leaving preserves the account and Auth identity');
} catch (error) {
  failure = error;
} finally {
  const clean = async (label, action) => {
    try { await action(); } catch (error) { cleanupErrors.push(new Error(`${label}: ${error.message}`)); }
  };
  // Use only newly created identifiers, including partially completed service
  // writes. Persistent demo users and copied records are never cleanup targets.
  if (clients.length) await clean('Clean clients', async () => checked(await db.from('clients').delete().in('id', clients), 'Clean clients'));
  if (users.length) await clean('Clean partial clients', async () => checked(await db.from('clients').delete().in('primary_coach_id', users), 'Clean partial clients'));
  if (gyms.length) await clean('Clean gyms', async () => checked(await db.from('gyms').delete().in('id', gyms), 'Clean gyms'));
  if (exercises.length) await clean('Clean exercises', async () => checked(await db.from('exercises').delete().in('id', exercises), 'Clean exercises'));
  if (users.length) {
    await clean('Clean partial exercises', async () => checked(await db.from('exercises').delete().in('coach_id', users), 'Clean partial exercises'));
    await clean('Clean login activity', async () => checked(await db.from('activity_logins').delete().in('user_id', users), 'Clean login activity'));
    await clean('Clean profiles', async () => checked(await db.from('coaches').delete().in('id', users), 'Clean profiles'));
    for (const id of users) await clean('Clean Auth fixture', async () => {
      const result = await db.auth.admin.deleteUser(id);
      if (result.error && result.error.status !== 404) throw result.error;
    });
    await clean('Verify empty fixture profiles', async () => assert.equal(checked(await db.from('coaches').select('id').in('id', users), 'Read remaining fixture profiles').length, 0));
    for (const id of users) await clean('Verify missing Auth fixture', async () => {
      const result = await db.auth.admin.getUserById(id);
      if (result.error && result.error.status !== 404) throw result.error;
      assert.ok(!result.data.user);
    });
  }
  for (const injector of injectors) injector.destroy();
  await clean('Remove temporary bundle', () => rm(bundle, { force: true }));
}
if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], 'Independent original-backend regression failed.');
console.log(`Original independent/staff services: ${checks.length} checks passed; synthetic fixtures and Auth identities removed.`);
for (const label of checks) console.log(`PASS ${label}`);
