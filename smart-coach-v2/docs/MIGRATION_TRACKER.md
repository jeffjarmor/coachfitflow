# Control de migración de vistas

Última actualización: 2026-10-08

Este documento es la fuente de verdad para el traslado de pantallas desde `smart-coach` hacia `smart-coach-v2`.

## Estado actual de paridad

La revisión del 2026-10-08 detectó diferencias de permisos y acciones frente al original. Se implementaron las correcciones descritas en [ROLE_PARITY.md](ROLE_PARITY.md), con pruebas locales de interfaz y servidor. La versión corregida está pendiente de validación en staging alojado. Los cierres del 2026-09-26 que aparecen debajo documentan la versión anterior y no acreditan la paridad de esta revisión.

El objetivo es conservar los perfiles y capacidades de `smart-coach`, renovando la interfaz. Crear gimnasios es exclusivo de administración; se restablecen las acciones administrativas faltantes y se retiran los flujos adicionales de personal y portal.

## Registro anterior — 2026-09-26

| Clasificación | Cantidad |
| --- | ---: |
| Migradas con fidelidad validada | 17 |
| Implementadas, aún en validación final | 0 |
| Nuevos módulos en progreso | 1 |
| Vistas nuevas sin equivalente directo | 1 |
| Rutas disponibles actualmente en V2 | 55 |

El Release Candidate del entrenador independiente quedó **aprobado en el staging alojado** el 2026-09-26. Las 11 superficies que estaban en `Validación`, además de la landing ya cerrada, pasaron la matriz con cuentas temporales de plan estándar, Pro activo, Pro vencido, segundo entrenador y administrador. Las pruebas cubren Auth real, CRUD y aislamiento RLS, permisos por plan, Storage, borrado de cuenta, administración limitada de ejercicios y carga inicial. El detalle del centro del cliente está en `CLIENT_PROFILE_MIGRATION_HANDOFF.md`.

Este cierre corresponde solamente al RC en stage: no autoriza el corte a producción. La fase multigimnasio ya incluye onboarding, selector, ingreso por código, contexto activo, dashboard, operación validada de clientes, mediciones, rutinas, competidor, RIR e invitación al Portal, además de los MVP validados de pagos, planes, personal y configuración. El Portal ya cubre resumen, perfil editable, mediciones, pagos, rutinas, registro de series/carga/RIR, PDF del plan y un historial consolidado descargable. La administración de entrenadores y clientes ya conserva sus siete rutas originales; operaciones globales adicionales como anuncios, actividad y mantenimiento destructivo continúan fuera de este alcance.

El **RC integral multigimnasio fue aprobado en staging el 2026-09-26**. La puerta `npm run test:hosted-staging-gym-rc` ejecuta un build alojado y diez suites encadenadas para onboarding, fundación/permisos, operación, UI contextual, Portal de series/RIR, mediciones del Portal, compatibilidad RIR, pagos, personal y configuración. Cada ejecución debe terminar con el mismo inventario sintético con el que comenzó.

## Release Candidate del entrenador independiente — staging

Estado: **Aprobado el 2026-09-26**.

| Cuenta de prueba | Evidencia de cierre |
| --- | --- |
| Entrenador estándar | CRUD de cliente y perfil, diez mediciones con valores nulos, ejercicio propio, rutina simple, bloqueo de nuevas biseries/triseries y Portal Pro, edición de una biserie heredada y Storage. |
| Entrenador Pro activo | Rutina con bloque avanzado, competidor y habilitación de funciones Pro; RIR real ya validado en la suite alojada. |
| Entrenador Pro vencido | Rechazo de bloques avanzados, Portal y RIR independiente. |
| Segundo entrenador | Sin lectura, edición, guardado ni eliminación sobre clientes y rutinas ajenos. |
| Administrador | Lectura global, CRUD real de ejercicios globales, guard de rutas admin y carga idempotente de 243 ejercicios. |

