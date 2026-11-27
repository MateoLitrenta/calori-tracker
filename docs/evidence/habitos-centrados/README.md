# Alineación interna de Hábitos

La referencia es el candidato revisado del PR #107, `7abfe67efd9be7367ede39ed5c2ec0bd669d4d00`. La comparación utiliza el 13 de noviembre de 2026 y la misma fixture local en ambas versiones.

## Capturas

- 320 px, Claro. [Antes](before/320-light-normal.jpg) · [Después](after/320-light-normal.jpg)
- 375 px, Claro. [Antes](before/375-light-normal.jpg) · [Después](after/375-light-normal.jpg)
- 390 px, Oscuro. [Antes](before/390-dark-normal.jpg) · [Después](after/390-dark-normal.jpg)
- 1440 px, Claro. [Antes](before/1440-light-normal.jpg) · [Después](after/1440-light-normal.jpg)
- 1440 px, Oscuro. [Antes](before/1440-dark-normal.jpg) · [Después](after/1440-dark-normal.jpg)
- 320 px, cifras largas y texto al 200 %. [Antes](before/320-light-large.jpg) · [Después](after/320-light-large.jpg)
- 375 px, cifras largas y texto al 200 %. [Antes](before/375-light-large.jpg) · [Después](after/375-light-large.jpg)
- 390 px, Oscuro, cifras largas y texto al 200 %. [Antes](before/390-dark-large.jpg) · [Después](after/390-dark-large.jpg)
- 375 px, Registrar peso. [Antes](before/375-light-no-weight.jpg) · [Después](after/375-light-no-weight.jpg)
- 375 px, pasos en edición. [Antes](before/375-light-editando.jpg) · [Después](after/375-light-editando.jpg)
- 375 px, agua guardada. [Antes](before/375-light-guardado.jpg) · [Después](after/375-light-guardado.jpg)

Las capturas encuadran Hábitos. Se oculta temporalmente la cápsula de navegación para que los recortes de tarjetas altas muestren todos los controles. Las mediciones de acceso táctil se ejecutan con la cápsula visible.

## Comprobaciones

- **Alineación.** En tres columnas, cada encabezado con su icono, lectura con unidad y grupo de controles comparte el eje central de su tarjeta. El encabezado interno y la lectura mantienen sus respectivas alturas entre tarjetas. En el modo de filas angostas se centra el conjunto y el contenido conserva el ajuste de línea. A 375 px en Chrome, la desviación máxima del eje central en la vista normal pasó de 26,7 px a menos de 0,1 px.
- **Conservación visual.** Coincidieron el ancho y la alineación horizontal del título Hábitos. También coincidieron los colores, radios, sombras y relleno de las tarjetas y los estilos de los botones. Las mediciones comparan el ancho, alto y contenido del calendario, balance, acciones, registros y navegación con la referencia.
- **Texto y objetivos.** Se probaron 1.234.567 ml, 12.345.678 pasos y 112,4 kg con la fuente raíz al 200 %. Todo el texto quedó dentro de las tarjetas y los controles miden al menos 44 × 44 px, con una tolerancia de redondeo subpíxel. El control de peso con y sin medición quedó alcanzable tras desplazar la pantalla.
- **Teclado y guardado.** A 375 px en Claro y 1440 px en Oscuro, el incremento de agua desde teclado mantuvo el foco visible. El agua llegó a 2.000 ml y el total de pasos se editó a 6.800 con dos confirmaciones sintéticas. El peso conservó 72,8 kg. Enter abre Editar peso y Escape retorna el foco al botón de origen.

Se verificaron 320 y 375 px en Claro, 390 px en Oscuro y 1440 px en ambos temas en cada motor y versión.

Resultados por motor. [Chrome antes](before/chromium.json) · [Chrome después](after/chromium.json) · [WebKit antes](before/webkit.json) · [WebKit después](after/webkit.json).

## Repetir la comparación

Iniciá la misma fixture desde una exportación de la referencia en el puerto 5193 y desde el candidato en el puerto 5194, con las dependencias QA instaladas.

```text
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5194
```

Desde el candidato, ejecutá `node scripts/fitness-global/habitos-centrados.mjs --before` y después `node scripts/fitness-global/habitos-centrados.mjs`. Repetí añadiendo `--webkit` para ese motor. Si los binarios de Playwright están en una ubicación local específica, configurá `PLAYWRIGHT_BROWSERS_PATH`.

## Alcance

La fixture intercepta solicitudes fuera del servidor local. Se registraron cero solicitudes externas y cero llamadas a IA. Los guardados se ejecutan en el almacén sintético. No se probó Safari de iPhone físico.
