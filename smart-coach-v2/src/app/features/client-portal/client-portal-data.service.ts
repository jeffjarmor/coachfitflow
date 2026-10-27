import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { hasActiveIndependentPro } from '../../core/data/plan-access';
import type { RoutinePdfContext } from '../routines/routine-pdf.models';

export interface ClientPortalContext {
  key: string;
  scope: 'independent' | 'gym';
  clientId: string;
  membershipId: string | null;
  label: string;
  available: boolean;
}

export interface ClientPortalRoutine {
  id: string;
  name: string;
  objective: string;
  trainingDaysCount: number;
  durationWeeks: number;
  startDate: string | null;
  endDate: string | null;
}

export interface ClientPortalMeasurement {
  id: string;
  date: string;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
  visceralFat: number | null;
  metabolicAge: number | null;
  calories: number | null;
  boneMass: number | null;
  waterPercentage: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  arms: number | null;
  legs: number | null;
  calf: number | null;
  thigh: number | null;
  notes: string | null;
}

export interface ClientPortalOverview {
  clientName: string;
  goal: string | null;
  routines: ClientPortalRoutine[];
  measurements: ClientPortalMeasurement[];
}

export interface ClientPortalWeekConfig {
  startWeek: number;
  endWeek: number;
  sets: number;
  reps: string;
  rest: string;
  notes: string | null;
}

export interface ClientPortalExercise {
  id: string;
  exerciseId: string;
  order: number;
  name: string;
  muscleGroup: string | null;
  source?: 'global' | 'coach' | null;
  imageUrl?: string | null;
  sets: number;
  reps: string;
  rest: string;
  notes: string | null;
  blockType: string;
  blockLabel: string | null;
  blockPosition: number | null;
  blockRest: string | null;
  isSuperset?: boolean;
  videoUrl: string | null;
  weekConfigs: ClientPortalWeekConfig[];
}

export interface ClientPortalDay {
  id: string;
  number: number;
  name: string;
  muscleGroups: string[];
  notes: string | null;
  exercises: ClientPortalExercise[];
}

export interface ClientPortalRoutineDetail extends ClientPortalRoutine {
  notes: string | null;
  warmupEnabled: boolean;
  warmupCustomText: string | null;
  warmupExercises?: { exerciseId: string; exerciseName: string }[];
  days: ClientPortalDay[];
}

export interface ClientPortalTrainingSet {
  id: string | null;
  sessionId: string;
  exerciseOrder: number;
  setNumber: number;
  actualReps: number | null;
  rir: number | null;
  load: number | null;
  loadUnit: string;
}

export interface ClientPortalTrainingDayState {
  sessionId: string;
  status: 'in_progress' | 'completed';
  sets: ClientPortalTrainingSet[];
}

export interface ClientPortalTrainingSetInput {
  actualReps: number | null;
  rir: number | null;
  load: number | null;
}

export interface ClientPortalHistorySet {
  id: string;
  setNumber: number;
  plannedReps: string | null;
  actualReps: number | null;
  rir: number | null;
  load: number | null;
  loadUnit: string;
  notes: string | null;
}

export interface ClientPortalHistoryExercise {
  name: string;
  order: number;
  sets: ClientPortalHistorySet[];
}

export interface ClientPortalHistorySession {
  id: string;
  routineId: string;
  routineName: string;
  dayName: string;
  sessionDate: string;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string | null;
  exercises: ClientPortalHistoryExercise[];
}

export interface ClientPortalPayment {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  dueDate: string;
  paidDate: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
}

export interface ClientPortalBilling {
  planName: string | null;
  planDescription: string | null;
  planPrice: number | null;
  currency: string;
  nextDueDate: string | null;
  subscriptionStatus: 'active' | 'inactive' | 'pending' | 'overdue';
  payments: ClientPortalPayment[];
}

export interface ClientPortalProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  age: number;
  address: string | null;
  notes: string | null;
  goal: string | null;
  createdAt: string;
}

