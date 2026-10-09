# Coach Habit Insights v1

Base: `main` actualizado, con PR #54 integrado (`5a2f4f4`). Rama: `codex/coach-habit-insights-v1`. Esperar pruebas con Gemini real en Preview antes del merge.

## Auditoría previa

El store ya obtiene el historial del perfil con sus comidas y entrenamientos. No hace falta otra consulta a Supabase. Antes de esta versión, `buildCoachContext` y la sanitización del endpoint limitaban los datos a siete fechas locales incluyendo hoy. Las listas visibles se recortaban a seis comidas y tres entrenamientos por día, conservando sus totales y contadores de omisiones. Gemini no disponía de evidencia para comparar 14/30 días con ventanas anteriores.

`coachCardMetrics` es la fuente oficial de las tarjetas: promedio calórico sobre días con comidas, promedio de pasos sobre días con pasos positivos, redondeo entero y conteos que incluyen elementos omitidos. El contexto diario usa `getCaloriesIngested`, `calculateDailyExpenditure`, `calculateDailyCalorieTarget` y `hasEnergyData`. Sus fórmulas no cambian. El gasto histórico usa el mismo perfil actual que el motor existente; no reconstruye perfiles anteriores.

El endpoint verifica identidad con Supabase y reserva cuotas atómicas PostgreSQL por modalidad. Conserva el límite de contexto serializado de 24.000 caracteres, los diez mensajes recientes, los límites de texto y medios, y el manejo de errores. Las correcciones temporales existentes de propuestas pueden consumir otra llamada y otra cuota; este motor no introduce llamadas ni reintentos adicionales.

## Arquitectura y contrato

1. El cliente construye hasta 60 fechas locales con totales diarios completos de los registros existentes. Siete fechas mantienen las listas actuales para tarjetas. Las otras fechas contienen escalares, conteos y hasta dos nombres de actividad de 40 caracteres; no contienen notas, IDs ni comidas detalladas.
2. `coachContextContract.ts` aplica la misma lista permitida en cliente y servidor. Normaliza fechas y valores, descarta propiedades ajenas y evidencia enviada por el cliente, y resuelve conflictos de las siete fechas recientes a favor de los valores oficiales usados por las tarjetas. Un cliente anterior sin historia conserva sus siete fechas: el resto queda desconocido.
3. `aggregateCoachMetrics` se comparte entre tarjetas y el nuevo motor. `habitInsights.ts` produce objetos con tipo, período, métricas, cobertura, clasificación descriptiva y limitaciones. El servidor calcula la evidencia desde el contexto sanitizado.
4. Gemini recibe los resúmenes actuales y anteriores, no `historyDays` sin procesar. Solo recibe el desglose diario acotado si el usuario pide números o explicar la evidencia. El objetivo se limita a los valores existentes del perfil; no se inventan objetivos físicos ni disponibilidad.
5. Las consultas de hábitos usan una llamada habitual a Gemini. Recetas, medios y registros sencillos no reciben evidencia adicional. Las consultas puras de hábitos devuelven `actions=[]`, incluso si el proveedor propone una acción; los pedidos de registro conservan las validaciones y confirmaciones existentes.

Las ventanas son móviles, inclusivas y de igual duración: 7 contra 7 anteriores, 14 contra 14, o 30 contra 30. `today` sigue siendo la fecha local resuelta por la aplicación. La aritmética de calendario no la reinterpreta usando la zona del servidor. “Semana” representa siete fechas, no una semana calendario; “mes” representa treinta fechas. Un seguimiento conserva el último período explícito de la conversación acotada, salvo que solicite otro; una pregunta nueva vuelve al valor por defecto de siete días.

## Evidencia y cobertura

| Dominio | Evidencia determinística | Interpretación limitada |
| --- | --- | --- |
| Alimentación | Días/comidas, promedio oficial, mínimo/máximo, fechas registradas/ausentes, comparación y bloques inicial/final | Solo ingesta registrada; no calidad nutricional ni excesos |
| Entrenamiento | Conteos/días, bloques de siete fechas y último bloque parcial, tipos y listas omitidas, diferencia de sesiones | Ausencia de sesiones no prueba inactividad; bloques parciales se identifican |
| Pasos | Promedio oficial, rango, cobertura y diferencia entre ventanas | Solo días con pasos positivos; separado del entrenamiento |
| Agua | Promedio entre días con entradas positivas y cobertura | No diagnóstico ni necesidades individuales |
| Peso | Mediciones diarias, medianas inicial/final y diferencia; medianas entre ventanas | No composición corporal, ni promesas por déficit estimado |

La comparación calórica/de pasos necesita al menos tres jornadas y cobertura de al menos 50 % en **cada** ventana. La tendencia calórica necesita esos requisitos en ambos bloques de igual longitud; con períodos impares se excluye la fecha central del análisis de tendencia, pero se conserva en el resumen. Los denominadores y cambios de cobertura están explícitos: más registros no demuestra más consumo o actividad real.

Para describir una tendencia de peso se requieren seis mediciones diarias, con medianas de al menos tres mediciones en cada extremo; una variación aislada no basta. Agua requiere al menos la mitad de fechas con entradas para una clasificación de registros frecuentes. Estos criterios son reglas de elegibilidad transparentes, no probabilidades ni niveles de confianza clínica.

Sin evidencia suficiente, el resultado es `insufficient_data` y las diferencias no sustentadas son `null`. Días sin comidas no se convierten en ingesta cero. Un día registrado puede estar incompleto. No se utiliza el peso del perfil como medición diaria. La cobertura no certifica exhaustividad del registro.

## Conversación y ejemplos de aceptación

