# Auditoría de paridad: smart-coach y smart-coach-v2

> Estado posterior: se implementaron correcciones en v2. Ver [registro de ajustes y pruebas](../../smart-coach-v2/docs/ROLE_PARITY.md). Los hallazgos siguientes conservan la evidencia del estado anterior a esos cambios.

Fecha: 8 de octubre de 2026. Referencia funcional: `smart-coach`.

## Resultado

**La v2 todavía no conserva las mismas acciones y permisos del original.** El caso de «Crear gimnasio» está confirmado y afecta a más perfiles que al dueño: cualquier cuenta de entrenador autenticada puede abrir ese flujo. La RPC que utiliza la v2 también admite cualquier perfil registrado en `coaches` y convierte al creador en dueño del gimnasio nuevo.

La intención del producto para esta revisión es la indicada por el usuario: casi un clon del original, con una interfaz mejorada. Por tanto, cambiar quién puede realizar una acción, introducir un espacio de trabajo adicional, eliminar una herramienta o cambiar los datos creados constituye una diferencia funcional, aunque el cambio parezca útil.

Se documentan **15 hallazgos en la v2**, más **5 inconsistencias heredadas** que deben tratarse por separado. P1 significa que la diferencia afecta sustancialmente la paridad; P2 corresponde a cambios de alcance o funciones secundarias. Estas prioridades no representan una evaluación de explotación en producción.

## Alcance y evidencia

Se compararon rutas, guards, navegación, componentes, servicios de datos, reglas de suscripción, operaciones RPC y políticas de las migraciones locales compartidas. También se ejecutaron ambas aplicaciones en desarrollo y se navegaron con sesiones y respuestas de datos simuladas.

La comprobación local cubrió nueve perfiles: administrador, independiente estándar, independiente Pro vigente, Pro vencido, dueño principal, copropietario, entrenador, recepción y un entrenador con todos los permisos operativos desactivados. Este último es una configuración de permisos existente, no un rol adicional del sistema.

- **172 navegaciones registradas**, con **148 comprobaciones de resultados** satisfactorias respecto de las diferencias y coincidencias descritas. Que estas comprobaciones pasen confirma el diagnóstico; no significa que exista paridad.
- Sin errores JavaScript no capturados en esas navegaciones.
- Ambas aplicaciones compilaron al arrancar sus servidores de desarrollo.
- `npm run test:plan` de la v2 pasó.
- [Resultados del navegador y consultas observadas](2026-10-08-smart-coach-browser-evidence.json).
- Capturas del mismo dueño: [original](assets/smart-coach-owner-gyms.png) y [v2](assets/smart-coach-v2-owner-gyms.png).

Las respuestas de Auth y REST se interceptaron localmente; no se enviaron operaciones a una base remota ni se guardaron datos de prueba. Las conclusiones sobre SQL describen las migraciones del repositorio y son aplicables donde estén instaladas. No se verificaron las migraciones ni los privilegios efectivos de producción. Las pruebas de navegación verifican acceso a pantallas y visibilidad de acciones, no el éxito real de una escritura bajo RLS.

En el original se cargó primero el perfil y luego se navegó dentro de Angular: algunos guards leen el perfil durante la inicialización. Esto evita atribuir a permisos una redirección causada por una sesión todavía sin resolver.

## Qué significa cada perfil

No deben confundirse estas tres dimensiones:

| Dimensión | Valores relevantes | Qué controla |
| --- | --- | --- |
| Rol global | `admin`, `coach`; el modelo original también admite `owner` legado | Administración general y perfil de entrenador |
| Tipo de cuenta | `independent`, `gym` | Modalidad del entrenador y aplicación del plan independiente |
| Relación con un gimnasio | `gyms.owner_id` y `gym_staff.role` (`owner`, `trainer`, `receptionist`) | Acciones dentro de cada gimnasio |

Un dueño principal y un copropietario tienen acceso de propietario al gimnasio. El dueño principal se identifica por `gyms.owner_id` y está protegido frente a cambios desde la pantalla de personal. Tener simplemente un rol global legado `owner` no sustituye la relación con el gimnasio.

