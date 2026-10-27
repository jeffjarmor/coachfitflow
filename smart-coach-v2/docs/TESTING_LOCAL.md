# Pruebas locales con el esquema de producción

Preparación: 2026-10-14, hora de Costa Rica. Esta instancia reproduce el esquema y los permisos actuales del original con datos ficticios para probar V2. No contiene cuentas, correos, expedientes ni archivos de clientes reales.

## Acceso

- Aplicación: `http://127.0.0.1:4350`.
- Supabase local: `http://127.0.0.1:55321`.
- Bandeja de correos capturados localmente: `http://127.0.0.1:55324`.
- Sesión del navegador: `zummith-v2-testing-auth`, separada de producción y de los otros entornos.
- Credenciales de pruebas: `~/.local/share/coachfitflow-testing/original-demo-credentials.json`, fuera de Git y con permisos `0600`.
- Lista legible de accesos: `~/.local/share/coachfitflow-testing/ACCESOS_TESTING.md`, también privada y fuera de Git.

Desde `smart-coach-v2`:

```sh
npm run testing:database
npm run seed:testing
npm run start:testing
```

`testing:database` usa el directorio persistente `~/.local/share/coachfitflow-testing/original-compat`. Inicia o reconoce sus contenedores locales y recupera el archivo privado de estado; no reinicia los datos. Ese directorio contiene exclusivamente las 60 migraciones del original. No usar `supabase db reset`, ni aplicar el conjunto completo de migraciones del repositorio, para esta prueba de compatibilidad.

`seed:testing` solo acepta esta API local. Conserva las cuentas y los datos del escenario para las pruebas manuales; su manifiesto permite reconocer los registros propios. No debe confundirse con los fixtures temporales de las suites automáticas, que se retiran al terminar.

La configuración normal de desarrollo y producción conserva su conexión original. Para estas cuentas se utiliza **`start:testing`**. El build local se genera con `npm run build:testing` en `dist/smart-coach-v2-local-testing`; el despliegue mantiene el artefacto de producción habitual.

## Fidelidad de la copia

La comparación de metadata del 14 de octubre confirmó las mismas 60 versiones de migración, 264 columnas (tipos, nulabilidad y valores predeterminados), 57 políticas RLS, 36 funciones públicas y sus permisos de ejecución, y el bucket público `assets`. Se restauró localmente la definición exacta de un helper legado de migración; las 36 definiciones de función coinciden. No se añadió ninguna migración a la copia ni se modificó producción.

La comparación y el estado privado quedan en `~/.local/share/coachfitflow-testing/original-compat`. Los archivos de estado contienen claves locales privilegiadas y no deben copiarse al frontend ni al repositorio. Angular contiene únicamente la clave pública local.

## Escenario y verificación

Los **10 usuarios** cubren administración, entrenador estándar, Pro vigente, Pro vencido, dos propietarios, entrenador de gimnasio, recepción y clientes con Portal independiente y de gimnasio. El escenario tiene **Horizonte Fitness** en San Pedro y **Norte Fuerza** en Heredia: 25 clientes, 4 planes en colones, 12 membresías con estados variados, 14 ejercicios, 25 rutinas de 3 días, 150 mediciones, 34 pagos y 24 sesiones con 200 series registradas. Incluye 1 hoja de competidor y 5 anuncios con distintas audiencias y fechas.

Los contactos son ficticios, las fechas se calculan en Costa Rica y la evolución corporal corresponde a varias semanas. Los 25 cumpleaños son distintos y coinciden con las edades registradas. Los planes Pro, rutinas y vencimientos permiten revisar casos activos, vencidos, pendientes e inactivos. La carga se ejecutó dos veces: no duplicó registros ni cambió identidades o contraseñas. La comprobación final de las 19 tablas del escenario no encontró diferencias con los datos generados. Las contraseñas y el inventario definitivo están en el manifiesto privado.

Las pruebas del contrato original son:

```sh
npm run check:backend
npm run check:original-backend
npm run test:original-backend-contract
npm run test:testing-seed
npm test -- --watch=false --browsers=ChromeHeadless
npm run test:original-backend-admin
npm run test:original-backend-gyms
npm run test:original-backend-portal
npm run test:original-backend-admin-controls
npm run test:original-backend-admin-controls-ui
npm run test:original-backend-independent
npm run test:testing-flows
npm run test:testing-auth
```

