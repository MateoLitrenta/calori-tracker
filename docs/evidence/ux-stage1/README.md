# Etapa 1 — evidencia sintética

Referencia congelada en `c365e1e6f236ab76d17b46cbd8fe1ec9eace8831`, integración del PR #79. Las dos versiones montan App, ThemeProvider, Inicio, Historial y Datos reales. Los datos y los límites de servicios se sustituyen localmente. La fecha normal de la fixture es 17 de noviembre de 2026, zona America/Buenos_Aires.

## Matriz de hallazgos

| Hallazgo | Reproducción anterior | Corrección comprobada | Evidencia | Resultado |
| --- | --- | --- | --- | --- |
| UX-01 | Inicio e Historial usan domingo–sábado. Datos usa lunes–domingo. Los grupos mensuales empiezan el día 1. | Se explicita el intervalo y se documenta la propuesta de unificación con ejemplos. El cambio funcional semanal requiere aprobación. | [Política y ejemplos](../../ux-stage1-week-policy.md), [recorridos de Inicio/Historial](history-daily/README.md) | Presentación y límites vigentes validados. Unificación funcional lunes–domingo PENDIENTE de aprobación. |
| UX-02 | La semana sintética muestra −879, 1.500 y 2.081 kcal/día, sobre 1 día con comidas y 2 energéticos. La proximidad sugiere una resta que no corresponde. | La nota de resumen explica las poblaciones. Historial aclara su base energética y los días con actividad sin comidas. | [Paridad](parity/numbers.json), capturas de resumen | Mismos valores y denominadores en 18 combinaciones. |
| UX-03 | A 375 y 393 px aparecen sólo meses iniciales vacíos. El año tiene actividad de agosto a noviembre. | El gráfico abre mostrando actividad, informa qué meses tienen registros y mantiene acceso a los 12 meses mediante scroll y controles. El año vacío tiene un estado explícito. | [Antes](before/375-light-anual.jpg), [después](after/375-light-anual.jpg), [recorrido](interactions/results.json) | Actividad descubierta al entrar. Posición conservada durante selección, Escape, cambios de Sistema y actualizaciones del store. |
| UX-04 | Semana móvil oculta el domingo y Mes muestra Sem 1/2. | Con texto a tamaño normal, desde 375 px se ven los siete días. Los grupos del mes muestran fechas reales. A 320 px se conserva desplazamiento local y señal visible. | [Geometría](after/matrix.json), [semanal](after/375-light-semana.jpg), [mensual](after/375-light-mensual.jpg) | Siete objetivos de al menos 44 px desde 375 con texto a tamaño normal (45,03 px medidos a 375). Al ampliar texto puede aparecer scroll local con señal visible. Agrupaciones y escala conservadas. |
| UX-13 | El saldo tiene más peso visual que consumo y gasto. | Componentes legibles junto al saldo, escala en kcal y nota visible sobre cobertura. El día sin comidas mantiene el estado parcial y su saldo en el desglose. | [Inicio antes](before/375-light-inicio.jpg), [Inicio después](after/375-light-inicio.jpg), recorridos de Inicio/Historial | Valores y fecha de escritura conservados. |
| UX-15 | Las diferencias con el período previo carecen de fechas y cobertura junto a ellas. | Se muestran los intervalos exactos y los días incluidos en cada media. La comparación mensual usa 1–17 nov y 1–31 oct, con coberturas 4/6 y 2/3. | [Comparación](interactions/393-month-comparison-light.jpg), [paridad](parity/numbers.json) | Diferencias −175, +93 y −276 kcal/día conservadas. El umbral vigente mantiene ausente la comparación semanal con sólo un día con comidas. |

## Comparativas visuales

Cada lámina enfrenta la misma fixture y tamaño: antes a la izquierda, después a la derecha; Claro arriba y Oscuro abajo.

| Vista | Móvil, 375 px | Desktop, 1440 px |
| --- | --- | --- |
| Inicio | [Comparativa](comparisons/375-inicio.jpg) | [Comparativa](comparisons/1440-inicio.jpg) |
| Resumen y cobertura | [Comparativa](comparisons/375-resumen.jpg) | [Comparativa](comparisons/1440-resumen.jpg) |
| Semana | [Comparativa](comparisons/375-section-semana.jpg) | [Comparativa](comparisons/1440-section-semana.jpg) |
| Mes | [Comparativa](comparisons/375-section-mensual.jpg) | [Comparativa](comparisons/1440-section-mensual.jpg) |
| Año | [Comparativa](comparisons/375-section-anual.jpg) | [Comparativa](comparisons/1440-section-anual.jpg) |
| Comparación previa | [Comparativa](comparisons/375-section-comparison.jpg) | [Comparativa](comparisons/1440-section-comparison.jpg) |

