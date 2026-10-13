# Coach Intelligence v1.1: recomendaciones y objetivos aceptados

Base: `main` con PR #54 y #55 integrados (`fc56952`). Rama: `codex/coach-actionable-intelligence-v1-1`. PR en borrador; no hacer merge antes de aplicar la migración y validar el Preview con Gemini/Supabase reales.

## Auditoría antes de implementar

Habit Insights v1 ya calcula ventanas móviles 7/14/30 contra períodos equivalentes, conserva hasta 60 fechas y usa los agregadores oficiales. Ya había instrucciones para recomendaciones, rutinas y planes conversacionales, además de restricciones de seguridad y confirmación de actividades. No se agrega otro motor energético ni se duplican las métricas de las tarjetas.

El objetivo energético está en `profiles.goal` y el contexto permitido; `today.target` proviene del motor existente. Disponibilidad, equipamiento y preferencias aparecen solo cuando el usuario los declara en los mensajes. No existen campos estructurados para guardarlos como memoria de Coach.

ChatView guarda conversaciones por usuario y fecha en localStorage. Las anteriores son de solo lectura; no se sincronizan entre dispositivos. El backend procesa los últimos diez mensajes. Ese historial no demuestra que una sugerencia fuese aceptada y no permite persistir compromisos de forma confiable. Los registros nuevos sí se publican en `activeProfile.records` después de persistir y se utilizan al construir el siguiente contexto.

El usuario eligió persistencia en Supabase con confirmación explícita y migración manual. Se priorizan dos objetivos: frecuencia de entrenamiento y días que alcanzan un umbral de pasos. Alimentación recibe coaching y planificación, pero sus objetivos persistentes quedan para una fase posterior.

## Estados y flujo

1. **Sugerencia/plan:** Gemini interpreta evidencia y restricciones declaradas; devuelve texto y, opcionalmente, una propuesta estructurada. No escribe datos. Un “sí” en el texto no guarda el objetivo.
2. **Propuesta:** el backend valida tipo, target y período; para modificaciones/cancelaciones valida que el ID pertenezca a un objetivo activo recuperado del usuario. El frontend muestra los datos exactos y un botón de confirmación. El usuario puede seguir escribiendo para personalizar la propuesta; la anterior se descarta sin guardar.
3. **Objetivo aceptado:** solo el botón llama `POST /api/coach/goals`. Se verifica Auth con Supabase y se usa su JWT junto con la clave publicable para que RLS permanezca activa. La identidad del body y los objetivos enviados por el cliente no determinan el propietario.
4. **Progreso registrado:** al consultar Coach, el backend recupera objetivos de Supabase. Cuando hace falta evaluar uno iniciado, lee sesiones y pasos persistidos del propietario, con columnas mínimas y fechas acotadas. El cálculo es determinístico; no depende de objetivos o actividades narrados por Gemini.

Las propuestas de objetivos son independientes de `actions` de comida/actividad. Aceptar un objetivo no registra sesiones, pasos ni comidas ni modifica el perfil. El frontend informa éxito solo después de una respuesta de guardado válida. Las repeticiones de aceptación con el mismo UUID son idempotentes; modificaciones y cancelaciones usan versión esperada para rechazar confirmaciones obsoletas de otro dispositivo. Cancelar conserva la fila y su estado; descartar una propuesta no cancela un objetivo aceptado.

## Modelo mínimo y evaluación

`public.coach_goals` almacena UUID, propietario, tipo, target, umbral opcional, fechas, estado `active/cancelled`, versión y timestamps generados por la base. No almacena conversaciones, diagnósticos, lesiones, preferencias inferidas ni planes completos.

- `workout_sessions`: cuenta todas las sesiones registradas del período mediante el agregador oficial. No certifica fuerza, duración, intensidad ni adherencia a una rutina específica. Target: 1–31 sesiones.
- `step_days`: cuenta fechas con pasos persistidos que alcanzan un umbral explícito; target es días, no pasos. Target: 1 hasta la cantidad de fechas del período; umbral técnico permitido: 100–100.000 pasos. No representa una recomendación universal.
- Períodos de 1–31 fechas locales. Un nuevo objetivo puede empezar dentro de las últimas siete fechas o en los treinta días siguientes; la base aplica un margen de fecha UTC/local. Aceptarlo hoy para un período que ya empezó no prueba compromiso anterior a `created_at`.
- Se pueden modificar target y umbral. Tipo y período son inmutables; para cambiar el período se propone un objetivo nuevo y se consulta la cancelación del anterior. No se conserva el historial de targets anteriores: se evalúa la versión vigente, identificando `updated_at`.
- La fase es futura, en curso, finalizada o cancelada. Solo se cuentan fechas hasta hoy; hoy es provisional. No se generan porcentajes ni se interpreta falta de entradas como incumplimiento confirmado.

