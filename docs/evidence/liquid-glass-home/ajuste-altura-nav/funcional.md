# Verificación funcional de la cápsula elevada

Chrome y WebKit abrieron una versión local de Calori con una cuenta, registros y respuestas sintéticas. Cada recorrido bloqueó conexiones a servicios externos. Los guardados de prueba se quedaron en la fixture.

- **Navegación.** El toque emulado recorrió las cuatro pestañas. Se comprobaron el arrastre horizontal y vertical, el foco, el regreso del indicador al interrumpir un gesto por cambio de tamaño, la rotación, una selección de pestaña ajena al gesto y la pérdida de captura. Chrome también comprobó arrastre táctil y cancelación por el protocolo de automatización. WebKit comprobó el arrastre con puntero de ratón. El movimiento reducido mantuvo la transición en 0 s.
- **Coach.** Claro y Oscuro conservaron el borrador, la posición de lectura y la edición de la propuesta en la rotación y alrededor del punto de corte 767/768 px. Con teclado simulado, la cápsula se oculta y la reserva se reduce a cero. Al cerrar el teclado a 375 × 667 px, la cápsula queda a 19,33 px del borde inferior, el compositor a 2 px de la cápsula y los avisos se anclan 8 px por encima del compositor.
- **Inicio y Datos.** Los recorridos a 320, 440 y 1440 px mantuvieron la semana de lunes a domingo, los importes con los tres signos, «Ver desglose», la fecha al editar y la vuelta del foco al cancelar. Los botones de guardado y cancelación quedaron visibles y alcanzables a 320 y 440 px con el tamaño de texto habitual y al 200 %. El final del contenido de Inicio y Datos quedó al menos 17,56 px por encima de la cápsula en estos ensayos. En Datos también se comprobó «Quitar selección» tras seleccionar una barra.
- **Avisos.** El recibo sintético de comida quedó al menos 10 px por encima de la cápsula, con texto al 75 %, 100 % y 200 %. A 320 px con texto al 200 %, «Ver registro» se alcanza con el desplazamiento interno del recibo.
- **Perfil.** Los últimos controles se alcanzaron con Gestión de datos plegada y desplegada, incluido texto al 200 %. Chrome verificó también un área segura inferior emulada de 34 px. La cápsula quedó a 56 px del borde y el último control visible dejó 35,06 px de separación a tamaño de texto habitual. No hubo desborde horizontal.

A 440 px, tras consultar Historial desplegado y cambiar de pestaña, Inicio limita la restauración del scroll al máximo alcanzable con el bloque plegado. En Chrome, tanto la referencia como el candidato limitaron 230 px a 114 px en este escenario. Los otros tamaños del recorrido restauraron los 230 px.

[Gestos Chrome](gestos-chromium.json) · [Gestos WebKit](gestos-webkit.json) · [Coach Chrome](coach-chromium-funcional.json) · [Coach WebKit](coach-webkit-funcional.json) · [Inicio Chrome](funcional-chromium.json) · [Inicio WebKit](funcional-webkit.json) · [Referencia funcional](funcional-chromium-antes.json)

## Reproducción

Iniciá la fixture candidata y ejecutá los recorridos en serie. Playwright puede usar `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_BROWSERS_PATH`.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --liquid-glass --glass-nav-lift --port=5194
node scripts/fitness-global/liquid-glass-gestures.mjs --glass-nav-lift
node scripts/fitness-global/liquid-glass-gestures.mjs --glass-nav-lift --webkit
node scripts/fitness-global/liquid-glass-coach.mjs --glass-nav-lift
node scripts/fitness-global/liquid-glass-coach.mjs --glass-nav-lift --webkit
node scripts/fitness-global/liquid-glass-home-flow.mjs --glass-nav-lift
node scripts/fitness-global/liquid-glass-home-flow.mjs --glass-nav-lift --webkit
```

Para repetir la referencia de Inicio, iniciá la misma fixture con `--before --port=5193` y agregá `--before` al recorrido de Inicio.

El arrastre nativo, la convivencia con el gesto para salir de la aplicación y las barras dinámicas siguen para revisión en Safari de iPhone físico. [Mediciones y capturas](visual.md)