export interface ClientPortalProfileInput {
  name: string;
  phone: string;
  birthDate: string | null;
  address: string;
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class ClientPortalDataService {
  private readonly supabase = inject(SupabaseService).client;
  private activationRequest: Promise<void> | null = null;
  private readonly sessionRequests = new Map<string, Promise<string>>();

  activateLinkedAccesses(): Promise<void> {
    if (this.activationRequest) return this.activationRequest;
    this.activationRequest = (async () => {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw error;
      const userId = data.session?.user.id;
      if (!userId) return;
      const [independent, gym] = await Promise.all([
        this.supabase.from('independent_client_portal_access').select('client_id').eq('user_id', userId),
        this.supabase.from('client_portal_access').select('client_gym_membership_id').eq('user_id', userId)
      ]);
      if (independent.error) throw independent.error;
      if (gym.error) throw gym.error;
      const pending = { portal_status: 'active', updated_at: new Date().toISOString() };
      const clientIds = (independent.data ?? []).map(row => row.client_id);
      const membershipIds = (gym.data ?? []).map(row => row.client_gym_membership_id);
      // Original REST contract, limited to links already visible for this user.
      // RLS may leave a gym invitation pending; that never blocks portal access.
      const updates = await Promise.all([
        clientIds.length
          ? this.supabase.from('clients').update(pending).in('id', clientIds).eq('user_id', userId).eq('portal_status', 'pending')
          : Promise.resolve({ error: null }),
        membershipIds.length
          ? this.supabase.from('client_gym_memberships').update(pending).in('id', membershipIds).eq('portal_status', 'pending')
          : Promise.resolve({ error: null })
      ]);
      for (const result of updates) if (result.error) throw result.error;
    })().finally(() => { this.activationRequest = null; });
    return this.activationRequest;
  }

  async listContexts(userId: string): Promise<ClientPortalContext[]> {
    const [independentResult, gymResult] = await Promise.all([
      this.supabase.from('independent_client_portal_access')
        .select('client_id,coach_id,created_at').eq('user_id', userId).order('created_at'),
      this.supabase.from('client_portal_access')
        .select('client_gym_membership_id,created_at').eq('user_id', userId).order('created_at')
    ]);
    if (independentResult.error) throw independentResult.error;
    if (gymResult.error) throw gymResult.error;

    const independentRows = independentResult.data ?? [];
    const gymRows = gymResult.data ?? [];
    const coachIds = [...new Set(independentRows.map(row => row.coach_id).filter((id): id is string => !!id))];
    const membershipIds = gymRows.map(row => row.client_gym_membership_id).filter((id): id is string => !!id);

    const [coachesResult, membershipsResult] = await Promise.all([
      coachIds.length
        ? this.supabase.from('coaches').select('id,name,account_type,coach_plan,next_plan_payment_date').in('id', coachIds)
        : Promise.resolve({ data: [], error: null }),
      membershipIds.length
        ? this.supabase.from('client_gym_memberships').select('id,client_id,gym_id').in('id', membershipIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (coachesResult.error) throw coachesResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    const coachById = new Map((coachesResult.data ?? []).map(coach => [coach.id, coach]));
    const membershipById = new Map((membershipsResult.data ?? []).map(membership => [membership.id, membership]));
    const gymIds = [...new Set((membershipsResult.data ?? []).map(membership => membership.gym_id).filter((id): id is string => !!id))];
    const gymsResult = gymIds.length
      ? await this.supabase.from('gyms').select('id,name').in('id', gymIds)
      : { data: [], error: null };
    if (gymsResult.error) throw gymsResult.error;
    const gymById = new Map((gymsResult.data ?? []).map(gym => [gym.id, gym]));

    const independent: ClientPortalContext[] = independentRows.map(row => {
      const coach = row.coach_id ? coachById.get(row.coach_id) : null;
      return {
        key: `independent:${row.coach_id ?? ''}:${row.client_id}`,
        scope: 'independent',
        clientId: row.client_id,
        membershipId: null,
        label: coach?.name || 'Tu entrenador',
        available: !!coach && hasActiveIndependentPro({
          accountType: coach.account_type,
          coachPlan: coach.coach_plan,
          nextPlanPaymentDate: coach.next_plan_payment_date
        })
      };
    });

    const gym: ClientPortalContext[] = gymRows.flatMap(row => {
      const membership = membershipById.get(row.client_gym_membership_id);
      if (!membership) return [];
      return [{
        key: `gym:${membership.gym_id}:${membership.client_id}`,
        scope: 'gym' as const,
        clientId: membership.client_id,
        membershipId: membership.id,
        label: gymById.get(membership.gym_id)?.name || 'Tu gimnasio',
        available: true
      }];
    });

    return [...gym, ...independent];
  }

  initialContext(userId: string, contexts: ClientPortalContext[]): ClientPortalContext | null {
    const available = contexts.filter(context => context.available);
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem(`zummith-v2-portal-context:${userId}`)
      : null;
    return available.find(context => context.key === stored) ?? available[0] ?? null;
  }

  rememberContext(userId: string, context: ClientPortalContext): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`zummith-v2-portal-context:${userId}`, context.key);
    }
  }

  async getOverview(context: ClientPortalContext): Promise<ClientPortalOverview> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');

    let routinesQuery = this.supabase.from('routines')
      .select('id,name,objective,training_days_count,duration_weeks,start_date,end_date')
      .eq('client_id', context.clientId).order('created_at', { ascending: false });
    let measurementsQuery = this.supabase.from('measurements')
      .select('id,date,weight,body_fat_percentage,muscle_mass')
      .eq('client_id', context.clientId).order('date', { ascending: false }).limit(8);
    if (context.membershipId) {
      routinesQuery = routinesQuery.eq('client_gym_membership_id', context.membershipId);
      measurementsQuery = measurementsQuery.eq('client_gym_membership_id', context.membershipId);
    } else {
      routinesQuery = routinesQuery.is('client_gym_membership_id', null);
      measurementsQuery = measurementsQuery.is('client_gym_membership_id', null);
    }

    const [clientResult, routinesResult, measurementsResult] = await Promise.all([
      this.supabase.from('clients').select('name,goal').eq('id', context.clientId).single(),
      routinesQuery,
      measurementsQuery
    ]);
    if (clientResult.error) throw clientResult.error;
    if (routinesResult.error) throw routinesResult.error;
    if (measurementsResult.error) throw measurementsResult.error;

    return {
      clientName: clientResult.data.name,
      goal: clientResult.data.goal,
      routines: (routinesResult.data ?? []).map(row => ({
        id: row.id,
        name: row.name,
        objective: row.objective,
        trainingDaysCount: row.training_days_count,
        durationWeeks: row.duration_weeks,
        startDate: row.start_date,
        endDate: row.end_date
      })),
      measurements: (measurementsResult.data ?? []).map(row => ({
        id: row.id,
        date: row.date,
        weight: row.weight,
        height: null,
        bmi: null,
        bodyFatPercentage: row.body_fat_percentage,
        muscleMass: row.muscle_mass,
        visceralFat: null,
        metabolicAge: null,
        calories: null,
        boneMass: null,
        waterPercentage: null,
        waist: null,
        hips: null,
        chest: null,
        arms: null,
        legs: null,
        calf: null,
        thigh: null,
        notes: null
      }))
    };
  }

