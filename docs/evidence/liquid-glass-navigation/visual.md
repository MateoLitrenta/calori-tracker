# Comparativas visuales

El escenario usa Inicio en la misma posición de desplazamiento, con la misma cuenta, el mismo día y los mismos registros sintéticos. Los archivos `before` corresponden a `80c9a150` (PR #102). Las capturas de Coach usan su propio recorrido funcional reproducible.

| Ancho y alto en px CSS | Claro antes | Claro después | Oscuro antes | Oscuro después |
| --- | --- | --- | --- | --- |
| 320 × 568 | [Antes](before/inicio-320-light.jpg) | [Después](after/inicio-320-light.jpg) | [Antes](before/inicio-320-dark.jpg) | [Después](after/inicio-320-dark.jpg) |
| 375 × 812 | [Antes](before/inicio-375-light.jpg) | [Después](after/inicio-375-light.jpg) | [Antes](before/inicio-375-dark.jpg) | [Después](after/inicio-375-dark.jpg) |
| 390 × 844 | [Antes](before/inicio-390-light.jpg) | [Después](after/inicio-390-light.jpg) | [Antes](before/inicio-390-dark.jpg) | [Después](after/inicio-390-dark.jpg) |
| 767 × 844 | [Antes](before/inicio-767-light.jpg) | [Después](after/inicio-767-light.jpg) | [Antes](before/inicio-767-dark.jpg) | [Después](after/inicio-767-dark.jpg) |
| 768 × 844 | [Antes](before/inicio-768-light.jpg) | [Después](after/inicio-768-light.jpg) | [Antes](before/inicio-768-dark.jpg) | [Después](after/inicio-768-dark.jpg) |
| 1280 × 800 | [Antes](before/inicio-1280-light.jpg) | [Después](after/inicio-1280-light.jpg) | [Antes](before/inicio-1280-dark.jpg) | [Después](after/inicio-1280-dark.jpg) |
| 1440 × 900 | [Antes](before/inicio-1440-light.jpg) | [Después](after/inicio-1440-light.jpg) | [Antes](before/inicio-1440-dark.jpg) | [Después](after/inicio-1440-dark.jpg) |

## Material y curvas

- Cápsula móvil a 390 px, con la selección y el borde a escala natural. [Antes Claro](before/curvas-movil-light.png) · [Después Claro](after/curvas-movil-light.png) · [Antes Oscuro](before/curvas-movil-dark.png) · [Después Oscuro](after/curvas-movil-dark.png)
- Barra lateral a 1440 px, con sus controles en la referencia y el borde exterior incluido en el acercamiento del candidato. [Antes Claro](before/curvas-lateral-light.png) · [Después Claro](after/curvas-lateral-light.png) · [Antes Oscuro](before/curvas-lateral-dark.png) · [Después Oscuro](after/curvas-lateral-dark.png)
- Fondos sintéticos con tono cercano a la superficie y bandas de color de alto contraste. [Fondo Claro cercano](after/fondo-cercano-light.jpg) · [Fondo Oscuro cercano](after/fondo-cercano-dark.jpg) · [Complejo Claro](after/fondo-complejo-light.jpg) · [Complejo Oscuro](after/fondo-complejo-dark.jpg)

## Movimiento y accesibilidad

- [Deslizamiento del indicador entre secciones](after/movimiento-indicador.webm)
- [Contenido de Inicio desplazándose detrás de la cápsula](after/contenido-detras-del-vidrio.webm)
- [Texto al 200 % y foco en Claro](after/texto-200-foco-light.jpg) · [Texto al 200 % y foco en Oscuro](after/texto-200-foco-dark.jpg)
- [Material opaco sin mejora de filtro en Claro](after/sin-backdrop-light.jpg) · [Material opaco sin mejora de filtro en Oscuro](after/sin-backdrop-dark.jpg)
- [Mediciones de referencia](before/mediciones.json) · [Mediciones del candidato](after/mediciones.json) · [Recorrido de Coach](funcional.md)

## Resultados medidos

| Vista | Superficie antes | Superficie después | Radios exterior / interior |
| --- | --- | --- | --- |
| Móvil a 390 × 844 | 390 × 64 px al borde inferior | 370 × 56 px, a 10 px de cada lado y 6 px abajo | 28 / 24 px |
| Escritorio a 1440 × 900 | 256 × 900 px al borde izquierdo | 244 × 876 px, a 12 px de los bordes superior, izquierdo e inferior | 26 / 14 px |

Los cuatro controles alcanzaron 44 × 44 px o más en los 14 montajes del candidato. El indicador y el botón activo compartieron centro. En 390 px, al final de Inicio, la última acción quedó a 52,4 px del borde superior de la barra, y su centro seguía listo para recibir la interacción. A 320 px, las etiquetas pasaron de 12 a 24 px y la cápsula de 56 a 64,8 px. Con zonas seguras simuladas de 24 px a la izquierda, 18 a la derecha y 34 abajo, se midieron separaciones de 30, 24 y 40 px. El recorrido por Tab conservó la selección anterior hasta activar Enter.

| Selección en Inicio | Texto Claro | Icono Claro | Texto Oscuro | Icono Oscuro |
| --- | ---: | ---: | ---: | ---: |
| Móvil a 390 px | 8,77:1 | 8,60:1 | 5,76:1 | 5,54:1 |
| Lateral a 1440 px | 8,63:1 | 8,47:1 | 5,46:1 | 5,28:1 |

El menor resultado de las pruebas móviles con fondos y preferencias simuladas fue 5,70:1 en texto y 5,46:1 en iconos. Contraste alto y transparencia reducida usaron fondo opaco en ambos temas. La simulación sin filtro conservó esa superficie y el indicador naranja. El selector Sistema cambió la apariencia en vivo y mantuvo la navegación seleccionada.

En 390 × 844, la cápsula filtró un rectángulo equivalente al 6,29 % de la ventana. En 1440 × 900, el lateral filtró el 16,49 %. El video de Inicio recorrió 405 px de contenido con la cápsula inmóvil. Chrome ejecutó 152 muestras de animación en 2,5 segundos con una mediana de 16,7 ms entre muestras. Estos valores corresponden a una sola ejecución de escritorio con grabación activa.

El runner mide las cajas en píxeles CSS y lee los colores ya compuestos en una cuadrícula detrás de cada icono y etiqueta. Obtiene el color de primer plano de los estilos computados y oculta solo ese color para la captura de medición. Conserva el menor contraste encontrado en cada región. El escenario sin filtro retira mediante CSSOM la mejora declarada en `@supports`. La prueba de fuente modifica el tamaño raíz a 200 %. El contraste alto, la transparencia reducida, el tema de Sistema y las zonas seguras se simulan mediante el protocolo de Chromium.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --port=5194
```

Con ambas instancias disponibles, ejecutar los recorridos sucesivamente. Los videos usan el FFmpeg que instala Playwright. Si el directorio de navegadores es externo al predeterminado, indicar su ruta en `PLAYWRIGHT_BROWSERS_PATH`.

```sh
node scripts/fitness-global/liquid-glass-visual.mjs --before
node scripts/fitness-global/liquid-glass-visual.mjs
```

Chrome de escritorio renderiza estos resultados. Los tamaños de teléfono, zonas seguras y preferencias de accesibilidad se comprueban mediante simulación. Las barras dinámicas de Safari, el indicador de inicio y el rendimiento en un iPhone físico quedan para revisión manual.
