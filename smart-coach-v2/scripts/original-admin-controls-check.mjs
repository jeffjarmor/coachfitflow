import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

// This suite may write only synthetic fixtures to the isolated original-schema
// stack. It never accepts a hosted backend or applies migrations.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Only the isolated local stack is supported.');
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:55321');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(6).toString('hex');
const password = `${randomBytes(20).toString('base64url')}Aa1!`;
const root = new URL('..', import.meta.url).pathname;
const bundle = `${root}/node_modules/.cache/original-admin-controls-${suffix}.mjs`;
const users = [], announcementIds = [], clientIds = [], gymIds = [], injectors = [], checks = [];
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
const check = (value, label) => { assert.ok(value, label); checks.push(label); };

async function account(name, role = 'coach') {
  const email = `admin-controls-${name}-${suffix}@example.invalid`;
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true,
    // Metadata deliberately disagrees with the normal coach's database role.
    user_metadata: { name, role: 'admin' } }), 'Create synthetic local account').user;
  users.push(user.id);
  checked(await db.from('coaches').upsert({ id: user.id, email, name, role,
    account_type: 'independent', coach_plan: 'standard' }), 'Create synthetic local profile');
  const api = createClient(target.API_URL, target.ANON_KEY, options);
  checked(await api.auth.signInWithPassword({ email, password }), 'Sign in synthetic local account');
  return { id: user.id, api };
}