Se reutiliza el agregador de sesiones de Habit Insights. El progreso de objetivos usa lecturas actuales de Supabase, que pueden ser más recientes que el snapshot del frontend usado por tarjetas/Habit Insights. Sus fechas y cobertura son explícitas; no se reconstruye progreso desde esas tarjetas ni se confunden períodos. Las preguntas de planificación/progreso usan `presentation=none`.

La actividad se consulta sobre 60 fechas y se valida que las respuestas incluyan todos los resultados mediante `Prefer: count=exact` y `Content-Range`. Se limita a 60 logs y 1.000 sesiones. Si falla la consulta, hay datos inválidos, paginación incompleta o el período está fuera de la historia, `registered=null/history_unavailable`: no se emite una cifra parcial ni se toma el contexto del cliente como reemplazo. Los pasos cero/nulos siguen el criterio conservador del producto: no prueban movimiento observado.

## Seguridad, memoria y costos

RLS restringe SELECT, INSERT y UPDATE al propietario autenticado. No se conceden DELETE, cambios de propietario, tipo/período ni escritura de versión/timestamps. Un trigger valida cambios, incrementa revisión y limita atómicamente a ocho objetivos en curso usando un bloqueo por propietario. Un índice evita objetivos activos idénticos.

Coach recupera hasta doce objetivos, priorizando activos y períodos recientes; informa recorte cuando se detecta. El historial textual sigue limitado a diez mensajes y el contexto diario a 60 fechas/24.000 caracteres. Entre conversaciones/sesiones/dispositivos puede recuperar **los objetivos estructurados**, no todos los detalles de una rutina ni preferencias que hayan salido del historial disponible. Si no puede recuperar un objetivo, pide aclaración sin inventar memoria.

`AI_COACH_GOALS_ENABLED` está desactivado por defecto. La falta de tabla/lectura se trata como persistencia no disponible y permite continuar la conversación normal sin propuestas de guardado. Cada consulta de coaching mantiene una llamada habitual a Gemini y una reserva de cuota; la corrección temporal existente de registros no se activa en consultas de planificación. Confirmar/modificar/cancelar no llama a Gemini ni consume cuota del proveedor. Con la función activa puede haber una lectura adicional de objetivos y dos lecturas de actividad en paralelo; no hay polling, suscripciones nuevas ni infraestructura paga adicional.

Las recomendaciones usan la evidencia existente, el objetivo energético y restricciones explícitas; no se infieren disponibilidad/experiencia/equipamiento. Las preguntas generales solicitan una conclusión, una acción útil y una pregunta solo cuando hace falta, en 2–4 frases; los planes detallados pueden extenderse y los pedidos numéricos siguen completos. Las pruebas de tamaño miden caracteres del prompt como proxy; no afirman un costo exacto ni un techo de presupuesto mensual. La tokenización y costos reales deben observarse en Preview.

## Aplicación manual: proyecto correcto y activación

**No se ejecutó la migración ni se modificaron variables remotas. La persistencia no está validada en Production.**

1. Revisar `src/lib/supabaseConfig.ts`: el proyecto de Calori es `ziclplqhbrpvcqjjqoau` (`https://ziclplqhbrpvcqjjqoau.supabase.co`). El conector utilizado en etapas anteriores apuntaba a otro proyecto; no usarlo para aplicar esta migración sin verificar el destino. Nunca pegar claves en el chat.
2. Mantener `AI_COACH_GOALS_ENABLED` ausente/false. Revisar en el SQL Editor del proyecto correcto que `public.coach_goals` no exista. Si existe, detenerse y revisar el esquema; no borrar datos para reaplicar. Revisar también RLS de `daily_logs` y `workouts` y su correspondencia de fechas con los registros del frontend.
3. Aplicar manualmente `supabase/migrations/202610130001_coach_goals.sql`, que ejecuta sus cambios en una transacción y solo crea objetos de objetivos. Si Preview comparte la base de Production, crear la tabla también afecta ese esquema compartido; decidir ese destino manualmente antes de ejecutar.
4. Comprobar grants, políticas y trigger con dos usuarios de prueba: cada uno debe ver y editar solo sus objetivos; anon no debe acceder. Comprobar el JWT de usuario, no una service key que eluda RLS. Verificar también las lecturas de logs/sesiones del propietario y sus headers de conteo completo.
5. En Vercel, activar `AI_COACH_GOALS_ENABLED=true` **solo en Preview de `codex/coach-actionable-intelligence-v1-1`** y redesplegar ese Preview. Verificar su configuración existente de autenticación y cuotas. No cambiar Production automáticamente.
6. Probar los flujos siguientes con registros de prueba y Gemini real. No marcar listo ni hacer merge hasta validar persistencia, aislamiento y continuidad reales. Para desactivar, volver el flag a false y redesplegar; conservar las filas, sin borrar la tabla.

