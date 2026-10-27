import { DEFAULT_BRAND_COLOR } from './branding';
import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';
import { hasActiveIndependentPro, localCalendarDate } from './plan-access';
import type { RoutinePdfContext } from '../../features/routines/routine-pdf.models';

export type WorkspaceKind = 'clients' | 'routines' | 'exercises' | 'measurements';

export interface CoachProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  logoUrl?: string | null;
  brandColor: string;
  role: 'admin' | 'coach' | 'owner';
  accountType: 'independent' | 'gym';
  coachPlan: 'standard' | 'paid';
  nextPlanPaymentDate?: string | null;
}

export interface CoachProfileUpdate {
  name: string;
  phone: string;
  brandColor: string;
  logoUrl?: string | null;
}

export interface WorkspaceItem {
  id: string;
  parentId?: string;
  title: string;
  subtitle: string;
  detail: string;
  status?: string;
  date?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  progress?: number;
  daysRemaining?: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  birthDate?: string | null;
  age: number;
  weight?: number | null;
  height?: number | null;
  goal: string;
  notes?: string | null;
  address?: string | null;
  portalStatus?: 'pending' | 'active';
  portalInvitedAt?: string | null;
  createdAt?: string | null;
  membershipPlanId?: string | null;
  gymMembershipId?: string | null;
}

export type ClientInput = Omit<ClientRecord, 'id' | 'age' | 'portalStatus' | 'portalInvitedAt' | 'createdAt'>;

export interface ClientRoutine {
  coachId?: string;
  id: string;
  name: string;
  objective: string;
  trainingDaysCount: number;
  durationWeeks: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

export interface ClientMeasurement {
  id: string;
  date: string;
  weight: number;
  height: number;
  bmi: number;
  bodyFatPercentage?: number | null;
  muscleMass?: number | null;
  visceralFat?: number | null;
  metabolicAge?: number | null;
  calories?: number | null;
  boneMass?: number | null;
  waterPercentage?: number | null;
  waist?: number | null;
  hips?: number | null;
  chest?: number | null;
  arms?: number | null;
  legs?: number | null;
  calf?: number | null;
  thigh?: number | null;
  notes?: string | null;
  createdAt?: string | null;
}

export type ClientMeasurementInput = Omit<ClientMeasurement, 'id' | 'bmi' | 'createdAt'>;

export interface CompetitorSheetRecord {
  coachId?: string;
  id: string;
  programTitle?: string | null;
  mesocycleTitle: string;
  macrocycleTitle: string;
  frequencyText: string;
  splitText: string;
  trainingDaysText: string;
  workouts: unknown[];
  createdAt?: string | null;
}

export interface TrainingSetRecord {
  id: string;
  routineDayId: string;
  routineDayName?: string | null;
  routineDayNumber?: number | null;
  exerciseName: string;
  exerciseOrder: number;
  setNumber: number;
  actualReps?: number | null;
  rir?: number | null;
  load?: number | null;
  loadUnit: string;
}

export interface TrainingSessionRecord {
  id: string;
  sessionDate: string;
  status: 'in_progress' | 'completed';
  sets: TrainingSetRecord[];
}

export type ExerciseSource = 'global' | 'coach';

export interface ExerciseItem {
  coachId?: string | null;
  id: string;
  name: string;
  muscleGroup: string;
  source: ExerciseSource;
  imageUrl?: string | null;
  videoUrl?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

export interface ExerciseInput {
  name: string;
  muscleGroup: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  description?: string | null;
}

export interface DashboardData {
  coach: CoachProfile;
  clients: number;
  routines: number;
  activeRoutines: number;
  newClientsThisMonth: number;
  newRoutinesThisMonth: number;
  exercises: number;
  measurements: number;
  recentRoutines: WorkspaceItem[];
  activeRoutineProgress: DashboardRoutineProgress[];
  announcements: DashboardAnnouncement[];
  recentRir: DashboardRirActivity[];
}

export interface DashboardRoutineProgress {
  id: string;
  title: string;
  clientName: string;
  progress: number;
  daysRemaining: number;
}

export interface DashboardAnnouncement {
  id: string;
  title: string;
  message: string;
}

export interface DashboardRirActivity {
  sessionId: string;
  clientId: string;
  clientName: string;
  dayName: string;
  sessionDate: string;
  updatedAt?: string | null;
  rirEntriesCount: number;
  exerciseNames: string[];
}

@Injectable({ providedIn: 'root' })
export class CoachDataService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly currentProfileState = signal<CoachProfile | null>(null);

  readonly currentProfile = this.currentProfileState.asReadonly();

