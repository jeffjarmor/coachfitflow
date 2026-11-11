begin;

-- Supabase grants service_role broad table privileges by default. The signed
-- intake function only needs to append payout records through its insert RPC.
revoke all on public.onvo_payout_settlements from service_role;
grant insert on public.onvo_payout_settlements to service_role;

commit;
