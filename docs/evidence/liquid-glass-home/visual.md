# Comparativa visual de Inicio · Liquid Glass 2A

La referencia es `cee76612a4352e82f626fc4eaf2951998f792e9c`, merge del PR #103. Ambas versiones usan la misma cuenta de prueba y los mismos registros sintéticos del 13 de noviembre de 2026. Las capturas se toman con la navegación real visible en cada ancho.

## Capturas antes y después

| Vista | Inicio | Balance | Acciones |
| --- | --- | --- | --- |
| Móvil Claro · 390 × 844 | [Antes](before/inicio-390-light.png) · [Después](after/inicio-390-light.png) | [Antes](before/balance-390-light.png) · [Después](after/balance-390-light.png) | [Antes](before/acciones-390-light.png) · [Después](after/acciones-390-light.png) |
| Móvil Oscuro · 390 × 844 | [Antes](before/inicio-390-dark.png) · [Después](after/inicio-390-dark.png) | [Antes](before/balance-390-dark.png) · [Después](after/balance-390-dark.png) | [Antes](before/acciones-390-dark.png) · [Después](after/acciones-390-dark.png) |
| Escritorio Claro · 1440 × 900 | [Antes](before/inicio-1440-light.png) · [Después](after/inicio-1440-light.png) | [Antes](before/balance-1440-light.png) · [Después](after/balance-1440-light.png) | [Antes](before/acciones-1440-light.png) · [Después](after/acciones-1440-light.png) |
| Escritorio Oscuro · 1440 × 900 | [Antes](before/inicio-1440-dark.png) · [Después](after/inicio-1440-dark.png) | [Antes](before/balance-1440-dark.png) · [Después](after/balance-1440-dark.png) | [Antes](before/acciones-1440-dark.png) · [Después](after/acciones-1440-dark.png) |

El exterior del balance toma el radio de 26 px del lateral. El indicador semanal y los botones toman el radio interior de 14 px, que resulta de restar el encastre de 12 px. La selección de fecha y «Agregar comida» mantienen el relleno `#ff9a53`. El calendario usa un reflejo raso y el cuerpo del balance conserva un fondo sólido para la lectura.

## Matriz de navegador

Chrome 158 y WebKit 26 aprobaron 28 casos del candidato cada uno. Cubren 320, 375, 390, 440, 768, 1280 y 1440 px en Claro y Oscuro, con tamaño de texto de referencia y ampliado al 200 % desde la raíz. El desplazamiento horizontal queda dentro del selector semanal al ampliar el texto. A tamaño de referencia entran los siete días en los anchos móviles y la fecha sintética aparece en una sola línea a 390 px.

Los controles de fecha, desglose y altas midieron al menos 44 × 44 px. Las dos acciones se pueden llevar por encima de la cápsula y responden al impacto del puntero en su centro. La matriz comprobó que el documento y el área principal se mantienen dentro del ancho y que las transiciones de las acciones quedan a cero con movimiento reducido.

Por motor se compararon los 28 pares de estados. Las cajas y los estilos medidos de la navegación principal, la fecha seleccionada y el valor del balance coincidieron con los de la referencia en todos los pares.

El mínimo medido en ambos motores fue **5,97:1** en texto e iconos activos y **6,99:1** en el contorno de foco. Se tomaron colores computados y muestras del fondo real de las etiquetas e iconos con texto al 100 %. El foco se verificó a 390 px en ambos tamaños de texto. La ampliación CSS y WebKit de escritorio comprueban la distribución, el foco y el contraste de la fixture. Falta la revisión de Safari en iPhone físico.

[Texto 200 % en Claro a 320 px](after/texto-320-light.png) · [Texto 200 % en Oscuro a 320 px](after/texto-320-dark.png)

[Mediciones Chrome antes](before/mediciones.json) · [Mediciones Chrome después](after/mediciones.json) · [Mediciones WebKit antes](before/mediciones-webkit.json) · [Mediciones WebKit después](after/mediciones-webkit.json)

## Foco con texto ampliado

Una prueba intermedia con Tab en Chrome a 390 px y 200 % situó «Ver desglose» entre y=734 y y=844, mientras la cápsula empezaba en y=773. La prueba de impacto del puntero en el centro encontró la cápsula. En la referencia, el mismo control quedaba entre y=608 y y=718. La reserva de desplazamiento se aplica al resumen y a las dos acciones de Inicio en móvil. Usa la altura y la separación de la cápsula, el área segura y 4 px para el contorno. La caja y su contorno quedan al menos 5,94 px por encima de la cápsula para «Ver desglose» y 1,94 px para las acciones en los recorridos finales a 390 px.

La referencia ya mostraba solapamiento del foco de los botones de alta con la cápsula a 390 px y 200 %. En ambos motores, el centro de «Agregar ejercicio» quedaba bajo la barra. El foco del día seleccionado en Oscuro también partía de un contraste de 1,34:1 sobre el naranja. La reserva local y el contorno de color oscuro sobre el día activo resuelven esos dos casos en el candidato.

## Reproducción

Abrir cada fixture en una terminal con las dependencias del proyecto instaladas.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home --port=5194
```

Ejecutar en serie con Playwright instalado. El script admite `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_BROWSERS_PATH` para indicar su módulo y el directorio de navegadores.

```sh
node scripts/fitness-global/liquid-glass-home-visual.mjs --before
node scripts/fitness-global/liquid-glass-home-visual.mjs
node scripts/fitness-global/liquid-glass-home-visual.mjs --webkit --before
node scripts/fitness-global/liquid-glass-home-visual.mjs --webkit
```
