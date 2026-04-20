# Firebase Collection Group Audit (Gym Domain + Cross-check)

Date: 2026-04-02
Project: smart-coach-e479b
Source: docs/migrations/firebase-collection-group-audit.json

## Non-empty collection groups detected

- `gymClients`: 1
  - sample: `gymClients/fklEGb4AAqYPtoZAGol06JhIDHH2`
- `membershipPlans`: 2
  - samples:
    - `gyms/Iq1UmLHNCFcDP7pafzfP/membershipPlans/kjPZJXAJ3IjfYnCZIbBP`
    - `gyms/zdS3747Jm8ROLFe9BLjo/membershipPlans/cWdWyozCOdNTOAYRQDOj`
- `competitor_sheets`: 1
  - sample: `coaches/rilWCCRTwje9I4pucfQAXVA91so1/competitor_sheets/wzT54s9AhxuJSLRwLxHl`
- `clients`: 82
- `coaches`: 71
- `routines`: 80
- `measurements`: 14
- `exercises`: 184

## Empty collection groups (important)

- `gyms`: 0
- `gymStaff`: 0
- `gym_staff`: 0
- `clientGymMemberships`: 0
- `client_gym_memberships`: 0
- `payments`: 0
- `membership_plans`: 0

## Key conclusions

1. Gym domain data in Firebase is partial/orphaned:
   - there are membership plans under `gyms/{id}/membershipPlans`, but no root `gyms` documents.
2. No evidence of gym staff or payments in Firebase (0 docs in known collection names).
3. Coach domain is still consistent in Firebase (`coaches/clients/routines`), but `measurements` now shows 14 in Firebase while Supabase currently has fewer; this requires a reconciliation pass.

## Recommended next safe steps

1. Reconciliation pass for `measurements` (Firebase 14 vs Supabase current count) using id-map based upsert.
2. Migrate `membershipPlans` as "orphan plans" into Supabase only after deciding mapping strategy for missing parent gyms.
3. Keep gym/staff/payment migrations blocked until parent gym entities are resolved.
