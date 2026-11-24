# Estado actual de Calori

## Auditoría del 24 de noviembre de 2026 · Etapa 1 en revisión

La rama parte del merge del PR #91. Inicio, Historial y Datos comparten la semana calendario de lunes a domingo. Las grillas mensuales y Home/End siguen ese mismo orden. Explorar una fecha conserva el día editable hasta abrir sus registros.

Con el ejemplo de la auditoría, el domingo 22 pertenece a la semana del 16 al 22 (−686 kcal) y el lunes 23 a la del 23 al 29 (+734 kcal). Las comparaciones mantienen sus bases: Historial incluye días con actividad energética aunque falten comidas; Datos calcula el balance sobre días con comidas. Los grupos internos de Datos mensual siguen siendo bloques del mes. Las ventanas móviles y los objetivos fechados conservan sus límites.

El resumen de estimación lee las calorías vigentes del formulario. Ante un ajuste, la estimación original queda como referencia secundaria. Una fecha futura se identifica como tal y sus registros quedan fuera de los promedios. Los ceros calculados siguen visibles.

[Comparativas y validación](evidence/coherencia-noviembre/README.md)
