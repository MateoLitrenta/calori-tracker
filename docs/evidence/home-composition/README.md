# Inicio · resumen, registros y hábitos

La [revisión de Hábitos](habitos/README.md) compara la banda compacta y la confirmación de tres segundos con el candidato que revisó Mateo.

Las capturas y medidas de esta página corresponden a la primera iteración del PR #90, `8bb158d4`, comparada con el merge del PR #89, `7621f70aaec4233aebd8deb16979b5f0da9d8f64`. La cuenta, las comidas, los entrenamientos, la foto y el día del 13 de noviembre de 2026 son sintéticos. Las vistas de Historial abren el 9 de noviembre.

## Decisiones de composición

- En móvil, la lectura continúa desde el resumen y los dos botones de alta hacia el registro que acaba de entrar. Le siguen Hábitos e Historial. La lista muestra hasta cuatro filas completas y el contador indica cuántas hay en el día. Expandirla es una elección que se conserva al actualizar hábitos.
- En escritorio, las acciones y Hábitos comparten la columna izquierda. Registros dispone de la derecha para nombres largos, hora, tipo y kcal. El diario pasa de una a dos columnas a 1280 px. Al redimensionar sin recargar, a 1279 px se midió una columna útil de 965 px. A 1280 px se midieron 402 y 532 px de columna, con 32 px entre ambas. El reparto es 43 % y 57 % del ancho restante tras una separación de 32 px. Cuando el día está vacío, el mensaje ocupa su altura natural y deja aire debajo.
- El balance ocupa el primer nivel de lectura. Consumo y gasto usan columnas alineadas y barras a escala común. Un día con actividad y sin comidas muestra el gasto estimado. El desglose explica la cobertura del dato. Una comida registrada puede dar un balance real de cero.
- En cada hábito la etiqueta identifica la cifra y la unidad. Los controles indican el incremento o decremento. Se redistribuyen debajo del valor cuando el texto ampliado lo requiere.

## Comparativas

Las imágenes abarcan todo Inicio. El recorrido captura el contenedor con su desplazamiento real y une las franjas del contenido. Mantiene el viewport y presenta la navegación una sola vez. En móvil el Historial se ve en su estado habitual contraído, salvo en el recorrido que lo abre.

| Escenario | 375 px | 1440 px |
| --- | --- | --- |
| Seis registros · claro | [Antes](before/375-light-larga.jpg) · [Después](after/375-light-larga.jpg) | [Antes](before/1440-light-larga.jpg) · [Después](after/1440-light-larga.jpg) |
| Seis registros · oscuro | [Antes](before/375-dark-larga.jpg) · [Después](after/375-dark-larga.jpg) | [Antes](before/1440-dark-larga.jpg) · [Después](after/1440-dark-larga.jpg) |
| Vacío · claro | [Antes](before/375-light-vacío.jpg) · [Después](after/375-light-vacío.jpg) | [Antes](before/1440-light-vacío.jpg) · [Después](after/1440-light-vacío.jpg) |
| Vacío · oscuro | [Antes](before/375-dark-vacío.jpg) · [Después](after/375-dark-vacío.jpg) | [Antes](before/1440-dark-vacío.jpg) · [Después](after/1440-dark-vacío.jpg) |
| Una comida, balance cero | [Antes](before/375-light-una.jpg) · [Después](after/375-light-una.jpg) | [Antes](before/1440-light-una.jpg) · [Después](after/1440-light-una.jpg) |
| Cuatro entradas | [Antes](before/375-light-cuatro.jpg) · [Después](after/375-light-cuatro.jpg) | [Antes](before/1440-light-cuatro.jpg) · [Después](after/1440-light-cuatro.jpg) |
| Actividad sin comidas | [Antes](before/375-light-actividad.jpg) · [Después](after/375-light-actividad.jpg) | [Antes](before/1440-light-actividad.jpg) · [Después](after/1440-light-actividad.jpg) |
| Día anterior abierto desde Historial | [Antes](before/375-light-historial.jpg) · [Después](after/375-light-historial.jpg) | [Antes](before/1440-light-historial.jpg) · [Después](after/1440-light-historial.jpg) |
| Carga | [Antes](before/375-light-carga.jpg) · [Después](after/375-light-carga.jpg) | [Antes](before/1440-light-carga.jpg) · [Después](after/1440-light-carga.jpg) |

## Medidas

Altura del resumen y coordenadas verticales en píxeles CSS desde el inicio de la página. Valores de Claro, con la misma posición inicial de desplazamiento.

