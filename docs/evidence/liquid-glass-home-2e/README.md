# Liquid Glass · Inicio 2E · Tu actividad

La comparación parte de `fb104d6c30832997e85f5e8fa8b211a0fafb162a`, merge del PR #109. Las capturas usan la app y la misma fecha y cuenta sintéticas en ambas versiones.

## Decisiones

- **Semana.** Los siete días van de lunes a domingo. La fila da prioridad a la fecha, el balance firmado o el estado parcial, y los iconos de comidas y ejercicio.
- **Mes.** La línea bajo los días de la semana orienta la lectura. Las celdas son compactas y los tintes semánticos quedan bajo el valor. La ficha naranja del día consultado y el punto de Hoy pueden verse juntos.
- **Estados.** El guion identifica días sin registros y el reloj, fechas futuras. Si una fecha futura contiene registros, conserva su indicación sin contribuir al balance. Cero sigue mostrándose como `0` y los días parciales conservan su texto y línea discontinua. La leyenda explica las marcas cuando se abre.
- **Año.** Las doce tarjetas muestran primero el nombre del mes. Los promedios usan un acento lateral y el mes actual mantiene «En curso». Los estados «Sin registros», «Registro parcial», «Provisional» y «Próximamente» siguen visibles.
- **Navegación estrecha.** A 320 px la cuadrícula conserva los blancos de 44 px mediante desplazamiento local. En la base, «Hoy» podía seleccionar una fecha que seguía cortada. Ahora la muestra dentro del calendario y conserva el foco en el botón y la posición vertical.
- **Detalle.** La fecha consultada encabeza una superficie sólida. El balance, los registros y los hábitos tienen jerarquías propias. En escritorio, el resumen de Semana o Mes aparece junto al calendario y el detalle a su derecha. En móvil, el detalle sigue directamente debajo del calendario. Solo «Ver y editar» cambia el día editable.

Se reutilizan las cifras, los períodos, los textos de cobertura, el selector segmentado y la animación existente. El diff de producto está limitado a `Heatmap.tsx` y `ActivityHistory.css`. La resolución del peso por fecha, el guardado, el calendario de Inicio y la navegación de la app conservan sus implementaciones.

## Comparativas y comprobaciones

- [Antes · 375 px, Claro](before/375-light-mes.jpg) · [Después](after/375-light-mes.jpg)
- [Antes · 375 px, Oscuro](before/375-dark-mes.jpg) · [Después](after/375-dark-mes.jpg)
- [Antes · 1440 px, Claro](before/1440-light-mes.jpg) · [Después](after/1440-light-mes.jpg)
- [Antes · 1440 px, Oscuro](before/1440-dark-mes.jpg) · [Después](after/1440-dark-mes.jpg)
- [Capturas de referencia por escala y tema](before) · [Capturas del candidato](after)
- [Matriz de navegador, fixtures y medidas](navegador.md)

`tests/history-experience.test.mjs` comprueba las marcas y sus nombres accesibles, la exclusión de registros futuros del balance y la separación entre consulta y edición. Las pruebas preexistentes ejercitan períodos, historial energético, teclado, borradores y cambio de ancho. La ejecución focalizada de `history-experience.test.mjs` y `precision-layout.test.mjs` aprobó 61 de 61 pruebas. El runner Linux vigente es `Calori staging schema rehearsal`. El workflow histórico `integration-v9-1.yml` se limita al #71.

## Recorrido de revisión

1. Abrí Inicio y entrá a **Tu actividad**. En **Mes**, compará el punto de Hoy y la selección naranja con los tintes de balance y abrí **Indicadores del calendario**.
2. Seleccioná dos días consecutivos. Revisá que cambie el detalle y conservá como referencia el día del calendario superior. Pulsá **Ver y editar** cuando quieras abrir la fecha que estabas consultando.
3. Cambiá a **Semana** para recorrer de lunes a domingo. En **Año**, recorré los doce meses y abrí uno disponible. El selector de escalas y las fechas se pueden operar con teclado.
4. En Safari de iPhone, repetí el recorrido en Claro y Oscuro. En el ancho más angosto, deslizá dentro de la cuadrícula y usá las flechas del mes. Probá con texto ampliado y verificá que el último control se pueda alcanzar por encima de la cápsula de navegación.

Los resultados automatizados de WebKit ejercitan el motor en geometrías controladas. La interacción con las barras de Safari y las áreas seguras de un iPhone físico queda para la revisión en dispositivo.
