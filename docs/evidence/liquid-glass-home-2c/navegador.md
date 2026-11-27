# Comparación de formularios y calendario

Referencia exacta `5ff742305c9bb8b0fbc2ea5639aeea2dc0143370`. Ambas versiones se sirvieron con la misma fixture del 13 de noviembre de 2026. Los recorridos seleccionan el 12 de noviembre para verificar la fecha del registro.

## Capturas comparativas

- Inicio y navegación, 375 px en Oscuro. [Antes](before/375-dark-inicio.jpg) · [Después](after/375-dark-inicio.jpg)
- Agregar comida, 375 px en Oscuro. [Antes](before/375-dark-comida.jpg) · [Después](after/375-dark-comida.jpg)
- Agregar ejercicio, 375 px en Oscuro. [Antes](before/375-dark-ejercicio.jpg) · [Después](after/375-dark-ejercicio.jpg)
- Calendario mensual, 375 px en Oscuro. [Antes](before/375-dark-calendario-historico.jpg) · [Después](after/375-dark-calendario-historico.jpg)
- Editar comida con foco, 375 px en Oscuro. [Antes](before/375-dark-edicion-meal.jpg) · [Después](after/375-dark-edicion-meal.jpg)
- Editar ejercicio con foco, 1440 px en Claro. [Antes](before/1440-light-edicion-workout.jpg) · [Después](after/1440-light-edicion-workout.jpg)
- Formularios y calendario en escritorio, 1440 px en Claro. [Comida antes](before/1440-light-comida.jpg) · [Comida después](after/1440-light-comida.jpg) · [Ejercicio antes](before/1440-light-ejercicio.jpg) · [Ejercicio después](after/1440-light-ejercicio.jpg) · [Calendario antes](before/1440-light-calendario.jpg) · [Calendario después](after/1440-light-calendario.jpg)
- Selector de deporte y foco, 375 px en Oscuro. [Antes](before/375-dark-deporte-seleccionado.jpg) · [Después](after/375-dark-deporte-seleccionado.jpg)
- Estimación de imagen, 375 px en Oscuro. [Carga antes](before/375-dark-estimando.jpg) · [Carga después](after/375-dark-estimando.jpg) · [Resultado antes](before/375-dark-estimacion-foto.jpg) · [Resultado después](after/375-dark-estimacion-foto.jpg)
- Estimación fallida, 1440 px en Claro. [Antes](before/1440-light-error-ia.jpg) · [Después](after/1440-light-error-ia.jpg)
- Guardado, 375 px en Oscuro. [Fallo antes](before/375-dark-error-guardado.jpg) · [Fallo después](after/375-dark-error-guardado.jpg) · [En curso antes](before/375-dark-guardando.jpg) · [En curso después](after/375-dark-guardando.jpg) · [Confirmación antes](before/375-dark-guardado.jpg) · [Confirmación después](after/375-dark-guardado.jpg)
- Teclado y obstrucción simulados, 375 px en Oscuro. [Antes](before/375-dark-teclado-simulado.jpg) · [Después](after/375-dark-teclado-simulado.jpg)
- Texto al 200 %, 375 px en Oscuro. [Agregar comida antes](before/375-dark-comida-texto-200.jpg) · [Agregar comida después](after/375-dark-comida-texto-200.jpg) · [Editar ejercicio antes](before/375-dark-editar-ejercicio-texto-200.jpg) · [Editar ejercicio después](after/375-dark-editar-ejercicio-texto-200.jpg) · [Calendario antes](before/375-dark-calendario-texto-200.jpg) · [Calendario después](after/375-dark-calendario-texto-200.jpg)

## Qué se comprueba

