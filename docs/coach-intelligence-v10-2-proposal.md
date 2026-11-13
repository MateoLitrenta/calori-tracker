# V10.2 — Planificación inteligente: propuesta para aprobación

Estado: propuesta de alcance; sin implementación ni autorización de merge, despliegue o cambios de configuración. La referencia de capacidades existentes es main `44c79e85654408557037be4304a27aa2f26c5fbf`.

## Resultado buscado

Pasar de una observación útil a una propuesta breve para organizar los próximos siete días. El usuario debería poder expresar su disponibilidad, recibir hasta tres prioridades y ajustar la propuesta con sus registros actuales. La interfaz sigue siendo una conversación con una vista compacta, sin añadir un dashboard.

El MVP organiza intenciones. No incorpora todavía un sistema de planes activos persistidos entre días y dispositivos.

## Alcance prioritario

1. **Preparar una propuesta.** Desde la observación o una consulta explícita, ofrecer «Organizar mis próximos 7 días». Elegir el objetivo pertinente del perfil o de los compromisos confirmados y solicitar solo las restricciones que falten para esa petición.
2. **Distribuir sin inventar.** Mostrar hasta tres prioridades y, si sirve a la solicitud, bloques propuestos por fecha dentro de siete días. Ejercicio, pasos y organización alimentaria o hábitos pueden compartir una sola respuesta. Evitar listas extensas, varias tarjetas equivalentes y una llamada de IA por área.
3. **Revisar con evidencia actual.** Recalcular cobertura, progreso oficial y vigencia del período. Si cambió una condición relevante, indicar «La propuesta requiere revisión» y permitir una actualización explícita. No regenerar ni reorganizar automáticamente al abrir.
4. **Convertir solo compromisos compatibles.** Si el usuario pide establecer un objetivo de sesiones o días con un umbral de pasos, preparar la propuesta existente y exigir su confirmación. Una recomendación alimentaria permanece identificada como sugerencia.

## Información conocida y desconocida

Los registros muestran lo que fue anotado y los objetivos aceptados expresan compromisos guardados. Ninguna de esas fuentes prueba disponibilidad futura, recurrencia semanal, experiencia, equipamiento, preferencias o restricciones alimentarias.

Para organizar ejercicio se necesitan los días o momentos disponibles, el tiempo aproximado y los compromisos futuros que el usuario quiera conservar. Para alimentación se preguntan las preferencias o restricciones relevantes a su petición. Si falta un dato indispensable, se pide; si no es indispensable, se mantiene como desconocido y se ofrece una alternativa general.

La recogida de esos datos debe usar campos o preguntas breves antes de generar, sin una llamada dedicada solo a detectar qué falta. Las restricciones acordadas para el borrador se conservan explícitas al ajustarlo; no se reconstruyen desde respuestas anteriores del Coach ni se convierten en preferencias persistidas sin autorización.

Un registro de fútbol y otro de gimnasio no autorizan a programarlos todos los miércoles y viernes. Si el usuario declara que jugará el miércoles, esa fecha puede incluirse como intención futura, sin convertirla en actividad realizada.

## Tres estados separados

- **Propuesta de plan:** borrador de intenciones, con período, evidencia de origen, restricciones declaradas y alternativas. No guarda registros ni modifica objetivos.
- **Objetivo aceptado:** compromiso compatible con los tipos actuales, guardado únicamente mediante el botón de confirmación y el endpoint existente.
- **Registro realizado:** comida, entrenamiento u otro dato declarado con sus valores observables y guardado mediante el flujo de confirmación correspondiente.

Seguir o ajustar una propuesta no significa aceptar un objetivo. Aceptar un objetivo no registra una actividad. Un entrenamiento planificado no aumenta gasto energético ni autoriza un registro futuro. Los mensajes del Coach y un «sí» ambiguo no prueban aceptación.

## Adaptación determinística y uso de Gemini