## Escenarios y mediciones

| Comprobación | Resultado final |
| --- | --- |
| Matriz normal | 48 observaciones de referencia + 48/48 candidatas aprobadas |
| Paridad de datos y detalle | 18/18 combinaciones aprobadas |
| Recorridos de gráficos | 4/4 aprobados |
| Texto al 200% en Datos | 36/36 aprobados; separación mínima de rótulos 8 px |
| Inicio e Historial, escenarios y texto ampliado | [25/25 recorridos](history-daily/README.md), con límites heredados explícitos |
| Historial, matriz normal independiente | [12/12 combinaciones](history-daily/normal-widths.json) |
| Servicios durante los recorridos | 0 llamadas a IA, 0 escrituras y 0 solicitudes externas |


- Las matrices de [referencia](before/matrix.json) y [candidato](after/matrix.json) incluyen 48 observaciones cada una. Se recorren Inicio y los tres períodos de Datos, a 320, 375, 393, 440, 768 y 1440 px, en Claro y Oscuro. El desplazamiento local del gráfico se mide por separado del ancho de página.
- La [paridad numérica](parity/numbers.json) compara todos los campos canónicos existentes, incluyendo intervalos, buckets, resúmenes y diferencias. También compara los importes del DOM y abre cada barra para comprobar los valores exactos. Los casos son cuenta A, cuenta B vacía, año vacío, ingesta cero registrada, cruce de año y cruce de mes. Cada uno pasa por Semana, Mes y Año.
- Las cuatro [interacciones de gráficos](interactions/results.json) prueban Sistema claro/oscuro en vivo, selección por teclado, foco visible, Escape, navegación a enero y diciembre, retención del scroll, cambio de cuenta A→B→A, recreación del gráfico después de vaciar/restaurar solamente la fixture de una cuenta y cero frente a ausencia de comidas. La reinicialización después de un gráfico vacío fue una prevención detectada en revisión estática y comprobada sobre el código final; no se presenta como reproducción anterior en navegador.
- La [ampliación de texto](zoom/results.json) recorre Semana, Mes y Año en los seis anchos y ambos temas (36 casos). Usa tamaños de fuente y cajas de línea al 200% sobre los descendientes de la pantalla. Se mide el flujo resultante, sin transformar el viewport. El procedimiento está explícito en el script y no certifica la función de zoom de un navegador móvil físico.

Las comprobaciones usan Chromium de escritorio con ventanas emuladas. El arnés bloquea peticiones externas y contabiliza solicitudes de IA y escrituras. Los recorridos de lectura deben dejar ambos contadores en cero. Los tiempos de los scripts incluyen carga del host y no se presentan como métricas de rendimiento.

## Reproducción

Con dependencias del lockfile instaladas y Playwright capaz de abrir Chrome, iniciar dos terminales.

```sh
node scripts/ux-stage1/serve.mjs --before
node scripts/ux-stage1/serve.mjs
```

Los servidores escuchan sólo en loopback en 5195 y 5196. Admiten `scenario=main`, `empty`, `zeros`, `yearBoundary` y `monthBoundary`. Usar `theme=light|dark|system` y `controls=0` para capturas. `PLAYWRIGHT_MODULE` puede apuntar al módulo de una instalación disponible de Playwright. `QA_BROWSER_CHANNEL` selecciona su canal.

```sh
node scripts/ux-stage1/matrix.mjs --before
node scripts/ux-stage1/matrix.mjs
node scripts/ux-stage1/parity.mjs
node scripts/ux-stage1/interactions.mjs
node scripts/ux-stage1/zoom.mjs
node scripts/ux-stage1/history-daily.mjs
node scripts/ux-stage1/history-widths.mjs
node scripts/ux-stage1/sections.mjs
node scripts/ux-stage1/boards.mjs
```

Las láminas en [comparisons](comparisons/) usan exactamente las mismas cuentas sintéticas, día, ancho y apariencia. Incluyen ambas apariencias en cada comparación. Las capturas de sección mantienen completo el gráfico y sus controles: se extiende únicamente la altura del viewport a 3000 px para que la navegación fija no se superponga al panel. Las capturas de la matriz conservan las alturas originales.

## Límites

Esta evidencia cubre únicamente los seis hallazgos de la etapa 1. Los botones de hábitos +250/+500 presentan un desborde heredado al duplicar texto; [se documenta y compara contra la base](history-daily/README.md#texto-al-200-y-límites), sin atribuir una certificación de accesibilidad a toda la aplicación. Los servicios remotos, Gemini real, Auth y Storage reales, Safari/iOS físico, teclado táctil, lectores de pantalla y gestos reales requieren comprobaciones propias. La propuesta lunes–domingo y los otros hallazgos de la auditoría siguen pendientes de decisión y de sus etapas correspondientes.
