# Arrastre del indicador de navegación

El botón de la sección actual captura el puntero. El indicador recibe posición y escala por transformación una vez por cuadro mientras se mueve el puntero. Los botones, sus rótulos y sus iconos mantienen sus propias cajas. La sección se decide al soltar y pasa por el cambio de navegación normal de la aplicación. Un borrador de Perfil puede pedir confirmación antes de aceptar el cambio.

| Regla | Comportamiento |
| --- | --- |
| Inicio del gesto | 6 px de distancia entre la pulsación y la posición actual. |
| Cambio de sección | Desplazamiento horizontal de al menos el 45 % del ancho de una opción y mayor a 1,25 veces el desplazamiento vertical. Se elige la opción más cercana en esa dirección dentro de la barra. |
| Resistencia | El indicador acompaña el movimiento horizontal dentro del recorrido. Al exceder un extremo, la respuesta lateral se aproxima a 2 px. En vertical la respuesta se aproxima a 3 px con resistencia progresiva. |
| Retorno | 240 ms con rebote corto. Movimiento reducido conserva el seguimiento y elimina la deformación y la animación de retorno. |
| Interrupciones | Se libera la captura y se descarta el gesto al cancelarse o perder el puntero, al cambiar tamaño, orientación, foco de ventana o destino y al ocultarse el documento. El clic residual del gesto se descarta con la captura finalizada. |
| Prioridad táctil | Solo el botón activo usa touch-action none. Los demás botones mantienen su activación habitual y el contenido próximo conserva el desplazamiento. |

## Evidencia medible

En Chrome a 390 px, un desplazamiento horizontal de 22,63 px movió el indicador 22,63 px y conservó Inicio al soltar. El desplazamiento de una celda, 90,5 px, mantuvo Inicio mientras se sostenía el puntero y seleccionó Coach al soltar. El gesto hacia arriba de 70 px produjo una respuesta vertical de 2,39 px y regresó a Coach. La diagonal de 58,83 px a la derecha y 65 px hacia arriba conservó la selección. Con 84,17 px a la derecha y 20 px hacia arriba aceptó Datos.

Los recorridos verifican que el indicador queda centrado tras cada acción, incluso al perder la captura, girar, cruzar los 768 px o cambiar de sección por teclado con el puntero presionado. Tras un arrastre vertical o interrumpido, el siguiente clic y el foco por Tab siguen funcionando. También se comprueban clics rápidos, Enter, Espacio y movimiento reducido. En el recorrido de Chromium con toque emulado, el arrastre iniciado en el contenido junto a la barra desplazó 219 px y conservó la sección seleccionada.

En WebKit se reprodujo un cambio de sección involuntario al soltar justo después de pasar de 390 × 844 a 667 × 375. La prueba final cubre la liberación inmediata. El gesto se cancela si el marco del viewport o la geometría de la barra ya cambiaron, aunque el evento de redimensionamiento aún esté pendiente.

[Video del gesto](gesto-arrastre.webm) · [Mediciones Chromium](gestos-chromium.json) · [Mediciones WebKit](gestos-webkit.json)

El video usa un cursor visible y un rótulo de prueba que distingue puntero presionado y suelto. Muestra el indicador entre dos destinos mientras la sección aceptada sigue siendo Inicio.

## Regresiones de navegación y Coach

Los recorridos de Coach registran lectura, propuestas, borradores, recibos, foco y teclado simulado al cambiar de sección. Cada recorrido de Coach comprobó dos solicitudes interceptadas por la simulación y un guardado sintético tras confirmar. Los recorridos del gesto comprobaron cero solicitudes a IA, escrituras o conexiones externas. El escenario principal de gesto se ejecuta a 390 px y comprueba también las cajas táctiles y la selección en 320, 375, 768, 1280 y 1440 px. En WebKit el arrastre se ejerce con mouse y se prueba el toque corto emulado. En Chrome se cubren mouse y gestos táctiles enviados por el protocolo del navegador.

[Coach en Chromium](coach-chromium-funcional.json) · [Coach en WebKit](coach-webkit-funcional.json)

Desde la raíz del repositorio, iniciá el servidor de datos sintéticos del candidato. Usá otra terminal para los recorridos y configurá `PLAYWRIGHT_MODULE` si Playwright está instalado fuera de `../qa-tools`.

~~~sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-iteration-2 --port=5194
~~~

~~~sh
node scripts/fitness-global/liquid-glass-gestures.mjs
node scripts/fitness-global/liquid-glass-gestures.mjs --webkit
node scripts/fitness-global/liquid-glass-gestures.mjs --video
node scripts/fitness-global/liquid-glass-coach.mjs --iteration-2
node scripts/fitness-global/liquid-glass-coach.mjs --iteration-2 --webkit
~~~

En iPhone, empezá el gesto en la opción naranja y detené el dedo entre dos destinos. La sección debe cambiar al soltar únicamente si el gesto horizontal es claro. Subí el dedo sobre la opción seleccionada para probar el retorno y repetí el gesto al girar. Probá también un desplazamiento iniciado en el contenido cerca de la cápsula. En Mac, reducí el ancho de la ventana por debajo de 768 px para ver la barra inferior y repetí con el mouse. En escritorio, probá los rótulos del lateral con Tab, Enter y Espacio.

La respuesta bajo un dedo en Safari con teclado, barras y áreas seguras nativas requiere la revisión en iPhone físico. El video de escritorio comprueba el seguimiento del puntero y el retorno visual. La traza no estima rendimiento ni latencia en un dispositivo físico.
