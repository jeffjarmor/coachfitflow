# Prompt corto para continuar la migración

Trabaja únicamente en `smart-coach-v2`. `smart-coach` es la fuente funcional y no debe modificarse.

Antes de implementar, lee completo:

1. `smart-coach-v2/docs/CLIENT_PROFILE_MIGRATION_HANDOFF.md`
2. `smart-coach-v2/docs/MIGRATION_TRACKER.md`

Continúa con el primer P0 pendiente: migrar el constructor y detalle de rutinas reales a `/routines/new` y `/routines/:id`. Conserva la navegación, el diseño mobile-first, los tokens tipográficos, gaps, paddings, botones y footer ya existentes en V2.

No declares paridad por mostrar un botón. Deben funcionar lectura, escritura, permisos, estados, recuperación y navegación. No inventes tablas ni contratos: verifica los servicios originales y `supabase/migrations/`.

No amplíes el modal de rutina de la ficha; reemplaza sus CTA por rutas dedicadas cuando el flujo nuevo esté listo. Implementa y prueba una fase a la vez. Al finalizar ejecuta:

```bash
npm run build
npm run test:clients
npm run test:visual
npm run test:astra
```

Aclara qué fue probado con mocks y qué fue validado contra Supabase real.