  async getProfile(coachId: string, options: { setCurrent?: boolean } = {}): Promise<CoachProfile> {
    const { data, error } = await this.supabase
      .from('coaches')
      .select('id,name,email,phone,logo_url,brand_color,role,account_type,coach_plan,next_plan_payment_date')
      .eq('id', coachId)
      .single();

    if (error) throw error;
    const profile: CoachProfile = {
      id: data.id,
      name: data.name || 'Coach',
      email: data.email || '',
      phone: data.phone,
      logoUrl: data.logo_url,
      brandColor: data.brand_color || DEFAULT_BRAND_COLOR,
      role: data.role || 'coach',
      accountType: data.account_type || 'independent',
      coachPlan: data.coach_plan === 'paid' ? 'paid' : 'standard',
      nextPlanPaymentDate: data.next_plan_payment_date
    };
    if (options.setCurrent !== false) this.currentProfileState.set(profile);
    return profile;
  }

  async updateProfile(coachId: string, update: CoachProfileUpdate): Promise<CoachProfile> {
    const { error } = await this.supabase
      .from('coaches')
      .update({
        name: update.name.trim(),
        phone: update.phone.trim() || null,
        brand_color: update.brandColor,
        ...(update.logoUrl !== undefined ? { logo_url: update.logoUrl } : {}),
        updated_at: new Date().toISOString()
      })
      .eq('id', coachId);

    if (error) throw error;
    return this.getProfile(coachId);
  }

  async uploadCoachLogo(coachId: string, file: File): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `coaches/${coachId}/logo/${Date.now()}_${safeName}`;
    const { data, error } = await this.supabase.storage.from('assets').upload(path, file, {
      upsert: true,
      contentType: file.type
    });

    if (error) throw error;
    return this.supabase.storage.from('assets').getPublicUrl(data.path).data.publicUrl;
  }

  async deleteCurrentCoachAccount(): Promise<void> {
    // The original deployed backend has no safe self-service account-deletion endpoint.
    // Fail before touching profile data or Storage rather than leave a partially deleted account.
    throw new Error('La eliminación automática de cuentas no está disponible. Solicita la eliminación a administración.');
  }

  async getDashboard(coachId: string): Promise<DashboardData> {
    const [coach, clients, routines, exercises, measurements] = await Promise.all([
      this.getProfile(coachId),
      this.loadClients(coachId),
      this.loadRoutines(coachId),
      this.getExercises(coachId),
      this.loadMeasurements(coachId)
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [announcements, recentRir] = await Promise.all([
      this.loadDashboardAnnouncements(coach).catch(() => []),
      hasActiveIndependentPro(coach)
        ? this.loadRecentRir(coachId).catch(() => [])
        : Promise.resolve([])
    ]);

    const clientNames = new Map(clients.map(client => [client.id, client.title]));
    const activeRoutineProgress: DashboardRoutineProgress[] = routines
      .filter(routine => routine.status === 'Activa' && routine.daysRemaining != null)
      .map(routine => ({
        id: routine.id,
        title: routine.title,
        clientName: clientNames.get(routine.parentId || '') || 'Cliente',
        progress: routine.progress ?? 0,
        daysRemaining: routine.daysRemaining ?? 0
      }))
      .sort((first, second) => first.daysRemaining - second.daysRemaining);

    return {
      coach,
      clients: clients.length,
      routines: routines.length,
      activeRoutines: activeRoutineProgress.length,
      newClientsThisMonth: clients.filter((client) => this.isOnOrAfter(client.date, startOfMonth)).length,
      newRoutinesThisMonth: routines.filter((routine) => this.isOnOrAfter(routine.date, startOfMonth)).length,
      exercises: exercises.length,
      measurements: measurements.length,
      recentRoutines: routines.slice(0, 4),
      activeRoutineProgress,
      announcements,
      recentRir
    };
  }

  loadWorkspace(kind: WorkspaceKind, coachId: string, gymId?: string): Promise<WorkspaceItem[]> {
    switch (kind) {
      case 'clients': return this.loadClients(coachId, gymId);
      case 'routines': return this.loadRoutines(coachId, gymId);
      case 'exercises': return this.loadExerciseWorkspace(coachId);
      case 'measurements': return this.loadMeasurements(coachId, gymId);
    }
  }

  private async loadClients(coachId: string, gymId?: string): Promise<WorkspaceItem[]> {
    if (gymId) {
      const { data, error } = await this.supabase
        .from('client_gym_memberships')
        .select('id,joined_at,subscription_status,clients(id,name,email,phone,birth_date,goal)')
        .eq('gym_id', gymId)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return (data || []).flatMap((membership: any): WorkspaceItem[] => {
        const row = Array.isArray(membership.clients) ? membership.clients[0] : membership.clients;
        if (!row) return [];
        return [{
          id: row.id,
          title: row.name || 'Cliente sin nombre',
          subtitle: row.goal || 'Objetivo por definir',
          detail: row.email || 'Sin correo registrado',
          status: membership.subscription_status === 'active' ? 'Activo' : 'Pendiente',
          date: membership.joined_at,
          birthDate: row.birth_date,
          phone: row.phone
        }];
      });
    }
    const { data, error } = await this.supabase
      .from('clients')
      .select('id,name,email,phone,birth_date,goal,created_at')
      .eq('primary_coach_id', coachId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      title: row.name || 'Cliente sin nombre',
      subtitle: row.goal || 'Objetivo por definir',
      detail: row.email || 'Sin correo registrado',
      status: 'Activo',
      date: row.created_at,
      birthDate: row.birth_date,
      phone: row.phone
    }));
  }

