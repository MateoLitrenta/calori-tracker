# Coach: conservar una propuesta pendiente al cambiar de sección

Fecha: 25 de noviembre de 2026. Base: `79ce7d58da24e2df50f0124cdf27033b3a9eece4`, merge del PR #97.

## Hallazgo y criterio de aceptación

En el video de revisión, la propuesta de comida aparece aproximadamente a los 16,5 segundos y sigue presente a los 18,3. La persona abre Inicio entre los 18,8 y 19,2 segundos. Al volver a Coach, alrededor de los 19,7 segundos, el mensaje permanece pero la tarjeta ya no aparece; tampoco está al final de la conversación cerca de los 22,2 segundos. El video no muestra un código de versión verificable. No se incluyen el video personal ni sus fotogramas en el repositorio.

La propuesta debe conservarse al recorrer Inicio, Datos o Perfil y regresar a Coach. Editar mantiene el borrador pendiente; la persona termina confirmando o cancelando. Un fallo de guardado permite reintentar con los mismos valores. La navegación no confirma ni cancela implícitamente.

## Causa y solución

`App` desmonta la vista anterior al cambiar de sección. `UserChat` mantenía la propuesta, el modo edición, los IDs de las entradas y el bloqueo de confirmación en estado local. Solo los mensajes se recuperaban del historial. Además, el resultado de un guardado se descartaba cuando su componente ya estaba desmontado.

`CoachConversationStore`, propiedad de `AppStoreProvider`, conserva una conversación por cuenta y fecha durante la sesión abierta. La propuesta incluye su base original, IDs estables y selección explícita de registros repetidos. La vista se suscribe mediante `useSyncExternalStore`; sus efectos de cámara, micrófono, foco y viewport siguen desmontándose al salir.

El bloqueo de operación es sincrónico y compartido entre montajes. Un acuse añade un único recibo con procedencia y retira la propuesta; un fallo conserva la edición y la intención. Los mensajes se guardan en el historial aunque no haya una vista de Coach montada. Un cambio de identidad invalida las conversaciones anteriores, incluidas las respuestas tardías de una sesión anterior de la misma cuenta.

La respuesta de IA puede terminar mientras se está en otra sección. Al volver, se recupera el resultado sin reenviar la consulta. Los objetivos comparten el mismo ciclo de vida; si se vuelve antes de terminar una confirmación, la vista actual actualiza la lista al recibir el resultado. El anclaje de lectura se calcula desde el lector visible antes de mostrar mensajes nuevos, incluso cuando la petición se inició en un montaje anterior.

## Regresiones verificadas

Las pruebas de navegación usan React, `App`, el store, los eventos y el desmontaje reales dentro de JSDOM. Auth, IA y persistencia remota usan datos y respuestas sintéticos. El bloqueo de las escrituras permite controlar si se vuelve antes o después del acuse.

| Caso | Criterio comprobado |
| --- | --- |
| Propuesta → Inicio / Perfil / Datos → Coach | Misma tarjeta; una sola consulta IA y cero escrituras. |
| Editar comida y ejercicio | Se conservan nombre/actividad, tipo, calorías, hora, duración, distancia, ritmo y detalles multilínea. |
| Campos obligatorios vacíos | Se conservan los valores incompletos y el modo edición; se valida al confirmar. |
| Cancelar después de volver | La tarjeta no reaparece y no se escriben registros. |
| Volver antes del acuse | Se conserva «Confirmando», los campos quedan protegidos y no se admite una segunda escritura. |
| Acuse con Coach desmontado | Se retira la propuesta y queda un solo recibo con el ID de la entrada. |
| Repetición después del acuse | La procedencia identifica el registro ya guardado y exige elegir explícitamente otra entrada igual. |
| Fallo fuera de Coach | Se conserva el borrador; el reintento reutiliza el ID de entrada. |
| Respuesta IA tardía | Completa la conversación mientras está desmontada, sin guardar la propuesta ni repetir IA. |
| Cambio de cuenta o sesión | Ninguna propuesta ni respuesta tardía se publica en otra cuenta o en una sesión nueva. |
| Propuesta de hoy para una fecha pasada | Conserva la fecha objetivo original al navegar y confirmar. |
| Medianoche e historial | El borrador anterior permanece con su fecha y valores; se presenta en solo lectura y puede cancelarse. |
| Objetivo confirmado desde un montaje anterior | La vista actual actualiza objetivos y muestra el recibo una sola vez. |
| Punto de lectura tras regresar | Un mensaje tardío respeta a la persona que está leyendo más arriba. |
| Regresión del teclado del PR #97 | Se conserva el campo, el valor y el cursor con la geometría de teclado simulada. |

Comandos locales:

```bash
node --test tests/coach-viewport.test.mjs tests/coach-store-sync.test.mjs tests/chat-view.test.mjs tests/coach-proactive-flow.test.mjs tests/public-entry.test.mjs tests/reset-data.test.mjs tests/record-feedback.test.mjs tests/product-readiness.test.mjs
npm run lint
npm run build
git diff --check
```

Resultado local: **140/140 pruebas focalizadas**, sin omisiones. TypeScript de la aplicación, build y `git diff --check` aprobados. Lint conserva las diez advertencias de la base y Vite informa el bundle principal mayor de 500 kB.

La CI del PR debe aprobar sobre el mismo SHA de la Preview. Los enlaces al commit, la ejecución y el despliegue se publican en el PR junto con sus resultados finales.

## Alcance y límites

La conservación de propuestas cubre la navegación interna durante la sesión abierta. La recarga completa del navegador, el cierre de la pestaña o el cierre de sesión conservan el historial de mensajes existente, pero no rehidratan propuestas pendientes ni operaciones en curso. No se introduce una cola de escrituras automática ni persistencia de borradores entre dispositivos.

Las conversaciones anteriores siguen siendo de solo lectura: una propuesta no se traslada al día siguiente ni se cambia su fecha objetivo. Si queda pendiente, el historial lo explica y evita ofrecer una confirmación que el guardado rechazaría. Un resultado incierto no se describe como un registro que seguramente no se guardó.

La comprobación automatizada no certifica Safari físico, sus barras, el teclado nativo ni Gemini real. No se presenta una matriz visual de navegador nueva. La revisión del usuario en iPhone corresponde al candidato publicado a continuación.

## Recorrido de revisión en iPhone

1. Abrir la Preview y comprobar en Perfil el código de versión indicado en el PR.
2. Pedir una propuesta de comida. Sin confirmarla, ir a Inicio, volver a Coach, ir a Datos y luego a Perfil, y regresar. Debe seguir la misma tarjeta.
3. Tocar Editar, cambiar nombre y calorías y escribir dos líneas de detalles. Cerrar el teclado, ir a otra sección y volver: deben conservarse los campos y el modo edición. Repetir dejando calorías momentáneamente vacías.
4. Completar la propuesta y confirmar una sola vez. Si se sale mientras guarda, al volver debe aparecer el recibo o la confirmación en curso. Un fallo debe conservar la tarjeta para reintentar.
5. Pedir otra propuesta, editar y cancelar. Al salir y regresar no debe reaparecer ni haberse agregado al registro diario.
6. Repetir con ejercicio y comprobar que abrir el teclado en Calorías o Detalles mantiene el arreglo del PR #97.

Para aprobar: propuesta y borrador permanecen al navegar, no hay guardado implícito ni duplicados, el recibo corresponde a los valores confirmados y los errores conservan el trabajo pendiente.
