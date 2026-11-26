-- Read-only. This query returns names, callable signatures and access metadata.
-- It returns neither function bodies nor customer or payment records.
select jsonb_build_object(
  'migrations', (
    select coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'arguments', pg_get_function_arguments(p.oid),
      'executableByAuthenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  ),
  'buckets', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public) order by id), '[]'::jsonb)
    from storage.buckets
  )
) as metadata;
