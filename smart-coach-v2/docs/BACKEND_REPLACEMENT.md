# Conexión de V2 con la aplicación original

Revisión: 2026-10-10. El objetivo es usar la interfaz de `smart-coach-v2` con las cuentas, datos, lógica y permisos actuales de `smart-coach`, sin cambiar el backend compartido ni aplicar las 18 migraciones adicionales. Este documento prepara el reemplazo del frontend; no registra un despliegue ni una promoción de base de datos.

## Conexiones

| Configuración | Backend | Uso |
| --- | --- | --- |
| `production` / build normal | `https://bzhqprxolseyxuuwodqs.supabase.co` | Proyecto existente de `smart-coach`; comparte Auth, datos y Storage. |
| `local-staging` | `http://127.0.0.1:54321` | Supabase local aislado; pruebas con cuentas sintéticas y correo capturado localmente. |
| `local-testing` | `http://127.0.0.1:55321` | Copia del esquema y permisos actuales del original, con 60 migraciones y datos ficticios realistas para pruebas manuales y automáticas. |
| `hosted-staging` | `https://iyueiuonwvodksxlykyv.supabase.co` | Proyecto `zummith-v2-staging`, organización separada `dzkufamvbjzellugsstq`. |

Los environments de Angular contienen únicamente claves públicas. Las claves `service_role` quedan fuera del navegador. Los scripts de integración cargan claves privilegiadas del destino de staging y validan su identificador antes de crear fixtures.

Producción conserva la clave de sesión `zummith-auth` del original en el mismo dominio. Local usa `zummith-v2-local-auth` y staging alojado `zummith-v2-hosted-auth`, para evitar mezclar identidades entre bases. La recuperación de contraseña e invitación usa un cliente transitorio: valida el enlace y conserva cualquier otra sesión abierta. Se admiten `token_hash`, tokens heredados y PKCE; las credenciales del callback se retiran del historial del navegador.

Desde el 14 de octubre, `npm run start:testing` abre V2 en `http://127.0.0.1:4350` con la sesión independiente `zummith-v2-testing-auth`. La copia local fue comparada nuevamente con producción mediante metadata de solo lectura; sus 36 funciones y permisos de ejecución coinciden, incluida la restauración local del helper legado. Diez cuentas persistentes y un escenario ficticio realista permiten probar la aplicación sin utilizar cuentas o datos de clientes reales. Instrucciones y accesos privados: [`TESTING_LOCAL.md`](TESTING_LOCAL.md).

El registro de accesos vuelve a escribir en `activity_logins`, incluyendo OAuth y sesiones restauradas, con deduplicación por sesión. Las URLs heredadas `/forgot-password` y `/landing-nueva` tienen destinos compatibles en V2. Los guardados de cliente, ejercicio y plan administrativo ahora confirman filas afectadas, evitando mostrar éxito cuando el registro ya no existe o se retiraron permisos.

No hace falta trasladar usuarios, copiar datos ni aplicar las 18 migraciones adicionales para conectar V2 al original. Se adaptaron las operaciones de V2 al contrato de servidor ya desplegado: llamadas a tablas existentes y RPC disponibles. Se conserva el bucket `assets`, incluidos los logos de gimnasio. El build de reemplazo comprueba este contrato sin conectarse a producción.

La eliminación automática de la propia cuenta no está disponible en el contrato actual; V2 informa de ello antes de borrar archivos o registros. Las operaciones de varios pasos conservan las limitaciones del original: no adquieren transacciones nuevas del servidor. Si un pago se guarda pero falla la actualización de vencimiento, V2 identifica ese estado para evitar registrar otra vez el mismo pago.

## Contrato funcional compartido

| Área | Fuente y comportamiento esperado |
| --- | --- |
| Autenticación | Supabase Auth existente; registro, Google, recuperación, invitaciones y resolución de perfil de entrenador o cliente. |
| Roles y planes | Perfiles `coaches`, membresías `gym_staff`, propietario principal y permisos efectivos del servidor. V2 debe conservar las acciones del original y el vencimiento Pro por fecha local. |
| Clientes y mediciones | Contexto independiente o membresía exacta de gimnasio. Los permisos de lectura, edición, clonación y borrado se comprueban mediante RLS y RPC. |
| Rutinas y competidor | RPC independientes existentes y operaciones originales sobre tablas para gimnasio, conservando autoría, identificadores y ejercicios autorizados para el contexto. |
| Gimnasios | Contexto activo, ingreso por código, pagos, personal y configuración. Crear gimnasios y las operaciones administrativas globales requieren administración. |
| Portal | Accesos existentes, rutinas, mediciones, pagos y campos personales permitidos. Series, carga y RIR se guardan en el contexto autorizado. |
| Archivos y PDF | Storage existente y políticas por propietario/gimnasio; el PDF se produce desde los datos de la rutina autorizada. |

