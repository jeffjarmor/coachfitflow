import { DEFAULT_BRAND_COLOR } from '../../core/data/branding';
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';

export type AdminCoachPlan = 'standard' | 'paid';
export type AdminClientScope = 'independent' | 'gym';

export interface AdminGymAffiliation {
  gymId: string;
  gymName: string;
  role: 'owner' | 'trainer' | 'receptionist';
}

export interface AdminCoachRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  logoUrl: string | null;
  brandColor: string;
  role: 'admin' | 'coach' | 'owner';
  accountType: 'independent' | 'gym';
  coachPlan: AdminCoachPlan;
  nextPlanPaymentDate: string | null;
  createdAt: string | null;
  clientCount: number;
  routineCount: number;
  affiliations: AdminGymAffiliation[];
}

export interface AdminClientRecord {
  contextKey: string;
  id: string;
  coachId: string;
  coachName: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  age: number;
  weight: number | null;
  height: number | null;
  goal: string;
  notes: string | null;
  address: string | null;
  createdAt: string | null;
  scope: AdminClientScope;
  gymId: string | null;
  gymName: string | null;
  membershipId: string | null;
  subscriptionStatus: string | null;
  portalStatus: string | null;
  routineCount: number;
  measurementCount: number;
}

export interface AdminRoutineSummary {
  id: string;
  name: string;
  objective: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
}

export interface AdminMeasurementSummary {
  id: string;
  date: string;
  weight: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
}

export interface AdminClientDetail {
  client: AdminClientRecord;
  routines: AdminRoutineSummary[];
  measurements: AdminMeasurementSummary[];
}

export interface AdminClientUpdate {
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  weight: number | null;
  height: number | null;
  goal: string;
  notes: string;
  address: string;
}

@Injectable({ providedIn: 'root' })
export class AdminDataService {
  private readonly supabase = inject(SupabaseService).client;

  async listCoaches(): Promise<AdminCoachRecord[]> {
    const [coachesResult, clientsResult, membershipsResult, routinesResult, staffResult] = await Promise.all([
      this.supabase
        .from('coaches')
        .select('id,name,email,phone,logo_url,brand_color,role,account_type,coach_plan,next_plan_payment_date,created_at')
        .order('created_at', { ascending: false }),
      this.supabase.from('clients').select('id,primary_coach_id'),
      this.supabase.from('client_gym_memberships').select('client_id,assigned_coach_id'),
      this.supabase.from('routines').select('id,coach_id'),
      this.supabase.from('gym_staff').select('coach_id,gym_id,role,gyms(id,name)')
    ]);

    if (coachesResult.error) throw coachesResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    if (routinesResult.error) throw routinesResult.error;
    if (staffResult.error) throw staffResult.error;

    const clientsByCoach = new Map<string, Set<string>>();
    for (const row of clientsResult.data || []) {
      if (!row.primary_coach_id) continue;
      const ids = clientsByCoach.get(row.primary_coach_id) || new Set<string>();
      ids.add(row.id);
      clientsByCoach.set(row.primary_coach_id, ids);
    }
    for (const row of membershipsResult.data || []) {
      if (!row.assigned_coach_id) continue;
      const ids = clientsByCoach.get(row.assigned_coach_id) || new Set<string>();
      ids.add(row.client_id);
      clientsByCoach.set(row.assigned_coach_id, ids);
    }
    const routineCounts = this.countBy((routinesResult.data || []).map((row) => row.coach_id));
    const affiliations = new Map<string, AdminGymAffiliation[]>();
    for (const row of staffResult.data || []) {
      const gym = this.related(row.gyms);
      if (!gym) continue;
      const current = affiliations.get(row.coach_id) || [];
      current.push({ gymId: row.gym_id, gymName: gym.name || 'Gimnasio', role: row.role });
      affiliations.set(row.coach_id, current);
    }

    return (coachesResult.data || []).map((row) => ({
      id: row.id,
      name: row.name || 'Entrenador sin nombre',
      email: row.email || '',
      phone: row.phone,
      logoUrl: row.logo_url,
      brandColor: row.brand_color || DEFAULT_BRAND_COLOR,
      role: row.role || 'coach',
      accountType: row.account_type || 'independent',
      coachPlan: row.coach_plan === 'paid' ? 'paid' : 'standard',
      nextPlanPaymentDate: row.next_plan_payment_date,
      createdAt: row.created_at,
      clientCount: clientsByCoach.get(row.id)?.size || 0,
      routineCount: routineCounts.get(row.id) || 0,
      affiliations: (affiliations.get(row.id) || []).sort((a, b) => a.gymName.localeCompare(b.gymName, 'es'))
    }));
  }

