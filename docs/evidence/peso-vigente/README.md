# Peso vigente en Perfil

La rama parte del merge de #105, `a579065571584535408dd89b092de6619b520e27`. Perfil ahora muestra el último peso medido junto con su fecha. Si se guardó un peso base de 77 kg y se registró una medición válida de 80 kg el 26 de noviembre, la lectura muestra 80 kg y el peso base sigue identificado.

## Fechas y actualización

La selección usa el día de calendario del registro, `dateStr`, elige la fecha más reciente hasta hoy y acepta cantidades finitas y positivas. Las fechas futuras o imposibles y los valores inválidos quedan fuera. La búsqueda recorre el historial disponible aunque una medición esté fuera del rango habitual de Inicio. La fecha se presenta en el calendario local, incluso si la referencia `Date` del registro se construyó en UTC.

Perfil obtiene el dato del conjunto de registros activo. Un alta, edición o retiro en ese conjunto se refleja en la próxima actualización. Al retirar la medición vigente, se muestra la anterior. Cuando el conjunto queda sin mediciones válidas, se muestra el peso base guardado en Perfil, inicialmente cargado durante el alta y editable desde «Editar perfil».

## Política de estimaciones

El peso vigente es una lectura de las mediciones. La TMB y las estimaciones conservan el peso base editable del perfil. Hoy los cálculos de Inicio, Datos, Historial y Coach usan ese campo, también al leer días anteriores. Una sustitución automática de 77 por 80 kg cambiaría en 30 kcal por día la TMB y los gastos que dependen de ella. Por eso la medición nueva no se escribe en el campo base ni se transmite como nueva referencia de esos cálculos. El formulario aclara que una edición deliberada del peso base recalcula estimaciones, incluso históricas, como ya ocurría.

La sincronización de esta versión es de presentación. Usar mediciones fechadas para estimaciones de cada día requiere acordar una política para los días sin medición y para preservación de históricos.

## Verificación

[Capturas, recorrido con datos sintéticos y resultados](visual.md)

Los casos automatizados cubren orden por fecha de calendario, mediciones anteriores, fechas futuras o inválidas, edición, retiro, fallback y el valor del campo base al editar Perfil. El retiro individual se simula con un snapshot de registros actualizado. El control existente de Gestión de datos conserva su confirmación.
