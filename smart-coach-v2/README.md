# Zummith V2

Aplicación Angular paralela para evolucionar la interfaz de Zummith sin modificar `smart-coach`.

El avance de cada pantalla se registra en [`docs/MIGRATION_TRACKER.md`](docs/MIGRATION_TRACKER.md). Una ruta creada no se considera migrada hasta completar la validación visual, funcional, responsive y de datos.

La base usa Angular 21.2.23, igual que el original actualizado. Usa Node 22.19.0 (`.nvmrc`) y `npm ci` para instalar las versiones fijadas en el lockfile.

La preparación para el reemplazo está en [`docs/BACKEND_REPLACEMENT.md`](docs/BACKEND_REPLACEMENT.md). V2 usa el proyecto Supabase, dominio, sesión y operaciones ya disponibles en el original. Las 18 migraciones adicionales del repositorio quedan fuera del reemplazo: no se requiere aplicarlas para este modo de compatibilidad.

For the teammate's production handoff, follow [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md): repository checkout, production settings, Netlify configuration, verification, rollback and the unresolved security risks confirmed on 2026-10-26.

## Alcance actual

- Landing page
- Registro, inicio de sesión y recuperación de contraseña
- Dashboard del entrenador independiente
- Centro de clientes con alta y edición, mediciones, Portal Pro e historial RIR; promoción a producción pendiente
- Portal del cliente: acceso por perfil, edición de datos personales permitidos, mediciones, pagos, rutinas, registro de series/carga/RIR y PDF, siguiendo los permisos del original
- Rutinas con constructor por etapas, progresión, bloques, calentamiento e impresión; guardado mediante las operaciones existentes del original
- Hoja de competidor con planificación semanal, tres microciclos y PDF; guardado mediante las operaciones existentes del original
- Listados de rutinas, ejercicios y mediciones
- Administración global y carga inicial de ejercicios para administradores
- Perfil de entrenador
- Fundación multigimnasio con selector, ingreso por código, contexto activo y dashboard por permisos
- Clientes de gimnasio con mediciones, rutinas, competidor, RIR e invitación al Portal aislados por membresía
- Pagos de gimnasio con cartera, planes, vencimientos e historial, bajo las reglas existentes del original
- Personal del gimnasio con ingreso por código, roles, permisos del original, copropietarios y retiro seguro
- Configuración del gimnasio con identidad, contacto, logo aislado, color y renovación segura del código de acceso
- Onboarding de gimnasio con borrador recuperable, creación administrativa y código único; asignación de propietario desde Administración

La administración incluye directorios globales, fichas, planes, edición y creación contextual de rutinas; gestión de anuncios por plan y fechas; actividad global y mantenimiento de gimnasios con asignación de propietario y eliminación confirmada. Usa el backend y los permisos actuales del original. El Portal del cliente cubre las superficies operativas acordadas. Permanece pendiente la revisión final de flujos antes de autorizar la publicación.

## Desarrollo

Para probar V2 con la copia local del esquema de producción y los usuarios ficticios preparados, usa `npm run start:testing` y abre `http://127.0.0.1:4350`. Los accesos, escenarios y comandos están en [`docs/TESTING_LOCAL.md`](docs/TESTING_LOCAL.md). Esta configuración usa una sesión separada de producción.

```bash
nvm use
npm ci
npm start
```

`npm start` usa el backend del original para autenticación, datos y archivos; las operaciones guardan en ese proyecto. Para pruebas con datos ficticios usa `npm run start:staging`. Los builds usan entornos explícitos: producción (`environment.prod.ts`), local y staging alojado. Cada backend conserva su sesión por separado; producción usa `zummith-auth` para mantener el acceso al sustituir el original en el mismo dominio.

Antes de generar el artefacto para el reemplazo:

```bash
npm run build:release
```

Este comando verifica sin conectarse a Supabase que la URL, clave pública y sesión de producción coincidan con el original, que staging esté aislado y que el SDK esté fijado. También comprueba las funciones y los buckets usados por V2 contra el catálogo de producción revisado; rechaza dependencias de funciones nuevas ausentes allí. Después compila `dist/smart-coach-v2/browser`. `netlify.toml` prepara esa carpeta y los redirects SPA; no publica automáticamente ni modifica el sitio actual.

### Perfiles de demostración locales

Con Supabase local en ejecución, carga datos ficticios en la base local y abre la v2 con su configuración de staging:

```bash
DEMO_PASSWORD='tu-contraseña-demo-de-12-caracteres-o-más' npm run seed:demo:local
npm run start:staging
```