El motor conserva las fechas del borrador y calcula cobertura, progreso oficial, días transcurridos y datos disponibles. Gemini organiza la propuesta y explica opciones; no reconstruye métricas ni decide que un hueco equivale a incumplimiento.

La evidencia de una propuesta debe incluir un período explícito y referencias a los valores relevantes, versiones de los objetivos y revisión de las restricciones declaradas. El backend la recalcula al generar o actualizar. El identificador de la observación seleccionada puede vincular la consulta con su origen, pero no debe sustituir la evidencia pertinente de todo el plan.

Ante registros o restricciones nuevos, cambio de fecha local o revisión de un objetivo, se comprueba si la propuesta sigue vigente. Si dejó de estarlo, se mantiene visible como borrador anterior y se ofrece actualizarlo. No se trasladan tareas pasadas, no se acumula ejercicio para «compensar» ausencias y no se cambian compromisos aceptados en silencio.

Un contrato acotado para la propuesta permitiría validar fechas, cantidad de prioridades y límites antes de mostrarla. El resultado de planificación no debe incluir acciones de registro; cualquier objetivo nuevo requiere una petición posterior explícita y su confirmación habitual.

## Reutilización de V10.1

Referencias verificadas en el commit indicado; los enlaces fijan las líneas de esa versión.

