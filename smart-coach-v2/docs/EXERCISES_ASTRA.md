# Biblioteca de ejercicios

La propuesta visual Astra fue adoptada como la experiencia oficial de ejercicios. Conserva la biblioteca global y los ejercicios propios en dos pestañas directas con sus conteos, además de todas las funciones de búsqueda, filtrado y administración.

## Rutas

- `/exercises`: biblioteca global y personal, búsqueda, filtro por grupo y zona, orden por nombre/fecha y detalle con instrucciones completas.
- `/exercises/new`: creación de ejercicio propio.
- `/exercises/:id/edit`: edición de ejercicio propio.

Las rutas `/exercises-astra`, `/exercises-astra/new` y `/exercises-astra/:id/edit` se conservan temporalmente como aliases compatibles. Las rutas requieren autenticación, usan `CoachDataService` y guardan en la misma cuenta y los mismos datos de Supabase. No utilizan una base de datos de demostración. Al crear, editar o cancelar se vuelve a `/exercises`.

## Dirección visual

Fotografía deportiva ya utilizada por el landing, acento lima para acciones y selección, tabs subrayados con conteos directos, grupos fotográficos y fichas compactas. Se mantienen los tokens de Zummith y los botones Bootstrap. En móvil las zonas se recorren horizontalmente, los campos de edición tienen prioridad sobre la vista previa y las fichas tienen dos columnas. El detalle usa un dialog nativo con foco, Escape y aislamiento del fondo.

Las imágenes guardadas se conservan. Solo los placeholders SVG de emojis, las imágenes ausentes o las imágenes fallidas usan fotografías por zona con la etiqueta «Foto de referencia». Esas fotografías no se guardan como demostraciones del ejercicio.

## Fotografías

Copias optimizadas de las imágenes existentes del landing, almacenadas en `public/assets/exercises-astra`:

- `strength.jpg`: https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e
- `training.jpg`: https://images.unsplash.com/photo-1549060279-7e168fcee0c2
- `movement.jpg`: https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b

## Validación

`npm run test:astra` con servidor local en 4300. Datos y escrituras interceptados por Playwright, sin modificar cuentas reales. Verifica 1440, 390 y 320 px: imágenes, filtros combinados, orden, vacío, detalle, cancelar eliminación, errores de formulario, creación, precarga de edición, actualización, eliminación, registro inaccesible y recuperación de carga.

Las capturas quedan en `docs/qa/astra-*.png`. Compilación de producción con `npm run build`. La escritura contra Supabase real sigue pendiente de validación con una cuenta de pruebas.