También pasaron registro real desde UI, confirmación mediante enlace Auth, recuperación, cambio de contraseña, login final, eliminación móvil completa de cuenta y compatibilidad de RIR de gimnasio. No quedaron identidades ni datos sintéticos. La entrega por SMTP externo y Google OAuth sobre el dominio actual se reservan para el ensayo de corte porque dependen de infraestructura externa, no del comportamiento del RC en staging.

## Estados

| Estado | Significado |
| --- | --- |
| Pendiente | Todavía no existe en V2. |
| En progreso | Se está trabajando actualmente. |
| Parcial | Existe una base, pero faltan diseño, comportamiento o estados del original. |
| Validación | La implementación está lista y falta compararla o probarla. |
| Completa | Conserva el alcance acordado, Supabase, responsive y pruebas. |
| Fuera de alcance | No forma parte de la fase actual. |
| Nueva | No tiene una pantalla equivalente en el proyecto original. |

## Fase actual

| ID | Vista original | Ruta V2 | UI | Funcionalidad | Supabase | Responsive | Playwright | Estado general | Próximo paso |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MKT-001 | `/landing-nueva` | `/` | Fiel al original | Carrusel, tabs y FAQ | No aplica | Validado | Desktop y móvil | Completa | Mantener comparación visual al editar. |
| AUTH-001 | `/login` | `/login` | Recreada y comparada | Email, Google, recuperación y estados heredados | Login y recuperación reales validados | Validado | Desktop, móvil y redirects locales | Completa | Comprobar Google OAuth sobre `zummith.com` durante el ensayo de corte. |
| AUTH-002 | `/set-password` | `/set-password` | Recreada | Cambio de contraseña | Enlace real, sesión de recuperación, cambio y login final validados | Validado a 390 px y 1440 px | Desktop y móvil | Completa | Repetir con SMTP externo sobre el dominio actual antes de producción. |
| AUTH-003 | `/signup` | `/signup` | Adaptada al sistema Zummith V2 | Alta por correo, validación, confirmación y creación diferida del perfil | Alta UI y confirmación mediante enlace Auth real validadas | Validado a 320 px, 390 px y 1440 px | Desktop, móvil y staging real | Completa | Comprobar entrega SMTP externa antes de producción. |
| COACH-001 | `/dashboard` | `/dashboard` | Resumen operativo propio | Altas del mes, rutinas activas con progreso y días restantes, avisos, plan Pro, accesos directos y actividad RIR | Lectura real validada | Validado a 390 px y 1440 px | Desktop y móvil, incluidos progreso y vencimiento | Completa | Dashboard de gimnasio queda fuera de este RC. |
| COACH-002 | `/clients`, `/clients/new`, `/clients/:id/edit`, `/clients/:id` | Mismas rutas | Tarjetas, paginación y centro del cliente propios | CRUD completo; búsqueda con debounce; ayuda; navegación reactiva; evolución de mediciones; RIR agrupado; Portal Pro | CRUD, diez mediciones, RIR, Portal y eliminaciones seguras verificados en staging real | Validado a 320 px, 390 px y 1440 px | Desktop, móvil, paginación, ayuda y estados Pro | Completa | Revalidar entrega de invitación con SMTP definitivo. |
| COACH-003 | `/routines/new`, `/routines/:id` | `/routines`, `/routines/new`, `/routines/:id` | Listado y asistente operativo de cinco etapas | Crear, consultar, editar, reemplazar, mover, agrupar, progresión, calentamiento, borrador, impresión/PDF y eliminación | CRUD, RLS, estándar/Pro/vencido y biserie heredada verificados en staging real | Validado a 320 px, 390 px y 1440 px | Desktop, móvil e interacciones completas | Completa | Mantener prueba de regresión al tocar bloques o planes. |
| COACH-007 | `/competitor/new`, `/competitor/:id/edit` | Mismas rutas | Editor progresivo dedicado con revisión y acciones persistentes | Crear, editar, ordenar y eliminar entrenamientos, días, semanas y bloques; tres microciclos; borrador; PDF y eliminación | CRUD real y aislamiento por entrenador verificados | Validado a 320 px, 390 px y 1440 px | Desktop, móvil, PDF e interacciones completas | Completa | Mantener prueba de exportación al cambiar la plantilla. |
| COACH-004 | `/exercises`, `/exercises/new`, `/exercises/:id/edit` | Mismas rutas | Biblioteca visual propia | Imágenes, pestañas, filtros, video y CRUD de ejercicios propios | Lectura y CRUD reales con RLS | Validado a 390 px y 1440 px | Desktop, móvil e interacciones | Completa | Mantener aislamiento al cambiar políticas. |
| COACH-005 | Sin equivalente directo | `/measurements` | Índice global de progreso | Búsqueda general y acceso a la pestaña de mediciones del cliente, sin duplicar CRUD | Conectado | Validado a 390 px | Móvil | Nueva | Validar enlaces con una cuenta que tenga mediciones reales. |
| COACH-006 | `/profile` | `/profile` | Settings editorial con tokens Zummith | Edición, logo, color, validaciones y eliminación | Edición, reemplazo de logo y eliminación completa de cuenta/Storage/Auth verificados en staging alojado | Validado a 390 px y 1440 px | Desktop, móvil y borrado real alojado | Completa | Aplicar migraciones a producción solo con respaldo y plan de reversión. |
| ADMIN-001 | `/exercises/admin` | `/exercises/admin` | Herramienta operativa con lista responsive | Búsqueda, filtro, paginación y CRUD global | Guard de coach, rol admin y CRUD global reales validados | Validado a 320 px, 390 px y 1440 px | Desktop, móvil e interfaz real | Completa | El resto de administración de usuarios queda fuera de este RC. |
| ADMIN-002 | `/seed-exercises` | `/seed-exercises` | Flujo guiado de carga segura | Agrega únicamente ejercicios faltantes en bloques y permite reintento | Admin real, rechazo de coach y carga idempotente de 243 ejercicios verificados | Validado a 320 px, 390 px y 1440 px | Desktop, móvil e interfaz real | Completa | Repetir solamente en un destino explícito; no reemplaza datos existentes. |
| ADMIN-003 | Siete rutas `/admin/coaches...` y `/admin/clients...` | Mismas rutas | Directorios, fichas y edición administrativa propias | Búsqueda, filtros, plan Pro, contexto entrenador/gimnasio, edición de cliente y creación de rutina en nombre del entrenador | Consultas y escrituras protegidas por `adminGuard`, `is_admin()` y RLS; nueva lectura administrativa de gimnasios/membresías | Validado a 390 px y 1440 px | Desktop, móvil, las siete rutas y rechazo de coach | Completa | Validar la migración RLS y el paquete contra staging alojado antes del corte. |
| GYM-001 | `/gyms`, `/gym/join`, `/gym/dashboard/:id` | Mismas rutas | Shell y resumen operativo por gimnasio | Selector, código de acceso, contexto, métricas y navegación por permisos | Propietario, copropietario, entrenador, recepción y cuenta externa validados con datos reales | Validado a 390 px y 1440 px | UI alojada, guards e ingreso real | Completa | Mantener regresión al cambiar navegación o permisos. |
| GYM-002 | Clientes, rutinas y competidor de gimnasio | `/gym/:gymId/...` | Reutiliza las superficies V2 dentro del contexto activo | Alta, edición, invitación, mediciones, rutina, competidor y RIR por membresía | Escrituras reales ligadas a `client_gym_membership_id`; aislamiento entre dos gimnasios | Validado a 390 px y 1365 px | Alta e invitación UI, constructor UI, permisos y aislamiento | Completa | Mantener la prueba contextual al modificar formularios compartidos. |
| GYM-003 | `/gym/payments/:id` | `/gym/payments/:id` | Cartera operativa, filtros, historial y planes | Configuración de membresía, CRUD de planes y registro de pago con avance de vencimiento | RPC atómica; dueño y recepción validados, entrenador sin permiso bloqueado | Validado a 390 px y 1440 px | Desktop/móvil, RLS y guards reales | Completa (MVP) | Mantener regresión al cambiar permisos financieros. |
| GYM-004 | `/gym/staff/:id` | `/gym/staff/:id` | Lista operativa, búsqueda, permisos y diálogos seguros | Alta por correo o código, roles, permisos explícitos, copropietarios y retiro sin borrar la cuenta | RPC protegidas; dueño principal inmutable; elevaciones restringidas a propietarios | Validado a 390 px y 1440 px | Dueño, copropietario, manager delegado, entrenador y recepción | Completa (MVP) | Mantener regresión al cambiar permisos. |
| GYM-005 | `/gym/settings/:id` | `/gym/settings/:id` | Configuración seccionada de identidad, marca y acceso | Datos generales, logo, color, código renovable y acceso a propiedad/permisos | RPC y Storage por gimnasio; dueño/copropietario permitidos, entrenador/recepción bloqueados | Validado a 390 px y 1440 px | Desktop/móvil, aislamiento de logo, código anterior/nuevo y guards reales | Completa (MVP) | Mantener regresión al cambiar identidad o acceso. |
| GYM-006 | `/gym/onboarding` | `/gym/onboarding` | Asistente propio de dos pasos | Datos básicos, borrador recuperable, revisión y entrada directa al dashboard | RPC atómica e idempotente para gimnasio, dueño, permisos, tipo de cuenta y código inicial | Validado a 390 px y 1440 px | UI alojada, repetición, validación, código e ingreso de segundo entrenador | Completa (MVP) | Ejecutar el ensayo integral multigimnasio. |
| PORTAL-001 | `/client/portal` | `/client/portal` | Resumen V2 responsive | Acceso por perfil, bloqueo Pro vencido y accesos a todas las áreas del Portal | Consultas por accesos existentes con RLS | Validado con mocks y cuenta real a 390 px y 1440 px | Redirección por rol, bloqueo Pro, cambio de perfil gimnasio/independiente y capturas desktop/móvil | Completa | Mantener navegación al agregar módulos. |
| PORTAL-002 | `/client/routines` | `/client/routines` | Lista de planes vinculados al perfil activo | Consulta de rutinas y navegación al detalle; estados vacío/error | Lectura con filtro de cliente y membresía, más RLS | Validado con cuentas reales independiente y gimnasio | Navegación desktop/móvil y aislamiento contextual | Completa | Mantener regresión al cambiar RLS de rutinas. |
| PORTAL-003 | `/client/routines/:id` | `/client/routines/:id` | Detalle y registro móvil por ejercicio | Cambio de día, calentamiento, bloques, técnica, autoguardado, finalización, corrección y PDF del plan | Escritura atómica con perfil independiente/gimnasio; Pro vencido y otra identidad bloqueados | Validado a 390 px y 1440 px | UI alojada, recarga, PDF real, reintentos y aislamiento | Completa | Mantener prueba de PDF al cambiar el plan. |
| PORTAL-004 | `/client/measurements` | `/client/measurements` | Historial y evolución responsive | Último control, cambios comparables, selector de métrica, gráfica accesible y detalle de todos los indicadores | Lectura exacta por acceso independiente o `client_gym_membership_id`; otra membresía e identidad externa bloqueadas | Validado a 390 px y 1440 px | UI alojada desktop/móvil, cambio de perfil, RLS y capturas | Completa | Mantener regresión al modificar políticas de clientes o membresías. |
| PORTAL-005 | `/client/payments` | `/client/payments` | Estado financiero de solo lectura | Estado, plan, monto, próximo vencimiento, historial y orientación para correcciones | Lectura exacta por `client_gym_membership_id`; otra membresía e identidad externa bloqueadas | Validado a 390 px y 1440 px | UI alojada desktop/móvil, perfil independiente, RLS y capturas | Completa | Mantener regresión al modificar pagos o membresías. |
| PORTAL-006 | `/client/profile` | `/client/profile` | Perfil editable y resumen de cuenta | Nombre, teléfono, nacimiento, dirección y notas; correo/objetivo protegidos y acceso a contraseña | RPC contextual `SECURITY DEFINER`; actualización directa protegida; perfil ajeno bloqueado | Validado a 390 px y 1440 px | UI alojada, cambios pendientes, persistencia y aislamiento | Completa | Mantener regresión al modificar políticas de clientes. |
| PORTAL-007 | Historial dentro del Portal original | `/client/history` | Resumen y sesiones expandibles | Consolidado por rutina/día, reps, carga, RIR y descarga PDF | Lectura exacta por cliente y `client_gym_membership_id`, reforzada por RLS | Validado a 390 px y 1440 px | UI alojada, PDF real, vacío implícito y aislamiento entre contextos | Completa | Mantener prueba de PDF y contexto al cambiar sesiones. |

