# Dirección visual

Zummith debe sentirse claro, enérgico y confiable. La identidad parte de la landing nueva: superficies verde grisáceas, tinta oscura, acento lima y fotografía real de entrenamiento.

## Sistema

- Tipografía: `Avenir Next`, `Avenir`, `Segoe UI`, sans-serif.
- Fondo principal: `#f4f7f1`.
- Superficie: `#fbfcf8`.
- Texto: `#141a14`.
- Acento: `#ccff00`.
- Controles: radio de 12 px.
- Tarjetas: radio de 20 px.
- Botones: forma cápsula.
- Contenedor: máximo de 1228 px, con gutters de 24 px por lado en escritorio y 16 px en anchos compactos.
- Secciones: 80 px verticales en escritorio y 40 px en móvil.
- Gaps principales: 40 px entre bloques, 24 px en grids y 16-18 px en móvil.

El lima señala la acción principal y los estados activos. No debe usarse como decoración indiscriminada.

## Mapa de color Bootstrap

| Bootstrap | Token Zummith | Uso |
| --- | --- | --- |
| `primary` | `$accent` | Acción principal y selección activa. |
| `secondary` | `$ink-soft` | Acción secundaria sólida. |
| `success` | `$success` | Operación completada. |
| `info` | `$info` | Información neutral. |
| `warning` | `$warning` | Atención sin bloqueo. |
| `danger` | `$danger` | Error o acción riesgosa. |
| `light` | `$page` | Fondos claros. |
| `dark` | `$dark` | Superficies oscuras y CTA de contraste. |

Cada color semántico incluye variantes `text-emphasis`, `bg-subtle` y `border-subtle` para alertas y estados. `_tokens.scss` es el único lugar donde se cambian los valores de color.

## Ritmo espacial

La escala vive en `_tokens.scss`, se expone como variables `--zm-*` y alimenta las variables Sass de Bootstrap. Los componentes deben reutilizar `.container`, las utilidades de spacing y los tokens semánticos antes de declarar medidas locales.

- `--zm-section-y`: separación vertical de una sección.
- `--zm-heading-gap`: distancia entre el encabezado y el contenido de sección.
- `--zm-grid-gap`: separación entre tarjetas o columnas repetidas.
- `--zm-copy-gap`: distancia entre título y texto relacionado.
- `--zm-card-padding`: espacio interno estándar de tarjetas.

## Escala tipográfica

La escala de producto nace de las proporciones ya aprobadas en el landing. Las vistas internas deben usar los roles `--zm-type-*` y no declarar tamaños locales para texto funcional.

- Título de página: 40/48 px en escritorio y 32/40 px en móvil.
- Título de sección: 28/36 px.
- Subtítulo: 24/32 px en escritorio y 20/28 px en móvil.
- Texto destacado: 20/28 px.
- Texto funcional: 16/24 px.
- Etiqueta: 14/20 px.
- Metadato: 13/20 px.
- Caption: 12/18 px.
- Navegación móvil compacta del administrador: 11/14 px, con iconos de 32 px. Este tamaño se limita a la barra inferior del perfil de administración.

Los tamaños de iconos pueden seguir siendo locales porque no representan texto. Los botones conservan su escala Bootstrap compartida con el landing.

## Movimiento

Las transiciones comunican interacción y cambio de estado. Los botones se elevan 2 px en hover y se comprimen levemente al presionarlos. Toda transición debe desactivarse con `prefers-reduced-motion`.

Los modales del sitio comparten un fade de opacidad de 180 ms al abrir y cerrar, incluido el fondo. Los montados condicionalmente usan `animate.enter` y `animate.leave` para completar la salida antes de retirarse del DOM; los diálogos del catálogo conservan su implementación nativa y animan el panel y el fondo. Las acciones que cambian de página esperan el final del fade antes de navegar. No se añaden desplazamientos ni escalado.

Los enlaces y las acciones de texto usan subrayado nativo con `--zm-link-underline-offset` (3 px). El subrayado sigue la línea del texto y no se simula con el borde inferior del área interactiva. Las acciones que aparecen subrayadas al pasar el cursor también lo hacen al recibir foco visible. Los indicadores de pestañas y navegación conservan sus bordes propios.

## Gráficas

Las gráficas usan el componente compartido `SiteChartComponent`, con Apache ECharts y `ngx-echarts` para Angular 21. El tema se obtiene de los tokens `--zm-*`: líneas verde oscuro, puntos lima, barras de tinta, cuadrícula tenue y tipografía del sitio. Solo se importan los módulos de líneas, barras, ejes, tooltips, accesibilidad y renderizado SVG en las rutas que los necesitan.

Las fechas, unidades y montos se presentan en español de Costa Rica. Las mediciones usan un eje temporal y los cobros conservan un eje desde cero, con gráficas separadas por moneda. Cada gráfica incluye una tabla desplegable con los valores exactos; las animaciones respetan `prefers-reduced-motion`. La verificación visual y de interacción se ejecuta con `npm run test:charts`.