try {
  await mkdir(`${root}/node_modules/.cache`, { recursive: true });
  await build({ stdin: { contents: `import '@angular/compiler';
    import {createEnvironmentInjector,runInInjectionContext} from '@angular/core';
    import {SupabaseService} from './src/app/core/auth/supabase.service.ts';
    import {AdminDataService} from './src/app/features/admin/admin-data.service.ts';
    import {AdminAnnouncementsService} from './src/app/features/admin/admin-announcements.service.ts';
    import {AdminActivityService} from './src/app/features/admin/admin-activity.service.ts';
    import {AdminMaintenanceService} from './src/app/features/admin/admin-maintenance.service.ts';
    export function make(client) {
      const injector=createEnvironmentInjector([{provide:SupabaseService,useValue:{client}},AdminDataService]);
      const services=runInInjectionContext(injector,()=>({announcements:new AdminAnnouncementsService(),activity:new AdminActivityService(),maintenance:new AdminMaintenanceService()}));
      return {...services,injector};
    }`, resolveDir: root, sourcefile: 'original-admin-controls-check.ts' }, outfile: bundle,
    bundle: true, packages: 'external', platform: 'node', format: 'esm',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
  const { make } = await import(pathToFileURL(bundle).href);
  const admin = await account('admin', 'admin');
  const coach = await account('coach');
  const owner = await account('owner');
  const services = make(admin.api), denied = make(coach.api);
  injectors.push(services.injector, denied.injector);
  const announcements = services.announcements;
  const input = { title: `Aviso local ${suffix}`, message: 'Mensaje de prueba para entrenadores.', audience: 'all',
    active: true, sortOrder: 2, startsAt: '2026-10-01', endsAt: '2026-10-31' };
  await assert.rejects(denied.announcements.createAnnouncement(input));
  check(true, 'Coach metadata cannot grant announcement administration');
  const announcement = await announcements.createAnnouncement(input);
  announcementIds.push(announcement.id);
  check(announcement.title === input.title && announcement.createdBy === admin.id, 'Admin creates announcements with its authenticated identity');
  check(new Date(announcement.startsAt).getDate() === 1 && new Date(announcement.endsAt).getDate() === 31,
    'Announcement dates retain local first and last day boundaries');
  const edited = await announcements.updateAnnouncement(announcement.id, { ...input, title: `${input.title} editado`, audience: 'paid', sortOrder: 1 });
  check(edited.audience === 'paid' && edited.sortOrder === 1 && edited.title.endsWith('editado'), 'Admin edits audience, priority and content');
  const paused = await announcements.toggleAnnouncementActive(announcement.id, false);
  check(paused.active === false, 'Admin pauses the announcement');
  const enabled = await announcements.toggleAnnouncementActive(announcement.id, true);
  check(enabled.active === true, 'Admin reactivates the announcement');
  check((await announcements.getAllAnnouncements()).some(row => row.id === announcement.id), 'Admin lists announcements from the original table');
  await assert.rejects(announcements.updateAnnouncement('00000000-0000-4000-8000-000000000000', input));
  check(true, 'Missing announcement cannot report a successful update');
  await assert.rejects(denied.announcements.toggleAnnouncementActive(announcement.id, false));
  await assert.rejects(denied.announcements.deleteAnnouncement(announcement.id));
  const protectedRow = checked(await db.from('coach_announcements').select('active').eq('id', announcement.id).single(), 'Read protected local announcement');
  check(protectedRow.active === true, 'Non-admin attempts preserve announcements');
  await announcements.deleteAnnouncement(announcement.id);
  check(checked(await db.from('coach_announcements').select('id').eq('id', announcement.id), 'Read deleted announcement').length === 0,
    'Admin deletes only the selected announcement');

  const reference = new Date();
  const before = await services.activity.load(reference);
  const today = reference.toISOString();
  checked(await db.from('activity_logins').insert([
    ...Array.from({ length: 1505 }, (_, index) => ({ user_id: index % 2 ? coach.id : owner.id, role: 'coach', timestamp: today })),
    { user_id: coach.id, role: 'coach', timestamp: new Date(reference.getTime() - 31 * 86400000).toISOString() },
    { user_id: coach.id, role: 'coach', timestamp: new Date(reference.getTime() + 86400000).toISOString() }
  ]), 'Seed paginated local activity');
  const client = checked(await db.from('clients').insert({ primary_coach_id: coach.id, name: `Cliente local ${suffix}`, email: `${suffix}@example.invalid`, goal: 'Fixture', age: 30 })
    .select('id').single(), 'Create shared local client');
  clientIds.push(client.id);
  checked(await db.from('routines').insert({ client_id: client.id, coach_id: coach.id, name: 'Rutina local de actividad',
    objective: 'Fixture', training_days_count: 1, duration_weeks: 4, created_at: today }), 'Create local activity routine');
  const activity = await services.activity.load(reference);
  check(activity.total.logins === before.total.logins + 1505, 'Global activity reads beyond the first 1000 rows and excludes old/future events');
  check(activity.today.logins === before.today.logins + 1505 && activity.today.uniqueUsers === before.today.uniqueUsers + 2,
    'Today counts repeated logins and distinct authenticated identities separately');
  check(activity.total.routines === before.total.routines + 1 && activity.today.routines === before.today.routines + 1,
    'Global routine counts use the existing routine creation date');
  check(activity.daily.length === 7 && activity.daily.at(-1).logins === activity.today.logins,
    'Daily history retains the original seven local calendar days');
  await assert.rejects(denied.activity.load(reference), error => error.code === 'ADMIN_ACTIVITY_FORBIDDEN');
  check(true, 'Global activity rejects coach metadata claiming admin');

  const names = [`Gimnasio local seleccionado ${suffix}`, `Gimnasio local conservado ${suffix}`];
  const gyms = checked(await db.from('gyms').insert(names.map((name, index) => ({ name, access_code: `${index}${suffix.slice(0, 5)}`.toUpperCase() })))
    .select('id,name'), 'Create isolated gym contexts');
  gymIds.push(...gyms.map(gym => gym.id));
  const selectedGymId = gyms.find(gym => gym.name === names[0]).id;
  const otherGymId = gyms.find(gym => gym.name === names[1]).id;
  const memberships = checked(await db.from('client_gym_memberships').insert(gyms.map(gym => ({ gym_id: gym.id, client_id: client.id, assigned_coach_id: coach.id })))
    .select('id,gym_id'), 'Create shared local memberships');
  checked(await db.from('measurements').insert(memberships.map(member => ({ client_id: client.id, client_gym_membership_id: member.id,
    date: today.slice(0, 10), weight: 70, height: 170, bmi: 24.22 }))), 'Create scoped local measurements');
  const directory = await services.maintenance.load();
  let gym = directory.gyms.find(row => row.id === selectedGymId);
  check(!!gym && directory.availableOwners.some(row => row.id === owner.id), 'Maintenance lists gyms and eligible independent owners');
  await assert.rejects(denied.maintenance.load());
  await assert.rejects(denied.maintenance.assignOwner(gym, owner.id));
  await assert.rejects(denied.maintenance.deleteGym(gym, gym.name));
  check(true, 'Maintenance checks real administrative permissions before reads and writes');
  await services.maintenance.assignOwner(gym, owner.id);
  check(checked(await db.from('gyms').select('owner_id').eq('id', selectedGymId).single(), 'Read assigned gym').owner_id === owner.id,
    'Owner assignment uses the original admin RPC');
  await assert.rejects(services.maintenance.deleteGym(gym, gym.name));
  check(true, 'A changed gym must be refreshed before destructive maintenance');
  gym = (await services.maintenance.load()).gyms.find(row => row.id === selectedGymId);
  await assert.rejects(services.maintenance.deleteGym(gym, 'wrong confirmation'));
  check(checked(await db.from('gyms').select('id').eq('id', selectedGymId), 'Read unconfirmed gym').length === 1,
    'Incorrect typed confirmation preserves the gym');
  await services.maintenance.deleteGym(gym, gym.name);
  check(checked(await db.from('gyms').select('id').eq('id', selectedGymId), 'Read selected gym').length === 0,
    'Confirmed maintenance removes only the selected gym');
  check(checked(await db.from('clients').select('id').eq('id', client.id), 'Read preserved base profile').length === 1,
    'Gym maintenance preserves the shared client profile');
  check(checked(await db.from('routines').select('id').eq('client_id', client.id).is('client_gym_membership_id', null), 'Read independent routine').length === 1,
    'Gym maintenance preserves independent training data');
  const remainingMembership = memberships.find(member => member.gym_id === otherGymId);
  check(checked(await db.from('client_gym_memberships').select('id').eq('id', remainingMembership.id), 'Read other gym membership').length === 1
    && checked(await db.from('measurements').select('id').eq('client_gym_membership_id', remainingMembership.id), 'Read other gym measurement').length === 1,
    'Gym maintenance preserves other gym contexts and their measurements');
  check(checked(await db.auth.admin.getUserById(owner.id), 'Read preserved owner Auth').user.id === owner.id
    && checked(await db.from('coaches').select('id').eq('id', owner.id), 'Read preserved owner profile').length === 1,
    'Gym maintenance preserves the owner account and authentication identity');
} finally {
  for (const injector of injectors) injector.destroy();
  if (announcementIds.length) checked(await db.from('coach_announcements').delete().in('id', announcementIds), 'Clean local announcements');
  if (gymIds.length) checked(await db.from('gyms').delete().in('id', gymIds), 'Clean local gyms');
  if (clientIds.length) checked(await db.from('clients').delete().in('id', clientIds), 'Clean local clients');
  if (users.length) {
    checked(await db.from('activity_logins').delete().in('user_id', users), 'Clean local login fixtures');
    checked(await db.from('coaches').delete().in('id', users), 'Clean local profiles');
    for (const id of users) { const result = await db.auth.admin.deleteUser(id); if (result.error && result.error.status !== 404) throw result.error; }
  }
  await rm(bundle, { force: true });
}
console.log(`Original admin controls: ${checks.length} real-service checks passed; local fixtures removed.`);
