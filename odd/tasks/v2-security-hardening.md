# V2 shared-backend security hardening
Objective: close the three authorized P1 findings while preserving verified legitimate V1/V2 flows. Branch: `codex/v2-security-hardening`; delivery: single-pr, local reviewable work units only, no publishing or production writes.
Verification: isolated PostgreSQL authorization tests with synthetic fixtures, frontend checks where touched, independent security verifier. Forecast: 800–1,200 authored changed lines; one coherent security release, separate commits per risk-bearing unit. Engram mirror pending: no memory provider is available.

## Specs

S1. "Quiero que resolvamos estos issues, pero que no afecte nada la funcionalidad actual, que los usuarios no salgan afectados, y si va afectar en algo avisame primero&#x20;" Acceptance: preserve authorized profile edits, coach invitations, matching portal identities, plan gates, and asset reads/authorized writes. Warn before a legitimate flow changes; do not modify production in this implementation.

S2. "P1 — Elevación a administrador: una cuenta autenticada puede modificar `coaches.role` en su propio perfil. El valor `admin` está permitido y no hay un trigger que impida asignárselo." Acceptance: prevent self-provisioning/self-elevation through inserts and updates, retain ordinary signup/profile edits and authorized administration. Check rejected writes leave persisted data unchanged.

S3. "P1 — Acceso indebido a clientes: sigue permitida la autovinculación al portal sin comprobar la identidad real del cliente. El filtro de plan activo no corrige esa falta de autorización. Además, las políticas de clientes reutilizan ese permiso para lectura, edición y borrado." Acceptance: forged new and historical independent portal links cannot authorize reads, edits, or deletes; valid coach-issued identities still work. Preserve the existing legacy mismatch record for manual verification; do not remap or delete identities. Accepted activation change: email/user metadata alone cannot establish client identity; the coach must issue the invitation.

S4. "P1 — Archivos de otros gimnasios: las políticas de `assets` permiten sobrescribir y eliminar objetos mediante Storage sin comprobar propietario ni gimnasio." Acceptance: deny cross-tenant upload/overwrite/move/delete while preserving public reads, own coach media, owner gym logos and cleanup, and administrative global exercise media. Do not move, delete, or rewrite existing objects.

## Tasks

- T1 | S1–S2 | delegated direct (parallel independent role/storage behavior with disjoint surfaces) | verified locally | commit `78247c8`; Risk: item 2 (authorization trigger), item 1 (migration).
- T2 | S1, S4 | delegated direct (parallel independent role/storage behavior with disjoint surfaces) | verified locally | commit `0cf9f18`; Risk: item 2 (Storage policies), item 1 (migration).
- T3 | S1, S3 | inline | verified locally | commit `8d4424e`; Risk: item 2 (portal identity authorization), item 1 (migration).
- T4 | S1–S4 | inline integration + delegated independent verification | local preparation verified; production application checks remain pending | commit `8866161`; Risk: item 2 (security), item 5 (deployment instructions).

## Log

L1 (2026-10-28). Original request:

> Quiero que resolvamos estos issues, pero que no afecte nada la funcionalidad actual, que los usuarios no salgan afectados, y si va afectar en algo avisame primero&#x20;
>
> - **P1 — Elevación a administrador:** una cuenta autenticada puede modificar `coaches.role` en su propio perfil. El valor `admin` está permitido y no hay un trigger que impida asignárselo.
> - **P1 — Acceso indebido a clientes:** sigue permitida la autovinculación al portal sin comprobar la identidad real del cliente. El filtro de plan activo no corrige esa falta de autorización. Además, las políticas de clientes reutilizan ese permiso para **lectura, edición y borrado**.
> - **P1 — Archivos de otros gimnasios:** las políticas de `assets` permiten sobrescribir y eliminar objetos mediante Storage sin comprobar propietario ni gimnasio.

L2 (2026-10-28). Authorized production metadata reads through this session's Supabase connection, then separately authorized aggregate-only portal/storage ownership counts. Results: 36 portal links, 35 identity matches, one mismatch, no missing identities/coach mismatches, 16 active-plan links, zero active identity mismatches. Assets: 19 objects (13 coach, six gym), zero unknown/malformed prefixes or missing Storage owners; three orphan coach paths and six orphan gym paths. Counts do not establish attacks or human ownership; no personal data or object paths were returned.