  async getRoutinePdfContext(clientId: string, coachId: string, gymId?: string): Promise<RoutinePdfContext> {
    const [client, coachResult, gymResult] = await Promise.all([
      this.getClient(clientId, coachId, gymId),
      this.supabase.from('coaches').select('name,email,logo_url,brand_color').eq('id', coachId).single(),
      gymId
        ? this.supabase.from('gyms').select('name,logo_url,brand_color').eq('id', gymId).single()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (coachResult.error) throw coachResult.error;
    if (gymResult.error) throw gymResult.error;
    const coach = coachResult.data;
    const gym = gymResult.data;
    return {
      client,
      coach: {
        name: gym?.name || coach.name, email: coach.email,
        logoUrl: gym?.logo_url || coach.logo_url,
        // Use the stored value: the PDF's original default is black, independent of the app theme.
        brandColor: gym?.brand_color || coach.brand_color
      }
    };
  }

  async getClient(clientId: string, coachId: string, gymId?: string): Promise<ClientRecord> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    const { data, error } = await this.supabase
      .from('clients')
      .select('id,name,email,phone,birth_date,age,weight,height,goal,notes,address,portal_status,portal_invited_at,created_at')
      .eq('id', clientId)
      .match(gymId ? {} : { primary_coach_id: coachId })
      .single();

    if (error) throw error;
    return {
      ...this.mapClient(data),
      gymMembershipId: membership?.id || null,
      membershipPlanId: membership?.membership_plan_id || null,
      ...(membership ? {
        portalStatus: membership.portal_status,
        portalInvitedAt: membership.portal_invited_at
      } : {})
    };
  }

  async createClient(coachId: string, input: ClientInput, gymId?: string): Promise<string> {
    await this.assertClientEmailAvailable(input.email);
    const email = input.email.trim().toLocaleLowerCase('es');
    if (gymId) {
      await this.assertGymClientManager(gymId);
      if (input.membershipPlanId) {
        await this.assertGymBillingManager(gymId);
        await this.assertGymPlan(gymId, input.membershipPlanId);
      }
    }
    const clientId = crypto.randomUUID();
    const { error } = await this.supabase
      .from('clients')
      .insert({
        id: clientId,
        primary_coach_id: coachId,
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        birth_date: input.birthDate || null,
        age: this.calculateAge(input.birthDate),
        weight: input.weight ?? null,
        height: input.height ?? null,
        goal: input.goal.trim(),
        notes: input.notes?.trim() || null,
        address: input.address?.trim() || null
      });

    if (error) throw error;
    if (gymId) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);
      const { error: membershipError } = await this.supabase.from('client_gym_memberships').insert({
        client_id: clientId, gym_id: gymId, assigned_coach_id: coachId,
        membership_plan_id: input.membershipPlanId || null,
        next_payment_due_date: dueDate.toISOString(), subscription_status: 'pending', portal_status: 'pending'
      });
      if (membershipError) {
        // This is the original two-write flow; only compensate the new, unlinked client we created.
        const cleanup = await this.supabase.from('clients').delete().eq('id', clientId).eq('primary_coach_id', coachId).select('id');
        if (cleanup.error || !cleanup.data?.length) {
          throw new Error('El cliente se creó, pero no se pudo vincular al gimnasio. Solicita a administración revisar el registro antes de repetir.');
        }
        throw membershipError;
      }
    }
    return clientId;
  }

  async updateClient(clientId: string, coachId: string, input: ClientInput, gymId?: string): Promise<void> {
    await this.assertClientEmailAvailable(input.email, clientId);
    if (gymId) {
      await this.assertGymClientManager(gymId);
      await this.getGymMembership(gymId, clientId);
      if (input.membershipPlanId !== undefined) {
        await this.assertGymBillingManager(gymId);
        if (input.membershipPlanId) await this.assertGymPlan(gymId, input.membershipPlanId);
      }
    }
    const { data, error } = await this.supabase
      .from('clients')
      .update({
        name: input.name.trim(),
        email: input.email.trim().toLocaleLowerCase('es'),
        phone: input.phone?.trim() || null,
        birth_date: input.birthDate || null,
        age: this.calculateAge(input.birthDate),
        weight: input.weight ?? null,
        height: input.height ?? null,
        goal: input.goal.trim(),
        notes: input.notes?.trim() || null,
        address: input.address?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', clientId)
      .match(gymId ? {} : { primary_coach_id: coachId })
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos guardar el cliente. Comprueba tus permisos y que el registro siga disponible.');
    if (gymId && input.membershipPlanId !== undefined) {
      const { data: planRows, error: planError } = await this.supabase.from('client_gym_memberships')
        .update({ membership_plan_id: input.membershipPlanId || null, updated_at: new Date().toISOString() })
        .eq('gym_id', gymId).eq('client_id', clientId).select('id');
      if (planError) throw planError;
      if (!planRows?.length) throw new Error('El perfil se guardó, pero no pudimos actualizar su plan de membresía. Comprueba tus permisos.');
    }
  }

  async deleteClient(clientId: string, coachId: string, gymId?: string): Promise<void> {
    if (!coachId) throw new Error('No hay una sesión activa.');
    if (gymId) {
      await this.assertGymClientManager(gymId);
      const membership = await this.getGymMembership(gymId, clientId);
      // Older schemas set routine/measurement membership references to NULL on removal.
      // Keep those records scoped by deleting only this membership's dependent data first.
      const tables = ['training_sessions', 'routines', 'competitor_sheets', 'measurements'] as const;
      const dependencies = await Promise.all(tables.map(async (table) => {
        const result = await this.supabase.from(table).select(table === 'routines' || table === 'competitor_sheets' ? 'id,coach_id' : 'id')
          .eq('client_gym_membership_id', membership.id);
        if (result.error) throw result.error;
        return { table, rows: (result.data || []) as unknown as { id: string; coach_id?: string }[] };
      }));
      const admin = await this.supabase.rpc('is_admin');
      if (admin.error) throw admin.error;
      if (!admin.data && dependencies.some(({ rows }) => rows.some((row) => row.coach_id && row.coach_id !== coachId))) {
        throw new Error('Este cliente tiene rutinas de otro entrenador. Solicita a administración retirarlo del gimnasio.');
      }
      for (const { table, rows } of dependencies) {
        if (!rows.length) continue;
        const removed = await this.supabase.from(table).delete().eq('client_gym_membership_id', membership.id).in('id', rows.map((row) => row.id)).select('id');
        if (removed.error) throw removed.error;
        if (removed.data?.length !== rows.length) throw new Error('No pudimos retirar todos los datos del cliente. Comprueba tus permisos antes de repetir.');
      }
      const { data, error } = await this.supabase.from('client_gym_memberships').delete()
        .eq('id', membership.id).eq('gym_id', gymId).eq('client_id', clientId).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('No tienes permiso para retirar este cliente del gimnasio.');
      // Never infer global orphanhood from an RLS-filtered membership count.
      // The base client and Auth identity may still belong to another coach or gym.
      return;
    }
    const { error } = await this.supabase.rpc('delete_owned_independent_client', {
      p_client_id: clientId
    });
    if (error) throw error;
  }

  private async assertGymBillingManager(gymId: string): Promise<void> {
    const [admin, owner] = await Promise.all([
      this.supabase.rpc('is_admin'), this.supabase.rpc('is_gym_owner', { p_gym_id: gymId })
    ]);
    if (admin.error) throw admin.error;
    if (owner.error) throw owner.error;
    if (!admin.data && !owner.data) throw new Error('Solo el propietario o administración puede cambiar el plan de membresía.');
  }

  private async assertGymClientManager(gymId: string): Promise<void> {
    const permission = await this.supabase.rpc('can_manage_clients', { p_gym_id: gymId });
    if (permission.error) throw permission.error;
    if (!permission.data) throw new Error('No tienes permiso para gestionar clientes en este gimnasio.');
  }

  private async assertGymPlan(gymId: string, planId: string): Promise<void> {
    const plan = await this.supabase.from('membership_plans').select('id').eq('id', planId).eq('gym_id', gymId).maybeSingle();
    if (plan.error) throw plan.error;
    if (!plan.data) throw new Error('El plan de membresía no pertenece a este gimnasio.');
  }

  async getClientRoutines(clientId: string, coachId: string, gymId?: string): Promise<ClientRoutine[]> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let query = this.supabase
      .from('routines')
      .select('id,coach_id,name,objective,training_days_count,duration_weeks,start_date,end_date,notes,created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    query = membership
      ? query.eq('client_gym_membership_id', membership.id)
      : query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      coachId: row.coach_id,
      name: row.name,
      objective: row.objective,
      trainingDaysCount: row.training_days_count,
      durationWeeks: row.duration_weeks,
      startDate: row.start_date,
      endDate: row.end_date,
      notes: row.notes,
      createdAt: row.created_at
    }));
  }

  async deleteClientRoutine(clientId: string, coachId: string, routineId: string, gymId?: string): Promise<void> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let query = this.supabase.from('routines').delete().eq('id', routineId).eq('client_id', clientId);
    query = membership
      ? query.eq('client_gym_membership_id', membership.id)
      : query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos eliminar el registro. Comprueba tus permisos.');
  }

  async getClientMeasurements(clientId: string, gymId?: string): Promise<ClientMeasurement[]> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let query = this.supabase.from('measurements').select('*').eq('client_id', clientId).order('date', { ascending: false });
    query = membership
      ? query.eq('client_gym_membership_id', membership.id)
      : query.is('client_gym_membership_id', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id, date: row.date, weight: row.weight, height: row.height, bmi: row.bmi,
      bodyFatPercentage: row.body_fat_percentage, muscleMass: row.muscle_mass,
      visceralFat: row.visceral_fat, metabolicAge: row.metabolic_age, calories: row.calories,
      boneMass: row.bone_mass, waterPercentage: row.water_percentage, waist: row.waist,
      hips: row.hips, chest: row.chest, arms: row.arms, legs: row.legs, calf: row.calf,
      thigh: row.thigh, notes: row.notes, createdAt: row.created_at
    }));
  }

  async saveClientMeasurement(clientId: string, input: ClientMeasurementInput, measurementId?: string, gymId?: string): Promise<void> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    const bmi = Number((input.weight / ((input.height / 100) ** 2)).toFixed(1));
    const payload = {
      client_id: clientId, client_gym_membership_id: membership?.id || null,
      date: input.date, weight: input.weight, height: input.height, bmi,
      body_fat_percentage: input.bodyFatPercentage ?? null, muscle_mass: input.muscleMass ?? null,
      visceral_fat: input.visceralFat ?? null, metabolic_age: input.metabolicAge ?? null,
      calories: input.calories ?? null, bone_mass: input.boneMass ?? null,
      water_percentage: input.waterPercentage ?? null, waist: input.waist ?? null,
      hips: input.hips ?? null, chest: input.chest ?? null, arms: input.arms ?? null,
      legs: input.legs ?? null, calf: input.calf ?? null, thigh: input.thigh ?? null,
      notes: input.notes?.trim() || null
    };
    let query = measurementId
      ? this.supabase.from('measurements').update(payload).eq('id', measurementId).eq('client_id', clientId)
      : this.supabase.from('measurements').insert(payload);
    if (measurementId) query = membership ? query.eq('client_gym_membership_id', membership.id) : query.is('client_gym_membership_id', null);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos guardar la medición. Comprueba tus permisos.');
  }

  async deleteClientMeasurement(clientId: string, measurementId: string, gymId?: string): Promise<void> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let query = this.supabase.from('measurements').delete().eq('id', measurementId).eq('client_id', clientId);
    query = membership
      ? query.eq('client_gym_membership_id', membership.id)
      : query.is('client_gym_membership_id', null);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos eliminar el registro. Comprueba tus permisos.');
  }

  async getCompetitorSheets(clientId: string, coachId: string, gymId?: string): Promise<CompetitorSheetRecord[]> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let query = this.supabase.from('competitor_sheets').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    query = membership
      ? query.eq('client_gym_membership_id', membership.id)
      : query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id, coachId: row.coach_id, programTitle: row.program_title, mesocycleTitle: row.mesocycle_title,
      macrocycleTitle: row.macrocycle_title, frequencyText: row.frequency_text,
      splitText: row.split_text, trainingDaysText: row.training_days_text,
      workouts: row.workouts || [], createdAt: row.created_at
    }));
  }

  async deleteCompetitorSheet(clientId: string, coachId: string, sheetId: string, gymId?: string): Promise<void> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let query = this.supabase.from('competitor_sheets').delete().eq('id', sheetId).eq('client_id', clientId);
    query = membership
      ? query.eq('client_gym_membership_id', membership.id)
      : query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos eliminar el registro. Comprueba tus permisos.');
  }

  async getTrainingHistory(clientId: string, coachId: string, gymId?: string): Promise<TrainingSessionRecord[]> {
    const membership = gymId ? await this.getGymMembership(gymId, clientId) : null;
    let sessionsQuery = this.supabase
      .from('training_sessions')
      .select('id,routine_day_id,session_date,status,started_at,updated_at')
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .limit(20);
    sessionsQuery = membership
      ? sessionsQuery.eq('client_gym_membership_id', membership.id)
      : sessionsQuery.eq('coach_id', coachId).is('client_gym_membership_id', null);
    const { data: sessions, error } = await sessionsQuery;
    if (error) throw error;
    if (!sessions?.length) return [];
    const routineDayIds = [...new Set(sessions.map((session) => session.routine_day_id).filter(Boolean))];
    const [{ data: sets, error: setsError }, { data: days, error: daysError }] = await Promise.all([
      this.supabase
        .from('training_session_sets')
        .select('id,training_session_id,routine_day_id,exercise_name,exercise_order,set_number,actual_reps,rir,load,load_unit')
        .in('training_session_id', sessions.map((session) => session.id))
        .order('exercise_order', { ascending: true })
        .order('set_number', { ascending: true }),
      routineDayIds.length
        ? this.supabase.from('routine_days').select('id,day_name,day_number').in('id', routineDayIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (setsError) throw setsError;
    if (daysError) throw daysError;

    const dayById = new Map((days || []).map((day) => [day.id, day]));
    const sessionsById = new Map(sessions.map((session) => [session.id, session]));
    const historyByDate = new Map<string, TrainingSessionRecord>();

    for (const set of sets || []) {
      if (set.actual_reps == null && set.rir == null && set.load == null) continue;
      const session = sessionsById.get(set.training_session_id);
      if (!session) continue;
      const existing: TrainingSessionRecord = historyByDate.get(session.session_date) || {
        id: `day:${session.session_date}`,
        sessionDate: session.session_date,
        status: 'completed' as const,
        sets: []
      };
      if (session.status !== 'completed') existing.status = 'in_progress';
      const day = dayById.get(set.routine_day_id);
      existing.sets.push({
        id: set.id,
        routineDayId: set.routine_day_id,
        routineDayName: day?.day_name,
        routineDayNumber: day?.day_number,
        exerciseName: set.exercise_name,
        exerciseOrder: set.exercise_order,
        setNumber: set.set_number,
        actualReps: set.actual_reps,
        rir: set.rir,
        load: set.load,
        loadUnit: set.load_unit || 'kg'
      });
      historyByDate.set(session.session_date, existing);
    }

    return [...historyByDate.values()]
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .map((session) => ({
        ...session,
        sets: session.sets.sort((a, b) =>
          (a.routineDayNumber ?? 0) - (b.routineDayNumber ?? 0)
          || a.exerciseOrder - b.exerciseOrder
          || a.setNumber - b.setNumber)
      }));
  }

  private mapClient(row: any): ClientRecord {
    return {
      id: row.id, name: row.name || 'Cliente sin nombre', email: row.email || '', phone: row.phone,
      birthDate: row.birth_date, age: row.age || this.calculateAge(row.birth_date), weight: row.weight,
      height: row.height, goal: row.goal || '', notes: row.notes, address: row.address,
      portalStatus: row.portal_status, portalInvitedAt: row.portal_invited_at, createdAt: row.created_at
    };
  }

  private calculateAge(birthDate: string | null | undefined): number {
    if (!birthDate) return 0;
    const birthday = new Date(`${birthDate}T12:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birthday.getFullYear();
    const month = today.getMonth() - birthday.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) age -= 1;
    return Math.max(0, age);
  }

  private async assertClientEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const normalized = email.trim().toLocaleLowerCase('es');
    const [coaches, clients] = await Promise.all([
      this.supabase.from('coaches').select('id').ilike('email', normalized).limit(1),
      this.supabase.from('clients').select('id').ilike('email', normalized)
    ]);
    if (coaches.error) throw coaches.error;
    if (clients.error) throw clients.error;
    const duplicateClient = (clients.data || []).some((row) => row.id !== excludeId);
    if ((coaches.data?.length || 0) > 0 || duplicateClient) throw new Error('Ese correo ya está registrado en la plataforma.');
  }

  private async loadRoutines(coachId: string, gymId?: string): Promise<WorkspaceItem[]> {
    let query = this.supabase
      .from('routines')
      .select('id,client_id,name,objective,training_days_count,duration_weeks,start_date,end_date,created_at')
      .order('created_at', { ascending: false });
    if (gymId) {
      const memberships = await this.getGymMemberships(gymId);
      if (!memberships.length) return [];
      query = query.in('client_gym_membership_id', memberships.map((membership) => membership.id));
    } else {
      query = query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    }
    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map((row) => {
      const timing = this.routineTiming(row.start_date, row.end_date, row.duration_weeks, row.created_at);
      return {
        id: row.id,
        parentId: row.client_id,
        title: row.name || 'Rutina sin nombre',
        subtitle: row.objective || 'Objetivo general',
        detail: `${row.training_days_count || 0} días por semana, ${row.duration_weeks || 0} semanas`,
        status: timing.active ? 'Activa' : 'Finalizada',
        progress: timing.progress,
        daysRemaining: timing.daysRemaining,
        date: row.created_at
      };
    });
  }

  async getExercises(coachId: string, gymId?: string): Promise<ExerciseItem[]> {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('id,coach_id,gym_id,name,muscle_group,source,image_url,video_url,description,created_at')
      .or(gymId ? `source.eq.global,and(source.eq.coach,gym_id.eq.${gymId})` : `source.eq.global,and(source.eq.coach,coach_id.eq.${coachId},gym_id.is.null)`)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      coachId: row.coach_id,
      name: row.name || 'Ejercicio sin nombre',
      muscleGroup: row.muscle_group || 'Full Body',
      source: row.source === 'coach' ? 'coach' : 'global',
      imageUrl: row.image_url,
      videoUrl: row.video_url,
      description: row.description,
      createdAt: row.created_at
    }));
  }

  async getCoachExercise(exerciseId: string, coachId: string, gymId?: string): Promise<ExerciseItem> {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('id,coach_id,gym_id,name,muscle_group,source,image_url,video_url,description,created_at')
      .eq('id', exerciseId)
      .eq('source', 'coach')
      .eq('coach_id', coachId)
      .or(gymId ? `gym_id.eq.${gymId}` : 'gym_id.is.null')
      .single();

    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      muscleGroup: data.muscle_group,
      source: 'coach',
      imageUrl: data.image_url,
      videoUrl: data.video_url,
      description: data.description,
      createdAt: data.created_at
    };
  }

  async createCoachExercise(coachId: string, input: ExerciseInput, gymId?: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('exercises')
      .insert({
        coach_id: coachId,
        gym_id: gymId || null,
        source: 'coach',
        name: input.name.trim(),
        muscle_group: input.muscleGroup,
        image_url: input.imageUrl || null,
        video_url: input.videoUrl?.trim() || null,
        description: input.description?.trim() || null
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async updateCoachExercise(exerciseId: string, coachId: string, input: ExerciseInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('exercises')
      .update({
        name: input.name.trim(),
        muscle_group: input.muscleGroup,
        image_url: input.imageUrl || null,
        video_url: input.videoUrl?.trim() || null,
        description: input.description?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', exerciseId)
      .eq('source', 'coach')
      .eq('coach_id', coachId)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos guardar el ejercicio. Comprueba tus permisos y que el registro siga disponible.');
  }

  async deleteCoachExercise(exerciseId: string, coachId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('exercises')
      .delete()
      .eq('id', exerciseId)
      .eq('source', 'coach')
      .eq('coach_id', coachId)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No pudimos eliminar el ejercicio. Comprueba tus permisos y que el registro siga disponible.');
  }

  private async loadExerciseWorkspace(coachId: string): Promise<WorkspaceItem[]> {
    const exercises = await this.getExercises(coachId);
    return exercises.map((exercise) => ({
      id: exercise.id,
      title: exercise.name,
      subtitle: exercise.muscleGroup,
      detail: exercise.description || 'Sin descripción',
      status: exercise.source === 'global' ? 'Global' : 'Personal',
      date: exercise.createdAt
    }));
  }

  private async loadMeasurements(coachId: string, gymId?: string): Promise<WorkspaceItem[]> {
    if (gymId) {
      const memberships = await this.getGymMemberships(gymId);
      if (!memberships.length) return [];
      const clientIds = [...new Set(memberships.map((membership) => membership.client_id))];
      const { data: clients, error: clientsError } = await this.supabase
        .from('clients').select('id,name').in('id', clientIds);
      if (clientsError) throw clientsError;
      const names = new Map((clients || []).map((client) => [client.id, client.name]));
      const { data, error } = await this.supabase
        .from('measurements')
        .select('id,client_id,date,weight,height,bmi,created_at')
        .in('client_gym_membership_id', memberships.map((membership) => membership.id))
        .order('date', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        parentId: row.client_id,
        title: names.get(row.client_id) || 'Cliente',
        subtitle: row.date ? new Date(row.date).toLocaleDateString('es-CR') : 'Fecha sin registrar',
        detail: `${row.weight ?? '-'} kg, IMC ${row.bmi ?? '-'}`,
        status: 'Registrada',
        date: row.created_at
      }));
    }
    const { data: clients, error: clientsError } = await this.supabase
      .from('clients')
      .select('id,name')
      .eq('primary_coach_id', coachId);

    if (clientsError) throw clientsError;
    if (!clients?.length) return [];

    const names = new Map(clients.map((client) => [client.id, client.name]));
    const { data, error } = await this.supabase
      .from('measurements')
      .select('id,client_id,date,weight,height,bmi,created_at')
      .in('client_id', clients.map((client) => client.id))
      .order('date', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      parentId: row.client_id,
      title: names.get(row.client_id) || 'Cliente',
      subtitle: row.date ? new Date(row.date).toLocaleDateString('es-CR') : 'Fecha sin registrar',
      detail: `${row.weight ?? '-'} kg, IMC ${row.bmi ?? '-'}`,
      status: 'Registrada',
      date: row.created_at
    }));
  }

  private async loadDashboardAnnouncements(coach: CoachProfile): Promise<DashboardAnnouncement[]> {
    const { data, error } = await this.supabase
      .from('coach_announcements')
      .select('id,title,message,audience,active,starts_at,ends_at')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    const now = Date.now();
    const hasPaidAccess = coach.accountType === 'gym' || hasActiveIndependentPro(coach);
    // Admins can read every announcement through RLS; their dashboard must still
    // apply the same schedule and audience rules as the original application.
    return (data || []).filter((announcement) => {
      if (!announcement.active) return false;
      const startsAt = announcement.starts_at ? new Date(announcement.starts_at).getTime() : NaN;
      const endsAt = announcement.ends_at ? new Date(announcement.ends_at).getTime() : NaN;
      if (startsAt > now || endsAt < now) return false;
      if (announcement.audience === 'all') return true;
      if (announcement.audience === 'paid') return hasPaidAccess;
      return coach.accountType === 'independent' && !hasPaidAccess;
    }).map(({ id, title, message }) => ({ id, title, message }));
  }

  async getGymMembership(gymId: string, clientId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('client_gym_memberships')
      .select('id,client_id,gym_id,assigned_coach_id,membership_plan_id,portal_status,portal_invited_at,subscription_status')
      .eq('gym_id', gymId)
      .eq('client_id', clientId)
      .single();
    if (error) throw error;
    return data;
  }

  private async getGymMemberships(gymId: string): Promise<Array<{ id: string; client_id: string }>> {
    const { data, error } = await this.supabase
      .from('client_gym_memberships')
      .select('id,client_id')
      .eq('gym_id', gymId);
    if (error) throw error;
    return data || [];
  }

  private async loadRecentRir(coachId: string): Promise<DashboardRirActivity[]> {
    const { data: sessions, error: sessionsError } = await this.supabase
      .from('training_sessions')
      .select('id,client_id,routine_day_id,session_date,updated_at')
      .eq('coach_id', coachId)
      .eq('portal_scope', 'independent')
      .is('client_gym_membership_id', null)
      .order('updated_at', { ascending: false })
      .limit(6);
    if (sessionsError) throw sessionsError;
    if (!sessions?.length) return [];

    const sessionIds = sessions.map((session) => session.id);
    const clientIds = [...new Set(sessions.map((session) => session.client_id).filter(Boolean))];
    const dayIds = [...new Set(sessions.map((session) => session.routine_day_id).filter(Boolean))];
    const [setsResult, clientsResult, daysResult] = await Promise.all([
      this.supabase.from('training_session_sets').select('training_session_id,exercise_name,rir').in('training_session_id', sessionIds).not('rir', 'is', null),
      this.supabase.from('clients').select('id,name').in('id', clientIds),
      this.supabase.from('routine_days').select('id,day_name,day_number').in('id', dayIds)
    ]);
    if (setsResult.error) throw setsResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (daysResult.error) throw daysResult.error;

    const clientNames = new Map((clientsResult.data || []).map((row) => [row.id, row.name]));
    const days = new Map((daysResult.data || []).map((row) => [row.id, row.day_name || `Día ${row.day_number || ''}`.trim()]));
    const summaries = new Map<string, { count: number; exercises: string[] }>();
    for (const row of setsResult.data || []) {
      const summary = summaries.get(row.training_session_id) || { count: 0, exercises: [] };
      summary.count += 1;
      if (row.exercise_name && !summary.exercises.includes(row.exercise_name)) summary.exercises.push(row.exercise_name);
      summaries.set(row.training_session_id, summary);
    }

    return sessions.flatMap((session) => {
      const summary = summaries.get(session.id);
      if (!summary?.count) return [];
      return [{
        sessionId: session.id,
        clientId: session.client_id,
        clientName: clientNames.get(session.client_id) || 'Cliente',
        dayName: days.get(session.routine_day_id) || 'Entrenamiento',
        sessionDate: session.session_date,
        updatedAt: session.updated_at,
        rirEntriesCount: summary.count,
        exerciseNames: summary.exercises.slice(0, 3)
      }];
    });
  }

  private isOnOrAfter(value: string | null | undefined, minimum: Date): boolean {
    if (!value) return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.getTime() >= minimum.getTime();
  }

  private routineTiming(
    startDate: string | null,
    endDate: string | null,
    durationWeeks: number,
    createdAt: string
  ): { active: boolean; progress: number; daysRemaining: number } {
    const dayMs = 86_400_000;
    const start = Date.parse(`${(startDate || createdAt).slice(0, 10)}T00:00:00Z`);
    const fallbackStart = Number.isFinite(start) ? start : Date.now();
    const recordedEnd = endDate ? Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`) : NaN;
    const end = Number.isFinite(recordedEnd)
      ? recordedEnd
      : fallbackStart + Math.max(1, durationWeeks || 4) * 7 * dayMs;
    const today = Date.parse(`${localCalendarDate()}T00:00:00Z`);
    const duration = Math.max(dayMs, end - fallbackStart);
    return {
      active: end >= today,
      progress: Math.round(Math.min(100, Math.max(0, (today - fallbackStart) / duration * 100))),
      daysRemaining: Math.max(0, Math.ceil((end - today) / dayMs))
    };
  }
}