Notas:

- La propuesta Astra es ahora la experiencia oficial en `/exercises`, `/exercises/new` y `/exercises/:id/edit`. Conserva aliases temporales bajo `/exercises-astra`, comparte los datos de la cuenta y mantiene las pestañas Biblioteca/Mis ejercicios con sus conteos. Documentación y pruebas en `EXERCISES_ASTRA.md` y `scripts/astra-check.mjs`.
- El área autenticada usa un header horizontal en escritorio, una navegación inferior de cinco destinos en móvil y un footer propio inspirado en el landing. El menú lateral anterior fue retirado.
- Los CTA “Crear cuenta” de la landing dirigen a `/signup`.
- La carga inicial conserva los ejercicios existentes y agrega solo nombres faltantes; no replica el reemplazo destructivo del original porque las rutinas usan claves foráneas con borrado restringido.
- Las rutinas se guardan en una sola transacción mediante `save_routine_plan`; la exportación usa la vista de impresión del navegador, que permite imprimir o guardar como PDF sin introducir una segunda plantilla divergente.
- La hoja de competidor se guarda mediante `save_competitor_sheet`; su exportación genera un PDF real con página de control y hojas imprimibles por entrenamiento. La librería de PDF se carga únicamente al exportar.
- La eliminación de un cliente independiente usa `delete_owned_independent_client`; la función elimina identidades Auth solo cuando ya no conservan otro cliente o acceso de Portal.
- El historial RIR agrupa sesiones del mismo día y actualiza cada 5 segundos únicamente mientras la pestaña está activa.
- La vigencia Pro se evalúa con la misma fecha de calendario local en dashboard, perfil, clientes, rutinas y Portal; esto evita cortar el acceso antes de medianoche en Costa Rica. El dashboard muestra rutinas activas ordenadas por vencimiento con progreso y días restantes, cubiertos por las pruebas del RC.
- `forgot-password` se integró como acción dentro de `/login`; no cuenta como una pantalla migrada independiente.
- Una captura con datos simulados valida presentación y responsive, pero no sustituye una prueba contra Supabase real.
- El original `smart-coach` y V2 comparten el proyecto de Supabase. Las RPC nuevas solo se invocan desde V2; no se modificaron las rutas ni el código del original durante esta fase.