  async getMeasurements(context: ClientPortalContext): Promise<ClientPortalMeasurement[]> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');
    let query = this.supabase.from('measurements')
      .select('id,date,weight,height,bmi,body_fat_percentage,muscle_mass,visceral_fat,metabolic_age,calories,bone_mass,water_percentage,waist,hips,chest,arms,legs,calf,thigh,notes')
      .eq('client_id', context.clientId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    query = context.membershipId
      ? query.eq('client_gym_membership_id', context.membershipId)
      : query.is('client_gym_membership_id', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(row => ({
      id: row.id,
      date: row.date,
      weight: row.weight,
      height: row.height,
      bmi: row.bmi,
      bodyFatPercentage: row.body_fat_percentage,
      muscleMass: row.muscle_mass,
      visceralFat: row.visceral_fat,
      metabolicAge: row.metabolic_age,
      calories: row.calories,
      boneMass: row.bone_mass,
      waterPercentage: row.water_percentage,
      waist: row.waist,
      hips: row.hips,
      chest: row.chest,
      arms: row.arms,
      legs: row.legs,
      calf: row.calf,
      thigh: row.thigh,
      notes: row.notes
    }));
  }

  async getBilling(context: ClientPortalContext): Promise<ClientPortalBilling | null> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');
    if (!context.membershipId) return null;
    const { data: membership, error: membershipError } = await this.supabase
      .from('client_gym_memberships')
      .select('membership_plan_id,next_payment_due_date,subscription_status')
      .eq('id', context.membershipId)
      .eq('client_id', context.clientId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error('No encontramos esta membresía.');

    const [planResult, paymentsResult] = await Promise.all([
      membership.membership_plan_id
        ? this.supabase.from('membership_plans')
          .select('name,price,currency,description').eq('id', membership.membership_plan_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.supabase.from('payments')
        .select('id,amount,currency,method,due_date,paid_date,status')
        .eq('client_gym_membership_id', context.membershipId)
        .order('paid_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
    ]);
    if (planResult.error) throw planResult.error;
    if (paymentsResult.error) throw paymentsResult.error;
    const plan = planResult.data;
    return {
      planName: plan?.name ?? null,
      planDescription: plan?.description ?? null,
      planPrice: plan?.price == null ? null : Number(plan.price),
      currency: plan?.currency || paymentsResult.data?.[0]?.currency || 'CRC',
      nextDueDate: membership.next_payment_due_date,
      subscriptionStatus: membership.subscription_status,
      payments: (paymentsResult.data ?? []).map(row => ({
        id: row.id,
        amount: Number(row.amount),
        currency: row.currency || 'CRC',
        method: row.method,
        dueDate: row.due_date,
        paidDate: row.paid_date,
        status: row.status
      }))
    };
  }

  async getProfile(context: ClientPortalContext): Promise<ClientPortalProfile> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');
    const { data, error } = await this.supabase.from('clients')
      .select('id,name,email,phone,birth_date,age,address,notes,goal,created_at')
      .eq('id', context.clientId)
      .single();
    if (error) throw error;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      birthDate: data.birth_date,
      age: data.age,
      address: data.address,
      notes: data.notes,
      goal: data.goal,
      createdAt: data.created_at
    };
  }

  async getRoutinePdfContext(context: ClientPortalContext): Promise<RoutinePdfContext> {
    const active = await this.requireActiveContext(context);
    // Use the context reconstructed from the signed-in user's grants, never an arbitrary branding ID.
    const brandId = active.key.split(':')[1];
    const [clientResult, brandResult] = await Promise.all([
      this.supabase.from('clients').select('name,age,weight,height').eq('id', active.clientId).single(),
      this.supabase.from(active.scope === 'gym' ? 'gyms' : 'coaches')
        .select('name,email,logo_url,brand_color').eq('id', brandId).single()
    ]);
    if (clientResult.error) throw clientResult.error;
    if (brandResult.error) throw brandResult.error;
    const brand = brandResult.data;
    return {
      client: clientResult.data,
      coach: {
        name: brand.name, email: active.scope === 'independent' ? brand.email : '',
        logoUrl: brand.logo_url, brandColor: brand.brand_color
      }
    };
  }

  async updateProfile(context: ClientPortalContext, input: ClientPortalProfileInput): Promise<void> {
    await this.requireActiveContext(context);
    const { error } = await this.supabase.from('clients').update({
      name: input.name.trim(), phone: input.phone.trim() || null,
      birth_date: input.birthDate, notes: input.notes.trim() || null,
      updated_at: new Date().toISOString()
    }).eq('id', context.clientId).select('id').single();
    if (error) throw error;
  }

  async getRoutines(context: ClientPortalContext): Promise<ClientPortalRoutine[]> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');
    let query = this.supabase.from('routines')
      .select('id,name,objective,training_days_count,duration_weeks,start_date,end_date')
      .eq('client_id', context.clientId)
      .order('created_at', { ascending: false });
    query = context.membershipId
      ? query.eq('client_gym_membership_id', context.membershipId)
      : query.is('client_gym_membership_id', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(row => ({
      id: row.id,
      name: row.name,
      objective: row.objective,
      trainingDaysCount: row.training_days_count,
      durationWeeks: row.duration_weeks,
      startDate: row.start_date,
      endDate: row.end_date
    }));
  }

  async getRoutineDetail(context: ClientPortalContext, routineId: string): Promise<ClientPortalRoutineDetail | null> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');
    let routineQuery = this.supabase.from('routines')
      .select('id,name,objective,training_days_count,duration_weeks,start_date,end_date,notes,warmup_enabled,warmup_custom_text')
      .eq('id', routineId)
      .eq('client_id', context.clientId);
    routineQuery = context.membershipId
      ? routineQuery.eq('client_gym_membership_id', context.membershipId)
      : routineQuery.is('client_gym_membership_id', null);
    const { data: routine, error: routineError } = await routineQuery.maybeSingle();
    if (routineError) throw routineError;
    if (!routine) return null;

    const { data: dayRows, error: daysError } = await this.supabase.from('routine_days')
      .select('id,day_number,day_name,muscle_groups,notes')
      .eq('routine_id', routineId)
      .order('day_number', { ascending: true });
    if (daysError) throw daysError;
    const warmupExercises: NonNullable<ClientPortalRoutineDetail['warmupExercises']> = [];
    if (routine.warmup_enabled) {
      const { data: warmupRows, error: warmupError } = await this.supabase.from('routine_warmup_exercises')
        .select('exercise_id,exercises(name)').eq('routine_id', routineId).order('order_index', { ascending: true });
      if (warmupError) throw warmupError;
      for (const item of warmupRows ?? []) {
        const exercise = Array.isArray(item.exercises) ? item.exercises[0] : item.exercises;
        warmupExercises.push({ exerciseId: item.exercise_id, exerciseName: exercise?.name || 'Ejercicio no disponible' });
      }
    }
    const dayIds = (dayRows ?? []).map(day => day.id);
    if (!dayIds.length) return this.mapRoutineDetail(routine, [], warmupExercises);

    const { data: exerciseRows, error: exercisesError } = await this.supabase.from('routine_day_exercises')
      .select('id,routine_day_id,exercise_id,sets,reps,rest,notes,order_index,block_type,block_label,block_position,block_rest,is_superset,video_url')
      .in('routine_day_id', dayIds)
      .order('order_index', { ascending: true });
    if (exercisesError) throw exercisesError;
    const catalogIds = [...new Set((exerciseRows ?? []).map(row => row.exercise_id))];
    const assignmentIds = (exerciseRows ?? []).map(row => row.id);
    const [catalogResult, weeksResult] = await Promise.all([
      catalogIds.length
        ? this.supabase.from('exercises').select('id,name,muscle_group,source,image_url,video_url').in('id', catalogIds)
        : Promise.resolve({ data: [], error: null }),
      assignmentIds.length
        ? this.supabase.from('routine_week_configs')
          .select('routine_day_exercise_id,start_week,end_week,sets,reps,rest,notes')
          .in('routine_day_exercise_id', assignmentIds).order('start_week', { ascending: true })
        : Promise.resolve({ data: [], error: null })
    ]);
    if (catalogResult.error) throw catalogResult.error;
    if (weeksResult.error) throw weeksResult.error;

    const catalogById = new Map((catalogResult.data ?? []).map(row => [row.id, row]));
    const weeksByAssignment = new Map<string, ClientPortalWeekConfig[]>();
    for (const row of weeksResult.data ?? []) {
      const list = weeksByAssignment.get(row.routine_day_exercise_id) ?? [];
      list.push({ startWeek: row.start_week, endWeek: row.end_week, sets: row.sets, reps: row.reps, rest: row.rest, notes: row.notes });
      weeksByAssignment.set(row.routine_day_exercise_id, list);
    }
    const exercisesByDay = new Map<string, ClientPortalExercise[]>();
    for (const row of exerciseRows ?? []) {
      const catalog = catalogById.get(row.exercise_id);
      const list = exercisesByDay.get(row.routine_day_id) ?? [];
      list.push({
        id: row.id,
        exerciseId: row.exercise_id,
        order: row.order_index,
        name: catalog?.name || 'Ejercicio no disponible',
        muscleGroup: catalog?.muscle_group ?? null,
        source: catalog?.source === 'global' ? 'global' : catalog?.source === 'coach' ? 'coach' : null,
        imageUrl: catalog?.image_url ?? null,
        sets: row.sets,
        reps: row.reps,
        rest: row.rest,
        notes: row.notes,
        blockType: row.block_type || 'single',
        blockLabel: row.block_label,
        blockPosition: row.block_position,
        blockRest: row.block_rest,
        isSuperset: !!row.is_superset,
        videoUrl: row.video_url || catalog?.video_url || null,
        weekConfigs: weeksByAssignment.get(row.id) ?? []
      });
      exercisesByDay.set(row.routine_day_id, list);
    }
    return this.mapRoutineDetail(routine, (dayRows ?? []).map(day => ({
      id: day.id,
      number: day.day_number,
      name: day.day_name,
      muscleGroups: day.muscle_groups ?? [],
      notes: day.notes,
      exercises: exercisesByDay.get(day.id) ?? []
    })), warmupExercises);
  }

