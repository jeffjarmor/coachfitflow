# Traspaso: perfil y centro del cliente

Última auditoría: 2026-09-24

Las tres migraciones RPC del 2026-09-23 están aplicadas y registradas en Supabase. La migración `20260912143000_add_self_service_coach_account_deletion.sql` **no** está aplicada; su archivo local se corrigió para conservar identidades Auth compartidas, pero aún requiere una revisión y prueba separadas antes de desplegarse.

## Alcance exacto

Este documento compara el centro del cliente de `smart-coach` con `smart-coach-v2`.
La prioridad solicitada es un entrenador independiente con plan estándar. Las funciones Pro se deben mostrar bloqueadas; su comportamiento activo también se documenta porque ya existe parcialmente en V2.

No asumir que una acción está migrada solo porque aparece un botón. Para marcarla completa deben existir ruta o interfaz, persistencia, permisos, estados de error y una prueba del flujo.

## Estado real

| Área | Estado V2 | Evidencia / límite |
| --- | --- | --- |
| Lista de clientes | Migrado | Tarjetas navegables, búsqueda con debounce, paginación de 10 y tutorial contextual. |
| Crear y editar cliente | Validación | Alta real verificada con cuenta Pro. Se separó `INSERT` de la lectura del ID por una incompatibilidad de `RETURNING` con la política RLS actual. Falta validar la UI y edición real. |
| Encabezado y resumen | Migrado | Editar, competidor, Portal Pro, eliminar, datos personales, métricas, objetivo y notas. |
| Rutinas | Validación | RPC aplicada; creación, edición y conservación del ID del día verificadas en Supabase real. Faltan restricciones Pro/RLS e impresión real. |
| Mediciones | Validación | Alta, edición y lectura verificadas en Supabase real. Faltan UI y más casos de indicadores. |
| Competidor | Validación | RPC aplicada; creación, edición y lectura verificadas en Supabase real. Faltan PDF y pruebas de permisos reales. |
| Portal del cliente | Validación | Identidad, acceso y solicitud de correo de invitación verificados en Supabase real. No se verificó la entrega en la bandeja ni el rate limit. |
| Historial RIR | Validación | Agrupación por fecha, día y ejercicio, expansión y refresco cada 5 segundos implementados. Falta validar sesiones reales. |
| Eliminación del cliente | Validación | RPC aplicada; cliente temporal e identidad Auth exclusiva eliminados en Supabase real. Falta probar identidad compartida. |
| Responsive y estilo | Migrado | Revisado en 320, 390 y 1440 px con tokens del landing. |
| Gimnasios y administración | Fuera del alcance actual | V2 no implementa membresías, permisos de staff ni rutas admin. |

## Ya migrado y verificado

- Rutas `/clients`, `/clients/new`, `/clients/:id/edit` y `/clients/:id`.
- Tarjeta completa del cliente con nombre, correo, edad, teléfono, objetivo y acceso a la ficha.
- Paginación de 10 clientes, búsqueda con debounce y reinicio automático a la primera página.
- Recarga reactiva de la ficha cuando cambia `:id` en una instancia reutilizada.
- Guardado de edición deshabilitado mientras el formulario permanece intacto.
- Ayuda guiada en lista, ficha, asistente de rutinas y asistente de competidor.
- Alta, edición y eliminación del cliente independiente.
- Campos: nombre, correo, teléfono, dirección, nacimiento, altura, peso, objetivo y notas.
- Validación de correo duplicado contra `coaches` y `clients`.
- Pestañas Rutinas, Mediciones, Competidor y RIR.
- Rutinas completas con cliente, datos, distribución, ejercicios, progresión, calentamiento, biseries/triseries, revisión, edición, impresión y eliminación.
- Hoja de competidor completa con distribución semanal, entrenamientos, bloques, tres microciclos, revisión, edición, PDF y eliminación.
- CRUD básico de mediciones.
- Captura de todos los valores corporales usados por el formulario original e IMC automático.
- Resumen de la última medición y cambio frente a la anterior para peso, grasa y masa muscular.
- Gráfica seleccionable de peso, grasa y masa muscular, y detalle expandible de todos los indicadores.
- Bloqueo de Portal/RIR para el plan estándar y CTA hacia el perfil.
- Invitación manual al portal para un entrenador independiente Pro activo.
- Invitación automática no bloqueante después de crear un cliente Pro.
- Estados diferenciados para plan estándar, Pro activo, Pro con pago pendiente y cuenta de gimnasio no soportada en V2.
- RIR agrupado por fecha, día de rutina, orden y ejercicio, con la sesión más reciente abierta.
- Actualización de RIR cada 5 segundos solo mientras la pestaña está activa.
- Eliminación mediante RPC con limpieza condicional de identidades Auth huérfanas.
- Confirmaciones para operaciones destructivas.
- Estados de carga, vacío, error, éxito y reintento en las superficies principales.
- Pruebas Playwright con datos simulados para CRUD y responsive.

