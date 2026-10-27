# Paridad de perfiles con smart-coach

Actualizado: 2026-10-08. El proyecto original define las acciones y permisos; la v2 conserva su interfaz renovada.

La auditoría de referencia es [comparación de ambos proyectos](../../docs/reviews/2026-10-08-smart-coach-paridad-perfiles.md). Los hallazgos de ese documento describen el estado **anterior** a estas correcciones.

## Cambios implementados

| Hallazgo | Corrección en v2 |
| --- | --- |
| F01 | Crear gimnasios requiere administrador en navegación, guard, RPC y RLS. La creación deja el dueño pendiente y conserva reintentos idempotentes. El endpoint anterior también exige administrador. |
| F02 | El administrador puede asignar o reasignar al propietario principal, eliminar gimnasios y eliminar cuentas de entrenador. Las eliminaciones usan transacciones y confirmación en la interfaz. |
| F03 | La ficha administrativa permite clonar a otro entrenador y eliminar el contexto seleccionado. La clonación copia perfil, rutinas con días, ejercicios, semanas y calentamientos, y mediciones; genera nuevos identificadores y no copia credenciales del portal. Los ejercicios privados se copian a la biblioteca independiente de destino para que el nuevo entrenador pueda leer y editar las rutinas. |
| F04 | La administración permite crear, abrir, editar, eliminar y descargar rutinas, además de crear, editar y eliminar mediciones de gimnasio o independientes. |
| F05 | Las rutas generales y la navegación del personal resuelven el gimnasio activo, incluyendo ejercicios, rutinas, clientes y mediciones. Se conserva el espacio seleccionado al recargar. |
| F06 | La biblioteca incluye los ejercicios compartidos del gimnasio. El guardado permite usarlos en rutinas y calentamientos; el editor conserva la autoría de cada ejercicio. |
| F07 | El panel del gimnasio queda para propietarios y administrador. Entrenador, recepción y consulta entran a clientes, con sus permisos correspondientes. |
| F08 | Los integrantes que no son propietarios pueden salir del gimnasio desde su perfil. La cuenta se conserva. |
| F09 | Se restablece Finanzas con período día, semana, mes o año, filtro por plan, total, promedio y gráfico. Se cargan todos los pagos mediante paginación y se separan monedas. |
| F10 | La ficha permite asignar membresía a propietarios y administrador. Los nuevos clientes de gimnasio comienzan pendientes, con vencimiento al mes siguiente. Recepción conserva el registro de pagos y la edición de vencimientos; no cambia plan ni estado manualmente. |
| F11 | El equipo ingresa por código. Se retiran alta por correo, casillas de permisos y delegación de roles por managers. Propietarios y administrador cambian roles con los permisos predeterminados del original. Los endpoints adicionales quedan revocados para usuarios autenticados. |
| F12 | Editar planes de gimnasio exige autoría o administración y conserva al autor original. El borrado valida filas afectadas; una negativa de RLS no se muestra como éxito. |
| F13 | El directorio distingue cada membresía de gimnasio y el contexto independiente, incluso para el mismo cliente y entrenador. Incluye membresías sin entrenador y conserva los identificadores en las rutas. |
| F14 | El portal conserva nombre, teléfono, nacimiento, notas y registro de series/carga/RIR. Se retiran dirección editable, finalización explícita e historial dedicado. La RPC de perfil preserva dirección y nacimiento existente si no se proporciona una fecha. |
| F15 | El entrenador y el administrador descargan el PDF de rutina directamente, con prescripción, calentamiento, semanas, bloques y notas. |

También se cierran los permisos heredados H01, H02 y H03: un usuario no puede cambiar su propio rol, tipo de cuenta o plan; crear gimnasios por inserción directa; ni escribir mediciones sin permiso sobre el cliente y contexto. Los cambios de plan de membresía se protegen también en escrituras directas. Managers no pueden retirar otros managers o propietarios mediante REST.

Para H04 y H05 se mantiene el permiso efectivo del servidor: recepción no crea hojas de competidor y solo administración modifica ejercicios globales. Se evita reproducir enlaces del original que llevaban a operaciones rechazadas por la base de datos.

## Base de datos

[20261008223616_restore_original_role_parity.sql](../../supabase/migrations/20261008223616_restore_original_role_parity.sql) contiene las funciones, políticas y triggers necesarios. Es una migración compartida del repositorio; no requiere modificar la aplicación `smart-coach`.

Las eliminaciones administrativas conservan perfiles, identidades y relaciones que siguen vinculados a otros contextos. El administrador no puede eliminar su propia sesión. No se eliminan datos históricos de entrenamiento para retirar los accesos adicionales del portal.

La migración se verifica contra Supabase local. **No se aplicó a staging alojado ni a producción, y no se publicó la aplicación.** El frontend actualizado requiere esta migración en el entorno donde se despliegue.

## Verificación reproducible

Desde la raíz del repositorio, con Supabase local iniciado:

```sh
npx --yes supabase@2.117.0 db push --local
docker exec -i supabase_db_coachfitflow psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/role_parity.local.sql
```

Desde `smart-coach-v2`:

```sh
npm run build
npm run test:plan
npm run test:role-parity
npm run test:admin-directory
npm run test:local-staging-portal-training
npm run test:local-staging-portal-measurements
npm run test:local-staging-gym-onboarding
npm run test:local-staging-gym-staff
```

La prueba SQL contiene 41 comprobaciones positivas y negativas y revierte sus fixtures. La matriz del navegador contiene 65 comprobaciones y usa Auth y REST reales de Supabase local para nueve perfiles: verifica aislamiento de contextos, visibilidad, guardias, clonación, mediciones y PDF. Comprueba que el entrenador de destino puede leer y guardar la rutina clonada con ejercicios, semanas y calentamiento. Incluye capturas de escritorio y móvil en [qa/role-parity](qa/role-parity/results.json).

Las suites históricas de onboarding, personal y portal se ajustaron al contrato original. Los cierres alojados del 2026-09-26 corresponden a la versión anterior y no acreditan esta revisión. Antes de publicar, corresponde aplicar la migración al staging de v2 y volver a ejecutar sus suites allí.
