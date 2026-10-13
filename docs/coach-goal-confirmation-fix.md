# Coach: confirmación de objetivos

Base: `main` actualizado (`14fac4e`), con PR #56 integrado. Rama: `codex/coach-goal-confirmation-fix`. Sin cambios de migración, esquema, variables remotas, límites ni pantallas.

## Causa verificada y límites de la investigación

Antes de esta corrección, el endpoint validaba `reply` y `actions`, pero `goalProposal` era opcional tanto en las instrucciones como en el contrato. El proveedor solo recibía `responseMimeType=application/json`, sin un esquema que obligara a incluir objetivos. Una respuesta con texto de propuesta y `actions=[]` pasaba como HTTP 200; si faltaba el objeto, no había ninguna propuesta confirmable. Un objeto inválido, o persistencia disabled/unavailable, también resultaban en una propuesta descartada sin corregir el texto que prometía confirmación.

Se reprodujo el primer caso contra el handler de `main`: Gemini simulado devolvió únicamente el texto de propuesta para la solicitud exacta reportada; el endpoint respondió sin `goalProposal`, y falló la nueva prueba al acceder a su target. Esa misma prueba pasa con la corrección. Un objeto válido sí atraviesa el normalizador y el servicio cliente; React muestra el componente existente. No se encontró un defecto de renderizado o del guardado en ese camino.

No se dispone del payload histórico de Production ni de la respuesta cruda del proveedor. El conector Vercel devolvió 403 para `mateolitrenta-gmailcoms-projects`; tampoco hay CLI disponible para usar credenciales propias. No se pudo verificar el flag ni la disponibilidad de la tabla en aquella solicitud. Por tanto, se confirma el defecto de contrato reproducible, pero no se atribuye el episodio histórico exclusivamente a una omisión de Gemini, a fechas descartadas o a configuración. El 429 por cuota agotada es correcto y se conserva.

## Corrección acotada

- Las instrucciones exigen el objeto para pedidos explícitos completos y persistencia disponible; la respuesta textual sola no equivale a una propuesta. Consultas, hipótesis, negaciones y un “sí” no son permisos para guardar.
- `server/coachGoalProposal.ts` aplica una gramática cerrada al mensaje actual completo: “Quiero establecer/crear/definir/fijar un objetivo de N entrenamientos/sesiones de entrenamiento durante/para los próximos D días”, opcionalmente con la frase de guardado del caso reportado. Acepta cifras de uno/dos dígitos y palabras de uno a diez, dentro de los límites existentes. Solo sintetiza `workout_sessions`; no es un extractor general de lenguaje natural.
- Para ese pedido inequívoco, el target sale del usuario y las fechas se resuelven con el helper de calendario existente: hoy a hoy+D−1, inclusive. El parser compartido valida 1–31 sesiones y 1–31 fechas. La propuesta sigue pasando por el normalizador existente, que genera el UUID. Ningún número sale de un texto de Gemini ni se escribe en la base al proponer.
- La gramática completa rechaza fechas alternativas, restricciones adicionales, citas, condiciones, negaciones y mensajes incompletos. No se inventa una extracción parcial para otros formatos. Propuestas estructuradas de Gemini siguen usando su validación existente; se rechazan las de consultas no comprometidas, fechas explícitas inválidas y comandos de creación sin meta/período suficientes. Fuera de la gramática, puede ser necesario aclarar o repetir valores; no se promete comprensión universal.
- Los pedidos exactos prevalecen frente a objetos omitidos, inválidos o con cantidades/fechas contradictorias. La respuesta textual se liga a la propuesta real. Cuando no se puede generar una propuesta válida, se comunica aclaración, persistencia deshabilitada o indisponibilidad, en vez de prometer un botón inexistente. Se corrigen afirmaciones de guardado sin una escritura del endpoint de confirmación.

El frontend y `/api/coach/goals` no cambian: reciben el mismo objeto validado y muestran el componente existente. Solo “Aceptar objetivo” persiste mediante Auth/JWT/RLS, idempotencia y versiones. “Descartar propuesta” no llama al guardado. No se agregan llamadas ni reintentos de Gemini, y confirmar continúa sin cuota de IA; puede funcionar aunque el cupo de consultas ya esté agotado. La cuota se reserva antes de procesar la propuesta: un 429 no genera objeto ni escritura.