## Faltantes prioritarios

### P0 — Rutinas reales: RPC aplicada, pendiente de validación final

La ficha navega a un asistente dedicado y dejó de mantener un segundo formulario parcial. El flujo implementado cubre:

- `/routines/new` con `?clientId=` y `/routines/:id` para consulta y edición.
- Cinco etapas, guardado local del borrador y confirmación al abandonar cambios.
- Grupos musculares, biblioteca por día, orden, reemplazo y movimiento entre días.
- Series, repeticiones, descanso, notas y progresión por rangos de semanas.
- Calentamiento, ejercicios de activación y texto personalizado.
- Copia de configuración entre días y biseries/triseries condicionadas por el plan.
- Revisión completa, edición, eliminación e impresión/guardado como PDF.
- Una RPC transaccional que valida entrenador, cliente y ejercicios antes de reemplazar el plan anidado.

`20260923120000_save_complete_routine_plan_rpc.sql` se aplicó el 2026-09-24. Creación y edición reales pasaron; la edición conserva el ID del día para no borrar el historial RIR por cascada. Pendientes: restricciones Pro/RLS e impresión con Supabase real.

Fuente original:

- `smart-coach/src/app/pages/routines/routine-wizard/`
- `smart-coach/src/app/pages/routines/routine-detail/routine-detail.component.ts`
- `smart-coach/src/app/services/routine.service.ts`
- `smart-coach/src/app/models/routine.model.ts`

Implementación V2 actual:

- `smart-coach-v2/src/app/features/routines/routine-builder.component.*`
- `smart-coach-v2/src/app/features/routines/routine-data.service.ts`
- `smart-coach-v2/src/app/features/routines/routine.models.ts`
- `supabase/migrations/20260923120000_save_complete_routine_plan_rpc.sql`
- `smart-coach-v2/scripts/routine-check.mjs`

### P0 — Hoja de competidor: RPC aplicada, pendiente de validación final

La ficha ahora navega a un editor dedicado y dejó de mantener el formulario parcial. El flujo implementado cubre:

- `/competitor/new` con `?clientId=` y `/competitor/:id/edit`.
- Selección de atleta y configuración general.
- Crear, editar, ordenar y eliminar entrenamientos.
- Columnas de días y planes semanales.
- Bloques de ejercicios por entrenamiento.
- Tres microciclos por bloque con series, repeticiones y descanso.
- Notas por bloque.
- Navegación progresiva, resumen, borrador recuperable y restauración de plantilla.
- Guardado, actualización, eliminación y descarga de un PDF real con control semanal y hojas imprimibles.
- Una RPC atómica que valida sesión, propiedad del cliente y contenido completo antes de insertar o actualizar.

`20260923150000_save_competitor_sheet_rpc.sql` se aplicó el 2026-09-24. Creación, edición y lectura reales pasaron. Pendientes: RLS, eliminación y PDF contra Supabase real.

Fuente original:

- `smart-coach/src/app/pages/competitor/competitor-sheet/`
- `smart-coach/src/app/services/competitor.service.ts`
- `smart-coach/src/app/services/competitor-pdf.service.ts`
- `smart-coach/src/app/models/competitor-sheet.model.ts`

Implementación V2 actual:

- `smart-coach-v2/src/app/features/competitor/competitor-sheet.component.*`
- `smart-coach-v2/src/app/features/competitor/competitor-data.service.ts`
- `smart-coach-v2/src/app/features/competitor/competitor-pdf.service.ts`
- `smart-coach-v2/src/app/features/competitor/competitor.models.ts`
- `supabase/migrations/20260923150000_save_competitor_sheet_rpc.sql`
- `smart-coach-v2/scripts/competitor-check.mjs`

