# Admin billing reconciliation and plans
Branch `codex/onvo-billing-local`. Delivery: single PR scope, local verification. Runner: Angular staging build, browser checks, local SQL and Deno tests.
Forecast: 650–900 authored lines across the reporting backend and the two admin views.

## Specs

- S1: “quiero que usemos el 03 · Conciliación contable y el admin billing plans en el perfil de admin”. Implement both tabs at `/admin/billing` with existing admin access, filters, and sandbox data. Reconciliation shows confirmed payout figures, recorded invoice amounts, and a filtered CSV. Plans shows each coach's access and recorded renewal state.
- S2: “respeta las fuentes y tamaños, ademas ya tenemos una libreria de graficas instaladas usa esa misma no importa que las graficas no sean iguales a las del figma”. “no uses las fuentes del figma, usa las que ya estaban en el sitio web”. Use the existing site font stack and Figma's typography sizes in the new Billing content. Reuse `app-site-chart` / ECharts.

## Tasks

- [x] T1 · S1 · delegated backend (independent database, webhook, tests) · `6675cd5` · Risk item 2: restrict cross-account report reads and verify payout authenticity.
- [x] T2 · S1–S2 · delegated frontend (independent admin views and CSV) · `a4f0878` · Existing route guard, site font stack, and chart library verified.

## Log

- L1: “quiero que usemos el 03 · Conciliación contable y el admin billing plans en el perfil de admin respeta las fuentes y tamaños, ademas ya tenemos una libreria de graficas instaladas usa esa misma no importa que las graficas no sean iguales a las del figma”
- L2: Approved designs are Figma nodes `110:2343` and `113:2106`. Existing invoice records contain a registration date, not an observed settlement date. Payouts and invoices remain distinct financial records. The sandbox is the active target; no provider endpoint is configured remotely by this task. Engram mirror pending (provider unavailable).
- L3 (2026-11-11): “no uses las fuentes del figma, usa las que ya estaban en el sitio web” supersedes the Manrope decision. The application keeps the existing Avenir Next/Avenir/Segoe UI stack.
- L4: Local baseline RPC probes returned 404. Applied the two expected migrations on port 54321 only. The first rollback SQL probe identified Supabase's default service-role table grants. The corrective migration restricted the ledger to inserts. The final rollback SQL test passed, as did the real HTTP role matrix (200/200 for admin, 403/403 for trainer), signed webhook tests (8/8), Deno entry check, plan-access check, CSV tests (3/3), and staging build.
- L5: Browser verification found and corrected an Angular lifecycle injection error and mobile chart overflow. The final local and fixture browser checks covered tab navigation and Back, Planes search and upcoming expiry, ECharts SVG resizing at 390px, CSV download, and the existing font at the Figma heading size of 40/48px. The fixture exercised payout figures while the actual sandbox report had zero settlements. The independent verifier confirmed the SQL privileges, signed intake, and the distinction between collected and liquidated amounts. Receipt-driven development is off; the informational assessment could not create its temporary index inside the sandbox.
