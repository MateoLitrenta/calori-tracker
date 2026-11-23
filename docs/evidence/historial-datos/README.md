# Historial y Datos

La referencia es el merge de #90 en `main`, `4694914ddd5363815faf77168e3cd85bbcc69a44`. Las capturas se tomaron antes y después con las mismas cuentas sintéticas, fecha local del 13 de noviembre de 2026 y huso de Buenos Aires. La documentación de referencia fue [Historial 2.1](../../activity-history-v2-1.md) y [fechas, métricas y gráficos](../../ux-stage1-dates-metrics-charts.md). El árbol de la base carecía de `AGENTS.md` y `docs/ESTADO_ACTUAL.md`.

## Historial

El fondo de cada celda representa su clasificación. El contorno naranja indica qué día se está consultando y un punto distingue a hoy. Los signos, los nombres accesibles y la leyenda permiten leer el calendario sin depender del color. La fecha consultada encabeza el detalle, donde balance, calorías consumidas y gasto estimado preceden a los registros. Explorar fechas conserva el día editable en Inicio hasta pulsar «Ver y editar».

En la muestra del 12 de noviembre se leen 3.100 kcal consumidas, 2.449 de gasto estimado y un balance de +651. Para el 11 de noviembre, con pasos y sin comidas, el detalle indica «Balance provisional» y «Sin comidas». Un día con sólo agua conserva ese registro y muestra «Sin datos energéticos».

| Escenario | Antes | Después |
| --- | --- | --- |
| Mes a 1440 px | [Claro](before/history-1440-light-mes.jpg) · [Oscuro](before/history-1440-dark-mes.jpg) | [Claro](after/history-1440-light-mes.jpg) · [Oscuro](after/history-1440-dark-mes.jpg) |
| Mes a 375 px | [Claro](before/history-375-light-mes.jpg) · [Oscuro](before/history-375-dark-mes.jpg) | [Claro](after/history-375-light-mes.jpg) · [Oscuro](after/history-375-dark-mes.jpg) |
| Detalle móvil | [Con comidas](before/history-375-dark-detalle.jpg) · [Parcial](before/history-375-light-parcial.jpg) | [Con comidas](after/history-375-dark-detalle.jpg) · [Parcial](after/history-375-light-parcial.jpg) |
| Otros períodos y texto ampliado | [Semana](before/history-375-light-semana.jpg) · [Año](before/history-1440-dark-anual.jpg) · [320 px al 200 %](before/history-320-light-mes-200.jpg) | [Semana](after/history-375-light-semana.jpg) · [Año](after/history-1440-dark-anual.jpg) · [320 px al 200 %](after/history-320-light-mes-200.jpg) |

El [recorrido de Historial, 8,6 s](after/history-recorrido.webm) muestra la selección, el cambio de período y la apertura explícita de registros.

## Datos

Las medias de balance, consumo y gasto comparten una banda. Cada valor tiene unidad y cobertura para que se pueda leer cuántos días intervienen en su cálculo. El gráfico conserva las dos series, la escala común y los rótulos del balance. La leyenda está antes de las barras y el detalle se abre con teclado, puntero o toque. Actividad y comparación de períodos quedan a continuación.

En el historial abundante a 1440 px, el gráfico pasó de **670 a 1126 px de ancho** y el resumen de **362 a 266 px de alto**. En el caso extremo a 320 px y con texto al 200 %, la referencia superior de 988.000 kcal cabe en una línea. El eje conserva el mismo máximo en ambas versiones.

| Escenario | Antes | Después |
| --- | --- | --- |
| Resumen semanal a 1440 px | [Claro](before/data-1440-light-semana.jpg) · [Oscuro](before/data-1440-dark-semana.jpg) | [Claro](after/data-1440-light-semana.jpg) · [Oscuro](after/data-1440-dark-semana.jpg) |
| Resumen semanal a 375 px | [Claro](before/data-375-light-semana.jpg) · [Oscuro](before/data-375-dark-semana.jpg) | [Claro](after/data-375-light-semana.jpg) · [Oscuro](after/data-375-dark-semana.jpg) |
| Gráfico mensual con selección | [Móvil](before/data-375-dark-mes.jpg) · [Escritorio](before/data-1440-light-mes.jpg) | [Móvil](after/data-375-dark-mes.jpg) · [Escritorio](after/data-1440-light-mes.jpg) |
| Actividad y comparación | [Móvil](before/data-375-light-actividad.jpg) · [Escritorio](before/data-1440-light-actividad.jpg) | [Móvil](after/data-375-light-actividad.jpg) · [Escritorio](after/data-1440-light-actividad.jpg) |
| Período vacío y escala extrema | [Vacío](before/data-375-dark-vacio.jpg) · [Texto al 200 %](before/data-320-light-extremo-200.jpg) | [Vacío](after/data-375-dark-vacio.jpg) · [Texto al 200 %](after/data-320-light-extremo-200.jpg) |

