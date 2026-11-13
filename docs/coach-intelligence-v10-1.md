# Coach Intelligence V10.1

El Coach presenta una observación personalizada al abrir la pantalla y permite conversar sobre ella con un toque. La apertura y las sugerencias se calculan en el dispositivo; Gemini interviene únicamente cuando el usuario envía una pregunta.

## Diagnóstico focalizado

Base de comparación: `742bd78d553d99f75f604e0b3fdb577829f1253d`, último `main` con Historial 2.1 al iniciar esta iteración.

- `ChatView.tsx` ya tenía conversación por fecha y cuenta, confirmación de acciones y tarjetas de resumen. El inicio pedía una pregunta y elegía sugerencias con tres ramas estáticas: sin registros, con entrenamiento y resto.
- `coachContext.ts` ya conserva siete fechas locales de detalle y sesenta días de totales acotados. Los contadores oficiales sobreviven al recorte de listas. Se reutiliza sin agregar lecturas ni persistencia.
- `habitInsights.ts` ya entrega cobertura, ventanas comparables y límites explícitos. Alimentación registrada no equivale a ingesta completa; pasos desconocidos no equivalen a sedentarismo; una sesión ausente no demuestra inactividad. Se reutiliza como fuente de evidencia.
- `coachGoals.ts` ya evalúa objetivos confirmados y distingue progreso registrado de incumplimiento. Se reutiliza; la tarjeta no crea ni modifica compromisos.
- `CoachInsightCard`, `CoachGoalCards` y sus métricas conservan su función dentro de la conversación. La apertura agrega una sola observación compacta, fuera del log, con evidencia desplegable. No agrega otro dashboard.
- El servidor ya separa cifras oficiales e interpretación. La referencia de la tarjeta permite reconstruir evidencia vigente y acotada para el envío contextual; el texto visible no se acepta como prueba independiente.

No se repitieron auditorías de seguridad o persistencia cerradas. Este cambio no modifica Supabase Production, RLS, protocolo transaccional, cuotas, tablas, pagos ni notificaciones.

## Comportamiento y límites

La selección prioriza datos inconsistentes, un objetivo confirmado vigente, actividades distintas registradas, cobertura de alimentación, entrenamiento y pasos. Sin evidencia suficiente, la observación explica qué falta y propone empezar con un registro simple. La prioridad es determinística: no rota recomendaciones al azar.

El identificador cambia con la evidencia pertinente y el contexto. Las sugerencias se regeneran con los registros y objetivos disponibles. La tarjeta abre su explicación con datos y limitaciones; después de enviar se compacta para dejar espacio a la conversación.

El CTA envía una referencia explícita. El servidor reconstruye la observación a partir del contexto saneado y de los objetivos oficiales disponibles. La respuesta debe explicar la evidencia sin atribuir actividades no registradas ni convertir estimaciones en certezas. Un consejo no registra una actividad. La confirmación existente sigue siendo necesaria para acciones solicitadas por el usuario.

## Escenarios sintéticos reproducibles

Las fixtures están en `scripts/coach-intelligence/fixtures.mjs`; ninguna representa una cuenta real.

- **Nuevo:** sin comidas, sesiones ni pasos. Debe explicar que todavía no conoce hábitos y permitir elegir el primer registro.
- **Incompleto:** una comida en una sola fecha. Debe mostrar cobertura parcial y evitar una tendencia, evaluación nutricional o déficit real.
- **Suficiente:** catorce fechas de comidas, pasos y actividad registrada; objetivo de déficit en el perfil. Debe usar datos registrados y conservar el carácter estimado de la energía.
- **Regularidad variable:** seis fechas con comidas en la ventana anterior y tres en la actual. Debe hablar de cambio de registro, sin afirmar que la persona come menos.
- **Fútbol y gimnasio:** sesiones de ambas actividades y pasos. Debe citar solamente esas actividades, separar pasos y sesiones y pedir contexto antes de recomendar carga o recuperación.
- **Objetivo confirmado:** objetivo de tres sesiones con dos registradas en su período. Debe mostrar progreso registrado y no tratar fechas sin datos como incumplimiento.
- **Inconsistente:** calorías y pasos inválidos, con agua en otra fecha. Debe pedir revisión de los datos antes de comparar.
- **Segunda cuenta:** solo pasos, sin sesiones. Al pasar desde la cuenta con fútbol y gimnasio, la nueva observación y el próximo envío no deben heredar actividades, mensajes ni objetivos anteriores.

`evaluate.mjs` evalúa claridad mediante reglas verificables: observación de hasta 280 caracteres, CTA de hasta 32, evidencia presente y límite explícito. Evalúa relevancia por el tipo de observación esperado en cada fixture, métricas disponibles y pregunta contextual. Es una rúbrica de implementación, no una investigación con usuarios ni una calificación generada por otro modelo.

