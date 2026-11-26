# Migración de Calori a Gemini 3.5 Flash-Lite

Fecha: 26 de noviembre de 2026.

## Alcance y decisión

El usuario pidió habilitar el Coach en todas las previews del repositorio y cambiar el modelo tanto en Preview como en Production. Esta migración parte de `main` (`c4ed2f221121bec448e7aa08e161e4fa82c60bd5`) y se mantiene separada del PR #99 de nombres de comidas.

Modelo elegido: `gemini-3.5-flash-lite`. Google anunció que el 1 de diciembre de 2026 las solicitudes a `gemini-2.5-flash` se redirigirán a ese modelo. Configurarlo explícitamente permite adaptar y comprobar las solicitudes antes del cambio automático.

Fuentes oficiales consultadas el 26 de noviembre:

- [Notas de versión del 2 de noviembre](https://aistudio.google.com/docs/changelog#11-02-2026).
- [Guía de migración a 3.5 Flash-Lite](https://aistudio.google.com/docs/whats-new-gemini-3.6#migrate-to-gemini-3-5-flash-lite).
- [Control de pensamiento en GenerateContent](https://aistudio.google.com/docs/thinking?generate-content=true).
- [Modelo, modalidades y tarifas](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite).

## Compatibilidad de las solicitudes

`server/geminiConfig.ts` resuelve un perfil explícito por solicitud. La ausencia de `GEMINI_MODEL` selecciona 3.5 Flash-Lite. Un valor vacío o un modelo sin perfil devuelve `503 ai_configuration` antes de reservar cuota o consultar al proveedor.

Los tres modos continúan usando REST `v1beta/models/{model}:generateContent` y `responseMimeType: application/json`. El perfil nuevo utiliza `thinkingLevel: minimal` e `includeThoughts: false`, y omite `temperature`, `topP`, `topK` y `candidateCount`. Los máximos anteriores se conservan:

| Modo | Entrada | Máximo de salida |
| --- | --- | --- |
| Estimación | Texto de comida/ejercicio y foto opcional | 512 tokens |
| Transcripción | Audio | 1024 tokens |
| Coach | Conversación y foto/audio adjunto | 2048 tokens |

`minimal` es un nivel de razonamiento bajo; no garantiza que el proveedor use cero tokens de pensamiento. Los máximos de salida también limitan esos tokens. Las pruebas reales deben observar respuestas truncadas y latencia antes de considerar cualquier aumento del límite.

El lector compartido de respuesta concatena exclusivamente las partes de texto final y excluye las partes `thought: true` y las firmas. Los validadores existentes siguen comprobando los contratos de cada modo. Los prompts, las métricas determinísticas, los tipos de acciones y la confirmación del usuario conservan su comportamiento.

El evento `ai_request` registra el identificador de modelo elegido y, si Google lo informa, el contador de tokens de pensamiento. No registra el contenido de pensamientos, conversaciones, adjuntos, firmas ni credenciales.

## Variables y despliegue

Se comprobó que `GEMINI_API_KEY` ya estaba disponible para Production y Preview. La causa del fallo en las previews recientes era que `SUPABASE_AI_SECRET_KEY` y `AI_TEXT_DAILY_LIMIT`, `AI_IMAGE_DAILY_LIMIT`, `AI_AUDIO_DAILY_LIMIT` estaban limitadas a `codex/ai-security-reliability-v1`.

El cambio de alcance de esas cuatro filas de Preview conserva sus valores y las filas de Production. No se descifran ni se copian secretos. La protección de despliegues permanece activa. `AI_COACH_GOALS_ENABLED=true` habilita también los objetivos en Preview mediante las comprobaciones de sesión y RLS existentes.

Configurar `GEMINI_MODEL=gemini-3.5-flash-lite` en Preview y Production solo después de preparar el código compatible. Las variables se aplican a despliegues nuevos: una URL de un despliegue anterior conserva su configuración y código. Las ramas activas deben incorporar esta migración antes de volver a desplegarse con el modelo nuevo; en particular, actualizar el PR #99.

Preview y Production usan el mismo proyecto Supabase. Los registros y los contadores de la cuenta son compartidos, y una prueba en Preview consume el cupo diario existente. No se aumentan los cupos ni se crea una base aislada mediante este cambio.

## Validación reproducible

Las pruebas de `tests/ai-security.test.mjs` interceptan la frontera HTTP del proveedor y verifican el modelo y los parámetros en Coach de texto/foto, estimación de texto/foto/ejercicio y transcripción. Cubren autenticación, una reserva por llamada, JSON final dividido, partes de pensamiento, modelo desconocido y el perfil anterior explícito. La prueba serverless ejecuta el JavaScript compilado y sus imports sin depender de fuentes TypeScript.

```sh
node --test tests/ai-security.test.mjs tests/coach-serverless-runtime.test.mjs tests/coach-response-policy.test.mjs tests/coach-immediate-time.test.mjs tests/coach-context.test.mjs
npx tsc --noEmit -p api/ai/tsconfig.json
npx tsc --noEmit -p api/coach/tsconfig.json
npm run lint
npm run build
git diff --check
```

La CI registra el resultado del mismo commit que se despliega. Los conteos finales y las URLs de Preview/Production se documentan en el PR y en el informe de entrega, sin confundir pruebas sintéticas con llamadas a Gemini real.

## Comprobación con Gemini real

Desde una sesión autorizada, recorrer una estimación textual, una foto consentida, un audio breve en español y dos turnos de Coach. Usar datos ficticios identificados como prueba y no confirmar registros u objetivos. Comprobar los contratos, las cantidades y fechas, la continuidad de la conversación y la capacidad de editar una propuesta. Correlacionar cada solicitud con `ai_request`: estado, modelo, modalidad, llamadas, duración y tokens, sin extraer la sesión ni registrar el contenido de la cuenta.

Una Preview READY, un HTTP 401 sin sesión o una prueba con proveedor simulado no acreditan la calidad del modelo real. Si no hay una sesión disponible, dejar esa comprobación expresamente pendiente.

## Recuperación

Antes del 1 de diciembre existe un perfil explícito para `gemini-2.5-flash` con los parámetros anteriores. Solo sirve como opción temporal si Google todavía permite acceder al modelo en este proyecto. No hay fallback automático ni llamada adicional a otro modelo. Desde la fecha de redirección, ese identificador no garantiza volver a 2.5: no debe utilizarse como estrategia de recuperación futura.

Si se revierte un despliegue por una regresión, comprobar también el modelo y las variables vinculadas a ese despliegue. No reducir los límites de Preview: la RPC compartida puede conservar el menor límite recibido durante el día para la misma cuenta.
