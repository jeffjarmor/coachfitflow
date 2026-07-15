-- RLS + policies for CoachFitFlow multi-gym schema

-- =========================
-- Helper functions
-- =========================
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()::uuid;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.coaches c
    where c.id = public.current_user_id()
      and c.role = 'admin'
  );
$$;

create or replace function public.is_gym_owner(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_admin() or exists (
    select 1
    from public.gyms g
    where g.id = p_gym_id
      and g.owner_id = public.current_user_id()
  );
$$;

create or replace function public.is_gym_staff_member(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
  );
$$;

create or replace function public.can_manage_clients(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_edit_clients = true
  );
$$;

create or replace function public.can_create_routines(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_create_routines = true
  );
$$;

create or replace function public.can_view_payments(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_view_payments = true
  );
$$;

create or replace function public.can_manage_staff(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_manage_staff = true
  );
$$;

create or replace function public.is_membership_client(p_membership_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.client_portal_access cpa
    where cpa.user_id = public.current_user_id()
      and cpa.client_gym_membership_id = p_membership_id
  );
$$;

create or replace function public.membership_gym_id(p_membership_id uuid)
returns uuid
language sql
stable
as $$
  select cgm.gym_id
  from public.client_gym_memberships cgm
  where cgm.id = p_membership_id
  limit 1;
$$;

create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_admin() or exists (
    select 1
    from public.client_gym_memberships cgm
    where cgm.client_id = p_client_id
      and (
        public.is_gym_staff_member(cgm.gym_id)
        or public.is_membership_client(cgm.id)
      )
  );
$$;

-- =========================
-- Enable RLS
-- =========================
alter table public.coaches enable row level security;
alter table public.gyms enable row level security;
alter table public.gym_staff enable row level security;
alter table public.membership_plans enable row level security;
alter table public.clients enable row level security;
alter table public.client_gym_memberships enable row level security;
alter table public.payments enable row level security;
alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_days enable row level security;
alter table public.routine_day_exercises enable row level security;
alter table public.routine_week_configs enable row level security;
alter table public.routine_warmup_exercises enable row level security;
alter table public.measurements enable row level security;
alter table public.client_portal_access enable row level security;
alter table public.activity_logins enable row level security;
alter table public.competitor_sheets enable row level security;

-- =========================
-- coaches
-- =========================
drop policy if exists coaches_select on public.coaches;
drop policy if exists coaches_insert on public.coaches;
drop policy if exists coaches_update on public.coaches;
drop policy if exists coaches_delete on public.coaches;

create policy coaches_select on public.coaches
for select
using (public.is_admin() or id = public.current_user_id());

create policy coaches_insert on public.coaches
for insert
with check (public.is_admin() or id = public.current_user_id());

create policy coaches_update on public.coaches
for update
using (public.is_admin() or id = public.current_user_id())
with check (public.is_admin() or id = public.current_user_id());

create policy coaches_delete on public.coaches
for delete
using (public.is_admin() or id = public.current_user_id());

-- =========================
-- gyms
-- =========================
drop policy if exists gyms_select on public.gyms;
drop policy if exists gyms_insert on public.gyms;
drop policy if exists gyms_update on public.gyms;
drop policy if exists gyms_delete on public.gyms;

create policy gyms_select on public.gyms
for select
using (
  public.is_gym_staff_member(id)
  or exists (
    select 1
    from public.client_gym_memberships cgm
    where cgm.gym_id = gyms.id
      and public.is_membership_client(cgm.id)
  )
);

create policy gyms_insert on public.gyms
for insert
with check (public.is_admin() or owner_id = public.current_user_id());

create policy gyms_update on public.gyms
for update
using (public.is_gym_owner(id))
with check (public.is_gym_owner(id));

create policy gyms_delete on public.gyms
for delete
using (public.is_admin());

-- =========================
-- gym_staff
-- =========================
drop policy if exists gym_staff_select on public.gym_staff;
drop policy if exists gym_staff_insert on public.gym_staff;
drop policy if exists gym_staff_update on public.gym_staff;
drop policy if exists gym_staff_delete on public.gym_staff;

create policy gym_staff_select on public.gym_staff
for select
using (
  public.is_admin()
  or coach_id = public.current_user_id()
  or public.is_gym_staff_member(gym_id)
);

create policy gym_staff_insert on public.gym_staff
for insert
with check (public.can_manage_staff(gym_id));

create policy gym_staff_update on public.gym_staff
for update
using (public.can_manage_staff(gym_id) or coach_id = public.current_user_id())
with check (public.can_manage_staff(gym_id) or coach_id = public.current_user_id());

create policy gym_staff_delete on public.gym_staff
for delete
using (public.can_manage_staff(gym_id) or coach_id = public.current_user_id());

-- =========================
-- membership_plans
-- =========================
drop policy if exists membership_plans_select on public.membership_plans;
drop policy if exists membership_plans_write on public.membership_plans;

create policy membership_plans_select on public.membership_plans
for select
using (
  public.is_gym_staff_member(gym_id)
  or exists (
    select 1
    from public.client_gym_memberships cgm
    where cgm.membership_plan_id = membership_plans.id
      and public.is_membership_client(cgm.id)
  )
);

create policy membership_plans_write on public.membership_plans
for all
using (public.is_gym_owner(gym_id))
with check (public.is_gym_owner(gym_id));

-- =========================
-- clients
-- =========================
drop policy if exists clients_select on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;

create policy clients_select on public.clients
for select
using (public.can_access_client(id));

create policy clients_insert on public.clients
for insert
with check (
  public.is_admin()
  or exists (select 1 from public.coaches c where c.id = public.current_user_id())
);

create policy clients_update on public.clients
for update
using (public.can_access_client(id))
with check (public.can_access_client(id));

create policy clients_delete on public.clients
for delete
using (
  public.is_admin()
  or exists (
    select 1
    from public.client_gym_memberships cgm
    where cgm.client_id = clients.id
      and public.can_manage_clients(cgm.gym_id)
  )
);

-- =========================
-- client_gym_memberships
-- =========================
drop policy if exists cgm_select on public.client_gym_memberships;
drop policy if exists cgm_insert on public.client_gym_memberships;
drop policy if exists cgm_update on public.client_gym_memberships;
drop policy if exists cgm_delete on public.client_gym_memberships;

create policy cgm_select on public.client_gym_memberships
for select
using (
  public.is_gym_staff_member(gym_id)
  or public.is_membership_client(id)
);

create policy cgm_insert on public.client_gym_memberships
for insert
with check (public.can_manage_clients(gym_id));

create policy cgm_update on public.client_gym_memberships
for update
using (public.can_manage_clients(gym_id))
with check (public.can_manage_clients(gym_id));

create policy cgm_delete on public.client_gym_memberships
for delete
using (public.can_manage_clients(gym_id));

-- =========================
-- payments
-- =========================
drop policy if exists payments_select on public.payments;
drop policy if exists payments_write on public.payments;

create policy payments_select on public.payments
for select
using (
  public.can_view_payments(public.membership_gym_id(client_gym_membership_id))
  or public.is_membership_client(client_gym_membership_id)
);

create policy payments_write on public.payments
for all
using (public.can_view_payments(public.membership_gym_id(client_gym_membership_id)))
with check (public.can_view_payments(public.membership_gym_id(client_gym_membership_id)));

-- =========================
-- exercises
-- =========================
drop policy if exists exercises_select on public.exercises;
drop policy if exists exercises_insert on public.exercises;
drop policy if exists exercises_update on public.exercises;
drop policy if exists exercises_delete on public.exercises;

create policy exercises_select on public.exercises
for select
using (public.current_user_id() is not null);

create policy exercises_insert on public.exercises
for insert
with check (
  (public.is_admin() and source = 'global' and coach_id is null)
  or
  ((not public.is_admin()) and source = 'coach' and coach_id = public.current_user_id())
  or
  (public.is_admin() and source = 'coach')
);

create policy exercises_update on public.exercises
for update
using (
  public.is_admin()
  or (source = 'coach' and coach_id = public.current_user_id())
)
with check (
  public.is_admin()
  or (source = 'coach' and coach_id = public.current_user_id())
);

create policy exercises_delete on public.exercises
for delete
using (
  public.is_admin()
  or (source = 'coach' and coach_id = public.current_user_id())
);

-- =========================
-- routines
-- =========================
drop policy if exists routines_select on public.routines;
drop policy if exists routines_insert on public.routines;
drop policy if exists routines_update on public.routines;
drop policy if exists routines_delete on public.routines;

create policy routines_select on public.routines
for select
using (
  public.is_admin()
  or coach_id = public.current_user_id()
  or (
    client_gym_membership_id is not null
    and (
      public.is_membership_client(client_gym_membership_id)
      or public.is_gym_staff_member(public.membership_gym_id(client_gym_membership_id))
    )
  )
);

create policy routines_insert on public.routines
for insert
with check (
  public.is_admin()
  or (
    coach_id = public.current_user_id()
    and (
      client_gym_membership_id is null
      or public.can_create_routines(public.membership_gym_id(client_gym_membership_id))
    )
  )
);

create policy routines_update on public.routines
for update
using (
  public.is_admin()
  or (
    coach_id = public.current_user_id()
    and (
      client_gym_membership_id is null
      or public.can_create_routines(public.membership_gym_id(client_gym_membership_id))
    )
  )
)
with check (
  public.is_admin()
  or (
    coach_id = public.current_user_id()
    and (
      client_gym_membership_id is null
      or public.can_create_routines(public.membership_gym_id(client_gym_membership_id))
    )
  )
);

create policy routines_delete on public.routines
for delete
using (
  public.is_admin()
  or (
    coach_id = public.current_user_id()
    and (
      client_gym_membership_id is null
      or public.can_create_routines(public.membership_gym_id(client_gym_membership_id))
    )
  )
);

-- =========================
-- routine_days
-- =========================
drop policy if exists routine_days_select on public.routine_days;
drop policy if exists routine_days_write on public.routine_days;

create policy routine_days_select on public.routine_days
for select
using (
  exists (
    select 1 from public.routines r
    where r.id = routine_days.routine_id
      and (
        public.is_admin()
        or r.coach_id = public.current_user_id()
        or (r.client_gym_membership_id is not null and public.is_membership_client(r.client_gym_membership_id))
        or (r.client_gym_membership_id is not null and public.is_gym_staff_member(public.membership_gym_id(r.client_gym_membership_id)))
      )
  )
);

create policy routine_days_write on public.routine_days
for all
using (
  exists (
    select 1 from public.routines r
    where r.id = routine_days.routine_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
)
with check (
  exists (
    select 1 from public.routines r
    where r.id = routine_days.routine_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
);

-- =========================
-- routine_day_exercises
-- =========================
drop policy if exists rde_select on public.routine_day_exercises;
drop policy if exists rde_write on public.routine_day_exercises;

create policy rde_select on public.routine_day_exercises
for select
using (
  exists (
    select 1
    from public.routine_days rd
    join public.routines r on r.id = rd.routine_id
    where rd.id = routine_day_exercises.routine_day_id
      and (
        public.is_admin()
        or r.coach_id = public.current_user_id()
        or (r.client_gym_membership_id is not null and public.is_membership_client(r.client_gym_membership_id))
        or (r.client_gym_membership_id is not null and public.is_gym_staff_member(public.membership_gym_id(r.client_gym_membership_id)))
      )
  )
);

create policy rde_write on public.routine_day_exercises
for all
using (
  exists (
    select 1
    from public.routine_days rd
    join public.routines r on r.id = rd.routine_id
    where rd.id = routine_day_exercises.routine_day_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
)
with check (
  exists (
    select 1
    from public.routine_days rd
    join public.routines r on r.id = rd.routine_id
    where rd.id = routine_day_exercises.routine_day_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
);

-- =========================
-- routine_week_configs
-- =========================
drop policy if exists rwc_select on public.routine_week_configs;
drop policy if exists rwc_write on public.routine_week_configs;

create policy rwc_select on public.routine_week_configs
for select
using (
  exists (
    select 1
    from public.routine_day_exercises rde
    join public.routine_days rd on rd.id = rde.routine_day_id
    join public.routines r on r.id = rd.routine_id
    where rde.id = routine_week_configs.routine_day_exercise_id
      and (
        public.is_admin()
        or r.coach_id = public.current_user_id()
        or (r.client_gym_membership_id is not null and public.is_membership_client(r.client_gym_membership_id))
        or (r.client_gym_membership_id is not null and public.is_gym_staff_member(public.membership_gym_id(r.client_gym_membership_id)))
      )
  )
);

create policy rwc_write on public.routine_week_configs
for all
using (
  exists (
    select 1
    from public.routine_day_exercises rde
    join public.routine_days rd on rd.id = rde.routine_day_id
    join public.routines r on r.id = rd.routine_id
    where rde.id = routine_week_configs.routine_day_exercise_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
)
with check (
  exists (
    select 1
    from public.routine_day_exercises rde
    join public.routine_days rd on rd.id = rde.routine_day_id
    join public.routines r on r.id = rd.routine_id
    where rde.id = routine_week_configs.routine_day_exercise_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
);

-- =========================
-- routine_warmup_exercises
-- =========================
drop policy if exists rwe_select on public.routine_warmup_exercises;
drop policy if exists rwe_write on public.routine_warmup_exercises;

create policy rwe_select on public.routine_warmup_exercises
for select
using (
  exists (
    select 1 from public.routines r
    where r.id = routine_warmup_exercises.routine_id
      and (
        public.is_admin()
        or r.coach_id = public.current_user_id()
        or (r.client_gym_membership_id is not null and public.is_membership_client(r.client_gym_membership_id))
        or (r.client_gym_membership_id is not null and public.is_gym_staff_member(public.membership_gym_id(r.client_gym_membership_id)))
      )
  )
);

create policy rwe_write on public.routine_warmup_exercises
for all
using (
  exists (
    select 1 from public.routines r
    where r.id = routine_warmup_exercises.routine_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
)
with check (
  exists (
    select 1 from public.routines r
    where r.id = routine_warmup_exercises.routine_id
      and (
        public.is_admin()
        or (r.coach_id = public.current_user_id() and (r.client_gym_membership_id is null or public.can_create_routines(public.membership_gym_id(r.client_gym_membership_id))))
      )
  )
);

-- =========================
-- measurements
-- =========================
drop policy if exists measurements_select on public.measurements;
drop policy if exists measurements_write on public.measurements;

create policy measurements_select on public.measurements
for select
using (
  public.can_access_client(client_id)
);

create policy measurements_write on public.measurements
for all
using (
  public.is_admin()
  or (
    client_gym_membership_id is not null
    and public.can_manage_clients(public.membership_gym_id(client_gym_membership_id))
  )
)
with check (
  public.is_admin()
  or (
    client_gym_membership_id is not null
    and public.can_manage_clients(public.membership_gym_id(client_gym_membership_id))
  )
);

-- =========================
-- client_portal_access
-- =========================
drop policy if exists cpa_select on public.client_portal_access;
drop policy if exists cpa_insert on public.client_portal_access;
drop policy if exists cpa_update on public.client_portal_access;
drop policy if exists cpa_delete on public.client_portal_access;

create policy cpa_select on public.client_portal_access
for select
using (
  public.is_admin()
  or user_id = public.current_user_id()
  or public.is_gym_staff_member(
    public.membership_gym_id(client_gym_membership_id)
  )
);

create policy cpa_insert on public.client_portal_access
for insert
with check (
  public.is_admin()
  or public.can_manage_clients(public.membership_gym_id(client_gym_membership_id))
);

create policy cpa_update on public.client_portal_access
for update
using (
  public.is_admin()
  or public.can_manage_clients(public.membership_gym_id(client_gym_membership_id))
)
with check (
  public.is_admin()
  or public.can_manage_clients(public.membership_gym_id(client_gym_membership_id))
);

create policy cpa_delete on public.client_portal_access
for delete
using (
  public.is_admin()
  or public.can_manage_clients(public.membership_gym_id(client_gym_membership_id))
);

-- =========================
-- activity_logins
-- =========================
drop policy if exists activity_logins_select on public.activity_logins;
drop policy if exists activity_logins_insert on public.activity_logins;

create policy activity_logins_select on public.activity_logins
for select
using (public.is_admin());

create policy activity_logins_insert on public.activity_logins
for insert
with check (
  public.current_user_id() is not null
  and user_id = public.current_user_id()
);

-- =========================
-- competitor_sheets
-- =========================
drop policy if exists competitor_sheets_select on public.competitor_sheets;
drop policy if exists competitor_sheets_write on public.competitor_sheets;

create policy competitor_sheets_select on public.competitor_sheets
for select
using (
  public.is_admin()
  or coach_id = public.current_user_id()
  or (client_gym_membership_id is not null and public.is_membership_client(client_gym_membership_id))
  or (client_gym_membership_id is not null and public.is_gym_staff_member(public.membership_gym_id(client_gym_membership_id)))
);

create policy competitor_sheets_write on public.competitor_sheets
for all
using (
  public.is_admin()
  or (
    coach_id = public.current_user_id()
    and (
      client_gym_membership_id is null
      or public.can_create_routines(public.membership_gym_id(client_gym_membership_id))
    )
  )
)
with check (
  public.is_admin()
  or (
    coach_id = public.current_user_id()
    and (
      client_gym_membership_id is null
      or public.can_create_routines(public.membership_gym_id(client_gym_membership_id))
    )
  )
);;