## Verificación funcional y responsive

`browser-qa.mjs` utiliza Chrome, Vite y el App/Coach/CSS reales. Solo reemplaza los límites de Auth/store, transporte de IA, servicio de objetivos y pantallas ajenas. Bloquea conexiones externas. El baseline se extrae del commit citado, por lo que no depende de archivos de UI ya modificados.

Las comprobaciones cubren apertura sin llamadas de IA ni escrituras, una sola observación, evidencia accesible, CTA con una sola solicitud y referencia contextual, compactación al enviar, sugerencias al cambiar datos y separación de dos cuentas. Las capturas incluyen claro/oscuro en móvil y desktop. Se verifican además anchos 320, 768 y 1920, desborde horizontal, área táctil del CTA y su posición respecto del compositor.

Resultado del navegador: **25/25 comprobaciones**, sin errores de página ni intentos de red externa; cuatro capturas baseline y 31 PNG de evidencia en total. Incluye 375×667, lectura completa de límites tras desplazar la tarjeta en 320×568, cierre de evidencia y observación con compositor accesible, y reapertura de conversación guardada sin solicitud de IA.

Comparativas de la misma fixture:

- Móvil claro: [antes](evidence/v10-1/before-sufficient-light-393.png) · [después](evidence/v10-1/after-sufficient-light-393.png).
- Móvil oscuro: [antes](evidence/v10-1/before-sufficient-dark-393.png) · [después](evidence/v10-1/after-sufficient-dark-393.png).
- Desktop claro: [antes](evidence/v10-1/before-sufficient-light-1440.png) · [después](evidence/v10-1/after-sufficient-light-1440.png).
- Desktop oscuro: [antes](evidence/v10-1/before-sufficient-dark-1440.png) · [después](evidence/v10-1/after-sufficient-dark-1440.png).
- Pantalla compacta: [evidencia completa tras scroll](evidence/v10-1/after-evidence-scrolled-light-320.png) · [observación cerrada](evidence/v10-1/after-evidence-closed-light-320.png).

Evidencia legible por máquina:

- `docs/evidence/v10-1/deterministic-evaluation.json`: observaciones, evidencia y límites por contexto; rúbrica y tiempos del motor local.
- `docs/evidence/v10-1/before-browser-report.json` y `after-browser-report.json`: dimensiones, texto renderizado, capturas, errores y comprobaciones funcionales.

Pasos después de entrar a Coach: **0** para recibir la observación; **1** para ver la evidencia; **1** para iniciar la pregunta contextual. La respuesta del navegador está simulada. Los tiempos de apertura incluyen arranque del bundle de desarrollo en este equipo; los tiempos de respuesta del harness incluyen una espera simulada. Ninguno representa latencia de Gemini ni de Vercel.

La ejecución determinística cubrió 8/8 escenarios. En 1.000 iteraciones después de calentamiento, el motor local registró p50 de 0,382 ms y p95 de 1,546 ms (máximo 6,436 ms). Son tiempos de este entorno y contexto sintético, sin red ni modelo.

En las 18 aperturas de la matriz visual, el tiempo desde crear el contexto de navegador hasta disponer del compositor fue p50 **9.996 ms**, p95 **27.821 ms**, rango **6.198–27.821 ms**. El primer caso nuevo duró 27.821 ms durante la carga del bundle de desarrollo y contención con otras pruebas del equipo. Se conservan todas las muestras; no se presentan como tiempos de apertura de producción ni se sustituyen por el benchmark del motor.

Para reproducir:

```powershell
node scripts/coach-intelligence/evaluate.mjs
$env:PLAYWRIGHT_MODULE = 'C:\ruta\a\playwright\index.mjs'
node scripts/coach-intelligence/browser-qa.mjs --before
node scripts/coach-intelligence/browser-qa.mjs
```

Playwright es una herramienta de QA externa al producto. No se agregó al lock ni a las dependencias de la aplicación. El ejecutor permite elegir canal con `QA_BROWSER_CHANNEL`.

## Validación técnica

La regresión final de Coach pasó **186/186 pruebas**, sin omisiones. Incluye motor proactivo, UI, transporte, hábitos, acciones, objetivos, política de respuestas y el handler compilado servido por HTTP local con TypeScript nativo desactivado. Auth, objetivos, cuota y Gemini están simulados; esta comprobación no usa servicios remotos.

`npm run build`, TypeScript del servidor (`tsc -p api/ai/tsconfig.json --noEmit`) y `git diff --check` terminaron correctamente. Lint terminó con cero errores y doce advertencias preexistentes. No se agregaron dependencias al producto.