## Aceptación real pendiente

Estos casos son criterios de prueba, no respuestas obtenidas de Gemini real:

- “Quiero entrenar tres veces esta semana” → “Solo tengo 40 minutos” → “Los miércoles juego al fútbol” → “Organizame la semana”: proponer un plan adaptado; no registrar fútbol ni sesiones futuras. Confirmar un objetivo solo tras revisar su tipo, target y fechas.
- Antes de aceptar: “¿Y si solo puedo entrenar dos días?” / “Cambiemos el jueves por el viernes”: conservar restricciones disponibles y sustituir la propuesta, sin writes.
- Aceptar y abrir una conversación nueva/otro dispositivo con el mismo usuario: “¿Cómo me fue con mi objetivo?” debe recuperar el objetivo de la base y contar sesiones realmente persistidas, con su período y limitaciones. Una sugerencia no aceptada no debe aparecer como compromiso.
- Acordar un umbral de pasos y cantidad de días: contar únicamente fechas que lo alcanzaron; distinguir días observados de datos faltantes y no prometer actividad futura.
- “Modificá el objetivo a dos sesiones” / “Quiero dejar de seguir ese plan”: exigir confirmar la modificación/cancelación. Una versión obsoleta debe dar conflicto sin sobreescribir cambios.
- Probar fallo de guardado y respuesta perdida: no informar falsamente aceptación; consultar antes de reintentar. El mismo UUID no debe duplicarse.
- Entrar con otro usuario: no recuperar objetivos del anterior. Registrar comida/ejercicio con su confirmación existente; navegar a Inicio/Datos sin recargar y verificar que todo siga sincronizado. Agua/pasos/peso y Perfil conservan sus flujos.

## Archivos y pruebas

Implementación: `api/ai/chat.ts`, `api/coach/goals.ts`, `api/coach/tsconfig.json`, `server/coachCoaching.ts`, `server/coachGoals.ts`, `src/utils/coachGoals.ts`, `src/services/coachGoals.ts`, `src/services/aiService.ts`, `src/components/ChatView.tsx`, `src/components/CoachGoalConfirmation.tsx` y la migración SQL. No se modifican Home, Datos, Perfil, store global, fórmulas ni el módulo de seguridad/cuotas.

Pruebas: `tests/coach-goals.test.mjs`, `tests/coach-goals-client.test.mjs`, `tests/coach-store-sync.test.mjs`, `tests/chat-view.test.mjs`, `tests/coach-immediate-time.test.mjs`, `tests/coach-serverless-runtime.test.mjs` y `tests/fixtures/coach-serverless-probe.mjs`. PostgreSQL/PGlite ejecuta la migración y RLS; React real verifica confirmación, doble clic, error, cambio de cuenta y personalización. Gemini, Auth remoto y transporte PostgREST se simulan. El probe HTTP compila ambos endpoints y corre sin TypeScript stripping; además se valida el empaquetado de ambos con el builder oficial `@vercel/node` disponible en el workspace.

Validación final local del 13 de octubre de 2026: **272/272 pruebas**, TypeScript cliente y ambos endpoints, lint sin errores (13 advertencias preexistentes), build de producción y `git diff --check`, correctos. El builder oficial carga ambos handlers y el probe HTTP verifica confirmación idempotente, recuperación en una conversación nueva y progreso calculado, además de los casos anteriores de seguridad/error. No quedan pruebas fallando. Se corrigió una clasificación demasiado amplia de expresiones con días de la semana; el harness de ChatView se adaptó al nuevo componente. Las consultas de planificación no solicitan datos de registro cuando el proveedor devuelve por error una propuesta de actividad.

Medición sintética: el system prompt de una consulta diaria base ocupa 22.018 caracteres; una consulta de planificación con ocho objetivos ocupa 36.258, una diferencia de **14.240 caracteres**. Incluye evidencia de hábitos, instrucciones de coaching y objetivos: es un incremento significativo, acotado a consultas relevantes. No equivale a un porcentaje exacto de tokens/costo. Las consultas normales mantienen su contexto anterior y la confirmación no llama a Gemini; controlar el consumo real antes de activar en Production.

Limitaciones: objetivos de alimentación diferidos; fechas/tipo inmutables; sin historial completo de revisiones ni persistencia de toda la rutina/preferencias; lecturas acotadas y seguimiento numérico limitado a 60 fechas; guardado real y calidad de coaching pendientes de validación en el proyecto/Preview correctos.