- **Ventanas y temas.** Altas, ediciones y calendario en 320, 375, 390, 440, 768, 1280 y 1440 px, en Claro y Oscuro, con fuente raíz normal y al 200 %. Se miden desbordamiento horizontal, blancos táctiles, fuente de los campos, animación reducida, material del encabezado, naranja y foco de retorno.
- **Contraste.** Los recorridos completos muestrean texto y pictogramas visibles en 375 px en Oscuro y 1440 px en Claro. Se mide el fondo renderizado sin glifos y se aplica el umbral de 4,5:1 para texto normal y 3:1 para iconos o texto grande. El informe muestra los valores de controles deshabilitados por separado, ya que los controles inactivos están exentos del umbral AA. [Contraste mínimo del W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [Contraste no textual del W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- **Fechas y teclado.** El calendario conserva las columnas de lunes a domingo y el bloqueo de fechas futuras. Flechas y RePág exploran, Enter selecciona y Escape restaura el foco. Se verifican la fecha histórica en los cuatro formularios, los selectores nativos y la acción Ahora.
- **Viewport.** Un `visualViewport` sintético reproduce alturas reducidas, desplazamiento vertical y una rotación de 375 × 812 a 667 × 375. Se verifica el cursor al editar texto y los puntos de contacto del campo y de las acciones. Con el teclado numérico simulado, Guardar responde a un toque y conserva el borrador ante el fallo.
- **Foto, cámara y estimación.** El selector de archivos recibe un PNG local, crea una vista previa y envía un adjunto sintético al transporte aislado. La cámara se verifica con permiso rechazado simulado. Se ejercitan la carga, el resultado, el error de estimación y la entrada manual.
- **Guardar y cancelar.** La escritura se bloquea temporalmente para observar Guardando… y comprobar que un segundo envío no duplique el registro. Se prueba reintento de comida tras error, edición de comida y ejercicio, y confirmación de descarte. Guardar, cancelar e ir a Datos conservan el día o la posición de scroll cuando corresponde.
- **Superficies existentes.** Se comparan dimensiones, radios, materiales y texto de Inicio y navegación, y una huella visual y semántica de detalle, peso y confirmación de descarte con la referencia. La captura de Inicio a 375 px en Oscuro tiene el mismo SHA-256 en ambas versiones.

## Resultados

Chrome 158 y WebKit 26 completaron cada uno 140 comprobaciones de ventana por versión y dos recorridos completos. El candidato registró 0 px de desbordamiento horizontal, un mínimo interactivo de 44 px y ninguna animación con movimiento reducido. Los campos usan superficies sólidas y radio de 14 px. Los primeros candidatos mostraron campos cuadrados cuando faltaban los tokens de espaciado en el portal y 9 px de desborde en el calendario a 320 px al 200 %. Se verificaron ambos ajustes en la matriz definitiva.

En las muestras del candidato, el contraste mínimo de texto activo fue 5,97:1 y el de pictogramas activos, 8,05:1 en ambos motores. Los placeholders de la referencia en Chrome Claro llegaron a 2,52:1. Los controles inactivos se midieron por separado, con un mínimo de 2,09:1 en el candidato.

En una comprobación adicional de Chrome a 375 px en Oscuro, las cuatro altas y ediciones conservaron `input[type=time]`, el selector nativo, el período `07:54 PM`, espacio de sobra para el sufijo español simulado, la acción Ahora y el botón Guardar visible con notas desplegadas. [Hora nativa en Chrome](after/chromium-hora.json)

### Mediciones por motor

- Chrome. [Matriz de referencia](before/chromium-smoke.json) · [Matriz candidata](after/chromium-smoke.json) · [Recorridos de referencia](before/chromium-recorridos.json) · [Recorridos candidatos](after/chromium-recorridos.json)
- WebKit. [Matriz de referencia](before/webkit-smoke.json) · [Matriz candidata](after/webkit-smoke.json) · [Recorridos de referencia](before/webkit-recorridos.json) · [Recorridos candidatos](after/webkit-recorridos.json)

## Repetir las pruebas

Iniciá el mismo servidor QA desde una exportación de la referencia y desde la rama candidata, con las dependencias locales instaladas. Usá 5193 para la referencia y 5194 para el candidato.

```text
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-home-2b --port=5194
```

Desde la rama candidata ejecutá `node scripts/fitness-global/liquid-glass-home-2c.mjs --before` y `node scripts/fitness-global/liquid-glass-home-2c.mjs`. Repetí cada comando con `--webkit` para el segundo motor y configurá `PLAYWRIGHT_BROWSERS_PATH` si sus binarios están fuera de la ubicación habitual. Se puede ejecutar solo la matriz con `--section=smoke` o los recorridos con `--section=recorridos`. Para la comprobación focalizada de Hora nativa ejecutá `node scripts/fitness-global/liquid-glass-home-2c-time.mjs` con el servidor candidato activo.

## Límites

Las fotos, la cámara, la IA y las escrituras usaron límites simulados y datos sintéticos. El ensayo del teclado es geométrico. Safari en iPhone físico sigue pendiente para comprobar teclado, barras del sistema, áreas seguras, orientación y selectores nativos de tipo de comida, hora y galería.
