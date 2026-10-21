# Creación conversacional de objetivos — corrección V1.2

## Causa reproducida en main

Base: `87f015d`, que integra el PR #60. La reproducción usa mensajes sintéticos con fecha local 2026-10-21; no contiene conversaciones privadas ni respuestas reales del proveedor.

1. `isActionableCoachingQuery()` devuelve `false` para «Quiero ir al gimnasio 3 veces por semana durante el mes de noviembre». Tampoco recupera la intención ante «Perdón, es para el mes de noviembre». El endpoint no consulta objetivos ni ejecuta el normalizador en esos turnos.
2. Cuando sí se entra al flujo, `resolveCoachGoalProposal()` solo recibe `lastMessage.text`. Sus comprobaciones `hasTarget` y `hasPeriod` no pueden reutilizar aclaraciones anteriores. `hasPeriod` además solo reconoce próximos días, esta semana o dos fechas ISO: un mes expresado por nombre falla incluso con un objeto estructurado válido. Reproducido enviando una sugerencia de 12 sesiones del 2026-11-01 al 2026-11-30 junto con «Quiero establecer un objetivo de 12 entrenamientos durante noviembre»: main descarta la propuesta y devuelve el error genérico.
3. El fallback anterior exige la frase completa «Quiero establecer/crear/definir/fijar un objetivo de … durante los próximos … días». No cubre las expresiones naturales del caso ni el mes aclarado en otro mensaje.
4. El contrato guarda un TOTAL de sesiones por período. Tres sesiones por semana durante un mes no es representable como recurrencia. Multiplicar por cuatro y guardar doce alteraría el objetivo solicitado.

La tarjeta existente requiere `goalProposal` válido; conversar sobre una meta no la crea. La persistencia y la interfaz de confirmación no eran la causa del rechazo anterior. Sin el payload de Production no se puede asegurar qué objeto emitió Gemini en cada turno; la reproducción demuestra los fallos del contrato sin atribuirlos a un JSON incorrecto del modelo.

## Corrección acotada

- Nuevo intérprete determinístico en `server/coachGoalConversation.ts`: reconoce solicitudes completas de sesiones, meses con año opcional, fechas ISO, períodos relativos, correcciones de mes y referencias a guardar el objetivo recién definido.
- Solo incorpora datos de mensajes del USUARIO con formas inequívocas. Ignora respuestas del bot como fuente de valores o persistencia. Una negación, hipótesis, alternativa ambigua o cambio de tema interrumpe el borrador. «No quiero otras metas» conserva la solicitud actual, sin significar aceptación.
- El borrador local utiliza como máximo veinte mensajes de la solicitud, con el mismo validador por mensaje; Gemini sigue recibiendo como máximo diez. Esto permite elegir una alternativa después de toda la secuencia observada sin perder el pedido inicial al recortar el prompt. Si algún mensaje adicional es inválido, se usa solo el historial reciente validado. No agrega memoria persistente para borradores ni recupera mensajes de otra conversación. Si el contexto original no está disponible, pide los datos faltantes en lugar de reconstruirlos desde lo que afirmó Gemini.
- El endpoint reconoce el resultado de este intérprete al decidir si debe cargar el contexto de objetivos. El normalizador recibe los mismos mensajes y prepara el objeto aun cuando Gemini lo omita o sugiera otros valores.
- Ante una recurrencia semanal no crea objetos automáticamente: explica la limitación, ofrece un objetivo de siete días desde hoy o un total mensual elegido expresamente. Solo la elección explícita cambia el período o el total. Los objetivos cuentan todos los entrenamientos registrados; no distinguen gimnasio de otras actividades.
- Los meses sin año usan el año actual; no se trasladan silenciosamente al siguiente. Se mantienen el contrato compartido, el máximo de 31 fechas/sesiones y la ventana de inicio local de -6 a +30 días. Los períodos pasados o fuera de la ventana producen una aclaración concreta.
- Mantiene las validaciones del modelo para pasos y las modificaciones/cancelaciones existentes. Las altas sin contexto suficiente, las hipótesis condicionales y las recurrencias no pueden eludir el control mediante un objeto del proveedor.
- La propuesta explica que todavía no está guardada. El botón existente es la única confirmación; el éxito depende de `/api/coach/goals`. No cambia `ChatView`, componentes, Supabase, RLS, SQL, versiones, idempotencia, cuotas ni fórmulas. No agrega llamadas a Gemini ni reintentos.

## Pruebas automatizadas

- Secuencia completa: pedido de gimnasio tres veces por semana para noviembre → septiembre pasado → corrección a noviembre → no querer otras metas → pedir guardar. Nunca propone doce sesiones ni promete persistencia; explica la recurrencia incompatible.
- Corrección «noviembre, no septiembre», meta mensual total explícita, dos fechas ISO, aclaración de período y referencia a guardar sin repetir la meta.
- Elección explícita de alternativa semanal o total mensual distinto de una multiplicación automática.
- Modelo que omite el objeto, propone valores diferentes o afirma falsamente que guardó; fechas inválidas, límites, negaciones, hipótesis, cambio de tema y mensajes del bot que no autorizan nada.
- API con Auth, cuotas y REST simulados sobre PostgreSQL/PGlite local: una llamada por mensaje, cero escrituras antes de confirmar, 429, caída de lectura de objetivos, confirmación idempotente y recuperación en conversación nueva. Las pruebas existentes cubren RLS, conflictos, guardado fallido y descarte sin escritura.
- React/JSDOM ejecuta App, navegación, cliente y ambos handlers reales: solicitud semanal → aclaración → tarjeta existente → aceptar → Mis objetivos → conversación nueva. Las fronteras de Auth, Gemini y REST son simuladas. No se confunden con una prueba real de Supabase o Gemini.
- Prueba serverless: compila ambas funciones y dependencias a JavaScript, elimina la dependencia del cargador TypeScript y ejecuta peticiones HTTP reales sobre loopback. Incluye la secuencia de meses y la propuesta aclarada con un único llamado simulado al proveedor por turno.

## Validación manual pendiente

Validaciones locales finales: **317/317 tests, sin fallos ni omisiones**, incluyendo PostgreSQL nativo/RLS y HTTP serverless; TypeScript de cliente (`tsc -b`) y de ambos endpoints (`api/ai/tsconfig.json`, `api/coach/tsconfig.json`) aprobados; lint aprobado con los 13 avisos preexistentes; build aprobado con el aviso existente de tamaño de bundle; `git diff --check` aprobado.

En Preview con una cuenta real, probar el texto original con Gemini real, elegir expresamente una alternativa, revisar la tarjeta, aceptar, verificar Mis objetivos y abrir una conversación nueva. Repetir el descarte y una corrección antes de aceptar. Comprobar que no aparece éxito si falla la persistencia. Los tests automáticos no demuestran persistencia en Production ni el comportamiento de Gemini real. Este PR no ejecuta migraciones, modifica variables remotas ni hace merge.
