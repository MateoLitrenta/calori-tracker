# Formularios móviles y barras flotantes de Safari

La revisión de Mateo en iPhone corresponde a `b9f030a92f0e60cfd7f761792742f8c3415755ad`. En las cuatro capturas, la barra de dirección o la barra accesoria se dibujan sobre los campos o las acciones. En Actividad se ve una franja de Inicio debajo de la hoja. La grabación aporta el recorrido desde los registros hasta el detalle y la edición con el teclado cerrado. El material personal se revisó localmente. Las imágenes de este directorio son sintéticas.

## Diagnóstico y corrección candidata

El formulario anterior anclaba la botonera al borde inferior informado por `visualViewport`. También aceptaba el cursor en cualquier posición dentro del cuerpo desplazable, incluido su extremo inferior. Una barra dibujada sobre ese espacio podía tapar ambos aunque la hoja pasara la prueba geométrica. Las capturas confirman la superposición en ese build. Falta medir en el teléfono en qué momento Safari mueve o dibuja las barras respecto de sus eventos de viewport. La matriz registra geometría en píxeles CSS. La API distingue el origen visual del origen de layout. [Definición de VisualViewport en CSSOM View](https://drafts.csswg.org/cssom-view/#the-visualviewport-interface).

En móvil, el editor de Comida, Ejercicio y Peso se abre como una superficie opaca. El título y las acciones ocupan la parte superior. El cuerpo tiene desplazamiento propio y recorrido suficiente para subir hasta el último campo. Los cambios de foco, selección y viewport sitúan la línea de escritura en la mitad superior del cuerpo cuando hace falta. Los botones conservan su activación táctil. El formulario mantiene los elementos nativos de entrada y la posición de edición. Inicio conserva su scroll y queda inerte y visualmente oculto detrás del editor. El detalle de solo lectura y el diálogo de escritorio mantienen su disposición.

## Comparación reproducible

Mismas fixtures, misma línea de texto, ancho y tema por pareja. La banda gris marca una obstrucción del ensayo. Recibe los impactos del puntero y ocupa una parte del viewport **que el navegador de prueba sigue declarando visible**.

| Caso de Mateo | Anterior · 375 px, Oscuro | Candidato · 375 px, Oscuro |
| --- | --- | --- |
| Agregar comida, Calorías | [Antes](before/chromium/dark-alta-calorias.jpg) | [Después](after/chromium/dark-alta-calorias.jpg) |
| Editar comida, Descripción desde el detalle | [Antes](before/chromium/dark-edicion-descripcion.jpg) | [Después](after/chromium/dark-edicion-descripcion.jpg) |
| Agregar ejercicio, Actividad | [Antes](before/chromium/dark-ejercicio-actividad.jpg) | [Después](after/chromium/dark-ejercicio-actividad.jpg) |
| Agregar ejercicio, Notas | [Antes](before/chromium/dark-ejercicio-notas.jpg) | [Después](after/chromium/dark-ejercicio-notas.jpg) |

Chrome y WebKit de Playwright en Windows, a 320 × 568, 375 × 812 y 1440 × 900 CSS px, Claro y Oscuro por separado. El ensayo toca las cuatro esquinas interiores de cada botón mediante hit testing y comprueba la zona de escritura del control enfocado. Para un textarea multilínea comprueba la línea de la selección. También recorre Hora, Duración, Peso, el descarte cancelado, la reapertura del teclado simulado y el guardado. Las matrices incluyen scroll de Inicio y del cuerpo, posición del viewport y rectángulos de las superficies.

En los 32 estados móviles por motor, ambas acciones quedaban completamente expuestas en 0/32 estados de la referencia y en 32/32 del candidato. La zona de escritura pasó de 18/32 a 32/32 en Chrome y de 20/32 a 32/32 en WebKit. En escritorio pasaron los 16 estados por motor. Estos conteos son del ensayo sintético.

- Chrome: [referencia](before/chromium/geometria.json) y [candidato](after/chromium/geometria.json).
- WebKit: [referencia](before/webkit/geometria.json) y [candidato](after/webkit/geometria.json).
- El límite de la obstrucción y las transiciones son sintéticos. El clic en «Ver registros» establece el ancla real. También se abre desde la parte superior y tras desplazar Inicio. En móvil se comprueba que el fondo inerte rechaza el foco.
- La CI del PR identifica el commit final y la regresión completa. El build Vercel incluye la versión al pie de **Perfil** únicamente en Preview. El identificador visible son los primeros ocho caracteres del SHA del build.
- Para reproducir: iniciar `node scripts/home-mobile/serve-qa.mjs --safari-forms --before`; ejecutar `node scripts/fitness-global/safari-forms.mjs --reference` en otra terminal y repetir con `--webkit`. Para el candidato, reiniciar el servidor sin `--before` y los navegadores sin `--reference`. Usar el entorno de Playwright y Chrome documentado en el [recorrido de guardado](../README.md).

## Un minuto en Safari de iPhone

1. **0–15 s.** Comprobá el código de versión al pie de **Perfil**. En Inicio, tocá **+ Comida**, escribí dos líneas en Descripción y corregí una palabra del medio. Pasá a **Calorías** con la flecha nativa. Mirá si podés leer y tocar Cancelar y Guardar con la dirección de Safari y el teclado numérico visibles.
2. **15–30 s.** Abrí Hora, guardá una comida de prueba y usá **Ver registro → Detalle → Editar**. Enfocá Descripción. Revisá la línea del cursor y **Guardar cambios**. Tocá Cancelar y, si hay cambios, probá **Seguir editando**.
3. **30–45 s.** Desde Inicio desplazado, abrí **+ Ejercicio → Actividad**. Alterná con Duración o Calorías usando toque y flechas. Buscá cualquier franja visible de Inicio debajo del editor.
4. **45–60 s.** En **Notas**, escribí varias líneas. Desplazá el cuerpo, cerrá y reabrí el teclado. Confirmá que conserva el texto y que el cursor y ambas acciones quedan despejados. Si se reproduce el fallo, indicá el campo, el código de Preview y la versión de iOS.

**Aceptación física pendiente.** El resultado del candidato en Safari de iPhone, sus flechas nativas, el selector horario y las animaciones reales de las barras se verifican con este recorrido.
