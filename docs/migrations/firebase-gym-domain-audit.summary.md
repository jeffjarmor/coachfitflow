# Firebase Gym Domain Audit (Batch 1)

Date: 2026-04-02
Project: smart-coach-e479b

## Findings

- Root collection `gyms`: **0 documents**
- Root collection `gymClients`: **1 document**
- `gymClients/fklEGb4AAqYPtoZAGol06JhIDHH2` references:
  - `gymId = Iq1UmLHNCFcDP7pafzfP` (missing in `gyms`)
  - `clientId = Y35QD5xEd3RKYXJe6ipC` (no current mapping in `migration_id_map`)

## Action Taken

- No inserts into `public.gyms` or `public.client_gym_memberships` (to avoid creating incorrect data).
- Registered `phase4_gym_domain_batch1` in `public.migration_runs` with status `warning`.
- Registered orphan reference in `public.migration_errors` for traceability and later repair.

## Artifacts

- Raw Firebase dump:
  - `docs/migrations/firebase-gym-domain-audit.raw.json`