Ejemplos orientativos, condicionados a sus datos; no son respuestas obtenidas de Gemini real ni textos exactos exigidos por las pruebas:

- **“¿Qué hábitos detectaste en mí?”** Con pasos en varias fechas y sesiones concentradas: “Tus pasos muestran movimiento cotidiano en varias jornadas; las sesiones registradas se concentran en un día. Si querés trabajar en una rutina, contame tu objetivo y disponibilidad.” Seleccionar solo observaciones relevantes y evitar transcribir la tarjeta.
- **“¿Qué cambió respecto de la semana pasada?”** Con distintas coberturas: “La cobertura de comidas cambió entre ambas ventanas. La diferencia describe los días registrados y todavía no permite afirmar que cambió tu alimentación real.” Si pide la justificación, mostrar los denominadores oficiales y las cifras disponibles.
- **“¿Estoy avanzando hacia mi objetivo?”** Con pocas mediciones: “Con estas mediciones no alcanza para establecer una tendencia de peso. Podemos revisar la continuidad de los registros y cómo se relacionan con tu objetivo conocido.” No prometer resultados físicos.
- **“Analizá los últimos 30 días” → “¿Y el período anterior?” → “Mostrá las calorías gastadas cada día.”** Mantener ventanas de treinta fechas, utilizar los valores diarios oficiales y reconocer los `null`; no sustituir gasto por objetivo ni mostrar una tarjeta semanal para el mes.
- **“Registrá una comida a las 12:30.”** Mantener la propuesta y su confirmación explícita; nunca guardar una recomendación de hábitos como registro.

Para preguntas generales se solicitan 1–3 observaciones y, cuando ayudan, 1–2 acciones concretas en lenguaje natural. Los pedidos de explicación o desglose conservan cifras exactas. No hay pantallas nuevas ni insights automáticos en Inicio.

## Validación y prueba real pendiente

Archivos de implementación: `api/ai/chat.ts`, `src/utils/coachContext.ts`, `src/utils/coachCardMetrics.ts`, `src/utils/coachContextContract.ts`, `src/utils/coachDates.ts` y `src/utils/habitInsights.ts`. Pruebas: `tests/habit-insights.test.mjs`, `tests/ai-security.test.mjs`, `tests/coach-response-policy.test.mjs`, `tests/coach.test.mjs`, `tests/coach-serverless-runtime.test.mjs` y `tests/fixtures/coach-serverless-probe.mjs`. Este documento completa los trece archivos del cambio.

La suite cubre ventanas 7/14/30 completas/incompletas, fechas ausentes, denominadores oficiales, tendencias insuficientes, frecuencia/distribución, separación pasos/sesiones, agua, peso y valores atípicos, seguimiento, recortes, compatibilidad con tarjetas, propuestas, bloqueo de acciones en consultas de hábitos, autenticación, cuotas y una única llamada del proveedor. Cambiar de un registro pendiente a una consulta de hábitos no activa la corrección temporal de ese registro ni una segunda llamada. La prueba HTTP carga JavaScript compilado con TypeScript stripping desactivado y comprueba 401/429/503, 200/502/200 y una comparación de treinta días.

Además de la prueba de la suite, se ejecuta el builder oficial `@vercel/node` contra `api/ai/chat.ts`, se materializan los archivos trazados y se realiza el mismo probe HTTP sobre ese artefacto. Autenticación, cuotas y Gemini se simulan: esto verifica empaquetado, resolución y ejecución HTTP, no la calidad de respuestas reales ni infraestructura remota.

Resultados locales del 9 de octubre de 2026: `npm test` **252/252**; `npx tsc --noEmit -p api/ai/tsconfig.json` y TypeScript cliente mediante `npm run build`, correctos; `npm run lint`, sin errores y con 13 advertencias preexistentes; build de producción correcto, con advertencia de chunks grandes; probe del builder oficial correcto; `git diff --check`, correcto. Las pruebas de sincronización existentes de Coach → Inicio/Datos, agua/pasos/peso y Perfil también pasan. No se realizaron pruebas con Gemini real en Preview.

Antes del merge, verificar en Preview las variables de autenticación y cuotas aplicables a **esta nueva rama**, incluida cualquier configuración previamente limitada al Preview de PR #54. No se cambian variables ni se activan restricciones nuevas automáticamente. Con una sesión autorizada y registros de prueba, consultar los ejemplos anteriores, pedir justificaciones, comprobar las tarjetas semanales y registrar una comida/ejercicio con confirmación; navegar a Inicio/Datos sin recargar. Probar también los flujos existentes de agua/pasos/peso y Perfil. Verificar logs agregados sin capturar conversaciones ni respuestas sensibles.

## Costos y límites

- No hay nuevas dependencias, tablas, migraciones, consultas de datos ni perfiles inferidos persistentes.
- Se conservan autenticación, cuotas, fórmulas, estado global, UI y sincronización de PR #54. Los registros nuevos siguen dependiendo del éxito de persistencia existente.
- Sesenta fechas bastan para las ventanas solicitadas y su comparación; períodos anteriores no están disponibles. Las listas de actividades y conversaciones son acotadas y pueden tener omisiones explícitas.
- Más evidencia puede aumentar tokens de entrada en consultas relevantes, aunque no agrega llamadas. Los cupos diarios y el presupuesto piloto de US$20 no garantizan un techo de gasto mensual.
- El backend recalcula agregados y valida el contrato, pero los totales diarios siguen llegando del contexto del perfil como antes; no consulta la base de datos para certificar su procedencia. Registros incompletos y el cumplimiento del prompt por Gemini requieren validación real.
