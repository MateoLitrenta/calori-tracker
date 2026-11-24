# Política de semanas y períodos · Etapa 1

**Actualización del 24/11/2026.** Se aprobó lunes a domingo para las tres vistas. La tabla siguiente documenta la base histórica. La política vigente y sus coberturas figuran en [Estado actual](ESTADO_ACTUAL.md).

La base auditada es `c365e1e6f236ab76d17b46cbd8fe1ec9eace8831`, que integra el PR #79. Esta etapa conserva los intervalos actuales y hace visibles sus límites. Adoptar lunes a domingo en Inicio e Historial requiere aprobación explícita porque cambia los días incluidos en el resumen semanal de Historial.

## Política implementada en la base

| Superficie | Intervalo y referencia | Zona horaria y corte | Consecuencia visible |
| --- | --- | --- | --- |
| Inicio, navegación semanal | Domingo a sábado alrededor del día seleccionado. Las flechas avanzan siete días con límites en el historial disponible y hoy. | Fecha civil del dispositivo. `parseISO` y `addDays` conservan las fechas locales. | El 17 de noviembre de 2026 se ubica en 15–21 nov. El marcador y las escrituras corresponden al día seleccionado, no a la suma de esa semana. |
| Inicio, calendario mensual | Mes calendario con filas de domingo a sábado. Puede mostrar días contiguos de otro mes. | Misma fecha civil y límites de selección que Inicio. | Cambiar de mes o explorar el calendario no convierte los días de relleno en parte del resumen mensual. |
| Historial, vista semanal | Domingo a sábado alrededor del día explorado. Las flechas avanzan siete días. Home y End apuntan al domingo y sábado de la fila. | Fecha civil local. El resumen excluye fechas posteriores a hoy. | Los límites 15–21 nov son intencionales en el código actual. El 17 sólo transcurrieron tres fechas del intervalo, y el denominador incluye los días transcurridos con datos energéticos. |
| Historial, mes y año | Mes calendario y año calendario del ancla explorada. La grilla mensual mantiene filas de domingo a sábado. | Mismo corte local en hoy. Agua o peso pueden acreditar actividad sin contar como datos energéticos. | El promedio se calcula sólo sobre los días con comida, ejercicio o pasos. Si incluye días energéticos sin comidas, se presenta como provisional. |
| Datos, Semana | Lunes a domingo de hoy. | Primero se resuelve `today` en la fecha local del dispositivo. Luego se construyen y recorren las fechas en UTC para operar sobre sus etiquetas sin desplazarlas por el huso o el horario de verano. Los agregados excluyen fechas posteriores a `today`. | El 17 de noviembre de 2026 muestra 16–22 nov. Las siete barras corresponden a las siete fechas, incluidas las futuras sin datos agregados. |
| Datos, Mes | Mes calendario de hoy. Barras agrupadas en 1–7, 8–14, 15–21, 22–28 y el resto del mes. | Misma aritmética de fechas y corte que Datos semanal. | Son bloques de siete fechas desde el día 1. Pueden empezar cualquier día de semana. La presentación de esta etapa identifica sus fechas reales. |
| Datos, Año | Año calendario de hoy, con doce meses como barras. | Misma aritmética y corte. | El resumen usa los registros hasta hoy. Las barras mensuales son promedios diarios con sus propias coberturas, no totales mensuales. |
| Observaciones de hábitos | Ventana móvil inclusiva de siete días terminada en hoy. El período anterior son los siete días inmediatamente precedentes. | `coachDates` recibe una fecha local ya resuelta y usa mediodía UTC para construir las etiquetas. | El 17 de noviembre abarca 11–17 nov y se compara con 4–10 nov. Una unificación de semanas de calendario no debe desplazar estas ventanas. |
| Objetivos | Fechas inicial y final expresamente aceptadas, ambas inclusivas. | Se evalúan por etiquetas de fecha. El avance transcurrido se corta en hoy. | Un objetivo puede empezar cualquier día. Sus fechas y su duración se conservan en una eventual migración del calendario. |

Fuentes del producto verificadas en esta base son [homeDateNavigation.ts](../src/utils/homeDateNavigation.ts), [WeeklyDateNav.tsx](../src/components/WeeklyDateNav.tsx), [Heatmap.tsx](../src/components/Heatmap.tsx), [historyPeriods.ts](../src/utils/historyPeriods.ts), [historyPresentation.ts](../src/utils/historyPresentation.ts), [chartStats.ts](../src/utils/chartStats.ts), [coachDates.ts](../src/utils/coachDates.ts) y [coachGoals.ts](../src/utils/coachGoals.ts).

La diferencia semanal procede de dos convenciones explícitas del código. Compartir el mismo intervalo no hará iguales todos los promedios. Historial incluye cada día con datos energéticos en su balance promedio. Datos restringe su balance y consumo promedio a días con comidas, mientras el gasto promedio usa todos los días energéticos. Incluso con idénticos límites pueden representar poblaciones diferentes.

## Comparación actual con el período anterior

Datos busca el día anterior al comienzo del intervalo actual y obtiene su semana, mes o año calendario completo. No alinea el día transcurrido del período anterior con el de hoy. Por ejemplo, al 17 de noviembre, Mes compara los registros del 1–17 de noviembre con los del 1–31 de octubre. La cabecera del período actual puede seguir mostrando el mes calendario 1–30 nov, porque el mismo gráfico conserva los bloques futuros.

