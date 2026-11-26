# Estado actual de Calori

## 26 de noviembre de 2026 · Pulido de confirmación y calorías del Coach en revisión

Base: merge del PR #99, `21c2e90d9d1528d3af8a9389341b621164971b75`. El usuario aprobó la revisión real de nombres descriptivos en escritorio y pidió resolver los dos retoques registrados en el [issue #101](https://github.com/MateoLitrenta/calori-tracker/issues/101).

El candidato conserva una referencia de lectura antes de sustituir la propuesta por el recibo. Reserva únicamente el rango de desplazamiento que falta; el contenido nuevo y el desplazamiento hacia el inicio consumen ese espacio. Si la persona está leyendo mensajes anteriores, el guardado no la lleva al final. En una propuesta móvil que comienza fuera del lector, el recibo se sitúa dentro del área visible. La reserva pertenece a la vista montada, se libera al continuar la conversación y no altera datos ni persistencia. La entrada del recibo usa opacidad y respeta movimiento reducido.

Propuesta, recibo nuevo, lista, detalle y resumen de estimación usan el mismo formato de kcal en español argentino. Se conservan el valor numérico de los campos, los signos de cada contexto, las calorías almacenadas, la fecha y la categoría.

La reproducción y las comparativas usan App/React reales con datos y servicios sintéticos. Los resultados y límites se registran en [la evidencia de este bloque](evidence/coach-confirmation-polish/README.md). La Preview y la CI del candidato definitivo se identifican en el PR. Este bloque requiere revisión antes de merge y publicación en Production.

## 26 de noviembre de 2026 · Migración de Gemini y configuración común de Preview

El usuario solicitó cambiar el modelo a `gemini-3.5-flash-lite` en Preview y Production y habilitar la configuración de IA para las previews de todas las ramas del repositorio. El servidor resuelve un perfil explícito para Coach, estimación y transcripción, usa los parámetros compatibles del modelo y conserva los cupos y máximos de salida existentes. El lector de JSON excluye pensamientos y firmas; los logs identifican el modelo sin guardar conversaciones.

La configuración común de Preview utiliza las credenciales y cupos existentes. Las URLs anteriores no se actualizan: las ramas deben incorporar la migración y desplegarse de nuevo. Preview y Production siguen compartiendo datos y contadores de la cuenta. La protección de Vercel se conserva.

La migración se integró en el PR #100, merge `1023b0b3de1313c19fda181aa80ddfa9ca95ace5`. En su Preview se verificaron dos turnos reales de Coach y estimaciones de comida y ejercicio: cuatro respuestas HTTP 200 con `gemini-3.5-flash-lite` identificado en los logs. Se descartaron las propuestas y borradores de prueba sin guardar registros. Esta comprobación valida integración, no precisión nutricional ni las modalidades de foto y audio.

El PR #99 de nombres de comidas incorporó esta base y fue integrado tras la revisión real del usuario. La publicación efectiva y la evidencia de cada SHA se detallan en sus respectivos PR.

[Decisiones, fuentes oficiales, validación y recuperación](gemini-35-migration.md)

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

## Ajustes del 25 de noviembre integrados en el PR #96 · Coach y registros

La base es el merge del PR #95, `e76a468eb3f02a4ca30dfa4f92329df090088c19`. Coach recupera el espacio de navegación al abrir el teclado táctil. Las altas sugieren el tipo de comida según la hora local y respetan una elección manual. El detalle adapta su pie al tema y requiere confirmar la eliminación del registro identificado. El resumen y el recibo de comida conservan la categoría de la estimación original al reclasificar.

El cambio de los nombres genéricos de comidas creadas por Coach se integró en el PR #99. Liquid Glass corresponde a un bloque posterior.

[Comparativas, criterios y revisión en iPhone](evidence/iphone-noviembre/README.md)

## Seguimiento del 25 de noviembre integrado en el PR #97 · Editar una propuesta de Coach

