# Publicación de Zummith V2 en producción

Esta guía es para quien vaya a publicar Angular desde `main` en el sitio de Netlify que sirve `zummith.com`.

## Prompt para un agente

> Trabajá desde `origin/main` en el repositorio completo de `coachfitflow`. Seguí esta guía para publicar Angular V2 en el sitio existente de Netlify de `zummith.com` y el proyecto Supabase `bzhqprxolseyxuuwodqs`. Prepará Netlify y registrá el despliegue anterior antes de tocar la base. En la ventana coordinada con Bonfire, verificá y aplicá únicamente la migración de consentimiento `20261113024214` si está pendiente. Actualizá el contrato a partir del catálogo real, comprobá `npm run build:release` y publicá la carpeta `smart-coach-v2/dist/smart-coach-v2/browser`. Conservá el dominio y las sesiones existentes. Dejá ONVO Live y Bonfire Factura apagados. Verificá inicio de sesión, rutas directas, portal de clientes, permiso de mediciones y enlaces legales. Informá el commit publicado, el ID de Netlify y el resultado de las verificaciones.

## Estado al 25 de noviembre de 2026

- Las seis migraciones de cobros y las funciones `coach-billing` y `coach-billing-webhook` ya están desplegadas. Los cobros reales siguen apagados y Bonfire emite manualmente las facturas. [Registro de facturación](BILLING_LOCAL.md#validación-de-publicación)
- Falta aplicar la migración de consentimiento y volver a exportar el catálogo real de producción. La validación de Angular reporta dos funciones de consentimiento ausentes.
- Los Términos llevan la fecha del 25 de noviembre de 2026. Informale a Bonfire que el número de versión, la vigencia del Aviso y algunas notas de cobros y cookies siguen entre corchetes. [Textos de Angular](../src/app/features/legal/legal-documents.ts)
- Las tres migraciones de seguridad registradas en octubre ya se aplicaron. [Registro de seguridad](security/PRODUCTION_HARDENING.md)

## Preparación

1. Confirmá acceso al sitio de Netlify que sirve `zummith.com` y al proyecto Supabase de producción `bzhqprxolseyxuuwodqs`. Registrá el ID del despliegue vigente, la rama de producción y las opciones actuales de build. Conservá ese despliegue para volver a publicarlo si hace falta.
2. Actualizá una copia limpia del repositorio. Conservá `smart-coach/` junto a `smart-coach-v2/` porque el validador compara la configuración y las llamadas de las dos aplicaciones.
3. Instalá las dependencias y ejecutá las pruebas. La compilación local sirve para ensayar el artefacto. La publicación requiere que pase `build:release` más adelante.

```sh
git switch main
git pull --ff-only origin main
git rev-parse HEAD
cd smart-coach-v2
nvm use
npm ci
npm run test:original-backend-contract
npm run build -- --configuration production
```

| Configuración de Netlify | Valor |
| --- | --- |
| Sitio | El proyecto existente de `zummith.com` |
| Base directory | `smart-coach-v2` |
| Package directory | Vacío o `smart-coach-v2` |
| Build command | `npm run build:release` |
| Publish directory, desde la base | `dist/smart-coach-v2/browser` |
| Node | `22.19.0` |
| Rama | `main` |

El build conserva la API de Supabase de producción, la sesión `zummith-auth` y los callbacks del dominio actual. Angular usa la clave pública ya registrada en el repositorio. Guardá las credenciales de administración en sus servicios correspondientes. [Configuración de monorepos de Netlify](https://docs.netlify.com/build/configure-builds/monorepos/)

## Ventana de publicación

### Consentimiento en Supabase

La migración [`20261113024214_client_measurement_consent.sql`](../../supabase/migrations/20261113024214_client_measurement_consent.sql) activa de inmediato la validación de escrituras de peso, estatura y mediciones. La interfaz anterior no tiene la tarjeta para otorgar el permiso. Tené lista la publicación en Netlify antes de aplicar la migración y coordiná ambas acciones en la misma ventana.

1. Consultá `supabase_migrations.schema_migrations` y confirmá si `20261113024214` está registrada. Si ya está aplicada, verificá las funciones y pasá a la exportación del catálogo.
2. Para aplicar solo esa versión con Supabase CLI v3, prepará un directorio temporal y creá `supabase/migrations/`. Copiá en él los archivos de las versiones ya registradas en producción y el archivo de consentimiento. En la copia temporal del archivo de consentimiento quitá solo el `begin;` inicial y el `commit;` final, porque el CLI envuelve la migración en una transacción. Conservá el archivo original en Git.
3. Revisá que el ensayo liste **exactamente** `20261113024214_client_measurement_consent.sql`. Solo entonces ejecutá el mismo comando sin `--dry-run`. El directorio temporal debe incluir únicamente el historial aplicado y esa migración nueva.

Creá el directorio con `consent_release_dir=$(mktemp -d)` y guardá esta configuración en `$consent_release_dir/supabase/config.toml`.

```toml
project_id = "zummith-consent-release"

[db]
major_version = 17

[db.migrations]
enabled = true

[db.seed]
enabled = false
```

```sh
supabase db push --remote=bzhqprxolseyxuuwodqs --workdir "$consent_release_dir" --include-all --dry-run --skip-vault
```

4. Verificá la versión en el historial y que `authenticated` tenga permiso de ejecución sobre `get_client_measurement_consent(uuid, uuid)` y `set_client_measurement_consent(uuid, uuid, text, text)`. La publicación de V2 solo requiere esa migración pendiente. Las migraciones fiscales, las demás migraciones pendientes y los datos de prueba quedan fuera.

### Catálogo y compilación

1. Ejecutá [`release-backend-metadata.sql`](../scripts/contracts/release-backend-metadata.sql) contra el mismo proyecto y guardá el objeto `metadata` que devuelve en `smart-coach-v2/scripts/contracts/deployed-backend-contract.json`. Incluí sus campos `migrations`, `functions` y `buckets`, más los campos indicados abajo. Usá como `reviewedAt` la fecha de la consulta en formato `YYYY-MM-DD`.
2. Confirmá que la validación pasó, que el HTML y el fallback SPA están en la carpeta de salida y que `onvoLiveBillingEnabled` sigue en `false`. El comando valida el catálogo guardado en Git y luego compila. Solo un catálogo obtenido de producción satisface el contrato.

```json
{
  "formatVersion": 2,
  "metadataOnly": true,
  "target": "deployed-production",
  "projectId": "bzhqprxolseyxuuwodqs",
  "reviewedAt": "YYYY-MM-DD"
}
```

```sh
npm run build:release
test -f dist/smart-coach-v2/browser/index.html
test -f dist/smart-coach-v2/browser/_redirects
```

3. Guardá el catálogo verificado en Git y subilo a `main`. Usá `[skip netlify]` en el commit si la publicación se hará manualmente, para coordinar el momento desde Netlify. [Documentación de Netlify sobre despliegues](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy)

### Netlify

Publicá el artefacto verificado en el **proyecto existente**. Para un despliegue manual, subí la carpeta `dist/smart-coach-v2/browser` o usá Netlify CLI desde `smart-coach-v2` con tu sesión y el ID del sitio verificado. La opción `--dir` apunta al artefacto recién validado.

```sh
npx netlify-cli deploy --prod --no-build --site "$zummith_netlify_site_id" --dir dist/smart-coach-v2/browser
```

Si usás el build de Netlify vinculado a Git, configurá los valores de la tabla y ejecutá **Trigger deploy** para el commit verificado de `main`. El log debe mostrar `npm run build:release` y la carpeta de publicación de V2. [Despliegue con Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)

## Verificación y recuperación

- Probá el inicio de sesión y la recarga de una ruta interna en `zummith.com`. Confirmá que el navegador usa Supabase de producción.
- Usá cuentas autorizadas para revisar el portal, la tarjeta de permiso de mediciones y el registro después de autorizar. Para probar el flujo de una persona adulta, el entrenador o gimnasio confirma primero su fecha de nacimiento en la ficha. Confirmá que un cliente sin permiso puede seguir consultando sus rutinas.
- Abrí Términos, Aviso de privacidad y el popup de Cookies desde el footer. Revisá Perfil → Facturación con el checkout de ONVO Live apagado.
- Registrá la revisión de Git, el ID del despliegue de Netlify y los resultados. Si hace falta regresar a la interfaz anterior, usá **Publish Deploy** sobre el despliegue previo. Los triggers de consentimiento en Supabase siguen activos tras ese cambio de frontend. Coordiná con Bonfire cualquier recuperación de las escrituras de mediciones. [Opciones de recuperación en Netlify](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#rollbacks)
