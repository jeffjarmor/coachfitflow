import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../../migrations/20261104021802_onvo_trainer_billing.sql', import.meta.url), 'utf8');
const handler = await readFile(new URL('../../functions/_shared/coach-billing/handler.ts', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../../functions/_shared/coach-billing/runtime.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../../functions/_shared/coach-billing/webhook.ts', import.meta.url), 'utf8');

test('billing persistence is RLS protected with owner reads and no browser write grants', () => {
  for (const table of ['coach_billing_accounts', 'coach_billing_invoices', 'coach_billing_events', 'coach_billing_operations']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.coach_billing_accounts,[\s\S]*from anon, authenticated/);
  assert.match(migration, /grant select on public\.coach_billing_accounts, public\.coach_billing_invoices to authenticated/);
  assert.match(migration, /create policy coach_billing_accounts_owner_select[\s\S]*coach_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /create policy coach_billing_invoices_owner_select[\s\S]*coach_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /create policy[^;]+for (?:insert|update|delete) to authenticated/i);
});

test('service RPCs are invoker-only, fixed-search-path, and unavailable to browser roles', () => {
  assert.match(migration, /language plpgsql security invoker set search_path = pg_catalog, public, pg_temp/);
  assert.doesNotMatch(migration, /security definer/i);
  for (const name of [
    'claim_coach_billing_operation', 'release_coach_billing_operation',
    'claim_coach_billing_event', 'record_coach_billing_invoice',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
});

test('durable claims serialize same-coach operations and webhook identity replays', () => {
  assert.match(migration, /primary key \(coach_id, action\)/);
  assert.match(migration, /on conflict \(coach_id, action\) do nothing[\s\S]*returning claim_id into v_claim_id/);
  assert.doesNotMatch(migration, /do update[\s\S]{0,160}public\.coach_billing_operations\.lease_until/);
  assert.match(migration, /where coach_id = p_coach_id and action = p_action and claim_id = p_claim_id/);
  assert.match(migration, /event_key text primary key/);
  assert.match(migration, /on conflict \(event_key\) do nothing/);
});

test('expired diagnostic claims remain locked until the original token releases them', async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.coaches (
        id uuid primary key, role text not null, account_type text not null,
        coach_plan text, next_plan_payment_date date
      );
    `);
    await db.exec(migration);
    const coachId = '00000000-0000-0000-0000-000000000001';
    await db.query(`insert into public.coaches (id, role, account_type) values ($1::uuid, 'coach', 'independent')`, [coachId]);
    const first = await db.query(`select public.claim_coach_billing_operation($1::uuid, 'subscribe') as claim`, [coachId]);
    const claimId = first.rows[0].claim;
    assert.ok(claimId);
    await db.query(`update public.coach_billing_operations set lease_until = now() - interval '1 hour' where coach_id = $1::uuid and action = 'subscribe'`, [coachId]);
    const denied = await db.query(`select public.claim_coach_billing_operation($1::uuid, 'subscribe') as claim`, [coachId]);
    assert.equal(denied.rows[0].claim, null);
    const wrongRelease = await db.query(`select public.release_coach_billing_operation($1::uuid, 'subscribe', gen_random_uuid()) as released`, [coachId]);
    assert.equal(wrongRelease.rows[0].released, false);
    const exactRelease = await db.query(`select public.release_coach_billing_operation($1::uuid, 'subscribe', $2::uuid) as released`, [coachId, claimId]);
    assert.equal(exactRelease.rows[0].released, true);
    const afterRelease = await db.query(`select public.claim_coach_billing_operation($1::uuid, 'subscribe') as claim`, [coachId]);
    assert.ok(afterRelease.rows[0].claim);
  } finally {
    await db.close();
  }
});

test('paid renewal projection is monotonic and stale failures cannot revoke paid access', () => {
  assert.match(migration, /status = case when public\.coach_billing_invoices\.status = 'paid' then 'paid' else excluded\.status end/);
  assert.match(migration, /if p_status = 'paid' then/);
  assert.match(migration, /next_plan_payment_date = greatest\(coalesce\(next_plan_payment_date, p_period_end::date\), p_period_end::date\)/);
  assert.match(migration, /paid_through = greatest\(coalesce\(paid_through, p_period_end::date\), p_period_end::date\)/);
  assert.doesNotMatch(migration, /drop trigger if exists protect_coach_authorization_fields/i);
});

test('public request contract rejects raw card fields and callbacks cannot claim success', () => {
  assert.match(handler, /invalidFieldName = \/\(card\|pan\|number\|primaryaccount\|cvc\|cvv/);
  assert.match(handler, /hasOnlyKeys\(body, \["action", "paymentMethodId"\]\)/);
  assert.doesNotMatch(handler, /case "success"/);
  assert.match(runtime, /intent\.status === "succeeded"/);
  assert.match(runtime, /paymentBehavior: "allow_incomplete"/);
  assert.match(runtime, /const intent = await onvo\(`\/payment-intents/);
});

test('webhook uses configured secret and deterministic provider object identity', () => {
  assert.match(webhook, /x-webhook-secret/);
  assert.match(webhook, /secureEqual\(supplied, deps\.secret\)/);
  assert.match(webhook, /subscription\.renewal\.succeeded/);
  assert.match(webhook, /subscription\.renewal\.failed/);
  assert.match(webhook, /SHA-256/);
});