## Estado de migraciones SQL en Supabase

Verificado contra `supabase_migrations.schema_migrations` y las funciones existentes del staging alojado el 2026-09-26.

| Migración | Estado remoto | Resultado |
| --- | --- | --- |
| `20260923120000_save_complete_routine_plan_rpc.sql` | Aplicada y registrada | RLS, estándar/Pro/vencido, edición, eliminación e impresión validados. |
| `20260923150000_save_competitor_sheet_rpc.sql` | Aplicada y registrada | RLS, creación, edición, eliminación y PDF validados. |
| `20260923170000_delete_owned_independent_client_safely.sql` | Aplicada y registrada | Identidades Auth exclusivas/compartidas y clientes sin identidad validados. |
| `20260912143000_add_self_service_coach_account_deletion.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | Elimina archivos mediante Storage API antes de la RPC, bloquea vínculos de gimnasio y preserva identidades compartidas. |
| `20260924230000_guard_independent_client_deletion_gym_memberships.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | Bloquea clientes con membresía de gimnasio o trabajo de otro entrenador; confirma borrado sin vínculos e identidad Auth compartida. La RPC de producción actual aún permite la cascada. |
| `20260924230201_restrict_legacy_migration_control_tables.sql` | **Aplicada en staging local y alojado; no aplicada en producción** | Revisar consumidores legados antes de producción. El asesor remoto marca además funciones heredadas con permisos amplios. |
| `20260924230655_enforce_independent_pro_for_training_logs.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | RIR real con Pro activo y bloqueo de lectura/escritura al vencer; escritura/lectura de RIR de gimnasio también pasan. |
| `20260926172911_guard_new_biseries_for_standard_coaches.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Bloquea nuevas biseries/triseries para estándar y Pro vencido, permite Pro/admin y conserva la edición de biseries heredadas. |
| `20260926180803_gym_client_operations_and_contextual_plans.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Alta/retiro atómicos de clientes de gimnasio y guardado contextual de rutinas/competidor; conserva el aislamiento del entrenador independiente. |
| `20260926183005_restrict_gym_client_updates_to_managers.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Impide por RLS que personal de solo lectura actualice perfiles de clientes mediante API directa. |
| `20260926184123_register_gym_payment_atomically.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Registra el pago, reactiva la membresía y avanza el vencimiento en una sola transacción; dueño y recepción pasan, entrenador sin `can_view_payments` queda bloqueado. |
| `20260926192524_manage_gym_staff_safely.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Sincroniza al dueño principal, agrega por correo, actualiza roles/permisos y endurece el retiro; protege propietarios frente a managers delegados. |
| `20260926195557_secure_gym_settings_and_logos.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Configura datos e ingreso del gimnasio, crea el bucket `gym-logos` y limita cambios a dueños/copropietarios. |
| `20260926200551_fix_gym_logo_storage_policies.sql` | **Aplicada y probada en staging alojado; no aplicada en producción** | Resuelve la autorización del dueño desde Storage sin exponer filas ni permitir escribir en carpetas de otros gimnasios. |
| `20260926201927_create_owned_gym_atomically.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | Crea gimnasio, dueño, permisos y primer código en una transacción; reintentos con la misma llave no duplican datos. |
| `20260926215003_save_portal_training_log_atomically.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | Expone ejercicios privados solo cuando están asignados al perfil autorizado y guarda/finaliza series del Portal de forma atómica. |
| `20260926222806_scope_portal_measurements_by_context.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | Separa mediciones independientes y de gimnasio por membresía exacta; bloquea otra membresía e identidad externa aun cuando compartan `client_id`. |
| `20260926233434_update_client_portal_profile_safely.sql` | **Aplicada y probada en staging local y alojado; no aplicada en producción** | Actualiza únicamente campos personales permitidos desde el contexto exacto; conserva correo, objetivo, identidad y entrenador protegidos. |

