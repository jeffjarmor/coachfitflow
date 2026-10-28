# Coach role protection

The coach role guard blocks authenticated users from assigning privileged roles through direct coach-row inserts or role updates. It covers admin and owner values, including deleting and recreating one's own coach row. New self-service rows keep the existing `coach` default, and ordinary profile edits remain available. An existing administrator can provision and change roles. `service_role` and PostgreSQL maintenance retain their database access.

The trigger runs as the invoking database role and asks the existing `public.is_admin()` helper for authorization. It does not read user-editable Auth metadata. Direct execution of the trigger function is revoked; PostgreSQL invokes it through the installed trigger.

The regression check uses an in-memory PGlite PostgreSQL engine with synthetic `coaches`, Auth UID, admin helper, and the production coach RLS policies. It exercises SQL inserts and updates under `anon`, `authenticated`, and `service_role`. This checks database behavior only; it does not exercise Supabase Auth or the Data API.