El bloque de comparación sólo existe cuando ambos períodos tienen al menos dos días con comidas. La diferencia de consumo resta medias sobre sus respectivos días con comidas. La diferencia de gasto resta medias sobre sus respectivos días energéticos. La diferencia de balance resta los balances diarios medios sobre sus respectivos días con comidas. Las coberturas pueden ser distintas entre períodos y entre métricas. El redondeo existente también forma parte del resultado.

Un ejemplo sintético reproducido usa un perfil con TMB de 1.618 kcal. Octubre registra comidas por 1.600 kcal el día 1 y 2.400 kcal el día 31, más 5.000 pasos sin comidas el día 2. Noviembre registra comidas por 1.700 kcal el día 1 y 2.100 kcal el día 16, más 1.000 pasos sin comidas el día 17. Un registro futuro del 29 de noviembre se excluye.

| Métrica | Noviembre 1–17 | Octubre 1–31 | Diferencia mostrada |
| --- | --- | --- | --- |
| Consumo diario medio | 1.900 kcal, 2 días con comidas | 2.000 kcal, 2 días con comidas | −100 kcal/día |
| Gasto diario estimado medio | 1.631 kcal, 3 días energéticos | 1.685 kcal, 3 días energéticos | −54 kcal/día |
| Balance diario medio | +282 kcal, 2 días con comidas | +382 kcal, 2 días con comidas | −100 kcal/día |

Este ejemplo prueba tanto la inclusión del último día de octubre como la desigualdad entre `balance` y la resta de las dos medias visibles. Al quitar la comida del 31 de octubre, desaparece la comparación por cobertura insuficiente. Las diferencias no acreditan mejoría ni empeoramiento.

## Propuesta funcional pendiente de aprobación

La propuesta consiste en alinear las semanas de calendario de Inicio e Historial a lunes–domingo, manteniendo Datos como está. Abarcaría el orden de columnas y rótulos, los límites de las filas, Home/End, el ancla de navegación, las etiquetas y los integrantes del resumen semanal de Historial. Las fechas seleccionadas y los registros conservarían sus claves. Se necesitaría revisar también los estados de navegación guardados para conservar el día explorado al cambiar su fila.

Los meses y años continuarían siendo calendarios, con los mismos integrantes de sus resúmenes. Los bloques 1–7 del gráfico mensual, las ventanas móviles de hábitos y los períodos aceptados de objetivos conservarían su definición. El usuario debe aprobar el cambio del resumen semanal antes de implementar esta propuesta.

| Fecha de referencia | Inicio/Historial actuales | Propuesta lunes–domingo y Datos actual |
| --- | --- | --- |
| 17 nov 2026 | 15–21 nov 2026 | 16–22 nov 2026 |
| 1 nov 2026, domingo | 1–7 nov 2026 | 26 oct–1 nov 2026 |
| 1 ene 2027 | 27 dic 2026–2 ene 2027 | 28 dic 2026–3 ene 2027 |
| 29 feb 2024 | 25 feb–2 mar 2024 | 26 feb–3 mar 2024 |

El siguiente ejemplo usa siempre `aggregateEnergy` sin alterar su fórmula, pero le pasa los dos conjuntos de fechas para medir el impacto propuesto. Con TMB de 1.618 kcal, se registran 2.500 kcal el domingo 15, 2.000 kcal el lunes 16, 1.000 pasos sin comidas el martes 17 y 2.800 kcal el domingo 22.

| Corte de datos | Resumen actual 15–21 nov | Resumen propuesto 16–22 nov | Motivo |
| --- | --- | --- | --- |
| Martes 17 nov | 3 días energéticos, 4.500 kcal consumidas, 4.894 kcal de gasto, promedio −131 kcal/día | 2 días energéticos, 2.000 kcal consumidas, 3.276 kcal de gasto, promedio −638 kcal/día | El domingo 15 deja de pertenecer al intervalo. El 22 sigue siendo futuro y se excluye. |
| Domingo 22 nov | 3 días energéticos, promedio −131 kcal/día | 3 días energéticos, promedio −31 kcal/día | El intervalo propuesto reemplaza el domingo 15 por el 22. |

Estos resultados son una simulación de la decisión pendiente. La etapa 1 conserva los límites y los resultados actuales del producto.

## Evidencia de límites y zona horaria

Las [pruebas de política temporal](../tests/ux-stage1-week-policy.test.mjs) ejecutan las funciones reales del producto para los límites anteriores, la navegación de siete días, los grupos mensuales, las ventanas móviles y la comparación contra el mes previo. Los dos intervalos del ejemplo contrafáctico son entradas explícitas a la fórmula existente, sin activar una política alternativa.

También ejecutan la resolución de fechas en procesos con `TZ` de Buenos Aires, Los Ángeles, Madrid y Kiritimati. Para el instante `2026-11-16T01:00:00Z`, los dos primeros dispositivos están en el domingo 15 y los otros dos en el lunes 16. Datos conserva el día local recibido en cada caso, por lo que la diferencia de semana entre esos dispositivos es esperable. Las semanas locales que atraviesan los cambios de horario de verano de Los Ángeles conservan siete etiquetas únicas, sin fechas repetidas ni omitidas.

Estas pruebas cubren aritmética y presentación de fechas con datos sintéticos. La política lunes–domingo sigue pendiente de aprobación funcional.