La prueba real `npm run test:live-migration` pasó con un entrenador independiente Pro: creó y editó rutina, hoja de competidor y medición; preparó acceso Portal y solicitó la invitación; después eliminó el cliente temporal y su identidad Auth exclusiva. Los enlaces Auth de confirmación y recuperación sí fueron aceptados en navegador; la entrega externa de la invitación sigue pendiente de SMTP. No se dejaron clientes ni usuarios Auth temporales.

## Pendientes antes del corte a producción

1. **P0 — Promoción controlada:** obtener respaldo, definir reversión y aplicar por lote las quince migraciones exclusivas de staging; nunca hacer `db push` indiscriminado al proyecto de producción ni usar la cuenta Pro activa en pruebas destructivas.
2. **P0 — Autenticación durante el corte:** conservar `https://zummith.com` como `Site URL`, confirmar los redirects exactos de V2 y probar Google OAuth, confirmación, recuperación e invitación con SMTP externo. No se necesita un dominio V2 separado.
3. **P0 — Seguridad y rendimiento heredados:** el asesor remoto ejecutado por CLI después de Configuración no reportó advertencias de seguridad nuevas. Persisten advertencias de rendimiento por `auth_rls_initplan` y políticas permisivas múltiples; además, auditar controles internos y consumidores de las RPC `SECURITY DEFINER` heredadas antes de cambiar privilegios compartidos.
4. **P1 — Ensayo de corte:** repetir los paquetes RC independiente y multigimnasio sobre el build candidato final, revisar telemetría y hacer una aceptación manual. `/measurements` es una vista nueva y queda como validación complementaria, no como una de las 11 migradas.