  async getTrainingDayState(context: ClientPortalContext, routineId: string, dayId: string): Promise<ClientPortalTrainingDayState | null> {
    let query = this.supabase.from('training_sessions')
      .select('id,status')
      .eq('routine_id', routineId)
      .eq('routine_day_id', dayId)
      .eq('client_id', context.clientId)
      // Keep the original app's UTC date so existing daily records are reused.
      .eq('session_date', new Date().toISOString().slice(0, 10))
      .order('started_at', { ascending: false })
      .limit(1);
    query = context.membershipId ? query.eq('client_gym_membership_id', context.membershipId) : query.is('client_gym_membership_id', null);
    const { data: session, error: sessionError } = await query.maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return null;

    const { data: sets, error: setsError } = await this.supabase.from('training_session_sets')
      .select('id,training_session_id,exercise_order,set_number,actual_reps,rir,load,load_unit')
      .eq('training_session_id', session.id)
      .order('exercise_order', { ascending: true })
      .order('set_number', { ascending: true });
    if (setsError) throw setsError;
    return {
      sessionId: session.id,
      status: session.status === 'completed' ? 'completed' : 'in_progress',
      sets: (sets ?? []).map(row => ({
        id: row.id,
        sessionId: row.training_session_id,
        exerciseOrder: row.exercise_order,
        setNumber: row.set_number,
        actualReps: row.actual_reps,
        rir: row.rir,
        load: row.load == null ? null : Number(row.load),
        loadUnit: row.load_unit || 'kg'
      }))
    };
  }