## Densidad

La landing conserva espacio amplio. Las pantallas de trabajo usan una densidad media, jerarquía clara y listas escaneables. En móvil, las listas cambian a tarjetas para evitar desplazamiento horizontal.

Las tarjetas de la biblioteca de ejercicios reservan un área cuadrada para la imagen. Los WebP del catálogo usan `object-fit: contain` para mostrar cuerpo y equipo completos. La cuadrícula muestra cuatro columnas desde 1024 px, tres entre 921 y 1023 px y dos hasta 920 px; el área de imagen conserva su proporción cuadrada también en móvil.

Los directorios, bibliotecas e historiales que pueden crecer reutilizan `ListPaginationComponent`: 5 registros iniciales y selector de 5, 10 o 20. Primero se busca, filtra y ordena sobre la colección completa cargada; después se pagina. Cada lista conserva su propia página y vuelve a la primera al cambiar sus filtros o contexto. Si desaparece la última página, se muestra la última disponible. Los totales, gráficas, exportaciones y formularios usan los datos completos.

La paginación muestra el rango y Anterior/Siguiente con límites deshabilitados. En móvil y en paneles de hasta 600 px usa dos filas compactas, texto de caption y controles táctiles de al menos 44 px. El cambio de página lleva el foco al comienzo de la lista. El componente completo se oculta con 5 registros o menos, sin dejar espacio ni borde. A partir de 6 conserva el selector, incluso cuando la cantidad elegida de 10 o 20 permite mostrar todo en una página. Los resúmenes acotados del inicio, las tablas de comparación de gráficas y los campos que componen un formulario mantienen su presentación propia.

## Autenticación y administración

- Las pantallas de autenticación priorizan el formulario. La fotografía puede acompañar, pero no debe repetir beneficios, titulares ni etiquetas promocionales.
- Las herramientas administrativas muestran primero el estado y la acción disponible. Los detalles de implementación no forman parte de la explicación principal.
- Una operación de mantenimiento usa una sola región de trabajo. No se divide en tarjetas tutoriales ni listas de pasos si la acción puede explicarse con estado, alcance y resultado.
- La navegación inferior conserva cinco destinos para entrenadores. Los dueños de gimnasio tienen seis, incluido Gyms con el icono Tabler `building-community` y enlace a `/gyms`. El administrador tiene siete: los cinco habituales más Gyms y Admin, con iconos Tabler y estados activos para sus respectivas áreas. Los accesos permanecen en una fila y conservan objetivos táctiles de al menos 44 px desde el ancho mínimo de referencia de 375 px. Solo el administrador usa textos de 11/14 px e iconos de 32 px en su barra inferior.
- El submenú de administración reutiliza la barra oscura de Gimnasios: fila de 48 px con iconos Tabler, tipografía de metadato, subrayado blanco y desplazamiento horizontal con flechas en móvil. Ambos submenús ocultan la barra de desplazamiento y conservan el deslizamiento horizontal. La opción activa permanece visible al navegar entre secciones.
- Los campos de una línea de administración comparten `--zm-admin-control-height` (50 px): buscadores, inputs de texto, números, fechas y selectores. La regla se limita a `.admin-workspace` e incluye los editores y diálogos internos. Los buscadores cuentan la altura de su borde exterior. Las áreas de texto conservan sus filas y altura editable; los checks y radios mantienen su tamaño propio. Los estilos de etiqueta no se aplican al contenedor del buscador.
- Todos los perfiles autenticados muestran el footer compartido, incluidos administración, dueños y personal de gimnasio, y clientes de gimnasio o independientes. En móvil (hasta 640 px), muestra únicamente el contacto de Instagram centrado y, debajo, copyright y crédito de Bonfire. En tablet y escritorio conserva el logo y los enlaces de navegación; los enlaces de trabajo mantienen el gimnasio activo y los clientes reciben enlaces de su Portal. En móvil y tablet, el footer deja espacio para la navegación inferior fija.
- Las páginas del Portal comparten una columna de altura mínima igual a la ventana. El contenido ocupa el espacio disponible y el footer cierra la página, también cuando hay pocos registros. El estado de guardado de una serie ocupa su propia fila debajo de los campos, sin superponerse a los inputs.

Las consultas de planes Pro y Gym, renovaciones, preguntas y soporte usan el contacto de Instagram `@jeff.jaram`. La URL y el usuario se centralizan en `core/config/contact.ts`; los enlaces abren una pestaña nueva para conservar el trabajo en curso.

## Avisos del administrador

Los avisos usan la variante «Contraste oscuro» aprobada en Figma: superficie `dark-surface`, borde `dark-line`, texto `dark-text`, mensaje `dark-muted` e icono lima. El componente compartido `AnnouncementsComponent` mantiene 24 px de padding y separación entre avisos, 16 px entre encabezado y contenido y radio de tarjeta. Los títulos usan 24/32 px y pasan a 16/24 px cuando el bloque tiene 640 px o menos; los mensajes usan 14/20 px y conservan sus saltos de línea. Un solo aviso ocupa todo el ancho y varios se distribuyen en columnas cuando hay espacio.