L3 (2026-10-28). Before implementation, warned that email/metadata-only activation must be replaced by a coach-issued identity and that the unmatched legacy link remains pending manual verification. User accepted: "sigue con el proceso estoy deacuerdo". Scope: prepare repository corrections and tests; production writes/deployment remain outside this authorization.

L4. Production metadata confirms the three vulnerable rules still exist. Do not apply all 18 optional migrations: use narrow new migrations. V1 and V2 share the backend. Current persistent local stacks are stopped and must be preserved. A bounded runtime worker is checking an isolated PostgreSQL runner. Receipt-driven review is globally off; do not enable it. Independent functional security verification still applies. Exact skill paths were supplied to workers; the registry has no more specific security workflow, and its referenced shared skill-resolver file is unavailable.

L5. Public dependency installation initially failed under network restrictions; the same bounded temporary installation succeeded with automatic approval review. Supabase CLI 2.122.0 generated the three new migration filenames. PGlite 0.5.12 supplies actual isolated PostgreSQL RLS/trigger tests without starting or changing persistent stacks. Dependency declarations/lock are isolated under `supabase/tests/security`; application dependencies are unchanged.

L6. Worker role baseline reproduced two escalation failures; patched six tests passed. Worker Storage baseline reproduced five broad-write failures; patched six tests passed. Portal/legacy baseline run reproduced five failures and three preserved-flow passes; patched eight passed. Timing exception: the portal SQL candidate was written before the baseline run, which then explicitly skipped it; the V1 method test was observed failing before the method edit. No before-edit SQL RED is claimed. Combined security suite: 20/20 passed; rejected mutations check unchanged persisted rows/objects. Production aggregate path recognition: all 19 supported, zero unrecognized. No production writes occurred.

L7. Both V1/V2 TypeScript projects passed with `--noEmit --incremental false`. Offline backend checks passed, original RPC contract reported zero incompatibilities, and all 12 contract tests passed. Full Auth/PostgREST/Storage HTTP integration is pending because the full local stack is unavailable. Tests explicitly use reduced schema, not a claimed production clone.

L8. Delegated-writer native assessment was attempted with explicit security item 2 escalation; it returned high/unassessable because new files were untracked. This does not lower risk. The global receipt-driven switch remains off, so no native review transaction was started. Independent security verification remains required. Technical test/deployment documentation is in English.

L9 (2026-10-28). User asked: "puedes desirme que son esas 18 migraciones, y si se pueden descartar". Explained their grouped purposes with the exact inventory link; recommended excluding them from this release while preserving migration history and expanded-schema test reproducibility. This was a read-only question, not authorization to delete files. Continued the accepted three-patch implementation.

L10. Independent verifier used a fresh system-temp candidate copy and baseline 951ba69. All S1–S4 passed within local proof; no change-caused blockers. Independent combined probes confirmed unchanged stored data, rejected privileged UPSERT/JWT-role spoof, cross-tenant Storage UPSERT/move/bucket changes, historical-link mutations and identity reassignment. Preserved legitimate/admin actions and helper ACL/search paths. Adopted the combined probes as a regression test, reusing a shared portal fixture. Final combined security suite after adoption: 21/21 passed. Parent spot check: role suite 6/6 passed. No full HTTP/deployed-schema compatibility verdict is claimed.

L11. Local implementation is ready for review. Before production: separately authorize destination/operation/session; validate the three patches on the actual isolated Supabase schema through Auth/PostgREST/Storage, confirm representative V1/V2 flows, and obtain deployment approval. The one inactive mismatched identity remains for authorized manual verification. The 18 historical optional migrations remain unchanged/excluded. No push, PR, deployment, role/data rewrite or remote mutation is authorized/performed. Mirror remains pending because Engram is unavailable.

L12. Local work units: `78247c8` role guard/tests, `0cf9f18` asset isolation/tests, `8d4424e` portal/V1 activation/tests, `8866161` combined regression and rollout instructions. Running authored delta: 1,014 added/deleted lines excluding generated dependency lock, plus this tracking document. Single-pr delivery strategy remains appropriate for this coherent patch. All units are high-risk by named items; native RDD outcomes are disabled/unmanaged, not approved. Final normalized combined probe passed 1/1 after adoption; no functional source changed after its applicable checks. Removed temporary dependency/probe copies after verification; no persistent test state was modified.
