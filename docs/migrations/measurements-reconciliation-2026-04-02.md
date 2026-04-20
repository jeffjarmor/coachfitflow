# Measurements Reconciliation (2026-04-02)

## Scope
- Reconcile Firebase `measurements` vs Supabase `public.measurements`.
- Keep migration idempotent and avoid fabricating parent entities.

## Verified counts
- Firebase collection group `measurements`: **14**
- Supabase `public.measurements`: **8**
- Supabase `migration_id_map` entries for measurement: **8**

## Result
- 8/14 measurement docs are already migrated and mapped.
- 6/14 remain unresolved because they are orphan subcollection docs in Firebase (measurement path exists but parent client doc is not present under the coach path during slice extraction).

## Registered in Supabase
- `migration_runs.phase = phase3_measurements_reconciliation_2026_04_02`
- `status = warning`
- `notes = Firebase collectionGroup=14; Supabase migrated=8; unresolved_orphans=6`
- 6 rows inserted in `public.migration_errors` with code:
  - `ORPHAN_FIRESTORE_SUBCOLLECTION`

## Orphan measurement paths
1. `coaches/06QMr1HLwdfE2AwGt05kU6ZCWRI3/clients/0xZbfrlWYxm8JOAXw9ck/measurements/AyVzPMC8nLkOF3ek33nJ`
2. `coaches/06QMr1HLwdfE2AwGt05kU6ZCWRI3/clients/KBKNqYX5xja1H50rx5Uh/measurements/MtUHq7XmdMNbDh9uTeF6`
3. `coaches/06QMr1HLwdfE2AwGt05kU6ZCWRI3/clients/KBKNqYX5xja1H50rx5Uh/measurements/puUhIafcm085t7blqJWh`
4. `coaches/06QMr1HLwdfE2AwGt05kU6ZCWRI3/clients/KTjC0pW84eRNLXjrWX89/measurements/bg5k16M55Awkeu5D8wH9`
5. `coaches/06QMr1HLwdfE2AwGt05kU6ZCWRI3/clients/OumsjxxynCoXYV17mPaX/measurements/EY4WHWSER4NVLv0igZ2L`
6. `coaches/kcnRm4xYrJhodag2vOUSG5buwBq1/clients/iTAog40zALflPUvM3uTn/measurements/BOr8Utxd0UXkvY5ShZKN`

## Decision
- No synthetic insert was performed for those 6 measurement docs.
- Reconciliation is complete for valid/mappable measurement entities.
