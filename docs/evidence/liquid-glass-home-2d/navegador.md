# Comparación de detalles y confirmaciones

La referencia exacta es `965334e8f008b23e5a3af8fb6af6f3da07a5b733`, candidato validado de 2C. Ambos lados usan los mismos registros sintéticos del 13 de noviembre de 2026. La comida con foto y el ejercicio tienen títulos largos, notas de varias líneas y una palabra sin espacios para forzar el ajuste de texto. La foto proviene de un PNG local servido por el doble sintético de Storage.

## Capturas

- Inicio en Oscuro, 375 px. [Antes](before/375-dark-inicio.jpg) · [Después](after/375-dark-inicio.jpg)
- Detalle de una comida sin foto, 375 px en Oscuro. [Antes](before/375-dark-detalle-comida.jpg) · [Después](after/375-dark-detalle-comida.jpg)
- Detalle de comida con foto, 375 px en Oscuro. El registro de referencia ya tenía una foto y el detalle no la mostraba. [Antes](before/375-dark-detalle-foto.jpg) · [Después](after/375-dark-detalle-foto.jpg)
- Detalle de ejercicio con distancia, ritmo y notas, 1440 px en Claro. [Antes](before/1440-light-detalle-ejercicio.jpg) · [Después](after/1440-light-detalle-ejercicio.jpg)
- Confirmación de eliminación, foco seguro en Cancelar, 375 px en Oscuro. [Antes](before/375-dark-eliminar.jpg) · [Después](after/375-dark-eliminar.jpg)
- Eliminación en curso, fallo y aviso de finalización. [En curso antes](before/375-dark-eliminando.jpg) · [En curso después](after/375-dark-eliminando.jpg) · [Error antes](before/375-dark-error-eliminar.jpg) · [Error después](after/375-dark-error-eliminar.jpg) · [Aviso antes](before/375-dark-eliminado.jpg) · [Aviso después](after/375-dark-eliminado.jpg)
- Confirmación de descarte, foco seguro en Seguir editando, 375 px en Oscuro. [Antes](before/375-dark-descarte-foco.jpg) · [Después](after/375-dark-descarte-foco.jpg)
- Formulario de peso, 1440 px en Claro. [Antes](before/1440-light-peso.jpg) · [Después](after/1440-light-peso.jpg)
- Peso y teclado numérico simulado, 375 px en Oscuro. [Teclado antes](before/375-dark-peso-teclado-simulado.jpg) · [Teclado después](after/375-dark-peso-teclado-simulado.jpg) · [Error antes](before/375-dark-error-peso.jpg) · [Error después](after/375-dark-error-peso.jpg) · [Guardando antes](before/375-dark-peso-guardando.jpg) · [Guardando después](after/375-dark-peso-guardando.jpg)
- Peso vigente y fecha después de guardar, 375 px en Oscuro. [Antes](before/375-dark-peso-en-perfil.jpg) · [Después](after/375-dark-peso-en-perfil.jpg)
- Recibo de comida, 375 px en Oscuro. [Antes](before/375-dark-recibo-meal.jpg) · [Después](after/375-dark-recibo-meal.jpg)
- Recibo de ejercicio, 1440 px en Claro. [Antes](before/1440-light-recibo-workout.jpg) · [Después](after/1440-light-recibo-workout.jpg)
- Error de comida y ejercicio. [Comida antes](before/375-dark-error-comida.jpg) · [Comida después](after/375-dark-error-comida.jpg) · [Ejercicio antes](before/1440-light-error-ejercicio.jpg) · [Ejercicio después](after/1440-light-error-ejercicio.jpg)
- Texto al 200 % a 320 px, Oscuro. [Detalle antes](before/320-dark-detalle-foto-texto-200.jpg) · [Detalle después](after/320-dark-detalle-foto-texto-200.jpg) · [Eliminar antes](before/320-dark-eliminar-texto-200.jpg) · [Eliminar después](after/320-dark-eliminar-texto-200.jpg) · [Peso antes](before/320-dark-peso-texto-200.jpg) · [Peso después](after/320-dark-peso-texto-200.jpg)

## Qué se comprueba

