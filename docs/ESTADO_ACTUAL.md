# Estado actual de Calori

## Auditoría del 24 de noviembre de 2026 · Etapa 1 integrada en el PR #92

La rama parte del merge del PR #91. Inicio, Historial y Datos comparten la semana calendario de lunes a domingo. Las grillas mensuales y Home/End siguen ese mismo orden. Explorar una fecha conserva el día editable hasta abrir sus registros.

Con el ejemplo de la auditoría, el domingo 22 pertenece a la semana del 16 al 22 (−686 kcal) y el lunes 23 a la del 23 al 29 (+734 kcal). Las comparaciones mantienen sus bases: Historial incluye días con actividad energética aunque falten comidas; Datos calcula el balance sobre días con comidas. Los grupos internos de Datos mensual siguen siendo bloques del mes. Las ventanas móviles y los objetivos fechados conservan sus límites.

El resumen de estimación lee las calorías vigentes del formulario. Ante un ajuste, la estimación original queda como referencia secundaria. Una fecha futura se identifica como tal y sus registros quedan fuera de los promedios. Los ceros calculados siguen visibles.

[Comparativas y validación](evidence/coherencia-noviembre/README.md)

## Etapa 2 integrada en el PR #93 · Coach y Mis objetivos

La base es el merge `6842ae51e353c33386e261b1b4321c0766c7ef7e`. La conversación vacía agrupa la observación y preguntas complementarias junto al compositor. Las conversaciones existentes conservan su punto de lectura y los accesos plegables. Mis objetivos separa meta, período, avance registrado y acciones sujetas a confirmación.

[Comparativas y recorridos sintéticos](evidence/coach-noviembre/README.md)

## Etapa 3 integrada en el PR #94 · Datos e Historial

La rama parte de `5a6048c346ce4052a9b1df02078177f36e06551c`, el merge del PR #93. En Datos, el balance encabeza un resumen compacto con las bases de las medias visibles y la explicación dentro de «Cómo se calculan». Las barras muestran el detalle al activarlas. En Historial, el día consultado queda junto al calendario y los agregados tienen su propio bloque. El año presenta doce tarjetas con sus estados y unidades.

Las comparativas en Chrome con datos sintéticos cubren cuatro anchos, ambos temas, ampliación de texto, teclado, selección táctil emulada y la separación entre consultar y editar. La revisión en teléfono físico y con lector de pantalla queda pendiente.

[Mediciones, capturas y recorridos de la etapa 3](evidence/datos-noviembre/README.md)

## Etapa 4 integrada en el PR #95 · Perfil y formularios

La base es el merge del PR #94, `1fb0e34efd7a82bfd35913a462e77bb5de3f4cab`. Datos personales reúne la edición, el peso utilizado en estimaciones y la explicación del gasto. La foto tiene acciones independientes. Apariencia conserva el selector de tema y Gestión de datos requiere un despliegue explícito. Si falla el guardado personal, el formulario informa el error y conserva el borrador para reintentar.

Los formularios diarios de comida y ejercicio comparten el selector nativo de hora y la acción Ahora. Las comparativas usaron cuentas y registros sintéticos. La revisión en iPhone del 25 de noviembre identificó los ajustes registrados en el bloque siguiente.

[Comparativas, mediciones y recorrido de revisión](evidence/perfil-noviembre/README.md)

## Ajustes del 25 de noviembre en revisión · Coach y registros

La base es el merge del PR #95, `e76a468eb3f02a4ca30dfa4f92329df090088c19`. Coach recupera el espacio de navegación al abrir el teclado táctil. Las altas sugieren el tipo de comida según la hora local y respetan una elección manual. El detalle adapta su pie al tema y requiere confirmar la eliminación del registro identificado. El resumen y el recibo de comida conservan la categoría de la estimación original al reclasificar.

El cambio de los nombres genéricos de comidas creadas por Coach y Liquid Glass corresponden a bloques posteriores.

[Comparativas, criterios y revisión en iPhone](evidence/iphone-noviembre/README.md)