Ejecutar las suites que escriben datos de forma secuencial. La copia se usa exclusivamente con usuarios ficticios; los scripts verifican el destino antes de autenticar, crear o eliminar sus fixtures. Las pruebas de navegador de testing bloquean conexiones a Supabase remoto.

Las suites históricas de `local-staging` y `hosted-staging` se conservan para el esquema ampliado de 78 migraciones. No se utilizan para acreditar esta copia del original.

La verificación del 14 de octubre aprobó 233 comprobaciones de servicios y controles sobre el esquema original, 58 pruebas unitarias de Angular, 12 del verificador de contrato y 4 del generador de datos. También se probaron en navegador los 10 perfiles, edición de clientes, operaciones de gimnasio, hojas de competidor, PDFs y registro RIR en ambos Portales. La prueba de correo aprobó 26 comprobaciones de registro, recuperación e invitación: sigue el enlace real entregado, observa la redirección de Auth, cambia la contraseña de la cuenta prevista y conserva la sesión principal. Los usuarios y correos temporales se eliminan al terminar.

La prueba de clientes detectó y corrigió un problema en la ruta antigua de edición: al guardar se perdían el mensaje de confirmación y la pestaña Perfil. Ahora se conservan ambos, con comprobación en clientes independientes y de gimnasio.

La entrega de correos se verifica en la bandeja local. Google OAuth y la entrega externa de correo requieren sus propias credenciales y configuración; no quedan acreditados por una copia de la base de datos.

## Revisión de mediciones y anuncios (2026-10-15)

El formulario de mediciones de entrenador, gimnasio y administración conserva los 15 inputs numéricos y notas del original, todos visibles. Solo peso (20–300 kg) y altura (100–250 cm) son obligatorios. Se restauraron los nombres de las circunferencias, los rangos opcionales y los pasos originales. La fecha se asigna usando el calendario local; al editar se conserva la fecha histórica. El valor legado `legs` se conserva sin presentar un input adicional. El IMC vuelve a calcularse con un decimal.

Se corrigió el bloqueo al completar o vaciar indicadores: los controles numéricos entregan números o `null`, y V2 intentaba llamar `.trim()` sobre ellos. Ahora llegan al guardado como números anulables, sin perder ceros válidos. Si falla el servidor, el formulario conserva los valores y muestra el error dentro del editor para permitir un reintento.

En anuncios, las lecturas y mutaciones se serializan para evitar que una lectura anterior oculte en memoria un anuncio recién guardado. Los filtros y etiquetas se actualizan automáticamente al comenzar o vencer una publicación. Se conservaron el diseño, las audiencias y las políticas existentes, incluida la restricción heredada del backend original para anuncios Pro en cuentas de gimnasio.

Las compilaciones de producción y testing aprobaron sus controles de conexión y contrato. Pasaron 69 pruebas unitarias, 143 comprobaciones reales de mediciones en los tres contextos y 52 de anuncios en escritorio y móvil. Los anuncios se probaron también desde los dashboards estándar y Pro, con permisos RLS reales. Se conservaron los registros de prueba existentes, incluidos los añadidos manualmente, y se retiraron únicamente los fixtures de estas suites. Las 217 fuentes del original permanecen intactas; no hubo cambios de esquema ni operaciones en producción.

Con `start:testing` activo, ejecutar secuencialmente:

```sh
npm run test:original-measurement-parity
npm run test:original-announcements-ui
```

Evidencia: [`qa/original-measurement-parity-2026-10-15.json`](qa/original-measurement-parity-2026-10-15.json) y [`qa/original-announcements-parity-2026-10-15.json`](qa/original-announcements-parity-2026-10-15.json).

## Revisión ampliada de formularios (2026-10-15)

Se revisaron los controles numéricos, valores vacíos, validaciones y recuperación de errores en clientes, rutinas, competidor, pagos, planes, configuración del gimnasio, Portal, ejercicios y autenticación. Membresías, personal, onboarding, unión de gimnasio, perfiles y otros controles administrativos tuvieron revisión estática; la evidencia distingue esa revisión de las pruebas DOM y de integración.