  async saveTrainingSet(
    context: ClientPortalContext,
    routineId: string,
    dayId: string,
    assignmentId: string,
    exerciseOrder: number,
    setNumber: number,
    input: ClientPortalTrainingSetInput
  ): Promise<{ sessionId: string | null; status: 'in_progress'; set: ClientPortalTrainingSet | null }> {
    await this.requireActiveContext(context);
    let routineQuery = this.supabase.from('routines').select('id,coach_id').eq('id', routineId).eq('client_id', context.clientId);
    routineQuery = context.membershipId ? routineQuery.eq('client_gym_membership_id', context.membershipId) : routineQuery.is('client_gym_membership_id', null);
    const [routineResult, dayResult, assignmentResult] = await Promise.all([
      routineQuery.single(),
      this.supabase.from('routine_days').select('id').eq('id', dayId).eq('routine_id', routineId).single(),
      this.supabase.from('routine_day_exercises').select('exercise_id,reps,sets,order_index')
        .eq('id', assignmentId).eq('routine_day_id', dayId).eq('order_index', exerciseOrder).single()
    ]);
    for (const result of [routineResult, dayResult, assignmentResult]) if (result.error) throw result.error;
    const assignment = assignmentResult.data!;
    if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > assignment.sets) throw new Error('Serie no válida para este ejercicio.');
    const { data: exercise, error: exerciseError } = await this.supabase.from('exercises').select('name').eq('id', assignment.exercise_id).maybeSingle();
    if (exerciseError) throw exerciseError;
    const sessionId = await this.getOrCreateTrainingSession(context, routineId, dayId, routineResult.data!.coach_id);
    const { data: row, error } = await this.supabase.from('training_session_sets').upsert({
      training_session_id: sessionId, routine_day_id: dayId,
      exercise_id: assignment.exercise_id, exercise_name: exercise?.name || 'Ejercicio no disponible',
      exercise_order: exerciseOrder, set_number: setNumber, planned_reps: assignment.reps,
      actual_reps: input.actualReps, rir: input.rir, load: input.load,
      load_unit: 'kg', updated_at: new Date().toISOString()
    }, { onConflict: 'training_session_id,routine_day_id,exercise_order,set_number' }).select('*').single();
    if (error) throw error;
    const { error: updateError } = await this.supabase.from('training_sessions')
      .update({ updated_at: new Date().toISOString(), status: 'in_progress' }).eq('id', sessionId).select('id').single();
    if (updateError) throw updateError;
    const set = {
      id: row.id,
      sessionId,
      exerciseOrder,
      setNumber,
      actualReps: row.actual_reps,
      rir: row.rir,
      load: row.load == null ? null : Number(row.load),
      loadUnit: row.load_unit || 'kg'
    } satisfies ClientPortalTrainingSet;
    return { sessionId, status: 'in_progress', set };
  }

  private async requireActiveContext(context: ClientPortalContext): Promise<ClientPortalContext> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id;
    if (!userId) throw new Error('No hay una sesión activa.');
    const contexts = await this.listContexts(userId);
    const active = contexts.find(item => item.available && item.key === context.key && item.scope === context.scope && item.clientId === context.clientId && item.membershipId === context.membershipId);
    if (!active) {
      throw new Error('Este acceso al portal no está activo.');
    }
    return active;
  }

  private getOrCreateTrainingSession(context: ClientPortalContext, routineId: string, dayId: string, coachId: string): Promise<string> {
    const sessionDate = new Date().toISOString().slice(0, 10);
    const key = `${context.key}:${routineId}:${dayId}:${sessionDate}`;
    const current = this.sessionRequests.get(key);
    if (current) return current;
    const request = (async () => {
      const existing = await this.getTrainingDayState(context, routineId, dayId);
      if (existing) return existing.sessionId;
      // Uses the same insert + set upsert contract as the original app.
      const { data, error } = await this.supabase.from('training_sessions').insert({
        routine_id: routineId, routine_day_id: dayId, client_id: context.clientId,
        coach_id: coachId, client_gym_membership_id: context.membershipId,
        portal_scope: context.scope, session_date: sessionDate, status: 'in_progress'
      }).select('id').single();
      if (error) throw error;
      return data.id as string;
    })().finally(() => { this.sessionRequests.delete(key); });
    this.sessionRequests.set(key, request);
    return request;
  }

  async getTrainingHistory(context: ClientPortalContext): Promise<ClientPortalHistorySession[]> {
    if (!context.available) throw new Error('Este acceso al portal no está activo.');
    let sessionsQuery = this.supabase.from('training_sessions')
      .select('id,routine_id,routine_day_id,session_date,status,started_at,completed_at')
      .eq('client_id', context.clientId)
      .order('session_date', { ascending: false })
      .order('started_at', { ascending: false });
    sessionsQuery = context.membershipId
      ? sessionsQuery.eq('client_gym_membership_id', context.membershipId)
      : sessionsQuery.is('client_gym_membership_id', null);
    const { data: sessions, error: sessionsError } = await sessionsQuery;
    if (sessionsError) throw sessionsError;
    if (!sessions?.length) return [];

    const routineIds = [...new Set(sessions.map(session => session.routine_id))];
    const dayIds = [...new Set(sessions.map(session => session.routine_day_id))];
    const sessionIds = sessions.map(session => session.id);
    const [routinesResult, daysResult, setsResult] = await Promise.all([
      this.supabase.from('routines').select('id,name').in('id', routineIds),
      this.supabase.from('routine_days').select('id,day_name').in('id', dayIds),
      this.supabase.from('training_session_sets')
        .select('id,training_session_id,exercise_name,exercise_order,set_number,planned_reps,actual_reps,rir,load,load_unit,notes')
        .in('training_session_id', sessionIds)
        .order('exercise_order', { ascending: true })
        .order('set_number', { ascending: true })
    ]);
    if (routinesResult.error) throw routinesResult.error;
    if (daysResult.error) throw daysResult.error;
    if (setsResult.error) throw setsResult.error;

    const routineById = new Map((routinesResult.data ?? []).map(row => [row.id, row.name]));
    const dayById = new Map((daysResult.data ?? []).map(row => [row.id, row.day_name]));
    const exercisesBySession = new Map<string, ClientPortalHistoryExercise[]>();
    for (const row of setsResult.data ?? []) {
      let exercises = exercisesBySession.get(row.training_session_id);
      if (!exercises) {
        exercises = [];
        exercisesBySession.set(row.training_session_id, exercises);
      }
      let exercise = exercises.find(item => item.order === row.exercise_order && item.name === row.exercise_name);
      if (!exercise) {
        exercise = { name: row.exercise_name, order: row.exercise_order, sets: [] };
        exercises.push(exercise);
      }
      exercise.sets.push({
        id: row.id,
        setNumber: row.set_number,
        plannedReps: row.planned_reps,
        actualReps: row.actual_reps,
        rir: row.rir,
        load: row.load == null ? null : Number(row.load),
        loadUnit: row.load_unit || 'kg',
        notes: row.notes
      });
    }

    return sessions.map(session => ({
      id: session.id,
      routineId: session.routine_id,
      routineName: routineById.get(session.routine_id) || 'Rutina',
      dayName: dayById.get(session.routine_day_id) || 'Día de entrenamiento',
      sessionDate: session.session_date,
      status: session.status === 'completed' ? 'completed' : 'in_progress',
      startedAt: session.started_at,
      completedAt: session.completed_at,
      exercises: (exercisesBySession.get(session.id) ?? []).sort((a, b) => a.order - b.order)
    }));
  }

  private mapRoutineDetail(
    row: {
      id: string; name: string; objective: string; training_days_count: number; duration_weeks: number;
      start_date: string | null; end_date: string | null; notes: string | null;
      warmup_enabled: boolean; warmup_custom_text: string | null;
    },
    days: ClientPortalDay[],
    warmupExercises: NonNullable<ClientPortalRoutineDetail['warmupExercises']> = []
  ): ClientPortalRoutineDetail {
    return {
      id: row.id,
      name: row.name,
      objective: row.objective,
      trainingDaysCount: row.training_days_count,
      durationWeeks: row.duration_weeks,
      startDate: row.start_date,
      endDate: row.end_date,
      notes: row.notes,
      warmupEnabled: row.warmup_enabled,
      warmupCustomText: row.warmup_custom_text,
      warmupExercises,
      days
    };
  }
}
