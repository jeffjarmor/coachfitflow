# Contrato frontend

## Producto y usuarios

Zummith organiza el trabajo diario de entrenadores y la consulta del progreso de sus clientes. Los objetos principales son clientes, rutinas, ejercicios y mediciones; el Portal muestra solo la información vinculada al usuario autenticado.

## Reglas

- Angular standalone y rutas con lazy loading.
- Bootstrap local compilado desde Sass como única base de componentes.
- El `.container` de Bootstrap es el contenedor oficial; no se deben recrear contenedores locales con otro ancho o gutter.
- Colores, radios y tipografía nacen de tokens, no de valores repetidos por componente.
- Los títulos, subtítulos, cuerpos, etiquetas y metadatos usan exclusivamente los roles `--zm-type-*`; solo los iconos pueden declarar un `font-size` local.
- El espaciado entre secciones, encabezados, grids, textos y tarjetas debe usar los tokens `--zm-*` definidos globalmente.
- Una acción primaria por región.
- Etiquetas visibles sobre cada campo. El placeholder no sustituye a la etiqueta.
- Estados de carga, vacío y error en cada consulta asíncrona.
- Errores en lenguaje humano con una acción de recuperación.
- El foco debe ser visible y navegable con teclado.
- Los controles deben tener un área táctil mínima de 44 px.
- En móvil se prioriza la tarea, no solo el apilado del escritorio.
- No mostrar IDs, nombres de tablas ni mensajes crudos de Supabase como contenido principal.
- El Portal del cliente usa navegación y estado propios: no presenta el dashboard ni las acciones de edición del entrenador. Si un usuario tiene varios perfiles, solo puede seleccionar entre los accesos devueltos para su sesión.

## Botones

- `btn-primary`: acción principal, fondo verde lima sólido, texto oscuro y sin borde. En hover, foco visible y pulsación se invierten los colores: fondo del color del texto y texto verde lima.
- `btn-outline-dark` y `btn-outline-secondary`: acción secundaria con borde. En hover, foco visible y pulsación, el fondo toma el color del borde y el texto usa `surface-soft` (`#edf2e9`).
- `btn-ghost`: acción utilitaria.
- Hover: elevación sutil y cambio de superficie.
- Active: compresión breve.
- Disabled: sin transformación ni sombra interactiva.
- Los CTA deben usar directamente `.btn`, `.btn-primary`, `.btn-outline-dark`, `.btn-outline-light`, `.btn-dark` y `.btn-sm`; no se deben duplicar variantes locales.
