# Etapa 3 · Experiencia del Coach

Referencia `a2021b32c22ea985d33f5ed681d3c507cef1f0b8`, con el PR #83 integrado. Se reutiliza Fitness Moderno. Las imágenes, los registros y las conversaciones de prueba son sintéticos. La auditoría del 17 de noviembre sirve de referencia para los hallazgos.

| Hallazgo | Reproducción | Corrección | Prueba |
| --- | --- | --- | --- |
| UX-08 · Espacio de lectura | Al abrir una conversación de 12 mensajes, la observación abre completa y comparte el alto con el compositor. Enfocar el compositor lleva la lectura al final. | Una conversación existente abre la observación en formato compacto. El título, la acción, las cifras y los límites se consultan al desplegar. La vista conserva el punto de lectura cuando se abre la evidencia o se enfoca el compositor. | [Matriz de referencia](before/matrix.json), [matriz del candidato](after/matrix.json) y [recorrido de navegación y respuestas](after/flows.json). |
| UX-09 · Carga de objetivos | Con la lectura de objetivos detenida, aparece una observación de entrenamiento. Al completar la lectura se reemplaza por una de objetivo. | La primera consulta muestra un estado neutral. Una actualización conserva la observación previa mientras espera datos y suspende las acciones de esa observación. Ante un fallo permanece disponible una lectura de registros y el reintento explícito de objetivos. | Se controla el momento de respuesta del servicio sintético. Se prueba carga inicial, fallo, reintento y actualización posterior. |
| UX-10 · Repetición y sugerencias largas | Los datos de la observación compiten con los de una respuesta activa. En escritorio, las preguntas largas ocupan una tira horizontal. | La cabecera activa deja paso a los mensajes. Una tarjeta estructurada y su explicación se leen como un conjunto. Las sugerencias tienen etiquetas breves y se despliegan a demanda durante la conversación. La pregunta original queda en la descripción accesible y en el envío. | Se mide el ancho del grupo y se compara la pregunta enviada con la original. Se verifican los 12 mensajes restaurados y el texto completo de una respuesta tardía extensa. |

| Captura comparable | Antes | Después |
| --- | --- | --- |
| Conversación existente · 375 px oscuro | [Referencia](before/375-dark-existing.jpg) | [Candidato](after/375-dark-existing.jpg) |
| Conversación existente · 375 px claro | [Referencia](before/375-light-existing.jpg) | [Candidato](after/375-light-existing.jpg) |
| Conversación existente · 1440 px oscuro | [Referencia](before/1440-dark-existing.jpg) | [Candidato](after/1440-dark-existing.jpg) |
| Conversación existente · 1440 px claro | [Referencia](before/1440-light-existing.jpg) | [Candidato](after/1440-light-existing.jpg) |
| Primera carga · 375 px oscuro | [Referencia](before/375-dark-loading.jpg) | [Candidato](after/375-dark-loading.jpg) |
| Tarjeta de objetivo y explicación · 375 px oscuro | [Referencia](before/375-dark-goal-reply.jpg) | [Candidato](after/375-dark-goal-reply.jpg) |

| Ancho en Oscuro | Área de lectura antes | Área de lectura después |
| --- | ---: | ---: |
| 320 px | 113 px | 272 px |
| 375 px | 365 px | 516 px |
| 1440 px | 413 px | 602 px |

La observación del candidato ocupa 46 px al estar cerrada. En los 12 escenarios por versión se conservan los 12 mensajes de la fixture y el compositor visible. La altura de lectura del candidato se mantiene al resolver la consulta de objetivos. Enfocar el compositor conserva el desplazamiento a 120 px en lugar de volver al final. La respuesta estructurada conserva la tarjeta y la explicación completa.

[Sugerencias activas al desplegarlas](after/375-dark-suggestions.jpg). Las matrices recorren 320, 375, 393, 440, 768 y 1440 px en Claro y Oscuro. El recorrido de Sistema comprueba el cambio en vivo, el regreso desde Inicio, la conversación anterior en solo lectura, el anclaje al recibir un mensaje tardío y la nueva conversación.

El punto de lectura se conserva en memoria durante la sesión de navegación, por cuenta y fecha de conversación. Al abrir la conversación sin una posición previa, se muestra el final. La recarga completa de la app inicia una sesión nueva de lectura. El texto de mensajes y los datos de objetivos siguen sus mecanismos existentes.

Para reproducir en secuencia, iniciar `node scripts/home-mobile/serve-qa.mjs --stage3 --before`, ejecutar `node scripts/fitness-global/coach-stage3.mjs --reference` y cerrar el servidor. Después iniciar `node scripts/home-mobile/serve-qa.mjs --stage3` y ejecutar `node scripts/fitness-global/coach-stage3.mjs`. Ambas fases usan loopback y bloquean tráfico externo. Sólo el recorrido explícito genera tres solicitudes de chat simuladas.

Chromium de escritorio emula los tamaños móviles. El arranque remoto de la Preview y la CI se informan por separado en el PR. Safari/iOS, teclado táctil físico, lectores de pantalla y Gemini real quedan pendientes. Esta entrega abarca UX-08, UX-09 y UX-10. La política lunes–domingo y Perfil pertenecen a decisiones posteriores.
