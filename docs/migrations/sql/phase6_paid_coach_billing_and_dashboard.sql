alter table public.coaches
add column if not exists next_plan_payment_date date;

comment on column public.coaches.next_plan_payment_date is
'Fecha del próximo cobro para entrenadores independientes con plan pago.';