En escritorio, el encuadre mensual claro incluye el gráfico seleccionado y las secciones de actividad y comparación. Las dos referencias de la tabla corresponden a esa misma captura.

El [recorrido de Datos, 6,1 s](after/data-periodos.webm) muestra la selección y lectura del gráfico en móvil.

## Matriz de verificación

| Alcance | Resultado y evidencia |
| --- | --- |
| Clasificación y navegación en Historial | 72 selecciones por versión en seis anchos y dos temas. Se cubrieron hoy, día vacío, déficit, superávit, equilibrio y día parcial. Se cotejaron nombres accesibles, categorías y registros. El recorrido incluye foco, apertura explícita y cambio de cuenta. [Base](before/history-matrix.json) · [Candidato](after/history-matrix.json) |
| Estadísticas y escalas en Datos | 144 combinaciones por versión con pocos registros, historial abundante, período vacío y valores extremos en Semana, Mes y Año. La salida de las 12 combinaciones de datos y período fue idéntica antes y después, incluidas fechas, medias, coberturas, límites, comparaciones, rótulos y alturas relativas de las barras. [Base](before/data-values.json) · [Candidato](after/data-values.json) |
| Reflujo | Se probaron 320, 375, 768, 1024, 1440 y 1920 px en claro y oscuro. El ensayo al 200 % duplica los tamaños de texto computados con viewport fijo. Se comprobó ausencia de desborde horizontal de página. El calendario y el gráfico conservan el desplazamiento local cuando lo requieren. [Geometría anterior](before/data-geometry.json) · [Geometría actual](after/data-geometry.json) |
| Accesibilidad | En los elementos de texto medidos, el contraste mínimo fue 5,83:1 en Historial (375 y 1440 px) y 6,33:1 en Datos. Se probaron foco visible, teclado, blancos táctiles de Historial de al menos 44 px y selección con movimiento reducido. [Historial](after/history-matrix.json) · [Datos](after/data-interactions.json) |
| Interacción del gráfico | Se probaron Enter, Escape, puntero, «Quitar selección», cero registrado, ingesta faltante, aislamiento entre cuentas y cambio de ancho en Año conservando la posición elegida y los doce meses accesibles. [Base](before/data-interactions.json) · [Candidato](after/data-interactions.json) |
| Regresión técnica | Las pruebas específicas de componentes cubren la ingesta registrada, el cero real y la ausencia de datos, además de la lectura del gráfico antes y después de seleccionar. El Draft enlaza la CI Linux del commit final, los resultados de TypeScript, Oxlint y build, la Preview y su código de Perfil. Oxlint es el linter configurado por el proyecto. |

Los recorridos de navegador usan servicios simulados. La CI ejecuta su entorno local desechable de PostgreSQL y PostgREST. Las semanas siguen de domingo a sábado en Historial y de lunes a domingo en Datos. Quedan para revisión manual el teléfono físico y la lectura con VoiceOver o NVDA.

## Reproducción

Desde la raíz del repositorio, iniciar en terminales separadas la base congelada y el candidato.

```sh
node scripts/home-mobile/serve-qa.mjs --history-data --before --port=5193
node scripts/home-mobile/serve-qa.mjs --history-data --port=5194
```

Con Chrome y la instalación de Playwright del proyecto de QA, ejecutar en secuencia. Los recursos del navegador y de grabación pueden localizarse con `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_BROWSERS_PATH`.

```sh
node scripts/fitness-global/history-review.mjs --before
node scripts/fitness-global/history-review.mjs
node scripts/fitness-global/history-review.mjs --video
node scripts/fitness-global/data-review.mjs --before
node scripts/fitness-global/data-review.mjs
```