El ciclo operativo multigimnasio y el Portal del cliente quedaron validados en staging. Las siete rutas administrativas de entrenadores/clientes ya están implementadas localmente; antes del reemplazo faltan aplicar su migración RLS en staging, ejecutar la nueva suite alojada y completar el ensayo de corte.

## Inventario del proyecto original

### Marketing y autenticación

| Ruta original | Estado | Observación |
| --- | --- | --- |
| `/` | Fuera de alcance | Landing anterior; la referencia elegida es `/landing-nueva`. |
| `/signup` | Completa en RC stage | Alta UI y confirmación Auth real validadas; SMTP definitivo pendiente del corte. |
| `/forgot-password` | Integrada | La solicitud de correo vive dentro del login V2. |

### Entrenador avanzado

| Ruta original | Estado |
| --- | --- |
| `/clients/new` | Completa en RC stage |
| `/clients/:id/edit` | Completa en RC stage |
| `/clients/:id` | Completa en RC stage |
| `/exercises/new` | Completa en RC stage |
| `/exercises/:id/edit` | Completa en RC stage |
| `/exercises/admin` | Completa en RC stage |
| `/seed-exercises` | Completa en RC stage |
| `/routines/new` | Completa en RC stage |
| `/routines/:id` | Completa en RC stage |
| `/competitor/new` | Completa en RC stage |
| `/competitor/:id/edit` | Completa en RC stage |