- En clientes independientes, gimnasio y admin, peso/altura ahora son `number | null`. Se guardan decimales y se pueden vaciar sin bloquear el submit. Los campos inválidos de admin muestran el motivo. El botón de reintento conserva y envía el borrador.
- Los cobros admiten importes positivos menores a 1, como el original, y utilizan el día local como fecha inicial. Un plan nuevo exige completar el precio; el cero sigue siendo válido si se introduce explícitamente.
- Un fallo al refrescar la configuración después del guardado no elimina el logo ya referenciado. Se distingue ese caso de un fallo al guardar para conservar el borrador y limpiar solo archivos no confirmados.
- Rutinas conserva una duración vacía o inválida y muestra su error; ya no la convierte automáticamente a una semana. Los errores de PDF conservan visible la rutina y permiten reintentar. Competidor distingue un guardado confirmado de una exportación fallida.
- Portal conserva las series que no se pudieron guardar, muestra «Sin guardar» y permite reintentar. Ejercicios globales informa el error cuando una actualización/eliminación no afecta ninguna fila. Nueva contraseña exige la misma complejidad que el original.

Pasaron **100 pruebas Angular** (31 regresiones nuevas), **12 pruebas del verificador del contrato** y ambas compilaciones. Se completaron **78 comprobaciones en navegador**: 38 de edición de clientes en los tres contextos, 28 de Portal independiente/gimnasio y 12 de competidor. Incluyen errores de servidor controlados, reintentos, recargas y PDFs reales. La comparación completa de 20 tablas conservó los registros existentes, incluidos los añadidos manualmente, y confirmó la limpieza de los fixtures temporales. Las 217 fuentes del original siguen intactas.

La RPC original de rutinas exige objetivo; se conserva esa regla aunque el control de V1 aparezca como opcional. No hubo cambios de esquema, permisos ni operaciones en producción. Los errores de PDF y los casos de logo/pagos se prueban con servicios simulados; no se presentan como nuevas pruebas completas de esos flujos contra un servidor remoto.

Con `start:testing` activo, ejecutar secuencialmente:

```sh
npm run test:original-client-forms
npm run test:testing-flows -- --focus portal
npm run test:testing-flows -- --focus competitor
```

Evidencia y alcance por método: [`qa/original-forms-audit-2026-10-15.json`](qa/original-forms-audit-2026-10-15.json). La aceptación manual final de los flujos sigue siendo una revisión aparte.

## Compartir mediante un túnel temporal

El entorno `local-testing-tunnel` genera un artefacto aparte, optimizado y sin mapas de fuentes. La app toma el dominio HTTPS del navegador y consulta `/supabase` en ese mismo dominio; el proxy dirige esas peticiones únicamente a la copia original local en `127.0.0.1:55321`. La sesión utiliza `zummith-v2-tunnel-auth`.

```sh
npm run build:testing-tunnel
PUBLIC_TUNNEL_ORIGIN=https://<dominio>.trycloudflare.com npm run start:testing-tunnel
```

Cloudflared apunta al proxy en `http://127.0.0.1:4351`. Su ejecutable y el estado del enlace actual se guardan fuera de Git en `~/.local/share/coachfitflow-testing/tunnel`. El dominio se obtiene al iniciar el túnel; el proxy debe arrancarse con ese origen exacto para aceptar las peticiones externas. El servidor no permite elegir otro backend.

El enlace utiliza las mismas 10 cuentas y los mismos datos ficticios. Solo comparte la app y las APIs de Auth, datos y archivos que necesita; las rutas administrativas de Auth, la base SQL, la bandeja de correos y los archivos privados de accesos no se publican. El proxy se comprueba con `node scripts/testing-tunnel-proxy.mjs --smoke` mientras está activo.

La comprobación real desde HTTPS se ejecuta con `npm run test:testing-tunnel -- https://<dominio>.trycloudflare.com`. Usa las cuentas existentes de entrenador, propietario y ambos Portales para iniciar sesión, leer datos de su contexto, recargar y cerrar sesión; bloquea intentos del navegador de consultar loopback o Supabase alojado. No crea fixtures ni cambia los datos del escenario, salvo la actividad normal de inicio de sesión.

La ejecución del 14 de octubre aprobó 37 comprobaciones con los cuatro perfiles desde el enlace HTTPS real: sin errores de navegador, API o transporte y sin solicitudes a loopback ni a Supabase alojado. Evidencia: [`qa/testing-tunnel-2026-10-14.json`](qa/testing-tunnel-2026-10-14.json).

El túnel dura mientras sus procesos y esta computadora permanezcan activos y conectados. El dominio cambia al volver a crearlo. Los cambios en datos son visibles tanto en el túnel como en la app local. Para los flujos de correo se conserva la bandeja local y los callbacks locales existentes; el túnel permite iniciar sesión con contraseña, pero no habilita Google ni recuperación/invitaciones remotas. Los logos que se suban durante la prueba pueden guardar URLs del dominio temporal.
