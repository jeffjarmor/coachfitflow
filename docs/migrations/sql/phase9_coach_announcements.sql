begin;

create table if not exists public.coach_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all'
    check (audience in ('all', 'standard', 'paid')),
  active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_by uuid null references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_announcements_date_range_check
    check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists coach_announcements_active_sort_idx
  on public.coach_announcements (active, sort_order, created_at desc);

create index if not exists coach_announcements_audience_idx
  on public.coach_announcements (audience);

alter table public.coach_announcements enable row level security;

drop policy if exists "Admins manage coach announcements" on public.coach_announcements;
create policy "Admins manage coach announcements"
on public.coach_announcements
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Coaches read visible announcements" on public.coach_announcements;
create policy "Coaches read visible announcements"
on public.coach_announcements
for select
using (
  public.is_admin()
  or (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and (
      audience = 'all'
      or (
        audience = 'paid'
        and exists (
          select 1
          from public.coaches c
          where c.id = public.current_user_id()
            and c.account_type = 'independent'
        )
        and public.is_independent_paid_coach_access_active(public.current_user_id())
      )
      or (
        audience = 'standard'
        and exists (
          select 1
          from public.coaches c
          where c.id = public.current_user_id()
            and c.account_type = 'independent'
        )
        and not public.is_independent_paid_coach_access_active(public.current_user_id())
      )
    )
  )
);

comment on table public.coach_announcements is
  'Admin-managed announcements shown on coach dashboards, with audience segmentation for standard and Pro independent coaches.';

commit;