| Ancho y estado | Resumen, alto | Acciones, y | Primera fila, y | Hábitos, y |
| --- | ---: | ---: | ---: | ---: |
| 375 · larga | 268 → 245 | 452 → 432 | 730 → 545 | 520 → 969 |
| 375 · vacío | 224 → 124 | 407 → 311 | — | 475 → 521 |
| 375 · actividad | 224 → 158 | 407 → 346 | 685 → 459 | 475 → 587 |
| 1440 · larga | 204 → 190 | 413 → 401 | 448 → 441 | 481 → 471 |
| 1440 · vacío | 169 → 122 | 378 → 333 | — | 446 → 403 |
| 1440 · actividad | 169 → 122 | 378 → 333 | 413 → 372 | 446 → 403 |

En la lista larga de móvil, Hábitos queda debajo de las cuatro filas y del control de expansión. Así se encuentra primero el registro que se acaba de cargar. Los nombres largos pueden ocupar varias líneas y la lista se desplaza con el resto de la página.

## Validación

| Recorrido | Resultado observado |
| --- | --- |
| Composición y estados | 72 combinaciones por versión. Día vacío, una comida con balance cero, cuatro registros, seis con nombres largos y foto, ejercicio sin comidas y día anterior abierto desde Historial. Se comprobaron 320, 375, 768, 1024, 1440 y 1920 px en Claro y Oscuro. [Base](before/mediciones.json) · [Candidato](after/mediciones.json) |
| Lectura y accesibilidad | Se recorrieron los controles con Tab y se midieron el foco visible, el contraste de texto y las áreas táctiles. El ensayo de texto al 200 % duplicó en el DOM el tamaño computado de las fuentes con el viewport fijo. Se midieron recortes, desborde y colisiones. Entre los pares de texto y fondo muestreados, el contraste mínimo fue 5,66:1 en Claro y 7,24:1 en Oscuro. [320 px](after/320-light-texto-200.jpg) · [1440 px](after/1440-light-texto-200.jpg) |
| Carga | El encabezado y la navegación se midieron en carga y tras recibir el día. El esqueleto reserva espacio para un día con cuatro filas. La altura final de cada fila depende de su nombre y metadatos. Con cuatro filas, el inicio de Hábitos quedó a un máximo de 18 px de la posición prevista por el cargador. El día vacío y la lista expandida tienen alturas propias. |
| Recibo y hábitos | Se guardó a las 22:30 una comida con el mismo nombre que otra. Guardar mantuvo el desplazamiento. «Ver registro» expandió la lista y enfocó la sexta fila por tipo e ID. Al sumar 250 ml, el agua pasó de 1750 a 2000 ml y la lista siguió expandida. Se verificó también el fallo y reintento de pasos en la fecha editable. [Video](after/recorrido.webm) · [Resultados](after/recorrido.json) |
| Formulario al cambiar de ancho | En la base, cruzar 768 px reemplazaba el campo de descripción aunque se preservara el texto. En el candidato, el mismo editor permanece montado desde 375 a 768, 1440 y de vuelta a 375 px. Conservó el foco, la foto, el texto y un error de guardado al cambiar también el tema del sistema. El reintento doble confirmó una sola escritura. Tras descartar una edición, el foco volvió a la fila. |
| Teclado y navegación previos | WebKit automatizado registró 114 mediciones en recorridos de alta y edición de comidas y ejercicio y en peso, a 320, 375 y 1440 px, en ambos temas. Se usó el recorrido de teclado y obstrucción sintéticos del PR #87. Chrome repitió los recorridos de peso, recibos y encabezados y los 37 recorridos de indicadores, foco y movimiento reducido del PR #89. [Resultados de regresión](after/regresion.json) |

## Repetir los recorridos

Con las dependencias bloqueadas del repo y el Playwright de QA disponible, iniciar en dos terminales los servidores de base y candidato. El servidor de referencia extrae desde Git la versión congelada.

```sh
node scripts/home-mobile/serve-qa.mjs --home-composition --before --port=5193
node scripts/home-mobile/serve-qa.mjs --home-composition --port=5194
```

Ejecutar secuencialmente en otra terminal. Los videos usan el FFmpeg de Playwright. Para seleccionar otra instalación se admiten `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_BROWSERS_PATH`.

```sh
node scripts/fitness-global/home-composition.mjs --before
node scripts/fitness-global/home-composition.mjs
node scripts/fitness-global/home-composition-flow.mjs
```

Los ensayos funcionales se realizaron en navegadores de escritorio con servicios locales simulados. Las pruebas móviles usan viewport y teclado emulados. La comprobación en teléfono físico con teclado nativo queda pendiente. El calendario mensual desplegado conserva la densidad de sus indicadores al 200 %; la medición de contraste y legibilidad se concentró en el resumen, las acciones, los registros y los hábitos. La CI Linux y la verificación remota del SHA de la Preview están enlazadas en el Draft.
