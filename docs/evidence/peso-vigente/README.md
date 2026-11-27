# Peso vigente y estimaciones por fecha

Perfil muestra una sola lectura de peso y, cuando proviene de una medición, la fecha del registro. El peso base guardado en el perfil cubre los días para los que aún no hay una medición aplicable.

## Resolución por fecha

Para una fecha consultada, se toma la última medición válida de ese día o anterior. Se usa el día de calendario guardado en `dateStr`. La fecha de modificación, el día seleccionado en Inicio y los pesos inválidos quedan fuera de la resolución del peso vigente. Las mediciones futuras se excluyen del cálculo de hoy. La búsqueda usa todo el historial cargado, incluidas mediciones anteriores al período que se está resumiendo.

Con un peso base de 77 kg y una medición de 80 kg el 26 de noviembre, Perfil muestra 80 kg. Si es la primera medición, la TMB de las fechas anteriores al 26 sigue usando 77 kg y la del 26 en adelante aumenta 30 kcal, hasta la próxima medición. Inicio, Datos, Historial, el contexto del Coach y cada nueva estimación de ejercicio usan la misma política. El ejercicio utiliza la fecha del formulario. Las series de mediciones del Coach siguen indicando solo pesos registrados en cada día.

## Ediciones y retiros

- Una corrección histórica puede cambiar las estimaciones desde la fecha corregida hasta la siguiente medición. Las fechas previas conservan su peso aplicable.
- Si se retira una medición, su intervalo toma la medición anterior o el peso base según corresponda.
- «Editar perfil» permite corregir el peso base. El cambio afecta solo los días anteriores a la primera medición disponible. Si todavía no hay mediciones, aplica a todos los días. Para actualizar la lectura con una nueva medición se usa el registro de Inicio.
- La política recalcula estimaciones derivadas. Se conservan las comidas, los pasos y las calorías de ejercicios ya guardadas. Se usan las escrituras existentes para editar Perfil y registrar mediciones. La resolución no agrega escrituras, tablas ni migraciones.

## Evidencia

[Recorrido sintético y versiones comparadas](visual.md). Las pruebas focalizadas cubren selección temporal, fechas inválidas y futuras, alta, edición, retiro de snapshots, recarga, cambio de cuenta, agregaciones y estimación de ejercicio con una respuesta simulada. El registro diario actual permite alta y edición. El retiro individual se verifica con un snapshot actualizado.