## Pruebas y alcance

Se agregan casos para el texto exacto y su variante con palabras, objeto omitido/válido/contradictorio, fechas inválidas, límites, objetivo incompleto, negación, hipótesis, citas, alternativas, consulta informativa, “sí”, flag deshabilitado/tabla indisponible, ausencia de writes antes de confirmar, 429, confirmación con cuota agotada, descarte y continuidad en otra conversación. Las pruebas existentes de modificaciones/cancelaciones, versiones, RLS, aislamiento y registros permanecen.

Una prueba con React real conecta el handler real de chat con el transporte/validador real del cliente y verifica el botón existente tras una respuesta de Gemini sin objeto. El botón llama al handler real de objetivos y guarda una sola vez sin consumir otra cuota ni registrar actividades. En esa prueba se simulan Auth, Gemini y PostgREST y la frontera de `confirmCoachGoal`; las pruebas específicas del cliente y PostgreSQL cubren el resto. No equivale a una prueba en Production.

El probe HTTP carga ambos endpoints emitidos como JavaScript y prueba el caso de objeto omitido, objeto válido, fechas inválidas, flag deshabilitado, 429, confirmación idempotente y conversación nueva. También se ejecuta el builder oficial `@vercel/node` con ese probe. No se registran conversaciones ni respuestas crudas del proveedor.

Validación final local: **289/289 tests, sin fallos ni omitidos**, incluidos PostgreSQL/RLS y concurrencia nativa; 39/39 tests focalizados; TypeScript del cliente y de ambos endpoints; lint con cero errores y 13 advertencias preexistentes; build de producción y diff check correctos. Los dos handlers se cargaron mediante el builder oficial de Vercel y pasaron el probe HTTP. Gemini/Auth/PostgREST remotos se simularon; no se afirma una validación real en Production. El fallback requiere una respuesta JSON base válida, autenticación/cuota aprobadas y persistencia disponible; no elude los errores del proveedor ni el 429.

Archivos de producción modificados: `api/ai/chat.ts`, `server/coachCoaching.ts` y el nuevo `server/coachGoalProposal.ts`. Pruebas: `tests/coach-goal-proposal.test.mjs`, `tests/coach-goals.test.mjs`, `tests/coach-store-sync.test.mjs`, `tests/coach-serverless-runtime.test.mjs`, `tests/fixtures/coach-serverless-probe.mjs`. Esta documentación completa el alcance; no cambia `ChatView.tsx`, el componente de confirmación, el servicio de guardado, SQL ni los módulos de seguridad.

## Repetición manual en Preview o Production

1. Usar una cuenta de prueba en el despliegue que incluya este commit. Comprobar, sin compartir claves, que `AI_COACH_GOALS_ENABLED=true` ya esté configurado para ese despliegue, que la migración aprobada esté aplicada y que Auth/cuotas/lecturas funcionen. Esta corrección no modifica esa configuración.
2. En Coach enviar: “Quiero establecer un objetivo de tres entrenamientos durante los próximos siete días y guardarlo en Calori”. Debe mostrarse “Objetivo propuesto”, tres sesiones y las fechas desde hoy hasta seis fechas después, junto con Aceptar/Descartar. Revisar fechas antes de aceptar.
3. Antes de aceptar, verificar que no exista una escritura POST a `/api/coach/goals`. Descartar no debe guardar. Repetir el pedido si se descartó y aceptar una sola vez: esperar HTTP 200 del endpoint y solo entonces el mensaje de guardado.
4. Abrir otra conversación con la misma cuenta y consultar el objetivo: debe recuperarse de Supabase. No enviar un “sí” como sustituto del botón. No probar agotamiento gastando solicitudes: usar una cuenta que ya haya agotado el cupo; confirmar una propuesta existente no debe llamar a Gemini ni reservar cuota.
5. Con flag deshabilitado, no debe aparecer propuesta y la respuesta debe explicar que no está habilitada. Ante error de guardado, no debe informarse aceptación exitosa. Las modificaciones de configuración necesarias para esas pruebas son manuales y quedan fuera de este PR.

La calidad de otras redacciones con Gemini real y el estado de la configuración del episodio original quedan pendientes de validación real. No se hicieron migraciones, cambios de variables ni merge.