Base: merge del PR #96, `c74bbe2656d041e2d82469b9a9163243f9b5895d`. El video posterior mostró que abrir el teclado directamente en la edición de una propuesta dejaba visible la navegación inferior y desplazaba el campo fuera del lector. La detección anterior solo reconocía el compositor de mensajes.

El candidato incluye los campos editables de la propuesta en la detección. Al escribir, recupera el espacio de navegación, compositor deshabilitado y observación; el lector desplaza únicamente lo necesario para mostrar el campo activo. La navegación vuelve cuando se cierra el teclado. Confirmar y Cancelar conservan el procesamiento mediante clic y la protección contra escrituras duplicadas.

Las regresiones de React y de viewport son sintéticas. Después del merge, el usuario confirmó en su revisión que el arreglo funciona. Esa aceptación corresponde al teclado de la propuesta, no a los cambios posteriores de persistencia al navegar.

[Causa, pruebas y recorrido de aceptación](evidence/coach-proposal-keyboard/README.md)

## Seguimiento del 25 de noviembre integrado en el PR #98 · Propuestas pendientes al navegar

Base: merge del PR #97, `79ce7d58da24e2df50f0124cdf27033b3a9eece4`. El video posterior muestra una tarjeta pendiente que desaparece al ir a Inicio y volver a Coach, mientras su mensaje permanece.

El candidato conserva la conversación, la propuesta, el modo edición y su intención de guardado en la sesión de la cuenta. Cambiar de sección permite retomar los valores, incluso cuando están incompletos. Confirmar espera el acuse; si falla, conserva el borrador y sus IDs. Cancelar retira la propuesta. Una respuesta o un guardado que termina fuera de Coach actualiza esa misma conversación sin repetir la petición. La vista que vuelve a montarse conserva el bloqueo de guardado y su propio punto de lectura.

El alcance es la navegación interna durante la sesión abierta. Una recarga completa o el cierre de sesión no recuperan propuestas pendientes. Las conversaciones anteriores mantienen su política de solo lectura y la fecha del registro no se cambia al llegar la medianoche.

[Causa, regresiones y recorrido de revisión](evidence/coach-pending-proposals/README.md)

## Bloque del 26 de noviembre integrado en el PR #99 · Nombres de comidas del Coach

Base inicial: merge del PR #98, `c4ed2f221121bec448e7aa08e161e4fa82c60bd5`; actualizada con el merge del PR #100, `1023b0b3de1313c19fda181aa80ddfa9ca95ace5`. El contrato de IA distingue el nombre de los alimentos de la categoría y conserva la descripción completa en detalles. Las propuestas nuevas con títulos genéricos recuperan un nombre compacto de su propia descripción. Si solo contienen notas, cantidades aisladas o supuestos, la propuesta conserva sus datos y abre la edición para completar el nombre.

La preparación del título se aplica una sola vez a la respuesta recibida. Los nombres editados por la persona se conservan en navegación, confirmación y reintentos. Los registros históricos respaldados por un recibo se reconocen antes de preparar títulos, manteniendo el aviso de ya registrado. El nombre confirmado es el mismo que llega a Inicio, Historial y la edición del registro.

Las pruebas automatizadas usan App/React y servicios sintéticos. La revisión posterior del usuario en la Preview `kqg68ox2h`, del HEAD `dd37bb20`, comprobó dos propuestas reales de comida, confirmación, recibos, Inicio y detalle con sus nombres y datos conservados. Esa grabación corresponde a escritorio y tema oscuro; no se extiende a edición manual del nombre ni a Safari en iPhone. El PR se integró en `main` como `21c2e90d9d1528d3af8a9389341b621164971b75` y Production quedó READY. El fixture reproducible conserva servicios sintéticos y red remota bloqueada.

[Decisiones, pruebas y recorrido de revisión](evidence/coach-meal-names/README.md)
