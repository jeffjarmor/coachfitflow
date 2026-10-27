# Staging alojado de V2

> Revisión 2026-10-08: la corrección de paridad está documentada en [ROLE_PARITY.md](ROLE_PARITY.md). La migración `20261008223616_restore_original_role_parity.sql` y la interfaz nueva se verificaron localmente; esta revisión no se ha aplicado ni validado en staging alojado. Los resultados anteriores de este documento corresponden a la versión previa.

El proyecto Supabase `zummith-v2-staging` (`iyueiuonwvodksxlykyv`) está en la organización **Free separada** `dzkufamvbjzellugsstq`. No es el proyecto de producción `bzhqprxolseyxuuwodqs`. Se creó sin copiar usuarios ni datos de producción; las migraciones del repositorio se aplicaron y registraron el 2026-09-24. La contraseña de Postgres está en el llavero de macOS bajo el servicio `supabase-zummith-v2-staging-db`, no en Git.

## Usar V2 con staging

Desde `smart-coach-v2`:

```sh
npm run start:hosted-staging
npm run build:hosted-staging
```

La web se abre en `http://127.0.0.1:4400`; solo esta configuración conecta con `https://iyueiuonwvodksxlykyv.supabase.co`. El build usa un directorio distinto y nunca debe confundirse con el build normal, que sigue apuntando al proyecto original. No hay frontend público desplegado todavía.

## Pruebas seguras

```sh
npm run test:hosted-staging
npm run test:hosted-staging-ui
npm run test:hosted-staging-gym-rir
npm run test:hosted-staging-rc
npm run test:hosted-staging-auth
npm run test:hosted-staging-admin
npm run test:admin-directory
npm run test:hosted-staging-gym-foundation
npm run test:hosted-staging-gym-operations
npm run test:hosted-staging-gym-ui
npm run test:hosted-staging-gym-payments
npm run test:hosted-staging-gym-staff
npm run test:hosted-staging-gym-settings
npm run test:hosted-staging-gym-onboarding
npm run test:hosted-staging-portal-training
npm run test:hosted-staging-portal-measurements
npm run test:hosted-staging-portal-payments
npm run test:hosted-staging-portal-profile
npm run test:hosted-staging-gym-rc
```

Los tests verifican explícitamente nombre, identificador y organización del proyecto antes de usar claves; rechazan otro destino. Crean cuentas sintéticas temporales, prueban aislamiento entre entrenadores, escrituras de rutina, competidor, mediciones, RIR, Pro vencido, Storage y borrado de cuenta desde la interfaz móvil. La matriz RC agrega cuentas estándar, Pro activa, Pro vencida, segundo entrenador y administrador. Auth comprueba registro, confirmación, recuperación y cambio de contraseña con enlaces reales. Admin comprueba guards, CRUD global y carga inicial idempotente. La fundación de gimnasios comprueba selector, contexto activo, ingreso por código, rechazo de una cuenta externa, métricas y permisos con propietario, copropietario, entrenador y recepción. La suite de operación comprueba alta/retiro contextual, mediciones, rutinas, competidor, aislamiento entre dos gimnasios y recepción de solo lectura. La prueba UI crea un cliente, prepara su invitación y construye una rutina contextual en navegador real. El Portal registra series, carga y RIR para perfiles independientes y de gimnasio, finaliza sesiones, conserva reintentos idempotentes, muestra historial consolidado y descarga PDF reales de rutina e historial; además bloquea identidades externas o Pro vencidas. La suite complementaria comprueba mediciones, pagos, perfil editable, responsive y aislamiento exacto por membresía. Pagos valida planes, vencimientos, cobro atómico, dueño, recepción y bloqueo de entrenador. Personal valida alta por correo, permisos explícitos, promoción, manager delegado, retiro y protección del dueño principal. Configuración valida edición por dueño/copropietario, bloqueo de entrenador/recepción, logo aislado por gimnasio y renovación real del código. Onboarding valida creación atómica e idempotente, dueño con permisos completos, primer código utilizable, borrador, redirección y responsive. La prueba adicional confirma que la regla de RIR no bloquea escritura y lectura en gimnasio.

El RC pasó completo el 2026-09-26. Al terminar se comprobó que quedaron cero usuarios Auth, coaches, clientes y ejercicios temporales. El catálogo global de 243 ejercicios sí permanece en staging porque es el resultado esperado de la carga inicial.

El RC integral multigimnasio también quedó **aprobado el 2026-09-26** mediante `npm run test:hosted-staging-gym-rc`. La puerta única compiló el build alojado y validó onboarding, selector/contexto, matriz de roles, clientes, mediciones, rutinas, competidor, registro de series/RIR desde el Portal, invitación, pagos, personal, configuración, logos y códigos de acceso. El inventario de usuarios Auth, coaches, clientes y gimnasios sintéticos quedó idéntico antes y después de la ejecución.

Las pruebas de Auth y Portal generan enlaces mediante Auth Admin **sin enviar correo externo** y abren los enlaces reales en el navegador. El SMTP predeterminado de Supabase Free no entrega correo a direcciones fuera del equipo; para probar recepción real de confirmaciones, recuperaciones e invitaciones se necesita configurar SMTP de staging y redirects permitidos. No usar direcciones de clientes reales para pruebas automáticas.

## Pendiente antes de producción

- El asesor remoto ejecutado por CLI después de Configuración no reportó advertencias de seguridad nuevas. Sí mantiene advertencias heredadas de rendimiento (`auth_rls_initplan` y políticas permisivas múltiples); revisarlas antes del corte y auditar las RPC `SECURITY DEFINER` del original antes de modificar privilegios compartidos.
- Conservar `https://zummith.com` como `Site URL`, confirmar los redirects exactos de V2 y probar Google OAuth y SMTP externo durante el ensayo de corte; no se necesita otro dominio.
- Obtener respaldo y plan de reversión antes de aplicar las quince migraciones exclusivas de staging al proyecto de producción.
- Mantener la fase multigimnasio en staging hasta el ensayo de corte; su RC integral ya aprobó onboarding, fundación, clientes/rutinas, pagos, personal y configuración. Las siete rutas de administración de entrenadores/clientes pasaron la suite local con mocks y requieren aplicar `20260927010308_admin_directory_read_policies.sql` y repetir la validación contra staging alojado antes de incorporarlas al RC.

No ejecutar `db push` sin indicar el proyecto de destino: los tests y el despliegue de staging usan el ref `iyueiuonwvodksxlykyv` de forma explícita.