Fuentes: [modelo original de entrenador](../../smart-coach/src/app/models/coach.model.ts#L10), [roles y permisos de gimnasio](../../smart-coach/src/app/models/gym-coach.model.ts#L24), [resolución de permisos en v2](../../smart-coach-v2/src/app/features/gyms/gym-context.service.ts#L149).

## Comparación por perfil

### Administrador

| Acción | Original | V2 |
| --- | --- | --- |
| Consultar entrenadores y sus clientes | Sí | Sí, con el problema de contexto de F13 |
| Cambiar plan estándar/Pro y vencimiento | Sí | Sí |
| Crear gimnasio | Sí; la propiedad se asigna aparte | Sí; queda propietario el propio administrador (F01) |
| Asignar o reasignar dueño principal | Sí | Falta (F02) |
| Eliminar gimnasio con sus datos relacionados | Sí | Falta (F02) |
| Eliminar otro entrenador con sus datos relacionados | Sí | Falta (F02) |
| Clonar cliente a otro entrenador | Sí | Falta (F03) |
| Eliminar cliente desde administración | Sí, con tratamiento según su contexto | Falta (F03) |
| Editar datos personales de cliente | Sí | Sí |
| Crear rutina desde la ficha administrativa | Sí | Solo aparece para contexto independiente (F04) |
| Abrir rutina de otro entrenador desde su ficha | Sí | La lista es informativa (F04) |
| Eliminar y descargar PDF de esas rutinas | Sí | Faltan acciones en esa ficha (F04) |
| Administrar mediciones desde la ficha | Sí | Solo muestra hasta ocho resúmenes (F04) |
| Gestionar pagos, personal y configuración de gimnasio | Sí | Los guards conservan acceso |
| Administrar biblioteca global de ejercicios | Sí | Sí; se restringe correctamente el acceso de otros perfiles (H05) |

### Personal de gimnasio: permisos base

La tabla representa el comportamiento base del original. La v2 mantiene los cuatro permisos operativos en las rutas explícitas de gimnasio, pero introduce las diferencias de la última columna. Los permisos almacenados pueden modificar los valores base de entrenador y recepción.

| Acción | Dueño principal | Copropietario | Entrenador | Recepción | Diferencia en v2 |
| --- | --- | --- | --- | --- | --- |
| Crear otro gimnasio | No | No | No | No | Todos pueden abrirlo; la RPC los admite como creadores (F01) |
| Elegir un gimnasio al que pertenece | Sí | Sí | Sí | Sí | Se conserva; el selector también queda abierto para independientes sin gimnasios |
| Abrir panel general del gimnasio | Sí | Sí | No | No | Se habilita a cualquier miembro (F07) |
| Consultar clientes del gimnasio | Sí | Sí | Sí | Sí | Se conserva en la ruta de gimnasio; cambia la navegación general (F05) |
| Crear/editar clientes del gimnasio | Sí | Sí | Sí | Sí | Se conserva según `canEditClients` en la ruta de gimnasio |
| Crear rutinas del gimnasio | Sí | Sí | Sí | No | Se conserva según `canCreateRoutines` en la ruta de gimnasio |
| Modificar rutinas de otro autor | Restricción de autor en SQL | Restricción de autor en SQL | Restricción de autor en SQL | No | La RPC nueva permite editar y cambia el autor (F12) |
| Ver y registrar pagos | Sí | Sí | No | Sí | Se conserva el acceso base |
| Crear/editar/eliminar planes de membresía | Sí | Sí | No | No | Se conserva la restricción a propietario/administrador |
| Ver finanzas por período y filtrar por plan | Sí | Sí | No | Sí | Falta la sección de finanzas (F09) |
| Gestionar personal | Sí | Sí | No | No | Se añaden alta por correo y permisos individuales; cambia la delegación (F11) |
| Cambiar configuración y marca del gimnasio | Sí | Sí | No | No | Se conserva el acceso base |
| Transferir al dueño principal desde Personal | No | No | No | No | Sigue protegido; falta el flujo administrativo alternativo (F02) |
| Salir del gimnasio desde Perfil | No | No | Sí | Sí | Desaparece la acción (F08) |
| Usar ejercicios compartidos del gimnasio | Sí | Sí | Sí | Sí | Las consultas de v2 omiten los de otros miembros (F06) |

Para un miembro con `can_edit_clients=false` y `can_create_routines=false`, ambas versiones deniegan la creación en el contexto del gimnasio. **La v2 sí permite abrir `/clients/new` y `/routines/new` como flujos personales**, mientras el original aplica los permisos de su gimnasio activo. Esto no demuestra que ese usuario pueda escribir sin permiso en el gimnasio: demuestra que se añadió otro contexto con acciones diferentes (F05).

Las hojas de competidor requieren una distinción: el original deja a recepción entrar al formulario mediante `canEditClients`, pero su política SQL exige `canCreateRoutines` para guardar en el gimnasio. La v2 usa este último permiso también en la interfaz. Es una inconsistencia heredada, descrita en H04.

### Entrenador independiente

| Acción | Estándar | Pro vigente | Pro vencido | Comparación |
| --- | --- | --- | --- | --- |
| Gestionar clientes propios, ejercicios propios y rutinas básicas | Sí | Sí | Sí | Se conserva la estructura general |
| Usar funciones premium de rutinas | No | Sí | No | Se mantiene la condición de plan vigente |
| Invitar al portal independiente y consultar seguimiento RIR | No | Sí | No | Se mantiene la condición de plan vigente |
| Cambiar perfil y marca personal | Sí | Sí | Sí | Se conserva |
| Eliminar su cuenta independiente | Sí | Sí | Sí | Existe en ambas versiones |
| Unirse a gimnasio por código | Sí | Sí | Sí | Existe en ambas; v2 redirige al nuevo panel disponible para miembros |
| Crear gimnasio | No | No | No | V2 lo habilita para los tres (F01) |
| Descargar PDF de rutina | Descarga directa | Descarga directa | Descarga directa | V2 sustituye la descarga por impresión del navegador (F15) |

La vigencia del plan independiente requiere `account_type=independent`, `coach_plan=paid` y fecha de pago vigente. Las funciones premium incluidas en cuentas de gimnasio no equivalen a darles una suscripción Pro independiente. Crear un gimnasio desde la v2 cambia el tipo de cuenta y, por ello, tiene consecuencias adicionales a mostrar un formulario.

Fuentes: [reglas originales de plan](../../smart-coach/src/app/models/coach.model.ts#L80), [reglas v2](../../smart-coach-v2/src/app/core/data/plan-access.ts#L14), [premium en el constructor v2](../../smart-coach-v2/src/app/features/routines/routine-builder.component.ts#L90).

### Cliente del portal

| Acción | Original | V2 |
| --- | --- | --- |
| Consultar sus rutinas, mediciones y pagos del contexto autorizado | Sí | Sí |
| Alternar entre sus accesos autorizados | Sí | Sí |
| Entrar mediante entrenador independiente estándar o vencido | Bloqueado por suscripción | Se mantiene el bloqueo |
| Entrar mediante acceso de gimnasio | No depende del plan independiente de un entrenador | Se conserva esa separación |
| Editar nombre, teléfono, nacimiento y notas personales | Sí | Sí |
| Editar dirección desde el portal | No está en el formulario original | Se añade (F14) |
| Registrar repeticiones, carga y RIR | Sí | Sí |
| Finalizar una sesión explícitamente y consultar un historial dedicado | Sin flujo equivalente | Se añade (F14) |
| Crear rutinas, planes de membresía o registrar cobros | Sin herramientas de gestión | No se encontraron herramientas nuevas de gestión |

El portal se revisó en código; no se incluyó una sesión de cliente en las nueve fixtures del navegador.

## Hallazgos detallados

### F01 · P1 · Crear gimnasios deja de ser exclusivo del administrador

**Original:** `/gym/onboarding` tiene `adminGuard`; los botones de creación se condicionan a administrador. El alta crea el gimnasio sin asignar automáticamente al administrador como dueño.

**V2:** la ruta solo hereda autenticación; los enlaces de creación son generales. `create_owned_gym` comprueba autenticación y existencia del perfil, pero no rol administrador. Guarda `owner_id=auth.uid()`, crea la membresía `owner` con todos los permisos y cambia `account_type` a `gym`.

**Impacto:** dueño, copropietario, entrenador, recepción, independiente estándar y Pro vencido disponen de una acción nueva. No se eleva su permiso en gimnasios ajenos: obtienen propiedad y permisos completos sobre el gimnasio nuevo. Además cambia su modalidad de cuenta. Un administrador que crea un gimnasio queda como dueño, distinto del flujo original de asignación posterior.

**Restitución:** restringir navegación, botones y operación de creación al administrador; mantener separadas creación y asignación de propiedad. También revisar la política heredada de inserción directa de H02. Ocultar el botón por sí solo no cierra la operación.

Evidencia: [ruta V1](../../smart-coach/src/app/app.routes.ts#L121), [alta V1](../../smart-coach/src/app/pages/gym/gym-onboarding/gym-onboarding.component.ts#L53), [ruta V2](../../smart-coach-v2/src/app/app.routes.ts#L76), [navegación V2](../../smart-coach-v2/src/app/layout/coach-shell/coach-shell.component.ts#L86), [RPC](../../supabase/migrations/20260926201927_create_owned_gym_atomically.sql#L37).

El [check de onboarding alojado](../../smart-coach-v2/scripts/hosted-gym-onboarding-check.mjs#L30) prepara un entrenador independiente estándar para este flujo. Ese caso de prueba también debe cambiar si se adopta la paridad; su existencia no demuestra qué está desplegado actualmente.

### F02 · P1 · Faltan asignación de propiedad y eliminaciones administrativas

**Original:** el administrador asigna/reasigna al dueño principal desde administración y puede eliminar gimnasios y otros entrenadores mediante operaciones completas.

**V2:** el servicio administrativo cubre directorio, planes y perfiles, pero no incluye esas operaciones. Promover un miembro a copropietario desde Personal no transfiere `gyms.owner_id`, por lo que no sustituye la asignación del dueño principal.

**Impacto:** se pierde el flujo de provisionamiento y mantenimiento que justificaba que solo administración creara gimnasios. También faltan herramientas para retirar gimnasios o cuentas administradas.

**Restitución:** migrar las acciones administrativas con sus confirmaciones y operaciones existentes, preservando la protección del dueño principal.

Evidencia: [eliminar gimnasio y entrenador V1](../../smart-coach/src/app/pages/admin/admin-dashboard/admin-dashboard.component.ts#L2112), [asignar dueño V1](../../smart-coach/src/app/pages/admin/admin-coach-detail/admin-coach-detail.component.ts#L137), [servicio administrativo V2](../../smart-coach-v2/src/app/features/admin/admin-data.service.ts#L153).

### F03 · P1 · El administrador pierde clonar y eliminar clientes

**Original:** la lista administrativa permite clonar un cliente a otro entrenador; la ficha permite eliminarlo. El servicio original distingue eliminación completa de cliente propio y desvinculación cuando corresponde a un gimnasio.

**V2:** la lista y la ficha administrativas no presentan acciones equivalentes ni el servicio las implementa.

**Impacto:** se elimina parte del soporte y mantenimiento de clientes. La acción ordinaria «Retirar cliente» de un gimnasio no equivale a clonar o ejecutar el flujo administrativo completo.

Evidencia: [clonar V1](../../smart-coach/src/app/pages/admin/admin-clients/admin-clients.component.ts#L100), [eliminar V1](../../smart-coach/src/app/pages/admin/admin-client-detail/admin-client-detail.component.ts#L105), [tratamiento de eliminación V1](../../smart-coach/src/app/services/admin.service.ts#L412), [acciones de ficha V2](../../smart-coach-v2/src/app/features/admin/admin-client-detail.component.html#L9).

### F04 · P1 · La ficha administrativa pierde gestión de rutinas y mediciones

**Original:** permite crear, abrir y eliminar rutinas y generar sus PDF; incorpora el componente de gestión de mediciones.

**V2:** solo ofrece «Crear rutina» para contexto independiente. Las rutinas existentes son filas sin enlace ni botones; las mediciones son resúmenes de las últimas ocho, sin formulario ni edición/eliminación.

**Impacto:** un administrador puede ver la ficha, pero no realizar las mismas tareas. Abrir manualmente la ruta general de rutina tampoco sustituye el flujo: en v2, sin `gymId` el servicio filtra por el entrenador consultado por el constructor y por contexto independiente; ya no acepta el antiguo `?coachId=...` como mecanismo de inspección.

Evidencia: [acciones de rutinas V1](../../smart-coach/src/app/pages/admin/admin-client-detail/admin-client-detail.component.ts#L130), [mediciones V1](../../smart-coach/src/app/pages/admin/admin-client-detail/admin-client-detail.component.html#L138), [lista informativa V2](../../smart-coach-v2/src/app/features/admin/admin-client-detail.component.html#L73), [consulta de rutina V2](../../smart-coach-v2/src/app/features/routines/routine-data.service.ts#L51).

### F05 · P1 · El contexto general deja de seguir al gimnasio activo

**Original:** resuelve el gimnasio activo del entrenador y las pantallas generales de clientes y rutinas operan en ese gimnasio. Los guards de creación consultan sus permisos.

**V2:** mantiene una navegación general a `/clients`, `/routines`, `/dashboard`, etc., además de otra navegación de gimnasio. El contexto depende de que la URL tenga `gymId`. Sin ese parámetro se habilitan crear cliente y rutina, y se consultan/escriben datos personales.

**Reproducción:** un entrenador de solo consulta es rechazado en `/gym/{id}/clients/new` y `/gym/{id}/routines/new`, pero puede abrir `/clients/new` y `/routines/new`. Recepción también puede abrir el segundo flujo general. En el original esas rutas usan el gimnasio activo y lo rechazan según los permisos correspondientes.

**Impacto:** listas que parecen vacías, acceso al espacio equivocado y clientes creados fuera del gimnasio. El alta general escribe `primary_coach_id` y no crea membresía de gimnasio. Luego la eliminación independiente exige `account_type=independent`, y el portal independiente se considera no soportado si el perfil es `gym`; se introducen operaciones que no completan el mismo ciclo de trabajo.

**Restitución:** hacer que las entradas generales conserven el gimnasio activo y sus permisos, o redirigirlas a su contexto equivalente. Ofrecer simultáneamente un espacio personal a personal de gimnasio es una ampliación de producto que no forma parte de una migración solo visual.

Evidencia: [contexto V1](../../smart-coach/src/app/services/coach.service.ts#L174), [lista V1](../../smart-coach/src/app/pages/clients/client-list/client-list.component.ts#L86), [guard V1](../../smart-coach/src/app/guards/gym-permission.guard.ts#L28), [navegación V2](../../smart-coach-v2/src/app/layout/coach-shell/coach-shell.component.ts#L38), [permisos por parámetro V2](../../smart-coach-v2/src/app/features/workspace/workspace.component.ts#L40), [alta personal V2](../../smart-coach-v2/src/app/core/data/coach-data.service.ts#L432), [restricción de borrado](../../supabase/migrations/20260924230000_guard_independent_client_deletion_gym_memberships.sql#L22).

### F06 · P1 · La biblioteca omite ejercicios compartidos del gimnasio

**Original:** la biblioteca y el selector de ejercicios combinan globales con los ejercicios del gimnasio activo. Al crear un ejercicio en ese contexto se guarda `gym_id`.

**V2:** tanto `CoachDataService.getExercises` como `RoutineDataService.getExercises` filtran globales o ejercicios cuyo `coach_id` es el del usuario. El alta tampoco envía `gym_id`.

**Impacto:** un entrenador deja de encontrar ejercicios creados por otro miembro de su gimnasio y los nuevos ejercicios no entran en la biblioteca compartida. La política de lectura permite esa colaboración; el filtro de la aplicación la elimina.

**Restitución:** conservar `gym_id` en el alta y cargar la biblioteca correspondiente al contexto, también dentro del constructor de rutinas.

Evidencia: [lectura V1](../../smart-coach/src/app/services/exercise.service.ts#L128), [alta V1](../../smart-coach/src/app/services/exercise.service.ts#L194), [lectura y alta V2](../../smart-coach-v2/src/app/core/data/coach-data.service.ts#L765), [selector V2](../../smart-coach-v2/src/app/features/routines/routine-data.service.ts#L41), [RLS que admite ejercicios compartidos](../../supabase/migrations/20260926215003_save_portal_training_log_atomically.sql#L10).

### F07 · P2 · El panel general del gimnasio se abre a todos los miembros

**Original:** tanto el guard como el componente limitan el panel a administrador y propietarios.

**V2:** usa `gymMemberGuard`, por lo que entrenador, recepción y miembros con permisos operativos desactivados acceden a conteos de clientes, personal y rutinas. El resumen de pagos vencidos sí se condiciona a `canViewPayments`, y el código de acceso en esta pantalla se condiciona a `canManageStaff`.

**Impacto:** amplía una superficie de consulta respecto del original. No equivale a acceso irrestricto a finanzas o personal.

Evidencia: [comprobación interna V1](../../smart-coach/src/app/pages/gym/gym-dashboard/gym-dashboard.component.ts#L90), [guard V2](../../smart-coach-v2/src/app/app.routes.ts#L90), [datos del panel V2](../../smart-coach-v2/src/app/features/gyms/gym-context.service.ts#L94).

### F08 · P1 · Desaparece «Salir del gimnasio»

**Original:** un miembro que no es propietario puede salir desde Perfil. La aplicación informa si conservará otras afiliaciones o volverá a cuenta independiente.

**V2:** Perfil no ofrece una acción equivalente. La operación de base de datos aún admite que un miembro no propietario se retire a sí mismo.

**Impacto:** entrenador y recepción dependen de un gestor para una operación que antes realizaban por su cuenta. No se considera una regresión para copropietarios: el original también ocultaba esta acción para el rol `owner`.

Evidencia: [interfaz V1](../../smart-coach/src/app/pages/profile/profile.component.html#L50), [operación V1](../../smart-coach/src/app/pages/profile/profile.component.ts#L236), [Perfil V2](../../smart-coach-v2/src/app/features/profile/profile.component.ts), [RPC con retiro propio](../../supabase/migrations/20260926192524_manage_gym_staff_safely.sql#L247).

### F09 · P1 · Falta la sección de finanzas

**Original:** Pagos incluye Finanzas, con períodos día/semana/mes/año, filtro por plan, total, número de pagos, promedio y gráfica.

**V2:** solo tiene pestañas de cobros y planes, una métrica del mes actual y los diez pagos recientes.

**Impacto:** propietario, copropietario, administrador y recepción pierden análisis financiero al que tenían acceso. Registrar pagos y mostrar un total mensual no conserva esas acciones.

Evidencia: [Finanzas V1](../../smart-coach/src/app/pages/gym/gym-payments/gym-payments.component.html#L175), [pestañas y métricas V2](../../smart-coach-v2/src/app/features/gyms/gym-payments.component.ts#L15).

### F10 · P1 · Cambian la membresía y los valores iniciales al crear un cliente

**Original:** propietarios/administrador pueden seleccionar membresía en el formulario de cliente. El alta en gimnasio calcula vencimiento a un mes si no se proporciona y la escritura de membresía usa estado `pending` por defecto.

**V2:** el formulario no incluye selección de membresía; `create_gym_client` crea la relación con `subscription_status='active'`, sin plan ni fecha de vencimiento. La configuración se realiza después desde Pagos.

**Impacto:** cambian los datos resultantes y se agrega un paso. Los clientes nuevos dejan de entrar con el mismo estado y fecha de cobro. Además, recepción con los permisos base puede configurar plan, estado y vencimiento desde el nuevo diálogo; en el original ya podía modificar vencimientos y registrar pagos, pero la selección de plan en la ficha se reservaba a propietarios/administrador.

**Restitución:** reproducir la selección y los valores iniciales originales; conservar quién puede cambiar cada dato de membresía. No confundir esta asignación con administrar el catálogo de planes, que sigue restringido a propietarios/administrador.

Evidencia: [selector V1](../../smart-coach/src/app/pages/clients/client-form/client-form.component.html#L59), [fecha inicial V1](../../smart-coach/src/app/services/client.service.ts#L156), [estado y plan V1](../../smart-coach/src/app/services/firestore.service.ts#L567), [alta por RPC V2](../../supabase/migrations/20260926180803_gym_client_operations_and_contextual_plans.sql#L47), [permiso de configuración V2](../../smart-coach-v2/src/app/features/gyms/gym-payments.component.ts#L53), [campos modificados V2](../../smart-coach-v2/src/app/features/gyms/gym-payments.service.ts#L110).

### F11 · P2 · Se amplía la gestión de personal y permisos

**Original:** la edición de personal cambia el rol y aplica los permisos predeterminados de ese rol. El alta ordinaria se realiza uniéndose con el código. La RPC de cambio de rol exige acceso de propietario.

**V2:** permite agregar un entrenador existente por correo, configurar cuatro permisos individualmente y delegar cambios sobre personal no propietario mediante `canManageStaff`. No es solo otra presentación de los mismos campos.

**Impacto:** propietarios obtienen nuevas acciones y un gestor delegado puede realizar cambios que la RPC original de roles no admitía. Los permisos personalizados ya podían existir almacenados; lo nuevo es la herramienta para configurarlos y la ampliación de operaciones autorizadas.

Existe además una desalineación nueva: la interfaz impide a un gestor delegado modificar a otro miembro con `canManageStaff=true`. La RPC verifica el rol propietario y el nuevo valor del permiso, pero no protege el valor anterior de `can_manage_staff`; puede retirar ese permiso enviando `false`. La eliminación por RPC también permite a un gestor retirar a otro miembro no propietario aunque gestione personal. Debe alinearse el criterio real con el mostrado en pantalla.

Evidencia: [edición V1](../../smart-coach/src/app/pages/gym/gym-staff/gym-staff.component.ts#L175), [RPC original de roles](../../supabase/migrations/20260825120000_enable_gym_coowners.sql#L62), [campos y alta V2](../../smart-coach-v2/src/app/features/gyms/gym-staff.component.ts#L130), [restricción visual V2](../../smart-coach-v2/src/app/features/gyms/gym-staff.component.ts#L185), [RPC nueva de edición](../../supabase/migrations/20260926192524_manage_gym_staff_safely.sql#L176), [RPC de retiro](../../supabase/migrations/20260926192524_manage_gym_staff_safely.sql#L247).

### F12 · P1 · Guardar una rutina/hoja del gimnasio cambia el autor y amplía la edición

**Original:** la política de actualización de rutinas exige administrador o que `coach_id` sea el usuario actual, además del permiso de crear rutinas en contexto de gimnasio. Las hojas de competidor tienen una restricción de autor equivalente.

**V2:** las RPC `save_gym_routine_plan` y `save_gym_competitor_sheet` validan el gimnasio, la membresía del cliente y `can_create_routines`, pero al editar asignan `coach_id` al actor antes de guardar. No exigen que este fuera el autor anterior.

**Impacto:** un entrenador con permiso de rutinas puede editar el plan de otro entrenador y apropiarse de su autoría registrada. Cambia el alcance de edición y afecta filtros, conteos administrativos y seguimiento por entrenador.

El borrado sigue otro camino: `deleteRoutine` realiza un DELETE directo y solo inspecciona `error`. Si RLS filtra una rutina de otro autor y elimina cero filas sin error, el constructor navega con un mensaje de eliminación exitosa. Es un riesgo deducido del servicio y las políticas, no una escritura probada en base remota.

**Restitución:** definir la edición y eliminación conforme a la regla original y conservar la autoría. Verificar la fila afectada antes de confirmar una eliminación.

Evidencia: [política original de actualización/borrado](../../supabase/migrations/20260323212547_enable_rls_and_policies_multigym_v1_20260323.sql#L437), [RPC de rutina V2](../../supabase/migrations/20260926180803_gym_client_operations_and_contextual_plans.sql#L143), [RPC de competidor V2](../../supabase/migrations/20260926180803_gym_client_operations_and_contextual_plans.sql#L210), [DELETE V2](../../smart-coach-v2/src/app/features/routines/routine-data.service.ts#L187), [confirmación visual V2](../../smart-coach-v2/src/app/features/routines/routine-builder.component.ts#L523).

### F13 · P1 · El directorio administrativo de v2 pierde contextos múltiples

**Defecto identificado en v2:** el mapa de clientes usa la clave `coachId:clientId`, sin membresía ni gimnasio. Dos afiliaciones del mismo cliente con el mismo entrenador se sobrescriben. Si hay también relación independiente con ese entrenador, se omite cuando ya existe la clave del gimnasio. Las afiliaciones sin entrenador asignado se saltan.

La ficha busca después solo por cliente dentro del entrenador. Sus rutinas se filtran además por `coach_id`, por lo que no muestra todas las rutinas del mismo cliente de gimnasio si las crearon otros entrenadores.

**Impacto:** administración puede ver una sola relación, conteos incompletos o no distinguir el contexto que quiere gestionar. Este hallazgo se registra como defecto de v2; no se afirma que el modelo administrativo legado resuelva perfectamente todos esos casos.

**Restitución:** usar una identidad de contexto que incluya membresía/gimnasio o relación independiente y transportarla al detalle; incluir afiliaciones sin asignación y consultar rutinas según el contexto correcto.

Evidencia: [construcción del directorio](../../smart-coach-v2/src/app/features/admin/admin-data.service.ts#L193), [selección de ficha](../../smart-coach-v2/src/app/features/admin/admin-data.service.ts#L235), [filtro de rutinas](../../smart-coach-v2/src/app/features/admin/admin-data.service.ts#L315), [clave insuficiente](../../smart-coach-v2/src/app/features/admin/admin-data.service.ts#L356).

### F14 · P2 · El portal añade acciones que exceden el rediseño

**Original:** el cliente modifica nombre, teléfono, nacimiento y notas, y registra series. No tiene un flujo explícito equivalente para finalizar una sesión ni una página dedicada de historial.

**V2:** permite modificar dirección, envía nacimiento nulo si se vacía, incorpora finalización explícita de entrenamiento y una página de historial con exportación.

**Impacto:** son ampliaciones funcionales. No se identifican como escalada administrativa; se señalan porque no pertenecen a una migración exclusivamente visual. Deben quedar fuera del alcance base de paridad salvo que se acepten expresamente como excepciones de producto.

Evidencia: [campos editados V1](../../smart-coach/src/app/pages/client-portal/client-profile/client-profile.component.ts#L136), [campos enviados V2](../../smart-coach-v2/src/app/features/client-portal/client-portal-data.service.ts#L440), [finalizar sesión V2](../../smart-coach-v2/src/app/features/client-portal/client-routine-detail.component.ts#L245), [historial V2](../../smart-coach-v2/src/app/features/client-portal/client-training-history.component.ts).

### F15 · P2 · La descarga de PDF de rutina se sustituye por impresión

**Original:** la acción «Descargar PDF» genera el documento mediante `PdfService`, incluyendo la selección de marca del gimnasio en ese contexto.

**V2:** «Imprimir o guardar PDF» llama a `window.print()`. El usuario debe elegir el destino de impresión y el archivo depende del flujo del navegador.

**Impacto:** cambia la acción de exportación y no se conserva una descarga directa equivalente. Esto afecta a los entrenadores que comparten rutinas; es independiente de que el portal y las hojas de competidor sí tengan sus propios generadores PDF en v2.

Evidencia: [generación V1](../../smart-coach/src/app/pages/routines/routine-detail/routine-detail.component.ts#L775), [acción V2](../../smart-coach-v2/src/app/features/routines/routine-builder.component.html#L28), [implementación V2](../../smart-coach-v2/src/app/features/routines/routine-builder.component.ts#L540).

## Inconsistencias heredadas: no atribuirlas al rediseño

### H01 · Potencial crítico · Edición del propio registro de entrenador sin protección de columnas

Las políticas `coaches_insert` y `coaches_update` aceptan la fila propia por `id`. No restringen qué columnas puede escribir el usuario. `is_admin()` se basa en el rol de `coaches`. No se encontró en las migraciones locales una protección posterior que impida modificar campos como `role` o el plan en una fila propia.

**Consecuencia potencial:** si el rol `authenticated` tiene los privilegios de escritura correspondientes en la base desplegada y no existe otra protección, una llamada directa puede alterar atributos de autorización. Esto puede invalidar las restricciones de ambas interfaces. Deben verificarse los grants y triggers efectivos antes de afirmar explotación en producción. No se intentó elevar privilegios durante esta auditoría.

Fuente: [políticas de coaches](../../supabase/migrations/20260323212547_enable_rls_and_policies_multigym_v1_20260323.sql#L182).

### H02 · P1 · El original ya permitía insertar un gimnasio propio en RLS

`gyms_insert` acepta administrador **o** `owner_id=current_user_id()`. Así, la restricción visual del original a administradores no estaba reflejada completamente en la inserción directa. La RPC y la interfaz de v2 hacen explícita una capacidad que las políticas ya permitían por otra vía, y añaden la afiliación y cambio de cuenta automáticos.

Para satisfacer «solo administrador crea gimnasios» hay que alinear ambas vías, con comprobación de despliegue y compatibilidad. No basta con copiar `adminGuard`.

Fuente: [política de inserción](../../supabase/migrations/20260323212547_enable_rls_and_policies_multigym_v1_20260323.sql#L215).

### H03 · P1 · Escritura de mediciones basada en acceso al cliente, no en permiso de edición

Las políticas de escritura de mediciones exigen perfil de entrenador y `can_access_client(client_id)`. Este helper incluye miembros del gimnasio, aunque no tengan `canEditClients`, y no limita esas escrituras a la membresía concreta de la medición.

El original monta la gestión de mediciones sin una restricción de edición equivalente en la ficha. La v2 oculta sus acciones de escritura cuando falta `canEditClient`, pero la política heredada no impone esa misma frontera. El problema debe corregirse en la autorización real y en el alcance de contexto; no conviene reproducirlo por fidelidad visual.

Fuentes: [políticas de escritura](../../supabase/migrations/20260325191303_harden_measurements_rls_using_coach_access.sql#L7), [acceso a cliente](../../supabase/migrations/20260714120000_phase8_enforce_independent_paid_access.sql#L51), [componente original](../../smart-coach/src/app/pages/clients/client-detail/client-detail.component.html#L134), [acciones condicionadas en v2](../../smart-coach-v2/src/app/features/clients/client-detail/client-detail.component.html#L150).

### H04 · P2 · Recepción entra a competidor en V1, pero SQL no le concede guardado

El original usa `gymClientEditGuard` para abrir las hojas de competidor. Recepción tiene ese permiso por defecto. La política de escritura exige además autoría y `can_create_routines`, que recepción no tiene. La v2 pasa a usar ese permiso también para entrar al formulario.

La prueba local confirma la diferencia de acceso al formulario, no un guardado exitoso en el original. Para conservar reglas coherentes debe tomarse una decisión explícita sobre el permiso correcto; copiar el acceso visual del original produciría otra vez el error de guardado.

Fuentes: [rutas originales](../../smart-coach/src/app/app.routes.ts#L111), [política de competidor](../../supabase/migrations/20260323212547_enable_rls_and_policies_multigym_v1_20260323.sql#L768), [rutas v2](../../smart-coach-v2/src/app/app.routes.ts#L155).

### H05 · P2 · Administración de ejercicios globales expuesta visualmente en V1

`/exercises/admin` y `/seed-exercises` solo tenían `authGuard` en el original. La escritura global se restringe en SQL a administrador. La v2 agrega `adminGuard`, alineando acceso a la herramienta con su capacidad de escritura.

Este cierre es razonable y no debería revertirse como parte de la paridad. La acción autorizada del administrador debe conservarse; los accesos visuales que terminaban en rechazo de SQL se documentan como defecto heredado.

Fuentes: [rutas originales](../../smart-coach/src/app/app.routes.ts#L91), [rutas administrativas v2](../../smart-coach-v2/src/app/app.routes.ts#L256).

## Orden recomendado para recuperar la paridad

1. **Cerrar cambios de permisos y contexto:** creación de gimnasios, asignación de dueño, rutas generales del personal de gimnasio y autoría de rutinas/hojas. Incluir las vías SQL, no solo botones y guards.
2. **Restaurar las herramientas del administrador:** eliminaciones, clonación, rutinas y mediciones; resolver la identidad del contexto en el directorio.
3. **Restaurar el trabajo compartido del gimnasio:** biblioteca de ejercicios, salida voluntaria, selección y valores iniciales de membresía y sección de finanzas.
4. **Retirar del alcance de rediseño las ampliaciones no acordadas:** permisos individuales editables, alta por correo, panel para todos los miembros y nuevas acciones del portal. Mantenerlas requeriría tratarlas como excepciones funcionales explícitas.
5. **Restituir la exportación equivalente y verificar por actor:** descarga de rutinas y pruebas con datos que incluyan distintos autores, varios gimnasios y clientes con más de una relación.
6. **Corregir las incoherencias heredadas de autorización** sin reproducirlas por fidelidad al original. Verificar privilegios efectivos y despliegue antes de cambiar migraciones compartidas.

## Criterios concretos de aceptación

- Solo administración puede crear gimnasios desde interfaz, URL directa, RPC e inserción directa autorizada; crear no asigna automáticamente al administrador como dueño.
- El administrador puede asignar/reasignar dueño principal y completar las mismas operaciones de mantenimiento de gimnasios, entrenadores y clientes.
- Cada entrada de clientes/rutinas del personal conserva el gimnasio activo y sus permisos, incluso al entrar por URL directa o recargar.
- Un miembro sin permiso no obtiene otro flujo de escritura por una ruta general.
- Los ejercicios del gimnasio son visibles entre sus miembros y los nuevos conservan `gym_id`.
- La edición de planes conserva las reglas de autoría acordadas; un borrado de cero filas nunca se presenta como exitoso.
- Se conservan salida del gimnasio, finanzas, selección de membresía y valores iniciales del alta.
- La ficha administrativa mantiene acciones sobre rutinas y mediciones, distinguiendo gimnasio, membresía y relación independiente.
- Estándar, Pro vigente y Pro vencido conservan sus diferencias originales; la modalidad gimnasio no se confunde con un plan independiente.
- Las ampliaciones funcionales quedan identificadas y fuera del requisito de paridad salvo aceptación expresa.

Esta revisión incorpora documentación y evidencia local. No modifica código de aplicación, permisos, migraciones ni datos remotos.