### Gimnasios — ciclo MVP completo en staging

| Ruta original | Estado |
| --- | --- |
| `/gym/onboarding` | Completa (MVP) en staging: creación atómica, dueño inicial, permisos completos, primer código, borrador idempotente y entrada directa al dashboard. |
| `/gym/join` | Completa en staging: ingreso real por código, normalización, errores y redirección al contexto activo. |
| `/gyms` | Completa en staging: selector responsive, múltiples gimnasios, rol visible y persistencia del contexto activo. |
| `/gym/dashboard/:id` | Completa en staging: métricas reales, guard, accesos rápidos y permisos de propietario, copropietario, entrenador y recepción. |
| `/gym/:gymId/clients` | Completa en staging: listado aislado por membresía y navegación según permisos. |
| `/gym/:gymId/clients/new` | Completa en staging: alta UI atómica de cliente+membresía y preparación de invitación al Portal. |
| `/gym/:gymId/clients/:id` | Completa en staging: perfil, mediciones, rutinas, competidor y RIR filtrados por `client_gym_membership_id`. |
| `/gym/:gymId/clients/:id/edit` | Completa en staging: edición con guard `canEditClients`; recepción sin permiso queda en lectura. |
| `/gym/:gymId/routines` | Completa en staging: planes del gimnasio sin caída al espacio independiente. |
| `/gym/:gymId/routines/new`, `/gym/:gymId/routines/:id` | Completa en staging: constructor UI, guard `canCreateRoutines` y guardado atómico contextual. |
| `/gym/:gymId/competitor/new`, `/gym/:gymId/competitor/:id/edit` | Completa en staging: hojas de competidor contextuales y aisladas. |
| `/gym/payments/:id` | Completa (MVP) en staging: cartera, filtros, planes, configuración, cobro atómico, historial y permisos por rol. |
| `/gym/staff/:id` | Completa (MVP) en staging: alta por correo/código, roles, permisos, copropietarios, retiro seguro y protección del dueño principal. |
| `/gym/settings/:id` | Completa (MVP) en staging: identidad, contacto, logo aislado, color, código renovable y permisos de propietario/copropietario. |
| `/gym/dashboard` | Integrada: redirige al selector para resolver el contexto explícitamente. |