El comando crea ocho accesos: administrador, coach estándar, coach Pro, dueña de gimnasio, entrenador de gimnasio, recepción, cliente independiente y cliente de gimnasio. También agrega un gimnasio, otros clientes ficticios, un plan, pagos, rutinas, ejercicios, mediciones e historial de entrenamiento. Se puede repetir sin duplicar los registros. Solo acepta la URL local de Supabase (`127.0.0.1:54321`); no usa la base remota de la configuración normal.

Los dominios permitidos para callbacks deben configurarse siguiendo [`docs/SUPABASE_AUTH.md`](docs/SUPABASE_AUTH.md). Sin esa lista, Supabase puede enviar un login local al Site URL de producción.

## Bootstrap y estilos

Bootstrap se instala localmente desde npm. No se usa CDN.

- `src/styles/_tokens.scss`: valores visuales de Zummith.
- `src/styles/_bootstrap-theme.scss`: variables Bootstrap y estados de botones.
- `src/styles.scss`: estilos globales y tokens CSS semánticos.

Para cambiar colores o radios, modifica primero `_tokens.scss`. Los componentes deben usar clases Bootstrap y tokens semánticos antes de agregar estilos locales.

## Imágenes del catálogo global

Los 245 WebP animados del catálogo global se incluyen en `public/assets/exercises/v1`, con nombres basados en el UUID del ejercicio. Angular los copia como archivos estáticos al build. El manifiesto de esa carpeta registra tamaños, hashes y animación; la lista generada de IDs en `src/app/shared` evita intentar cargar archivos para ejercicios desconocidos.

La biblioteca y el constructor comparten `global-exercise-media.ts`: conservan una imagen real guardada y sustituyen los placeholders heredados por el WebP del ID global. En una rutina se usa `exerciseId`, no el ID de la asignación. La resolución afecta a la presentación y no reescribe imágenes en la base de datos. Los ejercicios con `source: 'coach'` mantienen sus imágenes y alternativas anteriores. En el Portal, «Ver movimiento» carga el WebP global solo al abrir la vista y lo retira al cerrar.

```bash
npm run test:exercise-media
ZUMMITH_TEST_URL=http://127.0.0.1:4200 npm run test:exercise-media-ui
```

La primera prueba verifica únicamente los archivos incluidos en V2 y puede ejecutarse sin el directorio `output`. La segunda usa respuestas simuladas de autenticación y datos, y comprueba biblioteca y rutinas en escritorio y móvil contra una instancia local de V2.

Si la copia de prueba tiene ejercicios globales con UUIDs heredados, `npm run seed:testing-exercise-media` muestra el plan de asociación y `npm run seed:testing-exercise-media -- --apply` lo aplica únicamente a la copia local `original-compat`. Asocia por nombre normalizado único, guarda la URL estática en `image_url` y añade solo los globales que faltan; conserva los UUIDs existentes y las referencias de rutinas. Los ejercicios personalizados y las imágenes reales guardadas quedan protegidos. Después, recarga la biblioteca de prueba.

Para regenerar o cotejar los archivos desde el catálogo original verificado y sus 22 lotes en `../output`, usa `npm run sync:exercise-media` o `npm run sync:exercise-media -- --check`. Estas fuentes solo son necesarias para el mantenimiento del catálogo; no se necesitan para compilar o servir la aplicación. Una nueva versión de las imágenes debe actualizar la carpeta versionada y regenerar la lista y el manifiesto correspondientes.

## Verificación

```bash
npm run check:backend
npm run check:original-backend
npm run test:original-backend-contract
npm run test:plan
npm run build:release
```

Las pruebas visuales con respuestas simuladas usan `npm start` en el puerto 4200; `ZUMMITH_TEST_URL` permite elegir otra instancia. `test:clients`, `test:astra`, `test:routines`, `test:competitor` y las pruebas administrativas guardan capturas en `docs/qa` y comprueban navegación, integración y adaptación a móviles.

Para las pruebas reales del reemplazo se usa una instancia local aislada con las 60 migraciones registradas en producción. Las instrucciones y resultados están en [`docs/BACKEND_REPLACEMENT.md`](docs/BACKEND_REPLACEMENT.md). El staging habitual de 78 migraciones y las suites históricas se conservan para mejoras opcionales; sus resultados no acreditan compatibilidad con el backend actual del original.

El script histórico que escribe en producción quedó separado como `test:production-mutations` y exige habilitación explícita. No forma parte de las pruebas locales ni de la verificación de conexiones.