Los permisos efectivos los determinan las políticas y funciones actualmente desplegadas del original. [ROLE_PARITY.md](ROLE_PARITY.md) y [MIGRATION_TRACKER.md](MIGRATION_TRACKER.md) también contienen revisiones sobre el esquema ampliado de staging; sus resultados no sustituyen las pruebas de compatibilidad con el contrato de producción actual.

## Inventario de base de datos

El 2026-10-10 se consultaron los historiales sin modificar datos:

- Supabase local habitual: **78 migraciones aplicadas de 78 archivos**, incluidas mejoras opcionales de servidor. No representa el backend actual del original.
- Instancia local aislada `coachfitflow-original-compat`, API `http://127.0.0.1:55321`: **60 migraciones**, seleccionadas por las versiones exactas del historial remoto. No contiene cuentas ni datos de clientes reales ni las 18 migraciones adicionales.
- Producción: **60 migraciones registradas**, con la última versión `20260923170000`. Hay **18 archivos adicionales en el repositorio**: una migración anterior de borrado de cuenta, dieciséis posteriores presentes al comenzar esta revisión y la corrección local de activación/aislamiento del Portal. **No forman parte del reemplazo del frontend.**
- Staging alojado: la documentación conserva pruebas de septiembre y declara pendiente la revisión de paridad. La conexión MCP disponible denegó acceso; la CLI falló con `LegacyDbConfigIpv6Error` al leer el destino enlazado. No se cambió el enlace ni se aplicaron migraciones. No se utiliza ese destino como evidencia del contrato original; hay que consultar su esquema actual antes de cualquier prueba allí.

Inventario histórico de mejoras adicionales, excluidas del reemplazo:

| Versión | Cambio |
| --- | --- |
| `20260912143000` | Borrado de cuenta de entrenador con prevalidación de vínculos. |
| `20260924230000` | Protección al borrar clientes independientes con membresías o trabajo compartido. |
| `20260924230201` | Restricción de tablas legadas de control de migración. |
| `20260924230655` | Reglas Pro para registros de entrenamiento independientes. |
| `20260926172911` | Restricción de bloques avanzados nuevos y compatibilidad de rutinas heredadas. |
| `20260926180803` | Operaciones de clientes de gimnasio y planes contextuales. |
| `20260926183005` | Protección RLS de edición de clientes de gimnasio. |
| `20260926184123` | Registro atómico de pagos. |
| `20260926192524` | Operaciones seguras sobre personal de gimnasio. |
| `20260926195557` | Configuración de gimnasio y bucket de logos. |
| `20260926200551` | Políticas de Storage para logos de gimnasio. |
| `20260926201927` | Creación atómica de gimnasio, posteriormente restringida a administración por paridad. |
| `20260926215003` | Guardado atómico de series del Portal. |
| `20260926222806` | Lectura de mediciones del Portal por contexto exacto. |
| `20260926233434` | Edición segura del perfil del Portal. |
| `20260927010308` | Lectura administrativa de gimnasios y membresías. |
| `20261008223616` | Paridad con el original: permisos, administración, clonación y protección de campos de autorización. |
| `20261010202940` | Activación de invitaciones ya vinculadas y cierre de autovínculos indebidos al Portal independiente. |

Los archivos están en [`supabase/migrations`](../../supabase/migrations). No ejecutar un `db push` global al reemplazar el frontend. Cualquier mejora de servidor de este inventario requiere un trabajo separado; omitirla conserva las reglas desplegadas que ya usa el original.

Si se decide aplicar esas mejoras en un trabajo futuro, también cambiarán funciones, políticas y triggers que consume el original; necesitarán su propia validación y reversión de servidor. La reversión del frontend por sí sola no revierte esos cambios.

La revisión del 10 de octubre reprodujo localmente una regla heredada que permitía insertar un vínculo propio al Portal de un cliente independiente ajeno y leer sus datos. La nueva migración bloquea nuevos vínculos indebidos y deja sin acceso los vínculos forjados anteriores: exige la identidad real de `clients.user_id` y un entrenador coherente. También permite reconocer invitaciones existentes como activas sin crear vínculos ni cambiar identidad, roles o facturación.

Una consulta de solo lectura confirmó que producción conserva la política heredada `independent_portal_access_self_or_coach` y la función de acceso sin comprobación de `clients.user_id`. No se ejecutó el ataque contra producción. El agregado de sus 35 vínculos mostró una identidad diferente de la ficha del cliente, cero identidades ausentes y cero entrenadores incoherentes. Esa diferencia no acredita un ataque: debe investigarse por un administrador autorizado y resolver su identidad antes de promover la corrección, porque el nuevo contrato denegará ese acceso. La corrección sigue aplicada únicamente en local; producción no fue modificada.

