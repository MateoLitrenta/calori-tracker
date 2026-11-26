# Liquid Glass · Iteración final de materialidad

Las capturas muestran Inicio con el mismo perfil y registros sintéticos, la misma posición de desplazamiento y los mismos tamaños. La referencia es el commit `3a61032d73b1bb674efb4f958bb909d4c246732f` del PR #103.

## Comparativas

| Vista | Referencia | Candidato | Detalle del material |
| --- | --- | --- | --- |
| Móvil 390 × 844, Claro | [Antes](before/inicio-390-light.jpg) | [Después](after/inicio-390-light.jpg) | [Recorte antes](before/curvas-movil-light.png) · [Recorte después](after/curvas-movil-light.png) |
| Móvil 390 × 844, Oscuro | [Antes](before/inicio-390-dark.jpg) | [Después](after/inicio-390-dark.jpg) | [Recorte antes](before/curvas-movil-dark.png) · [Recorte después](after/curvas-movil-dark.png) |
| Escritorio 1440 × 900, Claro | [Antes](before/inicio-1440-light.jpg) | [Después](after/inicio-1440-light.jpg) | [Recorte antes](before/curvas-lateral-light.png) · [Recorte después](after/curvas-lateral-light.png) |
| Escritorio 1440 × 900, Oscuro | [Antes](before/inicio-1440-dark.jpg) | [Después](after/inicio-1440-dark.jpg) | [Recorte antes](before/curvas-lateral-dark.png) · [Recorte después](after/curvas-lateral-dark.png) |

En móvil, el borde y la cuadrícula de Hábitos se alinean con la cápsula al desplazar Inicio. Sus contornos difuminados se distinguen mejor bajo el vidrio en el candidato. La reserva al final del scroll mantiene disponible el último control. En escritorio, el lateral toma el fondo continuo de la aplicación y el contenido principal se dibuja en la columna vecina. Por eso el cambio sobre Inicio es más sutil.

Las bandas sintéticas permiten comparar cuánto se filtra un fondo de color por el mismo material en cada versión. Se agregan exclusivamente en la prueba. [Móvil Claro antes](before/fondo-complejo-light.jpg) · [Móvil Claro después](after/fondo-complejo-light.jpg) · [Móvil Oscuro antes](before/fondo-complejo-dark.jpg) · [Móvil Oscuro después](after/fondo-complejo-dark.jpg) · [Lateral Claro antes](before/lateral-fondo-prueba-light.png) · [Lateral Claro después](after/lateral-fondo-prueba-light.png) · [Lateral Oscuro antes](before/lateral-fondo-prueba-dark.png) · [Lateral Oscuro después](after/lateral-fondo-prueba-dark.png)

## Material y transmisión medida

Se redujo la proporción de color base. Pasó de 84 % a 72 % en Claro y 78 % en Oscuro para la cápsula, y de 90 % a 83 % y 85 % respectivamente para el lateral. El filtro bajó de 14 px a 10 px en móvil y 12 px en escritorio. El reflejo superior es más fino y la sombra exterior más suave. Los radios exteriores e interiores conservan 28/24 px y 26/14 px respectivamente y el acento usa el color base `#ff9a53`. La geometría existente ya permite que el contenido pase detrás de la cápsula móvil.

La tabla mide el cambio de intensidad de cada canal RGB de 0 a 255 al alternar un fondo negro y blanco. La muestra es un parche interior de 5 × 5 px, alejado de texto y borde. Un valor mayor indica que el color del fondo tiene más influencia en el material.

| Superficie y tema | Δ intensidad antes | Δ intensidad después |
| --- | ---: | ---: |
| Cápsula, Claro | 41 | 71 |
| Cápsula, Oscuro | 41 | 56 |
| Lateral, Claro | 25 | 43 |
| Lateral, Oscuro | 25 | 38 |

## Legibilidad y acceso

Chrome 158 y WebKit 26 comprobaron los tamaños 320, 375, 390, 767, 768, 1280 y 1440 px en Claro y Oscuro. La comparación de las cajas medidas confirmó la misma geometría, reserva y selección en ambas versiones. En la matriz de Inicio, los mínimos del candidato fueron 5,38:1 en texto y 5,25:1 en iconos. Al añadir fondos sintéticos negros, blancos y complejos, los mínimos fueron 4,62:1 en texto y 4,78:1 en iconos. El muestreo incluye Tema Visual, correo y Cerrar Sesión del lateral. El texto conserva el umbral de 4,5:1 y los iconos el de 3:1 en las escenas medidas. [Chrome referencia](before/mediciones.json) · [Chrome candidato](after/mediciones.json)

Chrome verificó las preferencias de más contraste y transparencia reducida. En ambos casos y en la simulación de falta de soporte para `backdrop-filter`, el material queda opaco. También se probaron tema Sistema dinámico, texto al 200 % con foco visible por Tab, activación con Enter, movimiento reducido y áreas seguras de 34 px inferiores y 24/18 px laterales.

En WebKit, los mínimos fueron 5,42:1 en texto y 5,21:1 en iconos sobre Inicio, y 4,62:1 y 4,78:1 en el lateral con fondos sintéticos extremos. Registró el aviso de `ResizeObserver` ya presente en la referencia, una vez por tema al redimensionar en ambas versiones. [WebKit referencia](before/mediciones-webkit.json) · [WebKit candidato](after/mediciones-webkit.json)

## Reproducción

Ejecutar las fixtures en terminales separadas con las dependencias del proyecto instaladas. Las pruebas usan servicios sintéticos y bloquean conexiones externas.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-final --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-final --port=5194
```

Ejecutar las comparativas en serie. `PLAYWRIGHT_MODULE` permite indicar dónde está instalado Playwright y `PLAYWRIGHT_BROWSERS_PATH` dónde están sus binarios.

```sh
node scripts/fitness-global/liquid-glass-visual.mjs --glass-final --before
node scripts/fitness-global/liquid-glass-visual.mjs --glass-final
node scripts/fitness-global/liquid-glass-visual.mjs --glass-final --webkit --before
node scripts/fitness-global/liquid-glass-visual.mjs --glass-final --webkit
```

Safari en iPhone físico queda para revisar áreas seguras, barras dinámicas, teclado y arrastre bajo el dedo.
