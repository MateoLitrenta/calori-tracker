# Profundidad óptica · Comparativas de navegación

La referencia es `6edcba9252f5bb248b9cd98bbdddb276c16b17a2`, primera versión del PR #103. La comparación usa el mismo Inicio, el mismo conjunto de registros sintéticos y la misma posición de desplazamiento.

## Material y naranja

El espesor se sugiere mediante un reflejo interior de 1 px en el borde superior, una sombra interior de 1 px en el inferior y dos sombras exteriores de distinta difusión. Un brillo radial sesgado hacia la esquina superior izquierda ocupa hasta 18 px en la cápsula y 56 px en el lateral. Este reflejo queda en el fondo de la misma superficie translúcida y conserva un solo filtro de desenfoque de 14 px por navegación.

El marcador usa el mismo naranja base `#ff9a53`. En Claro, la proporción de naranja pasa de 63–78 % a 73–88 %. En Oscuro, se conserva el tono y la saturación de marca y se ajusta la luminosidad para mantener la lectura de los rótulos claros. El borde conserva el naranja completo. En navegadores con soporte de color más limitado se mantiene el tinte de la primera versión. La preferencia de más contraste o menos transparencia vuelve opaca la superficie.

## Inicio en Chrome

| Tamaño en px CSS | Claro antes | Claro después | Oscuro antes | Oscuro después |
| --- | --- | --- | --- | --- |
| 320 × 568 | [Antes](before/inicio-320-light.jpg) | [Después](after/inicio-320-light.jpg) | [Antes](before/inicio-320-dark.jpg) | [Después](after/inicio-320-dark.jpg) |
| 375 × 812 | [Antes](before/inicio-375-light.jpg) | [Después](after/inicio-375-light.jpg) | [Antes](before/inicio-375-dark.jpg) | [Después](after/inicio-375-dark.jpg) |
| 390 × 844 | [Antes](before/inicio-390-light.jpg) | [Después](after/inicio-390-light.jpg) | [Antes](before/inicio-390-dark.jpg) | [Después](after/inicio-390-dark.jpg) |
| 767 × 844 | [Antes](before/inicio-767-light.jpg) | [Después](after/inicio-767-light.jpg) | [Antes](before/inicio-767-dark.jpg) | [Después](after/inicio-767-dark.jpg) |
| 768 × 844 | [Antes](before/inicio-768-light.jpg) | [Después](after/inicio-768-light.jpg) | [Antes](before/inicio-768-dark.jpg) | [Después](after/inicio-768-dark.jpg) |
| 1280 × 800 | [Antes](before/inicio-1280-light.jpg) | [Después](after/inicio-1280-light.jpg) | [Antes](before/inicio-1280-dark.jpg) | [Después](after/inicio-1280-dark.jpg) |
| 1440 × 900 | [Antes](before/inicio-1440-light.jpg) | [Después](after/inicio-1440-light.jpg) | [Antes](before/inicio-1440-dark.jpg) | [Después](after/inicio-1440-dark.jpg) |

## Acercamientos y fondos

| Escena | Claro | Oscuro |
| --- | --- | --- |
| Borde y marcador móvil a 2× | [Antes](before/curvas-movil-light.png) · [Después](after/curvas-movil-light.png) | [Antes](before/curvas-movil-dark.png) · [Después](after/curvas-movil-dark.png) |
| Borde y marcador lateral a 2× | [Antes](before/curvas-lateral-light.png) · [Después](after/curvas-lateral-light.png) | [Antes](before/curvas-lateral-dark.png) · [Después](after/curvas-lateral-dark.png) |
| Fondo de tono cercano | [Antes](before/fondo-cercano-light.jpg) · [Después](after/fondo-cercano-light.jpg) | [Antes](before/fondo-cercano-dark.jpg) · [Después](after/fondo-cercano-dark.jpg) |
| Bandas de color y texto | [Antes](before/fondo-complejo-light.jpg) · [Después](after/fondo-complejo-light.jpg) | [Antes](before/fondo-complejo-dark.jpg) · [Después](after/fondo-complejo-dark.jpg) |
| Superficie opaca con filtro desactivado | [Antes](before/sin-backdrop-light.jpg) · [Después](after/sin-backdrop-light.jpg) | [Antes](before/sin-backdrop-dark.jpg) · [Después](after/sin-backdrop-dark.jpg) |

