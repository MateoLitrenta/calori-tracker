# Regresión funcional · Inicio 2B

La referencia congelada corresponde a `bf7fe5515a5f27edb2686c088c0110994d58e5b9`, merge del PR #104. Se usa React de cada versión en un servidor local con registros sintéticos. El fixture guarda únicamente en el almacenamiento local del contexto de prueba y bloquea conexiones remotas. Los recorridos registran cero llamadas a IA.

## Comprobaciones

- **Registros.** Estados con cinco, uno y cero registros. Se verifica orden por hora, el nombre largo completo, la descripción en detalle y los importes `+1.100 kcal`, `+750 kcal` y `-250 kcal`. Enter abre el detalle, Escape devuelve el foco a la fila y un único guardado sintético muestra el recibo y permite abrir el registro nuevo.
- **Hábitos.** El incremento de 250 ml deja 2.000 ml en la copia canónica. La edición de pasos muestra el error de guardado, retiene el borrador y confirma 10.000 pasos solo tras reintentar. El editor de peso guarda 112,4 kg. El candidato prueba además valores grandes y las cuatro acciones de incremento de al menos 44 × 44 px.
- **Tu actividad.** Semana conserva lunes a domingo, Mes distingue días vacíos, parciales, registrados y futuros, y Año presenta doce meses. Las flechas seleccionan con foco visible. Consultar el 12/11 conserva el 13/11 como fecha editable hasta abrir los registros y poner el foco en el diario. Salir y volver a Inicio restaura el día editable y el scroll.

Las 12 suites focalizadas ejecutaron **260 pruebas**, todas aprobadas, sin omisiones. Cubren registros, consolidación de guardados de hábitos, recibos canónicos, conflictos, fechas, actividad, promedios y restauración de scroll. Se verificó además Registros con Chrome a 375 px después del paso A, y se repitió junto con Hábitos después del paso B.

En Chrome, los seis escenarios compartidos produjeron los mismos resultados en la referencia y el candidato. Las mediciones adicionales de valores grandes y blancos táctiles se agregaron al recorrido del candidato. [Referencia Chrome](funcional-chromium-antes.json) · [Candidato Chrome](funcional-chromium.json)

Chrome 158 y WebKit 26 aprobaron los seis escenarios del candidato en cada motor, a 375 px en Claro y a 1440 px en Oscuro. Los resultados de ambos motores coincidieron. La entrada por Tab comprobó el indicador de foco del calendario después de seleccionar otra fecha con las flechas. También se repitió Registros en Chrome después del margen final de «Ver todos los registros». [Candidato WebKit](funcional-webkit.json)

## Reproducción

Con las fixtures de referencia y candidato en 5193/5194, ejecutá en serie con Playwright.

```sh
node scripts/fitness-global/liquid-glass-home-2b-flow.mjs --before
node scripts/fitness-global/liquid-glass-home-2b-flow.mjs
node scripts/fitness-global/liquid-glass-home-2b-flow.mjs --webkit
```

Para repetir una puerta a 375 px, usá `--block=records`, `--block=records,habits` o `--block=activity`. El recorrido completo utiliza 375 px en Claro y 1440 px en Oscuro. La matriz de contraste, foco y escalas de texto figura en la [comparativa visual](visual.md). La revisión de Safari con tacto y barras del sistema queda pendiente en iPhone físico.
