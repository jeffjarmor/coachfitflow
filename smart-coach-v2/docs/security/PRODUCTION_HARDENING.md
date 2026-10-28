# Shared-backend security patch

Prepared 2026-10-28. This patch is local repository preparation, not a deployment record or production security sign-off. V1 and V2 share Supabase project `bzhqprxolseyxuuwodqs`; deploying a frontend alone does not activate these database protections.

## Changes and compatibility

| Finding | Change | Preserved behavior |
| --- | --- | --- |
| Self-assigned admin role | A trigger rejects untrusted privileged signup and role changes, including deletion followed by privileged reinsertion. | Ordinary coach signup/profile edits; administrator provisioning and trusted database maintenance. Billing/account fields are outside this narrow role patch. |
| Forged independent portal links | Link policies resolve the actual client owner; the access helper requires `clients.user_id` to match the portal identity and checks the real primary coach. | Coach-issued invitations, matching identities, existing plan expiry rules, profile edits and gym authorization paths. |
| Cross-tenant assets writes | Upload, update and delete require an authorized coach/gym path. Updates validate both old and new paths. | Public image reads, own coach logos/exercises, gym-owner logo replacement/cleanup, administrative global media and orphan cleanup. |

V1 independent activation now acknowledges existing invitations only. It no longer assigns identity using user-editable metadata or an email match. V2 already uses linked activation and needs no new RPC. The owner accepted this activation change before implementation. Registration, sessions and password callbacks are not changed.

No customer record, association, file, plan or existing role is rewritten by these migrations. The patch prevents future self-elevation; it does not determine whether any existing privileged account was legitimately assigned. That separate ownership audit is outside the aggregate-only access authorized here.

Aggregate-only production checks on 2026-10-28 found 36 independent links: 35 identity matches, one mismatch, 16 active-plan links and zero active identity mismatches. The mismatch remains stored and will not become an authorization source if the coach later renews. An authorized administrator and the owning coach must verify its intended identity before relinking/reinviting; never repair it from email or metadata alone.

All 19 existing asset paths match the supported patterns (13 coach, six gym). Three coach paths and six gym paths have no current matching entity. Their public URLs remain readable. An administrator or trusted service performs orphan cleanup; do not grandfather gym write access based on the original uploader after gym ownership is removed.

## Local verification

Use the repository's supported Node version. Install V2 dependencies for the V1 method-contract test (`npm ci` in `smart-coach-v2`), then from the repository root:

```sh
pnpm --dir supabase/tests/security install --frozen-lockfile
pnpm --dir supabase/tests/security test
node smart-coach-v2/node_modules/typescript/bin/tsc -p smart-coach/tsconfig.app.json --noEmit --incremental false
node smart-coach-v2/node_modules/typescript/bin/tsc -p smart-coach-v2/tsconfig.app.json --noEmit --incremental false
cd smart-coach-v2
npm run check:backend
npm run check:original-backend
npm run test:original-backend-contract
```

The security tests create disposable in-memory PostgreSQL databases with PGlite and synthetic identities/files. They exercise real RLS, triggers and SQL mutations against the relevant reduced production schema, including unchanged state after rejected attacks. `HARDENING_BASELINE=1` deliberately skips the patches and reproduces the vulnerabilities; it is expected to fail. No test connects to a backend. `PGLITE_MODULE` optionally selects a separately installed local PGlite module.

These checks do not run the complete 60-migration backend, Supabase Auth, PostgREST or the Storage HTTP API. Before production, run end-to-end checks on an explicitly authorized isolated Supabase environment with the actual backend schema: coach signup/profile/admin role management; a coach invitation and client activation/profile; expired and valid plans; gym operations; own/cross-tenant upload, upsert, move and delete; anonymous image reads; previous-logo cleanup. Include V1 if it remains available. Do not use customer accounts/files for exploit tests.

## Controlled application

1. Obtain separate authorization for the production destination, migration operations and credential/session. Local development approval does not authorize applying SQL remotely.
2. Confirm the release revision and capture the current relevant policies, function definitions/ACLs and trigger definitions in the team's secure change record. Check for drift since 2026-10-28 and repeat the aggregate identity/path checks. Stop for unexpected policy changes or newly affected active identities.
3. Have the database administrator apply only these files in order, using the team's approved migration mechanism, and record their versions:

   - `supabase/migrations/20261028184202_harden_coach_roles.sql`
   - `supabase/migrations/20261028184203_harden_assets_tenant_writes.sql`
   - `supabase/migrations/20261028184209_harden_independent_portal_identity.sql`

4. Do **not** run a global `supabase db push`: the repository also contains 18 optional migrations excluded from the original production contract. These patches do not require them.
5. Deploy the V1 activation adjustment if V1 is still served; deploy V2 using the regular frontend handoff. Confirm representative authorized flows and public asset URLs, then inspect errors and record results. Review Supabase security advisors after application.

Apply each file as a complete transaction. On failure, roll back that transaction and investigate; do not weaken guards or edit customer identities to make a deployment succeed. Frontend rollback does not revert database changes. If a database regression requires rollback, the database administrator must use the captured pre-change definitions with explicit approval: restoring the former policies reopens the reported vulnerabilities. Prefer a bounded corrective patch when feasible. This document intentionally does not provide an automatic security-disable script.

Risk: item 1 (database migrations), item 2 (authorization), item 5 (release procedure).
