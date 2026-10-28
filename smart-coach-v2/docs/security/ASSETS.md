# Asset Storage access

The `assets` bucket remains public for reads. Authenticated writes are limited to supported paths:

- A coach can create, replace, move, and delete files under `coaches/{their-auth-id}/logo/` and `coaches/{their-auth-id}/exercises/`.
- A gym owner can manage that gym's `gyms/{gym-id}/logo*` files. The ownership check uses the existing `public.is_gym_owner(uuid)` authorization, which also recognizes administrators and co-owners.
- Administrators can manage global exercise media under `exercises_global/` and clean up any legacy or orphaned object.
- Unknown paths and malformed gym UUID paths are denied to ordinary users. UUID validation happens before the gym-owner helper casts the path value.

Updates check both the existing and proposed path. This prevents an authorized user from moving an object into another coach's or gym's namespace. Public reads continue to work for every existing object, including paths whose database entity is now orphaned.

The current Storage inventory includes orphaned coach and gym paths. Do not move, rewrite, or delete those files as part of this policy change. When an orphan must be removed, use an administrator or trusted service-role cleanup. Storage writes do not infer continuing gym ownership from the object's original uploader: access ends when the user is no longer authorized by the gym ownership records.

`supabase/tests/security/assets.test.mjs` exercises the relevant RLS policies using isolated PGlite tables and DML. It does not exercise Supabase Storage API request parsing, upload limits, signing, or CDN behavior; those remain governed by Supabase Storage and bucket configuration.
