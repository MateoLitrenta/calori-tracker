# Comparativa de la cápsula inferior

La referencia es `27f20caffeb976e57c4beffaa79a606d0c993184`. Las capturas usan las mismas pantallas y datos sintéticos con el viewport vertical de 390 × 844 px.

## Capturas

| Sección | Claro | Oscuro |
| --- | --- | --- |
| Inicio | [Antes](before/inicio-390-light.png) · [Después](after/inicio-390-light.png) | [Antes](before/inicio-390-dark.png) · [Después](after/inicio-390-dark.png) |
| Coach | [Antes](before/coach-390-light.png) · [Después](after/coach-390-light.png) | [Antes](before/coach-390-dark.png) · [Después](after/coach-390-dark.png) |
| Datos | [Antes](before/datos-390-light.png) · [Después](after/datos-390-light.png) | [Antes](before/datos-390-dark.png) · [Después](after/datos-390-dark.png) |
| Perfil | [Antes](before/perfil-390-light.png) · [Después](after/perfil-390-light.png) | [Antes](before/perfil-390-dark.png) · [Después](after/perfil-390-dark.png) |
| Inicio con área segura inferior de 34 px emulada | [Antes](before/inicio-390-light-safe-34.png) · [Después](after/inicio-390-light-safe-34.png) | |

Las capturas muestran el viewport de la página. La distancia empleada en las mediciones va desde el borde visual de la cápsula hasta el borde inferior de ese viewport.

## Medidas efectivas

| Viewport sin área segura simulada | Antes | Después | Elevación |
| --- | ---: | ---: | ---: |
| 320 × 568 | 6 px | 18 px | 12 px |
| 375 × 812 | 6 px | 22 px | 16 px |
| 390 × 844 | 6 px | 22 px | 16 px |
| 440 × 956 | 6 px | 22 px | 16 px |
| 667 × 375, horizontal | 6 px | 18 px | 12 px |
| 390 × 736, viewport acortado | 6 px | 20,72 px | 14,72 px |

A 390 × 844 con 34 px de área segura inferior, la separación pasa de 40 a 56 px. Con 21 px, pasa de 27 a 43 px. Chrome emuló los insets con CDP y conservó los márgenes laterales de 30 y 24 px. WebKit comprobó por separado el cálculo con un valor CSS simulado de la contribución segura inferior. En la referencia, ese valor se inyectó en la fórmula de la cápsula. La emulación CDP en Chrome también verificó las reservas que toman el inset de `env()`. El cambio de tamaño, la orientación y los insets de la prueba describen la página. La distancia física al indicador y a las barras de Safari requiere el [recorrido en iPhone](README.md#revisión-en-iphone-con-safari).

## Validación visual

Chrome y WebKit verificaron 64 casos por versión en cada motor. La matriz combina cuatro anchos verticales, dos temas, cuatro pantallas y escalas de texto de 100 % y 200 %. Se añadieron 16 combinaciones de área segura y 12 comprobaciones de cambio de viewport por motor. La cápsula mantuvo alto, ancho, radio, material, área táctil y alineación de la selección. El indicador conservó el mismo material, con duración de transición cero en movimiento reducido. Los objetivos midieron al menos 73 × 48 px en la matriz sin insets simulados. Se comprobó la geometría y el estilo del lateral a 1024 × 768 en ambos temas.

En el candidato, el final de Inicio y Perfil dejó accesible su último control. El final del último panel de Datos quedó visible y el compositor de Coach conservó su separación respecto de la cápsula. Las pantallas probadas no presentaron overflow horizontal. [Resultados Chrome antes](before/mediciones-chromium.json) · [Chrome después](after/mediciones-chromium.json) · [WebKit antes](before/mediciones-webkit.json) · [WebKit después](after/mediciones-webkit.json)

## Reproducción

Con las dependencias del proyecto y Playwright instaladas, iniciá una fixture en cada terminal.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-nav-lift --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-nav-lift --port=5194
```

Ejecutá las comparaciones en orden. `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_BROWSERS_PATH` admiten las ubicaciones de las herramientas locales.

```sh
node scripts/fitness-global/liquid-glass-nav-lift-visual.mjs --before
node scripts/fitness-global/liquid-glass-nav-lift-visual.mjs
node scripts/fitness-global/liquid-glass-nav-lift-visual.mjs --before --webkit
node scripts/fitness-global/liquid-glass-nav-lift-visual.mjs --webkit
```
