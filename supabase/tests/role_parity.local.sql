-- Local integration regression: run with psql -v ON_ERROR_STOP=1. Fixtures are rolled back.
begin;
create function pg_temp.assert(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'FAIL: %', p_label; end if; raise notice 'PASS: %', p_label; end $$;
create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when insufficient_privilege or invalid_authorization_specification then raise notice 'PASS: %', p_label; return; end;
  raise exception 'FAIL: allowed %', p_label;
end $$;
insert into auth.users(id,email,aud,role) select ('00000000-0000-4000-8000-0000009' || lpad(n::text,5,'0'))::uuid, 'parity-'||n||'@example.invalid','authenticated','authenticated' from generate_series(1,10) n;
insert into public.coaches(id,email,name,role,account_type) select id,email,'Parity '||right(id::text,1),case when right(id::text,1)='1' then 'admin'::public.coach_role else 'coach'::public.coach_role end,'independent' from auth.users where email like 'parity-%@example.invalid';
insert into public.gyms(id,name,access_code,owner_id) values
 ('00000000-0000-4000-8000-000000990001','Parity Gym A','PARITY-A','00000000-0000-4000-8000-000000900002'),
 ('00000000-0000-4000-8000-000000990002','Parity Gym B','PARITY-B','00000000-0000-4000-8000-000000900008');
insert into public.gym_staff(gym_id,coach_id,role,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff) values
 ('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900002','owner',true,true,true,true),
 ('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900003','trainer',true,true,false,false),
 ('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900004','receptionist',true,false,true,false),
 ('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900005','trainer',false,false,false,false),
 ('00000000-0000-4000-8000-000000990002','00000000-0000-4000-8000-000000900008','owner',true,true,true,true),
 ('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900009','trainer',false,false,false,true),
 ('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900010','trainer',false,false,false,true);
insert into public.clients(id,primary_coach_id,name,email,age,goal) values ('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000900006','Parity Shared','parity-shared@example.invalid',30,'Strength');
insert into public.client_gym_memberships(id,gym_id,client_id,assigned_coach_id) values
 ('00000000-0000-4000-8000-000000970001','00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000900003'),
 ('00000000-0000-4000-8000-000000970002','00000000-0000-4000-8000-000000990002','00000000-0000-4000-8000-000000980001',null);
insert into public.membership_plans(id,gym_id,name,price,currency) values ('00000000-0000-4000-8000-000000960001','00000000-0000-4000-8000-000000990001','Mensual',10000,'CRC');
update public.clients set address='Original address', birth_date='1990-05-10' where id='00000000-0000-4000-8000-000000980001';
insert into public.client_portal_access(user_id,client_gym_membership_id) values ('00000000-0000-4000-8000-000000900008','00000000-0000-4000-8000-000000970001');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900001',true);
select pg_temp.assert((select gym_id is not null from public.admin_create_gym('00000000-0000-4000-8000-000000950001','Parity New')), 'admin creates gym');
select pg_temp.assert((select owner_id is null from public.gyms where creation_request_id='00000000-0000-4000-8000-000000950001'), 'gym starts without an automatic owner');
select public.admin_create_gym('00000000-0000-4000-8000-000000950001','Parity New');
select pg_temp.assert((select count(*)=1 from public.gyms where creation_request_id='00000000-0000-4000-8000-000000950001'), 'gym creation retry is idempotent');
select public.admin_assign_gym_owner((select id from public.gyms where creation_request_id='00000000-0000-4000-8000-000000950001'),'00000000-0000-4000-8000-000000900007');
select pg_temp.assert((select owner_id='00000000-0000-4000-8000-000000900007' from public.gyms where creation_request_id='00000000-0000-4000-8000-000000950001'), 'admin assigns owner');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900002',true);
select pg_temp.denied($q$select public.admin_create_gym(gen_random_uuid(),'Owner Denied')$q$, 'owner cannot create gym through RPC');
select pg_temp.denied($q$select public.create_owned_gym(gen_random_uuid(),'Owner Denied')$q$, 'legacy create endpoint is also restricted');
select pg_temp.denied($q$insert into public.gyms(name,access_code,owner_id) values('Denied','PARITY-DENIED',auth.uid())$q$, 'owner cannot create gym by direct insert');
update public.coaches set name='Parity Owner Updated' where id=auth.uid();
select pg_temp.assert((select name='Parity Owner Updated' from public.coaches where id=auth.uid()), 'own personal profile remains editable');
select pg_temp.denied($q$update public.coaches set role='admin' where id=auth.uid()$q$, 'cannot promote own role');
select pg_temp.denied($q$update public.coaches set coach_plan='paid' where id=auth.uid()$q$, 'cannot activate own Pro plan');
select pg_temp.assert(not has_function_privilege('authenticated','public.add_gym_staff_by_email(uuid,text,public.gym_staff_role,boolean,boolean,boolean,boolean)','execute'), 'add by email endpoint disabled');
select pg_temp.assert(not has_function_privilege('authenticated','public.update_gym_staff_member(uuid,uuid,public.gym_staff_role,boolean,boolean,boolean,boolean)','execute'), 'custom permission endpoint disabled');
select public.create_gym_client('00000000-0000-4000-8000-000000990001','{"name":"Parity New Client","email":"parity-new-client@example.invalid","goal":"Fitness","age":25,"membership_plan_id":"00000000-0000-4000-8000-000000960001"}');
select pg_temp.assert((select m.subscription_status='pending' and m.next_payment_due_date::date=(current_date+interval '1 month')::date and m.membership_plan_id='00000000-0000-4000-8000-000000960001' from public.client_gym_memberships m join public.clients c on c.id=m.client_id where c.email='parity-new-client@example.invalid'), 'new gym client gets selected plan, pending status and next-month due date');
select public.set_gym_staff_role('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900004','trainer');
select pg_temp.assert((select can_create_routines and not can_view_payments and not can_manage_staff from public.gym_staff where gym_id='00000000-0000-4000-8000-000000990001' and coach_id='00000000-0000-4000-8000-000000900004'), 'role assignment restores original default permissions');
select public.set_gym_staff_role('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900004','receptionist');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900003',true);
select pg_temp.denied($q$select public.set_gym_staff_role('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900004','owner')$q$, 'trainer cannot delegate ownership');
select pg_temp.denied($q$select public.create_gym_client('00000000-0000-4000-8000-000000990001','{"name":"Denied Plan","email":"denied-plan@example.invalid","membership_plan_id":"00000000-0000-4000-8000-000000960001"}')$q$, 'trainer cannot choose billing plan');
select pg_temp.denied($q$insert into public.client_gym_memberships(client_id,gym_id,membership_plan_id) values ('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000960001')$q$, 'direct membership insert cannot bypass plan permission');
select public.save_gym_routine_plan('00000000-0000-4000-8000-000000990001','{"client_id":"00000000-0000-4000-8000-000000980001","name":"Parity Plan","objective":"Strength","duration_weeks":4,"days":[{"day_number":1,"day_name":"Day A","exercises":[]}]}');
select pg_temp.assert((select primary_coach_id='00000000-0000-4000-8000-000000900006' from public.clients where id='00000000-0000-4000-8000-000000980001'), 'gym routine does not overwrite independent coach');
insert into public.measurements(client_id,client_gym_membership_id,date,weight,height,bmi) values ('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000970001',current_date,70,170,24.22);
select pg_temp.assert((select count(*)=1 from public.measurements where client_id='00000000-0000-4000-8000-000000980001'), 'trainer with client permission writes measurements');
select pg_temp.denied($q$insert into public.measurements(client_id,client_gym_membership_id,date,weight,height,bmi) values ('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000970002',current_date,70,170,24.22)$q$, 'cannot write measurement in another gym');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900002',true);
select pg_temp.denied($q$select public.save_gym_routine_plan('00000000-0000-4000-8000-000000990001',jsonb_build_object('id',(select id from public.routines where name='Parity Plan'),'client_id','00000000-0000-4000-8000-000000980001','name','Takeover','objective','Strength','days',jsonb_build_array(jsonb_build_object('day_number',1,'day_name','A','exercises','[]'::jsonb))))$q$, 'owner cannot take over another authors routine');
do $$ declare v_count integer; begin with deleted as (delete from public.routines where name='Parity Plan' returning id) select count(*) into v_count from deleted; perform pg_temp.assert(v_count=0, 'RLS blocks deleting another authors routine'); end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900004',true);
select pg_temp.denied($q$select public.save_gym_routine_plan('00000000-0000-4000-8000-000000990001','{"client_id":"00000000-0000-4000-8000-000000980001"}')$q$, 'reception cannot create routine');
select pg_temp.denied($q$update public.client_gym_memberships set membership_plan_id='00000000-0000-4000-8000-000000960001' where id='00000000-0000-4000-8000-000000970001'$q$, 'reception cannot modify plan');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900005',true);
select pg_temp.denied($q$insert into public.measurements(client_id,client_gym_membership_id,date,weight,height,bmi) values ('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000970001',current_date,70,170,24.22)$q$, 'read-only staff cannot write measurements');
select public.remove_gym_staff_member('00000000-0000-4000-8000-000000990001',auth.uid());
select pg_temp.assert(not public.is_gym_staff_member('00000000-0000-4000-8000-000000990001'), 'non-owner can leave gym');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900009',true);
select pg_temp.denied($q$select public.remove_gym_staff_member('00000000-0000-4000-8000-000000990001','00000000-0000-4000-8000-000000900010')$q$, 'delegated manager cannot remove another manager');
do $$ declare v_count integer; begin with deleted as (delete from public.gym_staff where gym_id='00000000-0000-4000-8000-000000990001' and coach_id='00000000-0000-4000-8000-000000900010' returning coach_id) select count(*) into v_count from deleted; perform pg_temp.assert(v_count=0, 'direct staff delete cannot bypass manager protection'); end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900008',true);
select public.update_client_portal_profile('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000970001','Parity Shared','88887777',null,'Unwanted address','Portal notes');
select pg_temp.assert((select address='Original address' and birth_date='1990-05-10'::date and phone='88887777' from public.clients where id='00000000-0000-4000-8000-000000980001'),'portal updates permitted fields and preserves address and existing birth date');
select pg_temp.assert(not has_function_privilege('authenticated','public.complete_portal_training_session(uuid)','execute'), 'extra explicit completion action disabled');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900006',true);
select pg_temp.denied($q$select public.admin_delete_gym_fully('00000000-0000-4000-8000-000000990001')$q$, 'independent coach cannot delete gym');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000900001',true);
select public.save_gym_routine_plan('00000000-0000-4000-8000-000000990001',jsonb_build_object('id',(select id from public.routines where name='Parity Plan'),'client_id','00000000-0000-4000-8000-000000980001','name','Parity Admin Edit','objective','Strength','days',jsonb_build_array(jsonb_build_object('day_number',1,'day_name','A','exercises','[]'::jsonb))));
select pg_temp.assert((select coach_id='00000000-0000-4000-8000-000000900003' from public.routines where name='Parity Admin Edit'), 'admin edit preserves original author');
select public.admin_clone_client_context('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000900003','00000000-0000-4000-8000-000000900006','00000000-0000-4000-8000-000000970001');
select pg_temp.assert((select count(*)=2 from public.clients where name='Parity Shared'), 'admin clones client profile');
select pg_temp.assert((select count(*)=2 from public.routines where name='Parity Admin Edit'), 'clone includes routines');
select pg_temp.assert((select count(*)=2 from public.measurements where date=current_date and client_id in (select id from public.clients where name='Parity Shared')), 'clone includes measurements');
select pg_temp.assert((select count(*)=2 from public.routine_days where routine_id in (select id from public.routines where name='Parity Admin Edit')), 'clone includes nested routine days');
select public.admin_remove_client_context('00000000-0000-4000-8000-000000980001','00000000-0000-4000-8000-000000900003','00000000-0000-4000-8000-000000970001');
select pg_temp.assert((select count(*)=1 from public.client_gym_memberships where client_id='00000000-0000-4000-8000-000000980001'), 'context deletion preserves another gym membership');
select pg_temp.assert((select primary_coach_id='00000000-0000-4000-8000-000000900006' from public.clients where id='00000000-0000-4000-8000-000000980001'), 'context deletion preserves independent profile');
select public.admin_delete_gym_fully('00000000-0000-4000-8000-000000990001');
select pg_temp.assert(not exists(select 1 from public.gyms where id='00000000-0000-4000-8000-000000990001'), 'admin deletes gym and dependent work');
select public.admin_delete_coach_fully('00000000-0000-4000-8000-000000900007');
select pg_temp.assert(not exists(select 1 from public.coaches where id='00000000-0000-4000-8000-000000900007'), 'admin deletes coach');
select pg_temp.denied($q$select public.admin_delete_coach_fully(auth.uid())$q$, 'admin cannot delete own session');
rollback;