- **Geometría.** Detalles con y sin foto, ejercicio, confirmaciones y peso en 320, 375, 390, 440, 768, 1280 y 1440 px, Claro y Oscuro, con fuente raíz normal y al 200 %. Se miden ajuste horizontal, área táctil, cierre circular, lectura de campos y movimiento reducido. Se comprueba el rojo de la acción destructiva y el foco inicial seguro.
- **Contraste.** Los recorridos completos muestran texto y pictogramas medidos sobre el fondo renderizado a 375 px en Oscuro y 1440 px en Claro. Los umbrales se aplican sin redondear el valor medido. Los controles deshabilitados se informan aparte. [Contraste mínimo del W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Contraste no textual del W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- **Eliminación.** Cancelar o pulsar Escape devuelve el foco a Eliminar sin escribir. La confirmación muestra el registro elegido. Tras un error sintético, la comida permanece. Durante el reintento los controles se deshabilitan, un segundo intento no se ejecuta y el aviso aparece solo tras confirmación. El foco vuelve a Registros del día.
- **Descarte y edición.** El foco inicial queda en Seguir editando. Esa acción conserva el texto, la selección del cursor y el scroll. Descartar cierra sin escribir. Editar comida y ejercicio conserva 2C y el recibo aparece solo después de confirmar. Ver registro devuelve el foco a su fila.
- **Peso.** Se comprueban Registrar peso y Editar peso, fecha, entrada decimal, error, reintento y bloqueo de envíos repetidos. Al guardar 74,6 kg en el día actual, Perfil muestra esa medición y su fecha. El peso base y el balance del día anterior se mantienen. El teclado sintético reproduce el área visible reducida y una rotación de 375 × 812 a 667 × 375. Conserva el cursor y deja accionables los controles.
- **Alcance.** Se contrastan huellas de Inicio, navegación, calendario y formularios de 2C, además de Perfil y su confirmación de descarte compartida. Los recibos móviles se evalúan por encima de la cápsula, con el alto y el margen que calcula el navegador local.

## Resultados

Chrome 158 y WebKit 26 completaron cada uno 168 comprobaciones de ventana por versión y dos recorridos completos. La matriz candidata registró 0 px de desbordamiento horizontal, blancos mínimos de 44 px y ninguna animación con movimiento reducido. La referencia a 320 px y 200 % desbordaba 1.082 px en Chrome y 1.148 px en WebKit con la palabra larga del escenario de estrés. A ese tamaño y con nombre largo, la confirmación enfoca Cancelar y desplaza verticalmente el título fuera del primer encuadre, igual que en la referencia.

El contraste mínimo de texto activo fue 5,97:1 y el de iconos activos 6,11:1, en 271 muestras de Chrome y 255 de WebKit, sin incumplimientos. El mínimo de controles inactivos fue de 5,81:1. La captura de Inicio a 375 px en Oscuro tuvo el mismo SHA-256 que la referencia.

El aviso de error de un ejercicio podía cubrir Ver registro durante un reintento inmediato. Los recorridos finales verificaron que ambos botones del recibo reciben clic mientras ese aviso sigue visible, tanto en móvil como en escritorio. Al abrir el calendario, el recibo vuelve a su capa habitual y el cierre del calendario recibe el clic. El margen móvil del recibo queda a 10 px de la cápsula. La corrección final de capas se revalidó con ambos motores en los recorridos específicos, donde aparecen juntos el error y el recibo.

### Mediciones por motor

- Chrome. [Matriz de referencia](before/chromium-smoke.json) · [Matriz candidata](after/chromium-smoke.json) · [Recorridos de referencia](before/chromium-recorridos.json) · [Recorridos candidatos](after/chromium-recorridos.json)
- WebKit. [Matriz de referencia](before/webkit-smoke.json) · [Matriz candidata](after/webkit-smoke.json) · [Recorridos de referencia](before/webkit-recorridos.json) · [Recorridos candidatos](after/webkit-recorridos.json)

## Repetir las pruebas

Con las dependencias QA instaladas, serví la referencia exportada desde Git en 5193 y el candidato en 5194, un servidor por vez.

```text
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5194
```

Desde la rama candidata, ejecutá `node scripts/fitness-global/liquid-glass-home-2d.mjs --before` para la referencia y el mismo comando sin `--before` para el candidato. Añadí `--webkit` para WebKit y configurá `PLAYWRIGHT_BROWSERS_PATH` si sus binarios están fuera de la ubicación habitual. `--section=smoke` limita la ejecución a la matriz y `--section=recorridos` a los recorridos funcionales.

## Límites

Las escrituras, los errores y las fotos usan una fixture local. El ensayo del teclado es geométrico y su captura identifica la obstrucción simulada. Safari en iPhone físico sigue pendiente para comprobar el teclado y la barra de accesorios nativos, las áreas seguras reales, la rotación y las transiciones táctiles.