### P0 — Eliminación segura del cliente: RPC aplicada, pendientes casos compartidos

La base de datos elimina por cascada rutinas, mediciones, hojas, accesos independientes y sesiones relacionadas. Sin embargo, borrar `clients` no elimina por sí mismo la fila en `auth.users`.

El original:

1. Obtiene los usuarios Auth vinculados.
2. Elimina las rutinas.
3. Elimina el cliente.
4. Comprueba si cada usuario todavía tiene otro acceso al portal.
5. Invoca `admin_delete_auth_user` únicamente cuando quedó sin accesos.

V2 usa `delete_owned_independent_client`, una RPC `security definer` que:

1. exige sesión autenticada y entrenador independiente;
2. comprueba que el cliente pertenezca al entrenador actual;
3. captura todas las identidades Auth vinculadas antes del borrado;
4. elimina el cliente y deja actuar a las cascadas de datos;
5. elimina cada identidad Auth únicamente si ya no tiene otro cliente ni acceso de Portal independiente o de gimnasio.

La RPC no expone claves administrativas en el navegador. `20260923170000_delete_owned_independent_client_safely.sql` se aplicó el 2026-09-24; se verificó la eliminación de cliente e identidad Auth exclusivos y la ausencia de residuos temporales. Pendiente: clientes con identidad compartida y sin identidad.

Fuente original: `smart-coach/src/app/services/client.service.ts`, métodos `deleteClient` y `getLinkedAuthUserIds`.

Implementación V2 actual:

- `supabase/migrations/20260923170000_delete_owned_independent_client_safely.sql`
- `smart-coach-v2/src/app/core/data/coach-data.service.ts`
- `smart-coach-v2/scripts/client-check.mjs`

### P1 — Evolución de mediciones: implementada, pendiente de validación real

La ficha V2 ahora incluye:

- Resumen de la medición más reciente.
- Cambio frente a la medición anterior para peso, grasa y masa muscular.
- Gráfica con selector Peso / Grasa / Masa muscular.
- Detalle expandible de grasa visceral, edad metabólica, calorías, masa ósea, agua y todas las circunferencias.
- Formato y precisión consistentes para valores y unidades.

La gráfica usa SVG y HTML accesible propios, sin añadir una dependencia de visualización. Se limita a las ocho mediciones recientes para mantener legibilidad móvil. Falta verificar el resultado con datos reales extensos y valores nulos.

Fuente original: `smart-coach/src/app/pages/measurements/client-measurements/`.

### P1 — Historial RIR: implementado, pendiente de validación real

V2 ahora:

- Agrupa series por día de rutina, orden y ejercicio.
- Muestra el nombre y número del día.
- Permite expandir/contraer sesiones; la más reciente inicia abierta.
- Actualiza automáticamente cada 5 segundos mientras la pestaña RIR está activa.
- Detiene el temporizador al salir de la pestaña o destruir la vista.

La consulta omite sesiones sin valores registrados y combina sesiones de una misma fecha, igual que el flujo original. Falta verificar RLS y actualizaciones concurrentes con un cliente real.

Fuente original: `smart-coach/src/app/pages/clients/client-detail/client-detail.component.ts`, métodos de historial RIR y temporizador.

### P1 — Portal y reglas Pro: implementadas, pendientes de validación real

V2 ahora:

- Envía la invitación automáticamente después de crear un cliente cuando el entrenador independiente tiene Pro activo.
- Mantiene la creación del cliente aunque falle el correo y muestra una advertencia recuperable.
- Diferencia plan estándar, Pro activo y Pro con pago pendiente.
- Muestra mensajes específicos para el límite temporal de Supabase.
- No afirma soporte de Portal para gimnasio: muestra explícitamente que ese flujo no está disponible en V2.

La creación del cliente se confirma aunque preparar el acceso o enviar el correo falle; la ficha recibe una advertencia recuperable y ofrece reintento. Supabase aceptó una solicitud de invitación real; falta verificar entrega y aceptación del correo, límite 429 y pago vencido.

Fuente original:

- `smart-coach/src/app/pages/clients/client-form/client-form.component.ts`
- `smart-coach/src/app/models/coach.model.ts`
- `smart-coach/src/app/services/auth.service.ts`

### P2 — Lista, navegación y ayuda: implementado y validado

- Paginación de 10 clientes.
- Búsqueda con debounce de 300 ms y reinicio de página.
- Ayuda contextual en lista, ficha y asistentes.
- Recarga del componente al cambiar `:id`, con protección contra respuestas tardías de la ficha anterior.
- `Guardar cambios` deshabilitado mientras el formulario editado sigue intacto.

Validado con Playwright a 320, 390 y 1440 px, incluyendo una lista simulada de 23 clientes. La cuenta Pro de prueba también confirmó lectura real del listado, apertura de ficha, tutorial y estado inicial del formulario sin efectuar escrituras.

## Fuera de alcance para el coach estándar

No migrar estos puntos dentro de esta fase salvo que el alcance cambie explícitamente:

- Selección de membresía del gimnasio.
- Invitación de cliente de gimnasio.
- Permisos de staff como `canCreateRoutines`.
- Lectura/escritura por `gymId`.
- Modos y rutas de administración para editar clientes de otros coaches.

Estas capacidades sí existen en `smart-coach`, por lo que V2 no debe presentarse como reemplazo completo para cuentas de gimnasio o administrador.

## Orden recomendado para el siguiente modelo

1. Revisar y probar la migración de eliminación de cuenta del entrenador, aún no aplicada; no usar una cuenta activa para una prueba destructiva.
2. Completar pruebas de RLS/planes y de eliminación de cliente con identidades Auth compartidas y sin identidad.
3. Validar RIR, evolución de mediciones e invitaciones con datos reales y recepción del correo.
4. Probar exportaciones y eliminaciones reales de rutinas/competidor, además de `/measurements` con historial.

Evitar ampliar el modal actual de la ficha hasta convertirlo en un formulario gigante. Rutinas y competidor son flujos complejos y deben vivir en páginas dedicadas; la ficha debe seguir siendo el centro para consultar y entrar a cada flujo.

## Contrato para evitar alucinaciones

- `smart-coach` es la fuente funcional; no modificarla durante la migración.
- `smart-coach-v2` es el destino.
- No inventar nombres de tablas ni columnas: revisar `supabase/migrations/` y los servicios originales.
- No declarar Rutinas o Competidor como completas hasta validar sus RPC, RLS y exportaciones con Supabase real.
- Distinguir las pruebas reales de `scripts/live-supabase-migration-check.mjs` de `scripts/client-check.mjs`, que intercepta las llamadas de red. La primera cubre escrituras básicas, pero no cierra RLS, correo recibido ni toda la UI.
- Mantener los tokens tipográficos, gaps, paddings y botones ya definidos en V2.
- Diseñar primero para 320–390 px y verificar después 1440 px.
- Mantener confirmación en eliminaciones y recuperación en errores.
- Preservar RLS; nunca usar una service-role key en frontend.
- Cada fase debe terminar con build, prueba de interacción y captura visual.

## Comandos de verificación

Desde `smart-coach-v2`:

```bash
npm run build
npm run test:routines
npm run test:competitor
npm run test:clients
npm run test:visual
npm run test:astra
npm run test:admin
```

Las pruebas anteriores validan UI con datos simulados. Antes de cerrar una fase de datos también se necesita una prueba manual contra Supabase real con:

- entrenador independiente estándar;
- entrenador independiente Pro activo;
- error de permisos/RLS;
- correo de invitación exitoso y limitado por rate limit;
- eliminación de cliente con y sin usuario Auth vinculado.

## Criterio de cierre

El perfil del cliente estará completamente migrado para entrenador independiente cuando:

- todos los CTA lleven a un flujo utilizable;
- una rutina pueda crearse, verse, modificarse y exportarse con ejercicios reales;
- una hoja de competidor pueda editar su estructura y exportarse;
- las mediciones muestren evolución y detalle completo;
- RIR conserve agrupación y actualización del original;
- Portal e invitaciones respeten los tres estados del plan;
- la eliminación no deje usuarios Auth huérfanos;
- Supabase real, RLS, móvil y errores estén verificados.
