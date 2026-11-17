# Refinamiento UX/UI · Etapa 1

La base verificada es `c365e1e6f236ab76d17b46cbd8fe1ec9eace8831`, último main al iniciar el trabajo e integración del PR #79. La copia local estaba limpia. Esta entrega trabaja en `codex/ux-stage1-dates-metrics-charts`.

El pedido acota esta etapa a UX-01, UX-02, UX-03, UX-04, UX-13 y UX-15. La auditoría del 17 de noviembre se utilizó como referencia. Las evidencias publicadas proceden de cuentas, registros y servicios sintéticos.

## Semanas y magnitudes

Inicio e Historial mantienen domingo a sábado. Datos usa lunes a domingo. Los grupos mensuales de Datos comienzan el día 1 y avanzan de siete en siete. Las ventanas móviles y los objetivos aceptados tienen límites propios. La [política semanal y propuesta pendiente](ux-stage1-week-policy.md) documenta la zona horaria, los límites, los casos de prueba y el efecto numérico de adoptar lunes a domingo.

Esta propuesta requiere una decisión explícita. En el ejemplo sintético al 17 de noviembre, Historial abarca 15–21 y promedia tres días energéticos en −131 kcal/día. Con 16–22, los dos días disponibles producen −638 kcal/día. Las funciones de esta entrega conservan sus intervalos actuales.

Historial promedia el saldo de todos los días con datos energéticos. Cuando hay pasos o ejercicio sin comidas, indica que el promedio es provisional y expone cuántos días están en esa situación. Datos usa días con comidas para balance y consumo, y días con datos energéticos para gasto. La explicación próxima al resumen procede de esas coberturas.

## Cambios de presentación

| Hallazgo | Reproducción sintética | Corrección |
| --- | --- | --- |
| UX-01 | El 17 de noviembre, Inicio e Historial muestran 15–21 y Datos 16–22. También se prueban cruces de mes, año, año bisiesto y husos horarios. | Las convenciones se hacen explícitas en la interfaz y se documenta por separado la propuesta lunes a domingo. |
| UX-02 | Días con comidas y días sólo con pasos producen denominadores diferentes. | El resumen de Datos explica las bases y la posible diferencia al restar medias. Historial identifica los días energéticos sin comidas que vuelven provisional su promedio. |
| UX-03 | Año con actividad únicamente entre agosto y noviembre, comparado con un año vacío. | La primera entrada anual sitúa la ventana en actividad y nombra los meses con registros. Se mantienen doce meses accesibles, controles para explorar y posición estable al seleccionar o cambiar de tema. |
| UX-04 | Semana de siete fechas y mes con grupos 1–7, 8–14 y resto. | La vista semanal aprovecha el ancho y el mes muestra las fechas reales de cada grupo. Ausencia de registros y cero tienen representaciones distintas. |
| UX-13 | Día con comidas, día con actividad sin comidas y día vacío. | El saldo conserva la firma Fitness Moderno con una escala visual moderada. Consumo y gasto tienen mayor tamaño y una comparación en kcal identificada. La nota visible aclara que pueden faltar registros incluso con comidas. |
| UX-15 | Período actual en curso frente al anterior calendario completo, con distinta cobertura. | La comparación muestra ambos intervalos, su corte efectivo, los días de cada base y diferencias con signo y unidades. |

## Validación y evidencia

El [índice de evidencia](evidence/ux-stage1/README.md) vincula reproducción, capturas comparables, verificaciones numéricas y resultados por hallazgo. Los escenarios usan las vistas del producto con servicios sintéticos y la misma fecha para referencia y candidato.

La CI Linux del PR debe corresponder al HEAD final publicado. Su artefacto conserva el manifiesto completo, resultados, versiones de PostgreSQL y PostgREST locales, TypeScript de frontend y API, lint y build. El enlace al run definitivo y la Preview figuran en el PR.

La comparación de Datos verifica 18 combinaciones: seis contextos (incluida una segunda cuenta) por tres períodos. Compara tanto el resultado completo de `buildChartStats` como los importes de resumen, comparación y detalle que muestra la interfaz anterior y nueva. Se conserva la paridad numérica en los seis contextos; los nuevos rótulos de fecha y cobertura se verifican por separado.

La revisión estática confirma que no hay modificaciones en API, servidor, Supabase, hooks de persistencia, workflows ni `vercel.json`. El único cambio en la utilidad de estadísticas expone las fechas y el resumen anterior que la función ya calculaba. Los servicios del navegador son simulados; las pruebas Linux ejercitan PostgreSQL y PostgREST locales desechables.

## Límites y siguiente decisión

La adopción de lunes a domingo en Inicio e Historial requiere aprobación explícita del cambio de períodos. Las cifras de esta etapa corresponden a las políticas actuales.

La evidencia del navegador usa Chromium, tamaños de viewport y apariencias emulados. La prueba de ampliación de texto identifica su método en el informe. Safari/iOS, teclado nativo, lectores de pantalla y servicios remotos reales requieren una validación específica. Esta entrega cubre la etapa 1 de la auditoría.

La revisión de texto al 200% detectó que las etiquetas de los botones de hábitos `+250` y `+500` exceden sus cajas en la versión anterior y en la nueva. Se conserva esa evidencia como problema pendiente de los controles de hábitos; esta etapa no modifica esos controles ni declara una certificación de accesibilidad de toda la aplicación.