## Controles administrativos de V2

Los controles equivalentes del original están disponibles desde la navegación de Administración, sin añadir destinos a la barra inferior móvil:

| Ruta | Operaciones |
| --- | --- |
| `/admin/announcements` | Crear, editar, publicar, desactivar y eliminar anuncios para todos, estándar o Pro; orden, fechas y estados de publicación. El editor conserva los cambios ante un fallo y confirma su descarte. |
| `/admin/activity` | Inicios de sesión, usuarios únicos y rutinas de hoy; totales de 30 días e historial diario de 7 días, igual que el original. Las lecturas paginadas evitan truncar las estadísticas a 1.000 filas; un fallo muestra reintento, sin métricas incompletas. |
| `/admin/maintenance` | Buscar, crear y abrir gimnasios, asignar propietario y eliminar el gimnasio seleccionado. Accesos a cuentas/planes, clientes y catálogo/carga de ejercicios ya existentes. |

No se añadió una limpieza global: el original no ofrece esa operación. La asignación de propietario reutiliza `admin_assign_gym_owner`; el mantenimiento reutiliza las operaciones actuales sobre tablas. Las tres rutas exigen administración y sus servicios vuelven a comprobar los permisos del servidor. La eliminación de un gimnasio requiere escribir su nombre y verificar el estado actual; conserva las cuentas de entrenadores, los perfiles base de clientes y los datos de otros contextos. Las operaciones de varios pasos mantienen la limitación transaccional del original y advierten de posibles cambios parciales ante fallos.

Los anuncios siguen apareciendo en el inicio del entrenador mediante la lectura existente, que respeta publicación, fechas y plan. No cambian tablas, políticas, cuentas ni migraciones. Para el reemplazo permanece pendiente la revisión final de flujos y la autorización de publicación.

## Validación del contrato original

La comprobación offline usa el catálogo de producción revisado el 2026-10-10, guardado en `scripts/contracts/original-backend-contract.json`: versiones, firmas y permiso de ejecución de funciones, columnas y buckets; no contiene credenciales ni datos de clientes.

```sh
npm run check:backend
npm run check:original-backend
npm run test:original-backend-contract
npm run build:release
npm run build:staging
npm run build:hosted-staging
```

`build:release` falla si V2 llama funciones inexistentes, argumentos incompatibles o buckets ausentes del contrato revisado. Es una verificación estática; no prueba por sí sola todas las políticas de filas ni sustituye la aceptación funcional.

Las pruebas de integración del reemplazo se ejecutan exclusivamente en la instancia local aislada `coachfitflow-original-compat`, API `127.0.0.1:55321`, con las mismas 60 versiones del historial de producción. Usan cuentas sintéticas y retiran sus fixtures. El archivo de estado local de la CLI con claves de pruebas se guarda fuera del repositorio, con permisos restringidos; los scripts rechazan cualquier otra URL antes de conectarse. Nunca cargar un volcado de clientes reales.

```sh
npm run test:original-backend-admin
npm run test:original-backend-gyms
npm run test:original-backend-portal
npm run test:original-backend-admin-controls
npm run test:original-backend-admin-controls-ui
```

Las suites antiguas de `local-staging`, paridad y activación SQL prueban el esquema ampliado de 78 migraciones. Se conservan para las mejoras opcionales, pero no acreditan este reemplazo; algunos casos esperan funciones deliberadamente excluidas del contrato original. Los resultados de la revisión anterior a esta adaptación quedan como evidencia histórica.

El script histórico `scripts/live-supabase-migration-check.mjs` escribe en producción y no se utiliza. Requiere `ALLOW_PRODUCTION_MUTATIONS` igual al identificador exacto de producción antes de leer credenciales o conectar. Las verificaciones de compatibilidad no habilitan esa variable.

Resultados de la adaptación al backend original:

- Catálogo local comparado con producción: 264 columnas y 57 políticas idénticas; mismas firmas y permisos de 36 funciones. La comparación actualizada del 14 de octubre también confirmó las 36 definiciones idénticas, tras restaurar localmente el helper legado que difería en la revisión inicial.
- Contrato offline: cero incompatibilidades de funciones y buckets; doce pruebas del verificador aprobadas.
- Administración real contra la instancia de 60 migraciones: dieciocho comprobaciones aprobadas, incluyendo clonación de perfil/rutina/progresión/mediciones, conservación del origen y retirada de una membresía sin afectar otros gimnasios ni el cliente compartido. Cero fixtures residuales de la suite.
- Gimnasios: 35 comprobaciones reales aprobadas sobre el contrato original, incluyendo permisos, Storage original, pagos, conservación de autoría, aislamiento de membresías y edición de rutinas sin borrar historial de entrenamiento/RIR.
- Portal: 25 comprobaciones reales aprobadas, sin llamadas RPC ni errores de navegador: sesión original, activación/perfil/series mediante tablas existentes, aislamiento de contextos, accesos heredados con identidad diferente y recuperación de otra identidad sin cambiar la sesión ni la contraseña actuales. Fixtures retirados; servidor de prueba detenido.
- El enlace de contraseña del perfil conserva su diseño y ahora solicita recuperación por correo con feedback. Las redirecciones externas y Google requieren aceptación en el dominio final; no se cambió la configuración de Auth de producción.
- Compilaciones de producción, staging local y staging alojado aprobadas durante la adaptación inicial. Los artefactos contienen únicamente la conexión y clave de sesión correspondientes. La verificación actual de los controles administrativos se detalla a continuación.
- Cierre local: 60 migraciones y cero funciones nuevas requeridas de las 18; cero usuarios sintéticos residuales de las suites de compatibilidad. Las 217 fuentes del original siguen intactas. No se modificó el backend remoto ni se publicó V2.

Validación de los controles administrativos (2026-10-10):

- 25 comprobaciones de servicios reales en el esquema original aislado: CRUD de anuncios, permisos persistidos, estadísticas con 1.505 accesos paginados, límites temporales y mantenimiento que conserva cuentas, clientes y otros contextos.
- 39 comprobaciones de interfaz en escritorio y móvil táctil: navegación, permisos, errores/reintentos, validación de fechas, preservación de cambios, publicación/edición/borrado de anuncios y asignación/eliminación confirmada de gimnasios. Sin errores no controlados de navegador. Capturas `docs/qa/admin-controls-*.png`.
- 58 pruebas Karma/ChromeHeadless y compilación de producción aprobadas; contrato offline sin incompatibilidades. La aplicación mantiene el backend, las 60 migraciones y la sesión del original.
- Fixtures retirados y servidor de prueba detenido. Ninguna acción de prueba se ejecutó sobre clientes reales ni sobre producción.

## Testing local con usuarios persistentes (2026-10-14)

La instancia original se verificó nuevamente contra la metadata de producción, sin copiar información de clientes. Conserva 60 migraciones y tiene un escenario sintético persistente con 10 cuentas, 2 gimnasios, 25 clientes, rutinas, mediciones, pagos e historial RIR. La configuración `local-testing` conecta a `127.0.0.1:55321`, sirve V2 en `127.0.0.1:4350` y usa su propia sesión. Los accesos privados y los comandos de reinicio están documentados en [`TESTING_LOCAL.md`](TESTING_LOCAL.md).

Las seis suites del contrato original aprobaron 233 comprobaciones. Las pruebas de navegador cubrieron autenticación de los 10 perfiles, CRUD de clientes/mediciones/rutinas/competidor, operaciones y permisos de gimnasio, PDFs reales y guardado RIR en ambos Portales. Otras 26 comprobaciones aprobaron registro, recuperación e invitación con correo capturado y redirecciones reales de Auth. Se corrigió la ruta antigua de edición de clientes para conservar el mensaje de guardado y la pestaña Perfil. Las pruebas retiraron sus datos temporales y conservaron las cuentas del escenario; producción no fue modificada.

La aceptación manual final y los callbacks externos del dominio publicado siguen siendo pasos del corte. La evidencia local no implica publicar V2.

## Reemplazo del frontend

1. Actualizar el inventario de metadata de producción mediante lecturas, sin consultar ni modificar datos de clientes. Comprobar que el build conserva conexión, dominio y clave de sesión del original.
2. Completar la revisión final de flujos de V2: entrenador, gimnasios, Portal y administración, incluyendo lectura de datos existentes y acciones explícitas de guardado. Los controles administrativos equivalentes ya están implementados.
3. Preparar los artefactos del frontend original y V2, y una reversión del frontend. **No aplicar migraciones ni cambiar políticas, roles, buckets, vínculos o cuentas para este corte.**
4. Conservar `https://zummith.com` y `zummith-auth`. Confirmar los callbacks existentes de Google y correos de Auth; las pruebas locales no acreditan entrega de correo externa. No habilitar cambios remotos por defecto.
5. Publicar V2 únicamente cuando se autorice el corte. Verificar con cuentas representativas las lecturas y las operaciones acordadas, conservando el artefacto original para revertir el frontend.

La corrección de seguridad del Portal documentada arriba es un trabajo de servidor separado. Omitir las 18 migraciones no la aplica: conserva el estado de producción actual. El reemplazo visual no debe utilizarse para cambiar silenciosamente los accesos de clientes existentes.
