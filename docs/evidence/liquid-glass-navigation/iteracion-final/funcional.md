# Regresión funcional del material final

Los recorridos usan la aplicación y la hoja de estilos del candidato con datos sintéticos. Playwright intercepta toda conexión fuera del servidor local. Los escenarios de Coach cubren dos respuestas simuladas y una escritura sintética tras la confirmación explícita.

## Cobertura

- **Gestos y navegación**. Clic breve, arrastre horizontal corto y largo, arrastre vertical y diagonal, arrastre cancelado, pérdida de captura, selección externa, foco visible por teclado, Enter y Espacio. Se cruza el umbral de 768 px durante un gesto y se verifica que el desplazamiento táctil cerca de la barra siga disponible.
- **Coach y formularios**. En Claro y Oscuro se verifica que el teclado simulado oculte la barra y libere su espacio, incluso al girar y cruzar los 768 px. Se comprueban visibilidad y foco del campo, cursor, envío, lectura, propuestas, borradores, confirmación, recibo y vuelta del foco tras cerrar.
- **Áreas seguras y contraste**. La matriz visual simula las áreas seguras y comprueba contraste, foco con texto al 200 %, tema Sistema, movimiento reducido y los tratamientos opacos de accesibilidad. [Comparativas visuales](visual.md)

## Resultados de gestos

Chrome 158 y WebKit 26 validaron la navegación en 320, 375, 390, 768, 1280 y 1440 px. En Chrome a 390 px, el desplazamiento corto de 22,625 px movió 22,63 px la pieza y conservó Inicio. El arrastre de una celda mantuvo Inicio hasta soltar y seleccionó Coach. La tracción vertical de 70 px desplazó 2,39 px el indicador y lo devolvió a Coach. En ambos motores, el movimiento reducido dejó la transición en 0 s y el cambio de tamaño durante un arrastre conservó el destino aceptado.

La prueba responsive espera a que el motor aplique el ancho y muestre la navegación esperada antes de pulsar. El escenario aparte de interrupción mantiene la suelta inmediata para cubrir la carrera entre redimensionar y liberar el puntero.

[Registro Chrome](gestos-chromium.json) · [Registro WebKit](gestos-webkit.json)

## Resultados de Coach

Chromium 158 y WebKit 26 completaron los recorridos en Claro y Oscuro. El compositor y los campos de propuestas se mantuvieron por encima del teclado simulado. Durante la rotación y el cruce de 767/768 px, la barra inferior desapareció y su reserva quedó en 0 px. El lector conservó su posición al volver a Coach. Se conservaron la protección del borrador de Perfil, la confirmación explícita, el recibo y el retorno del foco.

[Registro Coach en Chrome](coach-chromium-funcional.json) · [Registro Coach en WebKit](coach-webkit-funcional.json)

## Reproducción

Iniciá el servidor local y ejecutá los cuatro recorridos en serie desde otra terminal. El runner usa `PLAYWRIGHT_MODULE` si se indica y toma la ubicación de los navegadores con `PLAYWRIGHT_BROWSERS_PATH`.

~~~sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-final --port=5194
~~~

~~~sh
node scripts/fitness-global/liquid-glass-gestures.mjs --iteration-final
node scripts/fitness-global/liquid-glass-gestures.mjs --iteration-final --webkit
node scripts/fitness-global/liquid-glass-coach.mjs --iteration-final
node scripts/fitness-global/liquid-glass-coach.mjs --iteration-final --webkit
~~~

Chromium ejecuta mouse y arrastre táctil emulado. WebKit ejecuta mouse y toque corto emulado. El teclado usa cambios sintéticos de `visualViewport`. La respuesta táctil nativa, el teclado y las barras dinámicas de Safari requieren la revisión en iPhone físico.