### Administración de entrenadores y clientes — rutas completas

| Ruta original | Estado |
| --- | --- |
| `/admin/coaches` | Completa: directorio, búsqueda, filtro por plan y resumen operativo. |
| `/admin/coaches/:id` | Completa: cuenta, actividad, gimnasios, clientes y actualización de plan/fecha. |
| `/admin/coaches/:id/clients` | Completa: clientes filtrados por entrenador con contexto independiente/gimnasio. |
| `/admin/clients` | Completa: directorio global, búsqueda y filtro por contexto. |
| `/admin/clients/:coachId/:clientId` | Completa: perfil, contexto, rutinas y mediciones. |
| `/admin/clients/:coachId/:clientId/routine/new` | Completa: reutiliza el constructor con el entrenador y cliente administrativos fijados. |
| `/admin/clients/:coachId/:clientId/edit` | Completa: edición validada con protección de cambios pendientes. |

La migración `20260927010308_admin_directory_read_policies.sql` agrega únicamente lectura administrativa autenticada sobre gimnasios y membresías. No amplía escritura ni concede acceso a entrenadores comunes. La suite `npm run test:admin-directory` cubre las siete rutas, actualización de plan, edición, contexto de rutina, responsive y rechazo de un rol no administrador.

### Portal del cliente — MVP completo en staging

| Ruta original | Estado |
| --- | --- |
| `/client/portal` | Completa en staging: resumen y accesos por perfil. |
| `/client/routines` | Completa en staging: listado contextual y estados. |
| `/client/routines/:id` | Completa en staging: detalle, registro real, finalización y PDF. |
| `/client/measurements` | Completa en staging: historial, evolución, detalle, responsive y aislamiento por perfil real. |
| `/client/payments` | Completa en staging: estado, vencimiento, plan, historial y aislamiento por membresía real. |
| `/client/profile` | Completa en staging: edición segura, cuenta, responsive y aislamiento. |
| `/client/history` | Completa en staging: sesiones consolidadas, reps/carga/RIR y PDF. |

## Criterio para marcar una vista como completa

- [x] Alcance y ruta acordados.
- [x] Estructura y contenido comparados con la vista original.
- [x] Componentes Bootstrap y tokens del proyecto, sin estilos duplicados innecesarios.
- [x] Lectura y escritura de Supabase verificadas según corresponda.
- [x] Estados de carga, vacío, error y éxito implementados.
- [x] Navegación, permisos y recuperación comprobados.
- [x] Revisión a 390 px y 1440 px sin desbordamiento.
- [x] Captura Playwright aprobada.
- [x] Build de producción correcto.

## Regla de actualización

Cada cambio de una vista debe actualizar su fila en este archivo dentro del mismo commit. Antes de marcarla como `Completa`, se debe guardar una captura en `docs/qa` y registrar cualquier excepción en “Próximo paso”.
