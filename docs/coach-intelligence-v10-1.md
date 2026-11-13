# Coach Intelligence V10.1

El PR #77 permanece abierto en Draft, sin merge ni cambios en Production. Las fuentes de este cierre son `f628fe450807473150211b812a326a7db50ac9f5`; los commits posteriores de evidencia no modifican la aplicación.

El Coach muestra una observación determinística al abrir, evidencia desplegable y una pregunta contextual iniciada por el usuario. Abrir, desplegar evidencia, cambiar registros o actualizar sugerencias no llama a Gemini.

## Cambios del cierre

- En móvil, las opciones siguen a la observación dentro del flujo de lectura. Se elimina el centrado vertical y el rótulo intermedio cuando ya hay una tarjeta, conservando los estados de carga y conversaciones pasadas.
- La separación tarjeta→sugerencias queda en **12 px**: antes era 62 px en 320/375 y 137,23 px en 393, en ambos temas. Desktop conserva 163,89 px antes y después.
- Cada acción nombra su tarea: «Completar mi registro», «Entender mi regularidad», «Revisar mi alimentación», «Organizar mis entrenamientos», «Elegir mi próximo entrenamiento», «Explorar mis pasos» o «Ver avance de pasos/entrenamientos». Un objetivo alcanzado ofrece «Sostener mi objetivo».
- Sin registros recientes se ofrece «Elegir mi próximo registro», sin asumir que nunca existieron registros antiguos; datos inconsistentes ofrecen «Revisar datos incompletos». Todas las acciones abren una pregunta pertinente, sin guardar datos automáticamente.

## Diagnóstico y reutilización

La base original es `742bd78` de main, con Historial 2.1. Se reutilizan `coachContext` (detalle de siete fechas locales y totales históricos acotados), `habitInsights` (cobertura y limitaciones), el cálculo de objetivos confirmados y las tarjetas conversacionales existentes. La apertura añade una sola observación, no otro dashboard.

La selección es determinística: calidad de datos, objetivo confirmado vigente, actividades distintas registradas, cobertura de alimentación, entrenamiento y pasos. Un día con registros puede estar incompleto; huecos de registro no demuestran ausencia de comida o actividad. No se deducen recuperación, carga física ni resultados corporales.

No se modifican RLS, persistencia transaccional, cuotas, esquema, pagos, notificaciones ni planes persistentes. No se reabrieron auditorías cerradas; sus pruebas existentes forman parte de la regresión completa.

## Selección y evidencia: comprobación automatizada

`tests/coach-proactive-flow.test.mjs` conecta **clic React real → generateAIResponse/requestAI reales → HTTP local → handler real**. Solo el store, el recurso de objetivos y los servicios externos usan fixtures.

Sus cuatro recorridos verifican:

- El backend recibe exactamente el identificador y la pregunta de la observación mostrada; el cliente no envía un objeto de evidencia como autoridad.
- Una referencia anterior y agregados manipulados no reemplazan la evidencia actual recalculada.
- El progreso de objetivos procede de actividad del propietario autenticado: el caso muestra dos sesiones en UI y una oficial en backend, y conserva el valor oficial. Cambiar de cuenta descarta conversación y referencia anteriores.
- Una desconexión muestra un error honesto, sin reintento automático, cuota reservada ni escritura.

Las once pruebas de `coach-proactive-chat.test.mjs` conservan los casos de validación, evidencia actualizada, objetivos no disponibles y propuestas inesperadas. El probe del artefacto compilado añade selección y recalculación proactivas sin TypeScript nativo. Los tests del motor cubren también doce combinaciones de acciones contextuales.

Auth, cuota y Gemini de estas pruebas son simulados. Verifican el contrato y la evidencia enviada, no la obediencia de una IA real.

## Regresión Linux y calidad

