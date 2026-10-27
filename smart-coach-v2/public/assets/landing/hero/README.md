# Fotografías del hero

## Hero editorial actual · opción 03 de Figma

La opción editorial utiliza los dos archivos originales de imagen del diseño, descargados el 17 de octubre de 2026. En Figma están identificados como fotografías ImageGen; no se les atribuye la licencia de las imágenes de Unsplash conservadas debajo.

| Archivo | Tamaño original | Nodo de Figma | Uso |
| --- | --- | --- | --- |
| `editorial-desktop.png` | 2146 × 732 px | `28:112` | Fotografía panorámica, contenedor de proporción 1180 / 340. |
| `editorial-mobile.png` | 1122 × 1402 px | `28:139` | Fotografía vertical hasta 640 px, contenedor de proporción 350 / 438. |

Referencia: [03 / Editorial, escritorio y móvil](https://www.figma.com/design/KNBbWwMP4BCVlbACfCIhhW/Test?node-id=25-20).

Se usan mediante un único `<picture>` con archivos locales, sin URLs temporales de Figma en la app. El navegador selecciona una fotografía según el ancho. Se conserva la fuente existente de Zummith (`$font-family-primary`) y el título HTML solicitado: “Tú acompañas. / Zummith organiza.”

## Fondo anterior conservado

Cuatro fotografías reales de Unsplash, descargadas el 15 de octubre de 2026 y preparadas como WebP de 1600 × 1000 píxeles. Cada archivo pesa menos de 200.000 bytes; el conjunto pesa 717.454 bytes. Se reutilizan imágenes ya referenciadas en la landing. Los originales temporales se conservan fuera del repositorio.

| Archivo | Escena observada | Tamaño | Identificador de origen | Fotógrafo confirmado |
| --- | --- | ---: | --- | --- |
| `coaching.webp` | Entrenadora acompañando flexiones sobre soportes | 192.216 bytes | `1571019614242-c5c5dee9f50b` | Nombre completo no verificado; los metadatos de origen indican `John B.` |
| `strength.webp` | Detalle del agarre de una barra y su disco | 193.412 bytes | `1549060279-7e168fcee0c2` | No verificado |
| `training.webp` | Entrenamiento de fuerza con barra | 133.582 bytes | `1581009146145-b5ef050c2e1e` | [Anastase Maragos](https://unsplash.com/photos/topless-man-in-black-shorts-carrying-black-dumbbell-7kEpUPB8vNk) |
| `gym.webp` | Mancuernas en primer plano y una persona entrenando al fondo | 198.244 bytes | `1534438327276-14e5300c3a48` | [Danielle Cerullo](https://unsplash.com/photos/woman-standing-surrounded-by-exercise-equipment-CQfNt66ttZM) |

## Fuentes y licencia

La [licencia oficial de Unsplash](https://unsplash.com/license), consultada el 15 de octubre de 2026, permite descargar, copiar, modificar y usar las imágenes gratuitamente, incluso con fines comerciales. La atribución no es obligatoria. Mantiene restricciones sobre venta de imágenes sin modificación significativa y recopilación para un servicio competidor.

Fuentes exactas de los archivos descargados y recortados por el CDN oficial:

- [coaching.webp](https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1600&h=1000&q=74&fm=webp&crop=top): WebP, calidad 74, recorte superior.
- [strength.webp](https://images.unsplash.com/photo-1549060279-7e168fcee0c2?auto=format&fit=crop&w=1600&h=1000&q=62&fm=webp&crop=center): WebP, calidad 62, recorte central.
- [training.webp](https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1600&h=1000&q=78&fm=webp&crop=top): WebP, calidad 78, recorte superior.
- [gym.webp](https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&h=1000&q=74&fm=webp&crop=center): WebP, calidad 74, recorte central.

Las fichas oficiales de `training.webp` y `gym.webp` identifican a sus fotógrafos y confirman la licencia Unsplash; sus enlaces de imagen coinciden con los identificadores anteriores. No se atribuyen los otros archivos a un fotógrafo sin confirmación. Los [metadatos públicos de coaching](https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?fm=json) conservan la firma `John B.`.

## Encuadres del fondo anterior

Valores usados en el componente con `object-fit: cover`, revisados con el gradiente del hero y sus títulos fijos. La versión móvil tiene su propio encuadre.

| Archivo | Escritorio | Móvil | Criterio |
| --- | --- | --- | --- |
| `coaching.webp` | `60% 45%` | `45% 40%` | Conserva el ejercicio hacia la derecha y, en móvil, la interacción entre entrenadora y atleta. |
| `strength.webp` | `60% 50%` | `65% 50%` | Mantiene el agarre y el disco como foco. |
| `training.webp` | `55% 20%` | `50% 30%` | El sujeto está más centrado; el anclaje superior conserva la cabeza en formatos anchos. |
| `gym.webp` | `70% 50%` | `83% 50%` | La persona está al fondo a la derecha; las mancuernas aportan contexto. |

Las fotografías son decorativas para el fondo; los títulos y CTA deben permanecer como contenido HTML independiente.

El fondo anterior usaba un ciclo de 32 segundos: una imagen entraba cada 8 segundos con un fundido cruzado de 2 segundos sobre la anterior y un desplazamiento/zoom leve. Estas fotografías no se solicitan desde el hero editorial actual.