## Video del material

La cámara conserva el marco de 390 × 844 px en Oscuro. Ambos clips recorren la misma sección de Inicio de principio a fin y comprueban que la cápsula conserve su posición. [Referencia](before/material-en-movimiento.webm) · [Candidato](after/material-en-movimiento.webm)

## Mediciones

Chrome comprobó que las catorce vistas del candidato conservan una sola navegación visible, objetivos de al menos 44 × 44 px y los radios de referencia, 28/24 px en la cápsula y 26/14 px en el lateral. Las mediciones de contraste toman el color del rótulo y del icono de sus estilos computados y el mínimo de una cuadrícula de quince muestras del fondo final, incluidos los reflejos y la tinta.

| Vista y tema | Texto antes | Texto después | Icono antes | Icono después |
| --- | ---: | ---: | ---: | ---: |
| Cápsula a 390 px, Claro | 8,77:1 | 8,26:1 | 8,60:1 | 8,16:1 |
| Cápsula a 390 px, Oscuro | 5,76:1 | 5,82:1 | 5,54:1 | 5,45:1 |
| Lateral a 1440 px, Claro | 8,63:1 | 8,08:1 | 8,47:1 | 8,04:1 |
| Lateral a 1440 px, Oscuro | 5,46:1 | 5,42:1 | 5,28:1 | 5,25:1 |

El contraste mínimo en las catorce vistas del candidato fue de 5,42:1 en texto y 5,25:1 en iconos. Los fondos blanco, negro, cercano y complejo y las preferencias de material dieron mínimos de 5,82:1 y 5,45:1, respectivamente. Una muestra del fondo del rótulo a 390 px en Oscuro pasó de `#7e5739` a `#a04200` y el borde computado usa `#ff9a53`.

La cobertura del filtro se mantuvo en 6,29 % del marco de 390 × 844 px y 16,49 % del de 1440 × 900 px. Ambos videos recorren 405 px. La mediana entre muestras del navegador fue de 16,7 ms en ambos clips, con 152 muestras en la referencia y 147 en el candidato. Son mediciones de una grabación por versión en Chrome de escritorio. [Mediciones de Chrome de referencia](before/mediciones.json) · [Mediciones de Chrome del candidato](after/mediciones.json)

WebKit 26.0 aprobó las catorce vistas en cada versión. Los mínimos de texto e iconos pasaron de 5,46:1 y 5,28:1 a 5,42:1 y 5,21:1. Ambas versiones emiten una vez por tema el mismo aviso de `ResizeObserver` al cambiar de ancho. La matriz registra ese aviso heredado y falla ante otros errores de página. [Mediciones de WebKit de referencia](before/mediciones-webkit.json) · [Mediciones de WebKit del candidato](after/mediciones-webkit.json)

## Reproducción

Con las dependencias locales instaladas, iniciar las dos fixtures en terminales distintas. La primera queda fijada al commit de referencia.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-iteration-2 --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-iteration-2 --port=5194
```

Ejecutar la matriz en serie. El runner admite la variable `PLAYWRIGHT_MODULE` para ubicar Playwright y `PLAYWRIGHT_BROWSERS_PATH` para el directorio de WebKit y FFmpeg.

```sh
node scripts/fitness-global/liquid-glass-visual.mjs --glass-iteration-2 --before
node scripts/fitness-global/liquid-glass-visual.mjs --glass-iteration-2
node scripts/fitness-global/liquid-glass-visual.mjs --glass-iteration-2 --webkit --before
node scripts/fitness-global/liquid-glass-visual.mjs --glass-iteration-2 --webkit
```

La matriz de Chrome simula contraste alto, transparencia reducida, áreas seguras y texto al 200 %. WebKit mide tamaño y contraste en escritorio con el mismo conjunto de vistas redimensionadas. Safari en iPhone físico queda para la comprobación de las barras dinámicas, el teclado y el rendimiento gráfico del dispositivo.