El dashboard y la vista previa en vivo del editor administrativo usan el mismo componente. La selección por audiencia, vigencia y plan continúa en la capa de datos. Gimnasios y Portal del cliente todavía no incorporan la recepción de estos anuncios.

## Perfil del cliente

El resumen del perfil usa franjas abiertas sobre el fondo de página, sin cards, bordes envolventes ni fondos por dato. Los títulos de grupo se alinean en una columna lateral en escritorio y encima del contenido en móvil. La información personal se presenta como pares etiqueta/valor; las métricas y el contexto conservan su agrupación mediante espacio y separadores. Los datos sin registrar tienen menor énfasis que los valores disponibles. Esta regla también se mantiene en móvil.

El formulario compartido de creación y edición conserva dos hijos directos por sección: encabezado y cuadrícula de campos. Los campos condicionales, como Membresía, pertenecen a esa cuadrícula y usan su ancho completo cuando corresponde. La cuadrícula admite como máximo dos columnas y pasa a una cuando cada campo quedaría por debajo de 14 rem. Las etiquetas y sus indicaciones de obligatoriedad pueden acomodarse en varias líneas sin superponerse.

Los teléfonos de clientes aceptan números locales e internacionales, con 7 a 15 dígitos y hasta 40 caracteres de formato. Admiten un `+` inicial, espacios, paréntesis, puntos y guiones; el teclado es `tel`. El mismo validador se usa al crear o editar desde entrenadores, gimnasios y administración. El campo sigue siendo opcional y conserva el código del país.

Los títulos de sección de la ficha del cliente usan peso 700. En Historial RIR, los acordeones usan una flecha de 22 px de ancho y mantienen la separación del token de distribución respecto al contenido. El historial comienza con 5 registros por página y permite elegir 5, 10 o 20. En móvil, la paginación se organiza en dos filas compactas con texto de 12 px y controles táctiles de al menos 44 px.

## PDF de rutinas

El PDF conserva el diseño de V1 y usa un único renderer para entrenadores, gimnasios, administración y Portal del cliente. Su tipografía Roboto, tamaños, tablas, márgenes, colores neutros y paginación corresponden al documento original. El logo y color de marca vienen de la configuración guardada del gimnasio o entrenador; el PDF conserva negro y el icono original como valores predeterminados, sin heredar el color por defecto de la interfaz.

El icono predeterminado del PDF se sincroniza con el archivo que V1 sirve desde `smart-coach/public/assets/brand/coach-fitflow-icon-dark-square.svg`. El color de marca sin configurar se resuelve mediante `core/data/branding.ts` a `#000000`, tanto en los exportadores como al preparar perfiles y formularios de gimnasio. Los valores personalizados guardados tienen prioridad.

Ambas descargas incluyen métricas del cliente, periodo, calentamiento, notas generales, indicaciones por día y ejercicio, bloques y progresiones semanales con sus notas. Los nombres de ejercicios enlazan al video guardado o a la búsqueda de YouTube del original. «Guardar y descargar PDF» exporta el plan persistido; si falla la descarga, se reintenta desde la rutina guardada sin crearla nuevamente.

## Biblioteca del constructor de rutinas

En la etapa 4, la biblioteca, la búsqueda y el selector de grupo muscular se limitan a los grupos elegidos para el día activo en Distribución. «Todos» reúne esos grupos del día. El mismo límite se aplica al agregar o reemplazar un ejercicio. Al cambiar de día o modificar los grupos se limpian los filtros anteriores; las prescripciones ya agregadas se conservan.

Distribución ofrece los grupos habituales, los presentes en el catálogo autorizado y los guardados en la rutina, para que categorías existentes como Brazos también se puedan elegir. Si los grupos de un día no tienen ejercicios disponibles, la biblioteca muestra un estado vacío con regreso a Distribución; no amplía automáticamente la selección al catálogo completo.

La paginación de la biblioteca deja 16 px de espacio interior respecto al borde de la tarjeta. Sus botones conservan 44 px de altura y la distribución compacta según el ancho del panel.

## Progresión de rutinas

La progresión general por semanas se configura debajo de Calentamiento en el paso 4. Sus rangos se aplican a todos los ejercicios actuales y se copian de forma independiente a los agregados después, incluidos otros días. Los cambios en esa sección actualizan la rutina completa; cada ejercicio permite realizar ajustes particulares desde su propio acordeón.

El borrador conserva la configuración general al recargar. El guardado mantiene el contrato de V1: los rangos efectivos se almacenan por ejercicio, y el PDF utiliza esos mismos valores. Al abrir un plan guardado con rangos uniformes se recupera la configuración general; los planes con diferencias conservan sus progresiones individuales. Los controles de rangos usan dos filas en móvil y objetivos táctiles de 44 px.
