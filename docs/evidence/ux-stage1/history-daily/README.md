# Inicio e Historial: validación sintética de UX-01, UX-02 y UX-13

Reproducción: con los servidores QA de esta etapa disponibles en `127.0.0.1:5195` (base `c365e1e`) y `127.0.0.1:5196` (candidato), ejecutar `node scripts/ux-stage1/history-daily.mjs`. Usa Chrome mediante Playwright, un contexto por vez, hora y registros sintéticos de `scripts/ux-stage1/fixture.mjs`, zona `America/Buenos_Aires` y red externa bloqueada. No accede a Production ni a cuentas reales. Tras el último ajuste CSS se repitió el tramo afectado con `--zoom-only`: conserva los 13 recorridos funcionales aprobados y sustituye todos los pares de ampliación, incluyendo la igualdad de dimensiones y fechas del calendario a tamaño normal frente a la base.

`results.json` conserva las observaciones, geometría, comparación numérica y contadores. Hay 25 recorridos: cuatro escenarios en base/claro y candidato/claro/oscuro, un recorrido de teclado y Sistema, y seis pares antes/después de texto ampliado (320, 375 y 1440 px; claro y oscuro). Un resultado `passed` en texto ampliado certifica las comprobaciones de esta etapa y la invariancia de los problemas heredados documentados abajo; **no significa que toda la aplicación esté libre de problemas de accesibilidad**.

La matriz independiente `normal-widths.json`, reproducible con `node scripts/ux-stage1/history-widths.mjs`, cubre 12 combinaciones de Historial a tamaño normal: 320, 375, 393, 440, 768 y 1440 px, en claro y oscuro. Reutiliza un único contexto y verifica ausencia de desborde global, controles de al menos 44 px, foco visible y navegación de teclado, fecha editable y registros intactos, y cero escrituras, IA y peticiones externas. Estas 12 comprobaciones se cuentan separadamente de los 25 recorridos anteriores.

## Comprobaciones

- `main`, `zeros`, `empty` y `yearBoundary`: igualdad exacta de datos, límites semanales, resumen, denominadores y cifras visibles entre base y candidato. Las semanas de Inicio e Historial continúan siendo domingo–sábado; no se implementó la propuesta lunes–domingo.
- Registro de comida con 0 kcal diferenciado de la ausencia de registros. Si no hay datos energéticos, las cifras principales permanecen desconocidas (`—`); el basal sólo se explica en el desglose.
- Cobertura de comidas y base real del promedio de Historial visibles. Un registro alimentario no garantiza que se hayan registrado todas las comidas. Un día con pasos sin comidas sigue en el promedio provisional existente, explicado junto al resultado.
- Navegación de teclado en la tira semanal, calendario mensual e Historial; foco visible; Escape devuelve foco al disparador. Explorar Historial no cambia el día editable. No se crean escrituras por explorar ni por cambiar de fecha.
- Cambio de Sistema de claro a oscuro y vuelta a claro sin recargar. Sin comidas, la cabecera no afirma déficit ni presenta un balance como completo; el valor provisional sigue disponible al abrir explícitamente el desglose.
- Sin cambios en ningún registro sintético y con cero escrituras, llamadas IA y peticiones externas durante los recorridos.

| Escenario | Semana conservada | Días con comidas / transcurridos | Base energética | Promedio existente |
| --- | --- | --- | --- | --- |
| `main` | 15–21 nov 2026 | 2/3 | 3 días | −760 kcal/día, provisional |
| `zeros` | 15–21 nov 2026 | 1/3 | 1 día | −1679 kcal/día |
| `empty` | 15–21 nov 2026 | 0/3 | 0 días | Sin datos |
| `yearBoundary` | 27 dic 2026–2 ene 2027 | 3/7 | 4 días | −494 kcal/día, provisional |

En `main`, Inicio conserva 1500 kcal registradas, 2379 kcal de gasto estimado y −879 kcal de saldo del día. En `zeros`, una comida registrada de 0 kcal produce el valor visible 0; en `empty` y el día seleccionado vacío del límite anual se muestra `—`, sin convertir ausencia en cero alimentario.

## Texto al 200% y límites

El script resuelve primero el `font-size` y `line-height` calculado de cada descendiente de `.app-main` y luego duplica cada tamaño una sola vez. No cambia el viewport, no transforma la página y no usa zoom del navegador. Esta es una prueba identificable de ampliación CSS de texto, no una certificación de zoom nativo, lectores de pantalla o dispositivos físicos. Los textos recortados deliberadamente para lectores de pantalla se excluyen de la inspección visual.

La medición comprueba desbordes de texto en los componentes de esta etapa, desbordes globales, controles fuera del viewport y colisiones entre hermanos en las filas de navegación, comparación e Historial. Cada cifra y etiqueta del calendario debe permanecer dentro de su propia celda incluso si el conjunto admite desplazamiento horizontal local. Las capturas son de viewport, con desplazamiento al contenido pertinente; una sección más alta que la pantalla puede requerir desplazamiento vertical.

Se encontraron desbordes en Historial a este tamaño: `Semana` a 320 px, `Dom` a 375 px y valores demasiado próximos entre celdas. También `DOM` y `MAR` excedían sus celdas en la tira semanal de Inicio. El ajuste permite que el texto de los controles salte de línea y que crezca su altura, conservando tipografía y tamaño táctil normales. Encabezados y días de Historial, y la tira de Inicio, usan un mínimo de columna de `max(44px, 2.75em)`: se conservan los 44 px normales y los calendarios pueden crecer al ampliar texto, dentro de sus desplazamientos horizontales locales existentes. No cambia límites, agregación ni selección de fechas.

Los botones de hábitos `+250` y `+500` ya desbordan sus cajas al duplicar todo el texto: aproximadamente 6–16 px según ancho. Se registran en `inheritedIssues`, se comparan exactamente contra la base y tienen capturas `text200-before-habits` / `text200-after-habits`. Su rediseño pertenece a una etapa posterior; esta entrega no modifica formularios ni estos controles. Los resultados conservan este límite expresamente.

Las capturas `*-daily` y `*-history` muestran el resultado normal en los cuatro contextos. `main-375-partial-disclosure` muestra la evidencia provisional tras una acción explícita. `*-text200-daily` y `*-text200-history` documentan la ampliación indicada. Todos los nombres, comidas y actividades de la evidencia son sintéticos.