El gate final de las fuentes `f628fe4` pasó **654/654 pruebas completas sobre 52 archivos y 14/14 del ensayo específico**, sin fallos, omisiones, cancelaciones ni pendientes. TypeScript de frontend/IA/objetivos, lint, build y diff check terminaron con código cero. Quedaron doce advertencias preexistentes de lint y ningún recurso temporal de PostgreSQL. [Run 43477100255](https://github.com/MateoLitrenta/calori-tracker/actions/runs/43477100255) · [resultado completo](evidence/v10-1/linux-ci-final.json) · [artefacto](https://github.com/MateoLitrenta/calori-tracker/actions/runs/43477100255/artifacts/14064316452).

El gate existente usa Ubuntu 24.04, Node 24.4.1, PostgreSQL 17.5 y PostgREST 16.5. Descubre todos los archivos de prueba actuales, conserva el manifest histórico y falla ante cualquier prueba omitida. Ahora también se activa para cambios de src, API, servidor, scripts y configuración.

El job histórico restringido al PR #71 no aplica a este PR; el gate actual ejecutó la suite completa sin omitir pruebas. El commit posterior de documentación y capturas no cambia las fuentes validadas ni requiere una nueva ejecución de la suite.

Los bloqueos del intento Windows inicial se resuelven verificando los runtimes compatibles en Linux, sin excluir archivos o subtests nativos. No se presenta una ejecución incompleta como verde.

## Capturas y evaluación sintética

El baseline de este ajuste es `e8c16fc`, la versión anterior del propio PR. [La evidencia de la revisión final](evidence/v10-1/review-2/README.md) conserva **41 PNG y 29/29 comprobaciones**: claro/oscuro, móvil de 320/375/393 y desktop de 1440; además responsive de 768/1920, evidencia completa, cierre, compositor, cambio de cuenta, actualización de sugerencias y reapertura del chat.

Las seis comparativas móviles y las dos de desktop se recapturaron con el markup final. El harness ejecuta Tailwind desde el árbol de fuentes seleccionado para que la compilación del baseline no dependa de las clases de la versión candidata.

- Móvil claro: [antes](evidence/v10-1/review-2/before-sufficient-light-393.png) · [después](evidence/v10-1/review-2/after-sufficient-light-393.png).
- Móvil oscuro: [antes](evidence/v10-1/review-2/before-sufficient-dark-393.png) · [después](evidence/v10-1/review-2/after-sufficient-dark-393.png).
- Desktop claro: [antes](evidence/v10-1/review-2/before-sufficient-light-1440.png) · [después](evidence/v10-1/review-2/after-sufficient-light-1440.png).
- Desktop oscuro: [antes](evidence/v10-1/review-2/before-sufficient-dark-1440.png) · [después](evidence/v10-1/review-2/after-sufficient-dark-1440.png).

La evaluación determinística pasó **8/8 escenarios**: cuenta nueva, información incompleta, suficiente, regularidad variable, fútbol y gimnasio, objetivos confirmados, datos inconsistentes y otra cuenta con pasos. La rúbrica comprueba observación compacta, acción específica, evidencia y límite explícito; no sustituye una investigación con usuarios.

En 1.000 iteraciones, el motor local registró p50 0,101 ms y p95 0,187 ms. Los tiempos de apertura y respuesta del harness se conservan por caso en el JSON; incluyen bundle de desarrollo y respuesta simulada, y no representan latencia de Gemini o Production. Son cero pasos para recibir la observación y un toque para abrir evidencia o iniciar su pregunta.

## Preview y límite de configuración

La [Preview actualizada](https://calori-tracker-nww3cmdat-mateolitrenta-gmailcoms-projects.vercel.app/app) está READY desde `f628fe4`. Se verificaron HTML, JavaScript, CSS y el bundle de Coach con HTTP 200; el artefacto contiene las acciones nuevas y las reglas móviles compactas. [Comprobación estática](evidence/v10-1/review-2/preview.json).

**El usuario confirmó que faltan variables para Gemini y el Coach completo en Preview.** No se inspeccionaron ni modificaron variables remotas, no se copiaron valores de Production y no se intentó certificar Gemini real allí. READY y los recursos estáticos no certifican la conversación autenticada, objetivos, acciones ni cuotas remotas.

## Impacto y costo estimado

Apertura, evidencia y sugerencias: **0 llamadas adicionales a Gemini y USD 0 de modelo**. Conversar usa el envío existente: una llamada por envío en los casos sintéticos proactivos, sin precarga ni llamada adicional para redactar la tarjeta. Se conservan las cuotas existentes.

Con la misma pregunta de fútbol/gimnasio, el prompt base ocupa 33.532 caracteres y el contextual 36.701: +3.169 (+9,45 %). Con el supuesto presupuestario de 3–4 caracteres por token, son aproximadamente 792–1.056 tokens adicionales de entrada, no tokens facturados medidos.

La [tarifa estándar publicada de Gemini 2.5 Flash](https://aistudio.google.com/docs/pricing#gemini-2.5-flash), consultada el 13 de noviembre de 2026, es USD 0,30/M de entrada y USD 2,50/M de salida, incluido pensamiento. Bajo ese supuesto, el contexto extra cuesta aproximadamente USD 0,00024–0,00032 por envío, o USD 0,24–0,32 por mil. Cien conversaciones nuevas con este prompt y 500 tokens totales de salida costarían aproximadamente USD 0,40–0,49. No se verificó el modelo configurado ni la facturación real.

La fuente advierte un cambio de ruta/tarifa para `gemini-2.5-flash` desde el 1 de diciembre de 2026. Esta iteración no migra el modelo; las estimaciones deberán revalidarse frente al modelo y los tokens reales de la comprobación autorizada.

## Pruebas posteriores al despliegue

**IA real: PENDIENTE.** Solo después de aprobación del PR, merge y despliegue se hará la [comprobación funcional controlada](coach-intelligence-v10-1-post-deploy.md), con una cuenta autorizada y la configuración funcional existente de Production.

Quedan para ese recorrido la conversación y explicación reales con Gemini, objetivos confirmados y progreso persistido, propuesta/confirmación de acciones, contabilización de cuotas, errores y monitoreo de latencia/llamadas/tokens. Los fallos que no se observen en ese entorno seguirán marcados como pendientes o simulados; no se provocarán caídas ni agotamientos de cuota. No hay autorización actual para merge o acciones de Production.

Persisten los límites de datos incompletos, listas recortadas, prioridad de una sola observación y dispositivos físicos/accesibilidad asistida no probados. En pantallas de poca altura, leer todos los límites puede requerir scroll dentro de la tarjeta. No se afirma ausencia total de alucinaciones, certificación del modelo ni superioridad medida frente a CAL AI.