  async getCoach(coachId: string): Promise<AdminCoachRecord | null> {
    return (await this.listCoaches()).find((coach) => coach.id === coachId) || null;
  }

  async updateCoachPlan(coachId: string, coachPlan: AdminCoachPlan, nextPlanPaymentDate: string | null): Promise<void> {
    const { data, error } = await this.supabase
      .from('coaches')
      .update({
        coach_plan: coachPlan,
        next_plan_payment_date: coachPlan === 'paid' ? nextPlanPaymentDate : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', coachId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos guardar el plan. Comprueba tus permisos y que el entrenador siga disponible.');
  }

  async listClients(coachId?: string): Promise<AdminClientRecord[]> {
    const [clientsResult, coachesResult, membershipsResult, routinesResult, measurementsResult] = await Promise.all([
      this.supabase
        .from('clients')
        .select('id,primary_coach_id,name,email,phone,birth_date,age,weight,height,goal,notes,address,created_at')
        .order('created_at', { ascending: false }),
      this.supabase.from('coaches').select('id,name'),
      this.supabase
        .from('client_gym_memberships')
        .select('id,client_id,gym_id,assigned_coach_id,subscription_status,portal_status,joined_at,gyms(id,name)'),
      this.supabase.from('routines').select('id,client_id,coach_id,client_gym_membership_id'),
      this.supabase.from('measurements').select('id,client_id,client_gym_membership_id')
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (coachesResult.error) throw coachesResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    if (routinesResult.error) throw routinesResult.error;
    if (measurementsResult.error) throw measurementsResult.error;

    const coaches = new Map((coachesResult.data || []).map((row) => [row.id, row.name || 'Entrenador']));
    const rows = new Map<string, AdminClientRecord>();
    const clients = new Map((clientsResult.data || []).map((row) => [row.id, row]));

    for (const membership of membershipsResult.data || []) {
      if (coachId && (coachId === 'unassigned' ? !!membership.assigned_coach_id : membership.assigned_coach_id !== coachId)) continue;
      const client = clients.get(membership.client_id);
      if (!client) continue;
      const gym = this.related(membership.gyms);
      rows.set(`gym:${membership.id}`, this.mapClient(client, {
        coachId: membership.assigned_coach_id || 'unassigned',
        coachName: coaches.get(membership.assigned_coach_id) || 'Sin entrenador asignado',
        scope: 'gym',
        gymId: membership.gym_id,
        gymName: gym?.name || 'Gimnasio',
        membershipId: membership.id,
        subscriptionStatus: membership.subscription_status,
        portalStatus: membership.portal_status,
        routines: routinesResult.data || [],
        measurements: measurementsResult.data || []
      }));
    }

    for (const client of clientsResult.data || []) {
      if (!client.primary_coach_id) continue;
      if (coachId && client.primary_coach_id !== coachId) continue;
      const key = this.clientContextKey(client.primary_coach_id, client.id);
      if (rows.has(key)) continue;
      rows.set(key, this.mapClient(client, {
        coachId: client.primary_coach_id,
        coachName: coaches.get(client.primary_coach_id) || 'Entrenador',
        scope: 'independent',
        gymId: null,
        gymName: null,
        membershipId: null,
        subscriptionStatus: null,
        portalStatus: null,
        routines: routinesResult.data || [],
        measurements: measurementsResult.data || []
      }));
    }

    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async getClientDetail(coachId: string, clientId: string, membershipId: string | null = null): Promise<AdminClientDetail | null> {
    const client = (await this.listClients(coachId)).find((row) => row.id === clientId && row.membershipId === membershipId);
    if (!client) return null;

    let routinesQuery = this.supabase
      .from('routines')
      .select('id,name,objective,start_date,end_date,created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    let measurementsQuery = this.supabase
      .from('measurements')
      .select('id,date,weight,body_fat_percentage,muscle_mass')
      .eq('client_id', clientId)
      .order('date', { ascending: false });

    if (client.membershipId) {
      routinesQuery = routinesQuery.eq('client_gym_membership_id', client.membershipId);
      measurementsQuery = measurementsQuery.eq('client_gym_membership_id', client.membershipId);
    } else {
      routinesQuery = routinesQuery.is('client_gym_membership_id', null).eq('coach_id', coachId);
      measurementsQuery = measurementsQuery.is('client_gym_membership_id', null);
    }

    const [routinesResult, measurementsResult] = await Promise.all([routinesQuery, measurementsQuery]);
    if (routinesResult.error) throw routinesResult.error;
    if (measurementsResult.error) throw measurementsResult.error;

    return {
      client,
      routines: (routinesResult.data || []).map((row) => ({
        id: row.id,
        name: row.name,
        objective: row.objective,
        startDate: row.start_date,
        endDate: row.end_date,
        createdAt: row.created_at
      })),
      measurements: (measurementsResult.data || []).map((row) => ({
        id: row.id,
        date: row.date,
        weight: row.weight == null ? null : Number(row.weight),
        bodyFatPercentage: row.body_fat_percentage == null ? null : Number(row.body_fat_percentage),
        muscleMass: row.muscle_mass == null ? null : Number(row.muscle_mass)
      }))
    };
  }

  async updateClient(clientId: string, input: AdminClientUpdate): Promise<void> {
    const { data, error } = await this.supabase
      .from('clients')
      .update({
        name: input.name.trim(),
        email: input.email.trim().toLocaleLowerCase('es'),
        phone: input.phone.trim() || null,
        birth_date: input.birthDate || null,
        age: this.calculateAge(input.birthDate),
        weight: input.weight,
        height: input.height,
        goal: input.goal.trim(),
        notes: input.notes.trim() || null,
        address: input.address.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos guardar el cliente. Comprueba tus permisos y que el registro siga disponible.');
  }

  async listGyms(): Promise<Array<{ id: string; name: string; ownerId: string | null }>> {
    const { data, error } = await this.supabase.from('gyms').select('id,name,owner_id').order('name');
    if (error) throw error;
    return (data || []).map(row => ({ id: row.id, name: row.name, ownerId: row.owner_id }));
  }

  async assignGymOwner(gymId: string, coachId: string): Promise<void> {
    const { error } = await this.supabase.rpc('admin_assign_gym_owner', { p_gym_id: gymId, p_coach_id: coachId });
    if (error) throw error;
  }

  async deleteGym(gymId: string): Promise<void> {
    await this.assertAdmin();
    const { data: memberships, error: memErr } = await this.supabase
      .from('client_gym_memberships')
      .select('id')
      .eq('gym_id', gymId);
    if (memErr) throw memErr;

    const membershipIds = (memberships || []).map((m: any) => m.id);

    if (membershipIds.length > 0) {
      const { error: routineErr } = await this.supabase
        .from('routines')
        .delete()
        .in('client_gym_membership_id', membershipIds);
      if (routineErr) throw routineErr;

      const { error: compErr } = await this.supabase
        .from('competitor_sheets')
        .delete()
        .in('client_gym_membership_id', membershipIds);
      if (compErr) throw compErr;

      const { error: measErr } = await this.supabase
        .from('measurements')
        .delete()
        .in('client_gym_membership_id', membershipIds);
      if (measErr) throw measErr;

      const { error: payErr } = await this.supabase
        .from('payments')
        .delete()
        .in('client_gym_membership_id', membershipIds);
      if (payErr) throw payErr;
    }

    const { error: staffErr } = await this.supabase.from('gym_staff').delete().eq('gym_id', gymId);
    if (staffErr) throw staffErr;

    const { error: exErr } = await this.supabase.from('exercises').delete().eq('gym_id', gymId);
    if (exErr) throw exErr;

    const { error: planErr } = await this.supabase.from('membership_plans').delete().eq('gym_id', gymId);
    if (planErr) throw planErr;

    const { error: memDelErr } = await this.supabase.from('client_gym_memberships').delete().eq('gym_id', gymId);
    if (memDelErr) throw memDelErr;

    const { error: gymErr } = await this.supabase.from('gyms').delete().eq('id', gymId);
    if (gymErr) throw gymErr;
  }

  async deleteCoach(coachId: string): Promise<void> {
    await this.assertAdmin();
    // Delete personal clients fully (including auth users) before deleting the coach.
    const { data: personalClients, error: personalClientsErr } = await this.supabase
      .from('clients')
      .select('id')
      .eq('primary_coach_id', coachId);
    if (personalClientsErr) throw personalClientsErr;

    for (const client of personalClients || []) {
      const { error } = await this.supabase.rpc('admin_delete_client_fully', {
        p_client_id: client.id
      });
      if (error) throw error;
    }

    const { data: ownedGyms, error: ownedErr } = await this.supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', coachId);
    if (ownedErr) throw ownedErr;

    for (const gym of ownedGyms || []) {
      await this.deleteGym(gym.id);
    }

    const { error: staffErr } = await this.supabase.from('gym_staff').delete().eq('coach_id', coachId);
    if (staffErr) throw staffErr;

    const { error: routineErr } = await this.supabase.from('routines').delete().eq('coach_id', coachId);
    if (routineErr) throw routineErr;

    const { error: exErr } = await this.supabase.from('exercises').delete().eq('coach_id', coachId);
    if (exErr) throw exErr;

    const { error: compErr } = await this.supabase.from('competitor_sheets').delete().eq('coach_id', coachId);
    if (compErr) throw compErr;

    const { error: clientRefErr } = await this.supabase
      .from('clients')
      .update({ primary_coach_id: null })
      .eq('primary_coach_id', coachId);
    if (clientRefErr) throw clientRefErr;

    const { error: membershipErr } = await this.supabase
      .from('client_gym_memberships')
      .update({ assigned_coach_id: null })
      .eq('assigned_coach_id', coachId);
    if (membershipErr) throw membershipErr;

    const { error: coachErr } = await this.supabase.from('coaches').delete().eq('id', coachId);
    if (coachErr) throw coachErr;

    const { error: authError } = await this.supabase.rpc('admin_delete_auth_user', { target_user_id: coachId });
    if (authError) throw authError;
  }

  async deleteClientContext(client: AdminClientRecord): Promise<void> {
    await this.assertAdmin();
    // Match the original: delete an owned independent client, or unlink the gym membership.
    const { data: row, error } = await this.supabase.from('clients')
      .select('id,primary_coach_id').eq('id', client.id).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error('El cliente ya no está disponible.');
    if (!client.membershipId && row.primary_coach_id === client.coachId) {
      const { error: deleteError } = await this.supabase.rpc('admin_delete_client_fully', { p_client_id: client.id });
      if (deleteError) throw deleteError;
      return;
    }
    if (!client.membershipId || !client.gymId) throw new Error('No se pudo verificar la membresía del cliente.');
    // Membership FKs in the original schema may use SET NULL. Remove only this
    // context's records first so they cannot become independent client records.
    for (const table of ['training_sessions', 'routines', 'competitor_sheets', 'measurements', 'payments'] as const) {
      const { error: contextError } = await this.supabase.from(table).delete()
        .eq('client_gym_membership_id', client.membershipId);
      if (contextError) throw contextError;
    }
    const { data, error: unlinkError } = await this.supabase.from('client_gym_memberships')
      .delete().eq('id', client.membershipId).eq('client_id', client.id).eq('gym_id', client.gymId).select('id');
    if (unlinkError) throw unlinkError;
    if (!data?.length) throw new Error('No pudimos retirar la membresía. Comprueba tus permisos.');
  }

  async cloneClient(client: AdminClientRecord, targetCoachId: string): Promise<string> {
    await this.assertAdmin();
    const clientId = client.id;
    const sourceCoachId = client.coachId;
    const sourceClient = await this.getClientDetail(sourceCoachId, clientId, client.membershipId);
    if (!sourceClient) throw new Error('Client not found');

    const original = sourceClient.client;
    const nowIso = new Date().toISOString();

    const { data: insertedClient, error: clientErr } = await this.supabase
      .from('clients')
      .insert({
        primary_coach_id: targetCoachId,
        name: original.name,
        email: original.email,
        phone: original.phone || null,
        birth_date: original.birthDate || null,
        notes: original.notes || null,
        age: original.age || 0,
        weight: original.weight && original.weight > 0 ? original.weight : null,
        height: original.height && original.height > 0 ? original.height : null,
        goal: original.goal || '',
        address: original.address || null,
        created_at: nowIso,
        updated_at: nowIso
      })
      .select('id')
      .single();
    if (clientErr) throw clientErr;

    const newClientId = insertedClient.id;

    let measurementQuery = this.supabase.from('measurements').select('*').eq('client_id', clientId);
    measurementQuery = client.membershipId ? measurementQuery.eq('client_gym_membership_id', client.membershipId) : measurementQuery.is('client_gym_membership_id', null);
    const { data: measurements, error: measErr } = await measurementQuery;
    if (measErr) throw measErr;

    for (const m of measurements || []) {
      const payload = { ...m, id: undefined, client_id: newClientId, client_gym_membership_id: null, routine_id: null, created_at: nowIso };
      delete payload.id;
      const { error } = await this.supabase.from('measurements').insert(payload);
      if (error) throw error;
    }

    let routineQuery = this.supabase.from('routines').select('*').eq('client_id', clientId);
    routineQuery = client.membershipId ? routineQuery.eq('client_gym_membership_id', client.membershipId) : routineQuery.eq('coach_id', sourceCoachId).is('client_gym_membership_id', null);
    const { data: routines, error: routineErr } = await routineQuery;
    if (routineErr) throw routineErr;

    for (const r of routines || []) {
      const { data: insertedRoutine, error: insRoutineErr } = await this.supabase
        .from('routines')
        .insert({
          coach_id: targetCoachId,
          client_id: newClientId,
          name: r.name,
          objective: r.objective,
          training_days_count: r.training_days_count,
          duration_weeks: r.duration_weeks,
          start_date: r.start_date,
          end_date: r.end_date,
          notes: r.notes,
          warmup_enabled: r.warmup_enabled,
          warmup_custom_text: r.warmup_custom_text,
          created_at: nowIso,
          updated_at: nowIso
        })
        .select('id')
        .single();
      if (insRoutineErr) throw insRoutineErr;

      const { data: days, error: daysErr } = await this.supabase
        .from('routine_days')
        .select('*')
        .eq('routine_id', r.id)
        .order('day_number', { ascending: true });
      if (daysErr) throw daysErr;

      for (const day of days || []) {
        const { data: newDay, error: newDayErr } = await this.supabase
          .from('routine_days')
          .insert({
            routine_id: insertedRoutine.id,
            day_number: day.day_number,
            day_name: day.day_name,
            notes: day.notes,
            muscle_groups: day.muscle_groups
          })
          .select('id')
          .single();
        if (newDayErr) throw newDayErr;

        const { data: exercises, error: exErr } = await this.supabase
          .from('routine_day_exercises')
          .select('*')
          .eq('routine_day_id', day.id)
          .order('order_index', { ascending: true });
        if (exErr) throw exErr;

        for (const ex of exercises || []) {
          const { data: newEx, error: newExErr } = await this.supabase
            .from('routine_day_exercises')
            .insert({
              routine_day_id: newDay.id,
              exercise_id: ex.exercise_id,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              notes: ex.notes,
              is_superset: ex.is_superset,
              block_type: ex.block_type || 'single',
              block_id: ex.block_id,
              block_label: ex.block_label,
              block_position: ex.block_position,
              block_rest: ex.block_rest,
              video_url: ex.video_url,
              image_url: ex.image_url,
              order_index: ex.order_index
            })
            .select('id')
            .single();
          if (newExErr) throw newExErr;

          const { data: weekConfigs, error: wcErr } = await this.supabase
            .from('routine_week_configs')
            .select('*')
            .eq('routine_day_exercise_id', ex.id)
            .order('start_week', { ascending: true });
          if (wcErr) throw wcErr;

          for (const wc of weekConfigs || []) {
            const { error } = await this.supabase.from('routine_week_configs').insert({
              routine_day_exercise_id: newEx.id,
              start_week: wc.start_week,
              end_week: wc.end_week,
              sets: wc.sets,
              reps: wc.reps,
              rest: wc.rest,
              notes: wc.notes
            });
            if (error) throw error;
          }
        }
      }
    }
    return newClientId;
  }

  private async assertAdmin(): Promise<void> {
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) throw new Error('No pudimos verificar tu sesión de administración.');
    const { data, error } = await this.supabase.from('coaches').select('role').eq('id', user.id).single();
    if (error || data?.role !== 'admin') throw new Error('Esta operación requiere una cuenta administradora.');
  }

  private mapClient(row: any, context: {
    coachId: string;
    coachName: string;
    scope: AdminClientScope;
    gymId: string | null;
    gymName: string | null;
    membershipId: string | null;
    subscriptionStatus: string | null;
    portalStatus: string | null;
    routines: any[];
    measurements: any[];
  }): AdminClientRecord {
    const contextRoutines = context.routines.filter((routine) => routine.client_id === row.id
      && (context.membershipId || routine.coach_id === context.coachId)
      && (context.membershipId ? routine.client_gym_membership_id === context.membershipId : !routine.client_gym_membership_id));
    const contextMeasurements = context.measurements.filter((measurement) => measurement.client_id === row.id
      && (context.membershipId ? measurement.client_gym_membership_id === context.membershipId : !measurement.client_gym_membership_id));
    return {
      id: row.id,
      contextKey: context.membershipId ? `gym:${context.membershipId}` : `independent:${context.coachId}:${row.id}`,
      coachId: context.coachId,
      coachName: context.coachName,
      name: row.name || 'Cliente sin nombre',
      email: row.email || '',
      phone: row.phone,
      birthDate: row.birth_date,
      age: Number(row.age || 0),
      weight: row.weight == null ? null : Number(row.weight),
      height: row.height == null ? null : Number(row.height),
      goal: row.goal || '',
      notes: row.notes,
      address: row.address,
      createdAt: row.created_at,
      scope: context.scope,
      gymId: context.gymId,
      gymName: context.gymName,
      membershipId: context.membershipId,
      subscriptionStatus: context.subscriptionStatus,
      portalStatus: context.portalStatus,
      routineCount: contextRoutines.length,
      measurementCount: contextMeasurements.length
    };
  }

  private countBy(values: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return counts;
  }

  private related(value: any): any | null {
    return Array.isArray(value) ? value[0] || null : value || null;
  }

  private clientContextKey(coachId: string, clientId: string): string {
    return `${coachId}:${clientId}`;
  }

  private calculateAge(value: string): number {
    if (!value) return 0;
    const birthDate = new Date(`${value}T12:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const month = today.getMonth() - birthDate.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return Math.max(age, 0);
  }
}
