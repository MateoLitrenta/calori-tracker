# Calori Premium V8.2 — Workout Experience & UI Consistency

Rama `codex/workout-entry-premium-v8-2`, creada desde `main` actualizado en `6eeecb7` (PR #67 integrado). El alcance es la presentación de los formularios de ejercicio y la consistencia del borde de Balance. Se prepara un PR en borrador hacia `main`; no se hace merge ni se modifica Production.

## Causas verificadas en la versión anterior

- `add-workout-activity` y `edit-workout-activity` eran `input type="text"`. Su comportamiento de una línea ocultaba horizontalmente el comienzo de las descripciones largas. Comidas y notas ya usaban `AutoResizeTextarea`.
- La regla principal de `.energy-card` declaraba `border: 0`, anulando el borde sutil que compartían las otras tarjetas.
- `handleEstimateWorkout` publicaba las suposiciones del servicio mediante `toast(result.assumptions.join(' · '))`. El resultado podía superponerse al formulario y no quedaba disponible junto al valor estimado.
- Las opciones rápidas sobrescribían `workActivity`. La categoría, las notas de gimnasio y la visibilidad de distancia/ritmo dependían de que el texto completo coincidiera exactamente con un nombre de deporte.
- La estimación aplicaba las calorías al finalizar la promesa, sin distinguir un formulario cerrado, otra edición o una modificación manual realizada durante la espera.

## Checkpoint A — Correcciones principales

Se reutiliza `AutoResizeTextarea` para Actividad al agregar y editar. Conserva saltos de línea, crecimiento y reducción según el contenido, ajuste de palabras largas y ausencia de scroll interno. El contenido sigue perteneciendo a `WorkoutEntry.activity`; no se crea otra implementación de auto-resize ni un formato persistido alternativo.

El borde principal de Balance pasa de `0` a `1px solid var(--home-line)` en su regla existente. Conserva los radios y tratamientos de tema; no se añade una sombra ni una capa de overrides para simularlo. Las mediciones y capturas de esta iteración se consolidan en la validación final.

## Checkpoint B — Estimación y formulario

`EntryEstimateResult` presenta el resultado original dentro del formulario. La estructura está en español y las suposiciones permanecen como texto original en «¿Cómo se calculó?». El detalle nativo puede abrirse y cerrarse con teclado, sin superposición, traducciones inventadas, llamadas adicionales ni scroll interno. La auditoría detectó el mismo toast de éxito en comidas y se reutiliza allí el panel compartido.

Una modificación manual distingue «Valor ajustado» de la estimación original. Si cambian los datos utilizados, el panel advierte que la estimación corresponde a datos anteriores. Versiones locales de entradas y calorías impiden que una respuesta tardía sustituya lo escrito durante la espera. Un identificador de sesión invalida respuestas al cerrar o cambiar de formulario, fecha o perfil. El bloqueo síncrono compartido permanece hasta que termina la solicitud, incluso al cerrar: no se inicia otra llamada ni se agrega un reintento automático.

La categoría es estado local explícito de presentación. Una opción rápida puede completar un campo vacío o reemplazar otra etiqueta rápida, pero conserva una descripción libre. Gimnasio mantiene su etiqueta de rutina, y Correr, Natación y Caminata conservan sus campos aunque se amplíe la descripción. La estimación recibe la descripción completa y, cuando corresponde, la categoría explícita en los detalles del pedido existente.

Al editar, únicamente una coincidencia exacta con los nombres conocidos permite reconocer una categoría anterior; no se infiere una categoría de una frase arbitraria ni se modifica la descripción al abrirla. Los campos de distancia y ritmo existentes siguen disponibles en edición, incluso si la categoría es desconocida. No se crea una obligación nueva de persistencia.

La jerarquía de ejercicio mantiene Actividad, Duración y Calorías por delante de la estimación y los campos secundarios. `EntryFormShell` incorpora `summary` a su recorrido de foco para el nuevo detalle. Se conserva el contrato actual de Cerrar: descarta el borrador sin guardar. El crecimiento, el seguimiento del cursor, `visualViewport` y el footer accesible reutilizan la implementación existente.

## Checkpoint C — Validación final

La suite completa aprobó **371/371 pruebas**, sin fallos, cancelaciones ni omisiones. Los 33 archivos se ejecutaron exactamente una vez en tres lotes disjuntos de 11 archivos: **136 + 131 + 104**, todos con código de salida 0. La validación incluye PostgreSQL/RLS local y la prueba HTTP serverless existente; no se ejecutaron migraciones remotas. Los errores iniciales `EACCES` del entorno se resolvieron habilitando los permisos de ejecución/red necesarios, sin debilitar pruebas ni modificar los contratos para hacerlas pasar.

TypeScript de frontend y ambos proyectos API, lint y build terminaron correctamente. Lint conserva las 11 advertencias previas. El bundle principal continúa alrededor de 574 kB; esta ejecución del build no emitió una advertencia de tamaño. Los resultados de la suite y los comandos estáticos corresponden al código de implementación `5a9bf1e`; los cambios posteriores de documentación o evidencia no alteran ese producto. Tras reforzar cuatro aserciones de visibilidad del cursor, el archivo `auto-resize-textarea.test.mjs` volvió a aprobar sus cinco pruebas.

Las regresiones cubren el textarea compartido al crear y editar, valor exacto multilínea, un único guardado, actualización del mismo registro, compatibilidad con actividad desconocida y distancia/ritmo antiguos, las cinco categorías, conservación de texto libre, suposiciones extensas como contenido secundario, modificación manual, respuestas tardías, bloqueo síncrono de duplicados, errores y ausencia de reintentos. También se comprueba el formulario de comida, el foco de `summary`, el borde de Balance y los contratos CSS responsive.

## Verificación real de interfaz con fixtures

La matriz de navegador registra **16 combinaciones**: 1920×1080, 1440×900, 1366×768, 1280×720, 768×1024, 430×932, 375×812 y 320×740, cada una en claro y oscuro. No se observó overflow horizontal global ni del formulario. El textarea conserva `overflow-y: hidden`, `scrollHeight = clientHeight` y `scrollTop = 0`; el desplazamiento necesario pertenece al formulario. Estas medidas proceden del navegador; JSDOM se usa para regresiones de estado y contratos, no para demostrar layout.

La actividad corta y su posterior reducción miden 42 px en desktop y 48 px en mobile. En la prueba móvil de 7, 16 y 31 líneas, el campo crece a **158, 338 y 638 px**, respectivamente. El texto completo permanece en el valor, se ajusta al ancho y vuelve a reducir su altura al borrar. En tablet, dar a Actividad la fila completa aumenta su ancho de 150 a aproximadamente 373,92 px y reduce de 658 a 258 px la altura del mismo ejemplo largo; no se alteran las columnas de desktop o edición.

En Inicio a 1440 px, Balance tiene borde computado de 1 px y conserva la altura de 156 px de la referencia. Balance, Agua, Pasos y Peso se alinean en y=72 y comparten la altura de 156 px y el radio de 20 px, tanto en el escenario normal claro como en el de cifras grandes oscuro. También se comprobó el escenario de cifras grandes claro a 320 px, sin overflow horizontal. El ajuste del borde no desplaza las tarjetas ni introduce una sombra.

Se ejercitaron las cinco categorías conservando la misma descripción libre de dos párrafos. Gimnasio mantuvo «Detalle de la rutina»; Correr, Natación y Caminata mantuvieron Distancia y Ritmo; Fútbol conservó la actividad libre. La selección de chips no borró la descripción. La estimación simulada mostró el estado de carga, el resultado integrado y sus suposiciones originales en inglés únicamente dentro del detalle secundario. Enter y Espacio abrieron y cerraron el detalle nativo. Cambiar las calorías mantuvo el valor manual y la etiqueta de ajuste.

El flujo de ejercicio guardó una sola entrada con la descripción larga exacta y 410 kcal; al reabrirla en edición se conservaron su identidad y contenido. El formulario de comida conservó descripción y notas multilínea al guardar una sola entrada de 520 kcal y volver a editarla. Son guardados dentro del fixture y no se presentan como persistencia real en Supabase.

En un viewport reducido de **375×420**, con 31 líneas, se comprobó el seguimiento del cursor mediante pegado nativo y Ctrl+Inicio/Ctrl+Fin, sin reenfocar el campo mediante el automatizador. Tras el pegado el formulario se desplazó 445 px; Inicio llevó la selección a 0 y el scroll a 23 px; Fin llevó la selección a 739 y el scroll a 436 px. El campo mantuvo `scrollTop = 0`, el cursor quedó dentro del área visible de contenido y el footer Guardar terminó en y=420. La prueba no utiliza un teclado virtual físico ni demuestra Safari/iOS.

En desktop con viewport de 720 px de alto, el recorrido de teclado alcanzó Guardar mediante el scroll natural de la página; el botón quedó entre y=397 e y=437. El crecimiento de Actividad no lo recorta ni exige desplazar internamente el textarea.

La primera comprobación con un comando de automatización que reenfocaba el textarea alto alteraba el scroll después del seguimiento del cursor. La medición del espejo de texto era correcta y el flujo nativo confirmó que el producto conservaba el cursor visible; no se introdujo un parche especulativo en el scroll del formulario.

## Alcance y contratos preservados

No se cambian fórmulas energéticas, TMB, gasto, endpoints, servicios de estimación, Gemini, prompts, cuotas, Supabase, autenticación, objetivos, historial, Datos, Perfil, esquema ni migraciones. El guardado conserva los campos actuales y su flujo de confirmación. No se incorporan dependencias.

Las pruebas visuales utilizan componentes reales con fixtures locales y servicios simulados. Guardar y reabrir dentro de esos fixtures demuestra el flujo de interfaz, no la persistencia remota en Supabase. El Preview público sin sesión autenticada tampoco demuestra persistencia real. No se realizaron llamadas reales a Gemini ni nuevas llamadas para traducir las explicaciones.

Archivos de producto: `DailyPanel.tsx`, `EntryEstimateResult.tsx`, `EntryFormShell.tsx` y `HomeVariants.css`. `AutoResizeTextarea.tsx` se reutiliza sin modificaciones. Las regresiones se incorporan en `workout-entry-premium.test.mjs` y `workout-entry-layout.test.mjs`; `daily-panel.test.mjs` adapta el harness al componente compartido y `auto-resize-textarea.test.mjs` refuerza las aserciones del cursor. El resto de los cambios son documentación y evidencia.

## Capturas y publicación

La referencia anterior se reproduce desde los componentes `DailyPanel`, `EntryFormShell` y los estilos de `main` en `6eeecb7`, con los mismos fixtures locales usados después. Las capturas históricas se generan para esta comparación; no se presentan como una sesión remota anterior. La estimación de referencia muestra el toast original con texto en inglés confirmado también en el DOM.

Formulario:

- [Antes: actividad de una línea a 375 px](screenshots/workout-entry-premium-v8-2/before-workout-long-375.jpg).
- [Después: descripción corta a 375 px](screenshots/workout-entry-premium-v8-2/after-workout-short-375-dark.jpg).
- [Después: actividad de 31 líneas](screenshots/workout-entry-premium-v8-2/after-workout-31-lines-375.jpg).
- [Después: descripción larga en desktop](screenshots/workout-entry-premium-v8-2/after-workout-long-1440-dark.jpg).
- [Edición del ejercicio guardado](screenshots/workout-entry-premium-v8-2/after-edit-workout-375-dark.jpg).
- [Edición de comida sin regresión](screenshots/workout-entry-premium-v8-2/after-edit-meal-375-dark.jpg).

Estimación:

- [Antes: explicación en toast](screenshots/workout-entry-premium-v8-2/before-estimate-toast-1440.jpg).
- [Estado de carga](screenshots/workout-entry-premium-v8-2/after-estimate-loading-375.jpg).
- [Resultado integrado](screenshots/workout-entry-premium-v8-2/after-estimate-375-dark.jpg).
- [Suposiciones originales expandidas](screenshots/workout-entry-premium-v8-2/after-estimate-details-375-dark.jpg).
- [Calorías ajustadas manualmente](screenshots/workout-entry-premium-v8-2/after-estimate-adjusted-375.jpg).
- [Panel compartido en comida](screenshots/workout-entry-premium-v8-2/after-meal-estimate-375-dark.jpg).

Inicio y adaptación:

- [Balance antes](screenshots/workout-entry-premium-v8-2/before-home-1440-dark.jpg), [después oscuro](screenshots/workout-entry-premium-v8-2/after-home-1440-dark.jpg) y [después claro](screenshots/workout-entry-premium-v8-2/after-home-1440-light.jpg).
- [Formulario a 320 px](screenshots/workout-entry-premium-v8-2/after-workout-320-dark.jpg), [430 px](screenshots/workout-entry-premium-v8-2/after-workout-430-dark.jpg) y [768 px](screenshots/workout-entry-premium-v8-2/after-workout-768-dark.jpg).
- [Pegado nativo en viewport reducido](screenshots/workout-entry-premium-v8-2/after-native-paste-reduced-viewport.jpg) y [cursor al final con Guardar accesible](screenshots/workout-entry-premium-v8-2/after-native-caret-reduced-viewport.jpg).

El enlace al PR en borrador, su SHA publicado y el Preview Ready se incorporan a la entrega final una vez confirmados por GitHub/Vercel. El despliegue automático del PR no modifica variables remotas para simular autenticación o IA.

## Límites de la validación

El teclado virtual, la precisión táctil y Safari/iOS en un dispositivo físico necesitan verificación manual. Un viewport reducido o una simulación de `visualViewport` puede comprobar el contrato de scroll y accesibilidad del botón Guardar, pero no sustituye esas pruebas físicas.

Las mejoras fuera de los formularios de comida/ejercicio y del borde solicitado quedan fuera de esta iteración. La aprobación visual del usuario es posterior a la publicación del PR; no se realiza merge automático.
