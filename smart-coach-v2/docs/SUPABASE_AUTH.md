# Configuración de redirects en Supabase

La aplicación construye los callbacks de autenticación con `window.location.origin`. Esto mantiene cada flujo en el entorno desde el que comenzó:

- Local vuelve a local.
- Preview vuelve al mismo preview.
- Producción vuelve a producción.

Supabase también debe autorizar explícitamente esos destinos. De lo contrario puede usar el `Site URL` configurado, que normalmente apunta a producción.

## Configuración requerida

En Supabase abre `Authentication > URL Configuration`.

V2 reemplazará a la aplicación original sobre el mismo dominio. No se necesita un dominio separado: mantén `https://zummith.com` como `Site URL` durante y después del corte. Para desarrollo agrega los orígenes locales y para producción autoriza los destinos exactos usados por Auth:

```text
http://localhost:4200/**
http://127.0.0.1:4200/**
http://localhost:4300/**
http://127.0.0.1:4300/**
https://zummith.com/dashboard
https://zummith.com/login?registered=1
https://zummith.com/set-password
https://zummith.com/set-password?mode=invite
```

Durante el despliegue solo hay que confirmar que esas rutas siguen permitidas y que el proveedor de Google conserva el callback del mismo proyecto Supabase. No se deben agregar comodines de producción ni dominios ajenos al proyecto.

## Destinos usados por V2

| Flujo | Destino |
| --- | --- |
| Google OAuth | `<origen actual>/dashboard` |
| Recuperación de contraseña | `<origen actual>/set-password` |
| Login con correo y contraseña | Navegación absoluta a `<origen actual>/dashboard` para entrenadores o `<origen actual>/client/portal` para clientes; respeta un `returnUrl` compatible y del mismo origen |

El login resuelve el destino contra `window.location.origin`, compara ambos orígenes y reemplaza cualquier destino externo o incompatible con el rol por la ruta inicial de ese usuario. La navegación final también se construye desde el origen actual, por lo que una sesión iniciada en localhost no puede terminar en el dominio de producción por medio del formulario. El callback de Google entra por `/dashboard`, donde la protección de rutas redirige a un cliente del Portal según su contexto.
