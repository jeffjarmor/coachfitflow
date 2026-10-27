# Staging local aislado

V2 dispone de una configuración `local-staging` que conecta únicamente con el Supabase CLI en `127.0.0.1:54321`. La configuración normal de V2 sigue apuntando al proyecto alojado; el original `smart-coach` no se modifica. Este staging no contiene datos de producción ni envía correos reales: Mailpit captura las invitaciones.

## Arranque

Con Docker Desktop iniciado, desde la raíz del repositorio:

```sh
npx --yes supabase@2.117.0 start --exclude imgproxy,logflare,vector,supavisor
```

Después, desde `smart-coach-v2`:

```sh
npm run start:staging
```

- V2: `http://127.0.0.1:4300`
- Supabase Studio local: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`

`supabase/config.toml` autoriza los callbacks locales de 4200/4300/4400 y usa 4300 como Site URL. Al modificar esta configuración, reinicia la instancia local conservando sus volúmenes (`supabase stop` sin `--no-backup`, seguido del arranque anterior) para que Auth adopte los nuevos destinos. Esta configuración no modifica Auth del proyecto alojado.

No publicar el build `local-staging`: contiene una URL de `127.0.0.1` y una clave pública de desarrollo. Nunca colocar la clave `service_role` en Angular.

## Verificación

Desde la raíz del repositorio, el siguiente test SQL crea solo datos sintéticos dentro de una transacción y termina con `ROLLBACK`:

```sh
docker exec -i supabase_db_coachfitflow psql -U postgres -d postgres -f /dev/stdin < supabase/tests/independent_deletion.local.sql
npx --yes supabase@2.117.0 db advisors --local --type security --level warn
```

Desde `smart-coach-v2`:

```sh
npm run build:staging
npm run test:local-staging
npm run test:local-staging-ui
npm run test:local-staging-gym-rir
```

`test:local-staging` prueba Auth, Pro, escrituras de rutina/competidor/medición, invitación capturada por Mailpit, RIR, rechazo con Pro vencido, aislamiento entre entrenadores, Storage y borrado. `test:local-staging-ui` repite el borrado desde la interfaz móvil; `test:local-staging-gym-rir` protege la compatibilidad del RIR de gimnasio. Todos exigen la URL local exacta, crean identidades temporales y las retiran al finalizar.

El staging local no comprueba entrega a un correo externo, Google OAuth, el corte sobre `zummith.com` ni el comportamiento del proyecto alojado. Después de actualizar Bonfire a Pro se creó un staging Supabase en una organización Free separada; sus instrucciones y limitaciones están en `HOSTED_STAGING.md`. No aplicar las migraciones nuevas al Supabase de producción ni ejecutar `db push` sin un identificador de proyecto explícito.