- [buildProactiveInsight](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/utils/coachProactive.ts#L44): observación de entrada, cobertura y limitaciones.
- [buildCoachContext](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/utils/coachContext.ts#L24): contexto acotado, siete fechas de detalle y totales históricos.
- [buildHabitInsights](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/utils/habitInsights.ts#L56): ventanas, denominadores y clasificaciones determinísticas.
- [evaluateCoachGoal](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/utils/coachGoals.ts#L58): progreso registrado y evidencia insuficiente, sin inferir incumplimiento.
- [readGoalActivity](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/server/coachGoals.ts#L41): actividad oficial del propietario autenticado para calcular progreso.
- [saveCoachGoal](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/server/coachGoals.ts#L83): guardado idempotente y actualización condicionada a la versión vigente.
- [recalculo de proactiveObservation](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/api/ai/chat.ts#L409): patrón para reconstruir evidencia en el backend en vez de confiar en un objeto del cliente.
- [ACTIONABLE_COACHING_INSTRUCTIONS](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/server/coachCoaching.ts#L1): restricciones explícitas, planes sin acciones y distinción de compromisos persistidos.
- [confirmActions](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/components/ChatView.tsx#L482) y [confirmGoal](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/components/ChatView.tsx#L509): confirmaciones separadas de recomendaciones.
- [findRecordedCoachAction](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/lib/coachActionReview.ts#L25): recibos de acciones confirmadas y revisión de duplicados.

## Persistencia y límites del MVP

La [conversación actual](https://github.com/MateoLitrenta/calori-tracker/blob/44c79e85654408557037be4304a27aa2f26c5fbf/src/components/ChatView.tsx#L187) se conserva localmente por cuenta y fecha. El MVP puede reutilizar ese historial para un borrador o snapshot versionado, dejando visible su período y procedencia. No debe presentarlo como un plan activo recuperable en otra cuenta, navegador o dispositivo.

Retomar un plan activo durante varios días y entre dispositivos sería una fase posterior. Requiere aprobar primero el significado de «activar», reemplazar, finalizar y cancelar un plan, su relación con los objetivos existentes y su almacenamiento. No se propone crear tablas, un calendario de cumplimiento o memoria persistente de preferencias en este MVP.

`workout_sessions` cuenta todas las sesiones, no solo las de una actividad. No puede prometer seguimiento específico de «tres sesiones de gimnasio» excluyendo fútbol. El borrador puede distinguir actividades declaradas; el objetivo persistido mantiene su semántica actual y debe explicarla.

La cobertura alimentaria no garantiza jornadas completas y no hay una tabla de macronutrientes para sostener nuevos objetivos de ese tipo. Las primeras propuestas pueden organizar opciones y hábitos declarados; no deben diagnosticar calidad nutricional, ingesta completa, recuperación o resultados físicos.

## Política de llamadas y costo

- Cero llamadas a Gemini al abrir, leer, comprobar vigencia, recalcular progreso o cambiar de cuenta.
- Una generación manual por propuesta o actualización explícita, dentro de la cuota de texto actual; sin agentes separados por alimentación, ejercicio y hábitos.
- Un contexto compacto con métricas pertinentes y restricciones declaradas, sin duplicar todo el historial ni ampliar ventanas por defecto.
- Resultado limitado y validado; una respuesta inválida no genera otra llamada automática de planificación.
- Releer el borrador local no invoca IA. No se usa una caché compartida entre usuarios ni un vencimiento que regenere contenido por sí solo.

No se propone cambiar cupos ni fijar una tarifa real a partir de caracteres. Antes de publicar se medirá el costo del modelo configurado y la cantidad efectiva de generaciones y actualizaciones, distinguiendo estimaciones de tokens facturados.

## Criterios de aceptación

- Una propuesta contiene como máximo tres prioridades y siete fechas locales, conserva las restricciones explícitas y nunca inventa disponibilidad o recurrencia.
- Sus cifras proceden de métricas oficiales; una lectura fallida o cobertura insuficiente conserva su límite.
- Generar, ajustar o leer el borrador no guarda actividad ni modifica un objetivo aceptado.
- Confirmar un objetivo o registro utiliza los endpoints y garantías existentes, sin mezclar ambos tipos de propuesta en un mismo envío.
- Una referencia anterior no puede reemplazar evidencia actual ni alterar versiones de objetivos; el cambio de cuenta elimina el contexto de la anterior.
- Abrir, leer y recalcular produce cero llamadas/reservas de IA; una actualización manual tiene una sola generación, sin llamadas por área.
- Un fallo mantiene identificado el borrador anterior y muestra el estado de la actualización, sin falsa promesa de guardado o éxito.
- La experiencia sigue siendo compacta y utilizable en móvil y desktop, con evidencia y detalles disponibles sin duplicar métricas.

## Escenarios de prueba

- Cuenta nueva: solicita los datos indispensables y no inventa experiencia ni hábitos.
- Alimentación incompleta o variable: reconoce cobertura; no prescribe compensaciones por comidas no registradas.
- Fútbol y gimnasio: conserva ambas actividades sin inferir un calendario futuro; respeta un compromiso futuro cuando fue declarado.
- Objetivo confirmado y posterior modificación/cancelación: usa la versión vigente y progreso oficial, sin restaurar valores anteriores.
- Datos cambiados y referencia anterior: marca la propuesta para revisar y solo genera otra al pulsar actualizar.
- Cambio de día y borrador vencido: conserva el período original; no mueve tareas ni fabrica incumplimiento.
- Dos cuentas y reapertura: borrador, restricciones, evidencia y conversación no cruzan identidades.
- Offline, cuota agotada y respuesta inválida: error honesto, sin reintento automático ni escrituras.
- Confirmación repetida: un registro realizado sigue siendo único; una intención futura o propuesta descartada no genera registros.

## Dependencias y fuera de alcance

Antes de apoyar nuevas interacciones de planificación en los objetivos, debe verificarse la corrección de los dos defectos recuperables encontrados en esta validación: interpretación de rangos naturales y cancelación cuando el modelo omite el objeto de propuesta. Los fixes están en una rama de trabajo; esta propuesta no los atribuye a Production ni autoriza desplegarlos.

Quedan fuera del MVP recurrencias persistidas, calendario externo, notificaciones, regeneración en segundo plano, seguimiento por actividad específica, nuevos tipos de objetivos alimentarios, macronutrientes, pagos y cambios de cuotas o RLS.

**Decisión solicitada:** aprobar o ajustar este alcance antes de implementar V10.2. Un plan activo persistente entre días/dispositivos requiere una decisión posterior independiente.