La suite global no se certifica como verde. Un intento durante la implementación produjo 556 aprobadas, ocho fallos y una cancelación sobre 565 pruebas: el sandbox bloqueó archivos/conexiones locales de PostgreSQL y HTTP, y faltaba el runtime nativo PostgREST. También incluyó una aserción del harness de UI corregida antes del commit de implementación. La regresión final de Coach volvió a validar la UI (24/24) y el HTTP compilado con loopback permitido. No se reabrieron ni modificaron las auditorías cerradas de seguridad o persistencia. El detalle y el alcance están en `docs/evidence/v10-1/validation.json`.

## Impacto y costo

Abrir Coach agrega **0 llamadas a Gemini y USD 0 de costo de modelo**. Consultar la evidencia y actualizar sugerencias también son operaciones locales. El CTA usa el envío conversacional existente: una solicitud por interacción, sin precarga ni segundo llamado para redactar la tarjeta. Las cuotas existentes se conservan.

En el escenario sintético de fútbol y gimnasio, con la misma pregunta, el prompt sin referencia ocupa 33.532 caracteres y el contextual 36.687: diferencia de 3.155 (+9,41%). Incluye instrucciones y evidencia, no datos nuevos persistidos. Con el supuesto presupuestario de 3–4 caracteres por token, son aproximadamente 789–1.052 tokens de entrada adicionales; no son tokens facturados medidos.

Al 13 de noviembre de 2026, la tarifa estándar publicada para texto de `gemini-2.5-flash` es USD 0,30 por millón de tokens de entrada y USD 2,50 por millón de salida, incluidos tokens de pensamiento. El incremento de contexto estimado equivale a aproximadamente **USD 0,00024–0,00032 por envío contextual**, o USD 0,24–0,32 por mil envíos. Fuente: [precios oficiales de Gemini](https://aistudio.google.com/docs/pricing#gemini-2.5-flash).

Si 100 de cada 1.000 aperturas provocaran conversaciones que antes no existían, con el prompt sintético de unos 9.200–12.200 tokens de entrada y 500 tokens de salida total por respuesta, esas 100 interacciones costarían alrededor de USD 0,40–0,49. Es un escenario de presupuesto, no una predicción de adopción, consumo o facturación. El costo real depende de `GEMINI_MODEL`, historial, tokens de pensamiento, respuestas, tarifas y uso efectivo.

La documentación oficial advierte que `gemini-2.5-flash` está deprecado y describe un cambio de ruta y tarifa desde el 1 de diciembre de 2026. Esta iteración no migra el modelo; será necesario revalidar precio y comportamiento con el modelo configurado antes de cualquier publicación posterior a esa fecha.

## Riesgos y pendientes de revisión

La [Preview Vercel está disponible](https://calori-tracker-bx61kjw71-mateolitrenta-gmailcoms-projects.vercel.app), en estado **READY**, desde `6ea12e14dc5a7627c0292f0091a1930cb4b3b2ec`. El usuario regularizó la facturación que había bloqueado la creación. Se verificaron `/`, `/app`, JavaScript/CSS y el bundle de Coach con HTTP 200; el bundle incluye la tarjeta proactiva. `GET /api/ai/chat` devuelve 405 JSON, como corresponde. La lectura sin sesión de objetivos devolvió 401, pero el conector no expuso el cuerpo y no se certifica ese flujo por esta comprobación. No se inició sesión en Supabase ni se llamó a Gemini. La revisión funcional autenticada y el ensayo del modelo real siguen pendientes; esta actualización de documentación no cambia el código de la aplicación desplegada.

- Las pruebas de transporte y prompts usan mocks: comprueban datos enviados, invariantes, conteo de solicitudes y renderizado. **No certifican obediencia de un Gemini real**, ausencia total de alucinaciones textuales ni latencia de producción. La revisión humana de respuestas reales en un entorno permitido sigue pendiente.
- Una lista de actividad recortada puede omitir nombres. Los totales conservan su significado, pero no permiten reconstruir una actividad ausente ni toda la carga física.
- Cobertura no mide jornadas completas ni calidad nutricional. La regularidad de registro no demuestra regularidad real de alimentación.
- Los objetivos pueden estar cargando o no estar disponibles. La apertura usa otra evidencia mientras tanto; solo un objetivo confirmado y disponible puede sustentar progreso de compromiso.
- La selección presenta una observación prioritaria. Puede haber otros datos relevantes; el usuario conserva la conversación y las tarjetas existentes para explorarlos.
- La densidad visual, el tono y la utilidad percibida requieren la revisión del usuario en la preview. No se midió superioridad frente a CAL AI ni se afirma.
- En pantallas de poca altura, desplegar evidencia genera desplazamiento dentro de la observación para conservar el compositor visible. Es un compromiso de UX: leer todo el límite puede requerir desplazar esa tarjeta. Puede volver a cerrarse sin bloquear el envío.
- No se hizo merge ni publicación en Production. El PR debe permanecer Draft hasta la revisión visual y funcional solicitada.
