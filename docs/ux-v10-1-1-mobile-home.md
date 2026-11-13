# UX/UI V10.1.1 — Inicio móvil y navegación diaria

Base: main `5a74e7279c77a7d1dc25fb5604d5fa0d657d6bf5`, que incluye PR #78. Rama independiente: `codex/ux-v10-1-1-mobile-home`. Sin merge, migraciones o despliegues en Production.

## Fase A — Diagnóstico y solución definida antes de implementar

`HomeViewState.dailyDateStr` ya es la fuente del registro diario que recibe `DailyPanel`. El calendario tiene otro estado para explorar tendencias; sólo «Abrir registros del día» cambia la fecha editable. `App.homeContext`, asociado al propietario, conserva esa fecha entre secciones, pero se pierde al recargar. El escritor y los controladores de borradores ya retienen la fecha y los snapshots de sus operaciones.

La jerarquía actual antepone las tres tarjetas de hábitos a las acciones de alimentación/ejercicio y al listado de registros. Los márgenes acumulados y la tarjeta energética alta aumentan el desplazamiento. El pill diario pinta cualquier déficit de verde, aunque no implica un resultado positivo. Historial 2.1 aporta información útil, pero ocupa espacio permanente en la tarea cotidiana.

Decisiones de esta iteración:

- Reutilizar la fecha diaria existente mediante un selector de siete días, semanas anterior/siguiente, Hoy y acceso al calendario mensual. Una selección es una acción explícita sobre el día editable; explorar Historial conserva su separación actual.
- Validar calendario y límites en una sola transición de fecha, incluida la restauración. No habilitar días futuros. Conservar el período histórico actual.
- Mantener visible el contexto «Hoy» o fecha anterior en selector, registros y formularios. Bloquear cambios si hay edición activa; el clic fuera del formulario debe reconocer el selector como navegación protegida para no descartar el borrador.
- Conservar sólo metadatos de presentación en sessionStorage por cuenta para soportar recarga. No almacenar allí registros, borradores, credenciales o preferencias nuevas. Mantener el aislamiento por propietario de App y HomeView.
- Ordenar Inicio móvil: cabecera compacta, fecha, balance/consumo/gasto estimado y cobertura, acciones, registros, hábitos compactos y acceso a Historial. Reutilizar los componentes existentes sin duplicar escritores o datos.
- Presentar déficit/superávit diarios con tonos neutrales, etiquetas y límites. No cambiar categorías, fórmulas, objetivos o cálculos de Historial. Tener comidas registradas no acredita un día completo.
- Conservar Historial 2.1 con sus vistas, indicadores, detalle y apertura explícita. En móvil, ofrecer un acceso visible que lo despliegue cuando se necesita, además del acceso mensual superior. Mantener la funcionalidad de escritorio.
- Siete columnas visibles sin overflow a 320 px; controles de fecha altos y cercanos a 44 px de ancho cuando el espacio lo permite. Foco visible, etiquetas completas y teclado.

## Plan de validación definido en la auditoría

Pruebas reales de React/HomeView/DailyPanel/App con límites sintéticos para writer, Auth e IA: cambio simultáneo de métricas, guardado con fecha exacta, borradores, operaciones pendientes, Hoy, límites/futuro, recarga, secciones y dos cuentas. Conservar regresiones de Historial 2.1 y ejecutar CI Linux completa, TypeScript, lint y build.

Comparación en navegador real con los mismos datos sintéticos antes/después del main base: 320, 375, 393, 440, 768 y 1440 px, claro/oscuro. Revisar recorridos de navegación, edición, guardado, Historial, teclado, ausencia de overflow y coherencia de fechas. Las capturas y resultados acompañarán el PR Draft; no se certificará Gemini real en Preview ni se modificarán sus secretos.

## Implementación

`WeeklyDateNav` permite seleccionar directamente uno de los siete días, cambiar de semana, volver a Hoy y abrir el calendario mensual. La selección y el encabezado comunican la fecha activa; los futuros y las fechas fuera del rango histórico existente no habilitan registros. Los controles tienen nombres completos, estado seleccionado y navegación de foco por teclado.

`HomeView` conserva una sola fecha diaria y la entrega a `DailyPanel`. No hay copias paralelas para comidas, entrenamiento o hábitos. El helper `homeDateNavigation` valida calendario y límites también al restaurar el estado. `sessionStorage` guarda únicamente la fecha y el contexto de exploración, con versión y clave por propietario; no guarda registros, borradores o credenciales. La memoria de `App` mantiene la continuidad entre secciones y la restauración por cuenta cubre la recarga dentro de la misma pestaña/sesión. No es recuperación entre dispositivos o sesiones nuevas. Si el almacenamiento está bloqueado o no es válido, una recarga comienza en Hoy, con el día visible explícitamente; los registros siguen usando el escritor existente.

El formulario abierto conserva su día y bloquea una selección que pudiera retargetearlo. Una operación ya iniciada utiliza su snapshot y fecha originales, incluso si un guardado diferido de hábitos se confirma mientras se ve otro día. Al cambiar de cuenta, el contexto y los formularios se separan por propietario.

La composición diaria coloca balance, calorías consumidas, gasto estimado y cobertura antes de las acciones de comida/ejercicio. Siguen los registros del día y las métricas complementarias compactas. Agua, pasos y peso conservan edición y controles accesibles. El peso utiliza el mismo formulario accesible y el contexto de fecha que los otros registros; un fallo conserva el valor introducido y no anuncia un guardado.

La presentación diaria usa tonos neutrales para las categorías de balance, incluido un déficit elevado. Las cifras, categorías y fórmulas existentes se conservan. La cobertura distingue datos registrados de un día completo y mantiene el carácter estimado o provisional cuando corresponde.

Historial 2.1 mantiene sus datos, cálculos, vistas de semana/mes/año, indicadores y detalle. En móvil se accede desde «Historial y tendencias» o el calendario superior; no es necesario para cambiar el día cotidiano. Explorar el calendario no cambia por sí solo la fecha editable: conserva la apertura explícita existente. El escritorio retiene el historial y recibe un selector superior más compacto.

## Pruebas locales ejecutadas

Se ejecutó una selección de 41 archivos relevantes en Windows con Node 24.4.1: **565 casos**, con **559 aprobados y seis fallos en el primer pase**, sin omisiones, cancelaciones o TODO. Ese resultado original se conserva; no se presenta como una única ejecución final 565/565.

- Cuatro fallos correspondían a conexiones HTTP de loopback bloqueadas por el sandbox (`EACCES 127.0.0.1`): tres casos de `coach-proactive-flow` y el probe de `coach-serverless-runtime`. Los dos archivos se reejecutaron con permiso de red local y aprobaron **5/5**, sin modificar el código de Coach o backend.
- Dos pruebas antiguas de peso dependían de una clase de color eliminada y de un `keydown` que JSDOM no convierte en la acción nativa de enviar un formulario. Se actualizaron para encontrar el botón semántico y enviar el formulario real. Se conservaron las aserciones de operación pendiente, fallo, valor del borrador, confirmación, revisión de conflicto, versión y datos refrescados. El archivo completo `workout-entry-premium` aprobó **25/25**. El gesto Enter nativo se comprobó por separado en el navegador sintético.
- TypeScript de frontend, API de IA y objetivos, lint incluyendo scripts, build y `git diff --check` terminaron con **exit 0**. Lint volvió a ejecutarse después de los dos ajustes de pruebas: doce advertencias anteriores. Build conserva el aviso anterior de bundle superior a 500 kB.
- Durante la selección inicial cambió únicamente `WeeklyDateNav.css`, por el ajuste de tamaño en escritorio. Tipos, lint y build tomaron esa CSS. La corrección posterior del contraste de la etiqueta energética se verificó por separado en el navegador y su contrato de estilo; la CI completa debe comprobar el HEAD que contiene ambos ajustes. Los reruns no se atribuyen a un único primer pase estable.

La selección incluye contratos de navegación, formularios, Historial, accesibilidad, presentación responsive, transporte, Coach, objetivos, hábitos, persistencia cliente y aislamiento de cuentas. Usa límites sintéticos para Auth, Gemini y persistencia remota; PGlite y HTTP de loopback son locales reales. Los resultados detallados y logs se conservaron fuera del checkout, en `work/home-v10-1-1-validation`, incluyendo el primer pase y los reruns. No se ejecutó SQL remoto ni se modificó Production.

## Recorridos observados en navegador real

El harness `scripts/home-mobile/serve-qa.mjs` sirve App, HomeView, DailyPanel, Historial, Datos y CSS reales con los mismos fixtures en la baseline congelada `5a74e72` y la candidata. Fija la fecha de prueba en 13/11/2026. Las cuentas sintéticas tienen registros y métricas distintos entre Hoy y días anteriores. Los guardados se confirman en un escritor sintético local; Auth, Storage y AI remotos están sustituidos. CSP y la barrera de fetch bloquean conexiones a otros orígenes. El harness no forma parte de la entrada o el build de la aplicación de Production.

Los servidores usan cachés Vite separadas para evitar que la baseline y la candidata invaliden mutuamente sus dependencias optimizadas. Se verificaron 80 módulos/imports reales por HTTP local sin errores. Esto comprueba el harness, no sustituye una prueba del producto.

Los recorridos del navegador controlado comprobaron:

- Selección directa de otra fecha y correspondencia de comidas, ejercicio, agua, pasos, peso y resumen energético con ese día.
- Registro y modificación mediante los controles existentes, con fecha explícita y confirmación del escritor sintético.
- Persistencia del contexto diario al recargar y al ir a Datos y volver a Inicio.
- Acceso al calendario mensual y conservación de la separación entre explorar tendencias y abrir un día editable.
- Cambio entre las dos cuentas sintéticas, sin reutilizar registros o contexto de la otra.
- Fallo sintético de guardado: borrador conservado y ausencia de falsa confirmación.
- Envío mediante Enter nativo en el formulario de peso: se guardó el valor introducido en el día seleccionado, se cerró el diálogo y el foco volvió al control de edición.

Estos son resultados sobre una aplicación real con servicios externos simulados. No acreditan escrituras remotas en Supabase, una sesión Auth real, Storage HTTP o Gemini.

## Comparación visual y accesibilidad observada

Se conservaron **24 capturas comparativas**: antes y después en 320, 375, 393, 440, 768 y 1440 px, tanto claro como oscuro. La auditoría del navegador registró además 17 casos de recorridos y verificaciones. Las fotos, métricas y resultados se encuentran en [evidencia V10.1.1](evidence/v10-1-1).

- Móvil 375 px: [antes claro](evidence/v10-1-1/before-375-light.jpg), [después claro](evidence/v10-1-1/after-375-light.jpg), [antes oscuro](evidence/v10-1-1/before-375-dark.jpg), [después oscuro](evidence/v10-1-1/after-375-dark.jpg).
- Escritorio 1440 px: [antes claro](evidence/v10-1-1/before-1440-light.jpg), [después claro](evidence/v10-1-1/after-1440-light.jpg), [antes oscuro](evidence/v10-1-1/before-1440-dark.jpg), [después oscuro](evidence/v10-1-1/after-1440-dark.jpg).
- Recorridos: [peso y fecha seleccionada](evidence/v10-1-1/weight-selected-date-light.jpg) y [hábitos e Historial a 320 px](evidence/v10-1-1/habits-history-320-light.jpg).

En la muestra de 375 px, el comienzo de las acciones pasó de Y=531,40 a Y=433,84: quedó **97,55 px más arriba**, aun incorporando el selector diario. La tarjeta energética pasó de 241,40 a 175,34 px de alto, una reducción de **66,05 px**. A 320 px, las acciones pasaron de Y=610,59 a Y=433,70, aproximadamente **176,90 px más arriba**. Son mediciones de los mismos fixtures y viewports; no se extrapolan a todos los contenidos posibles.

Los doce diseños de la candidata, combinando ancho y tema, mantuvieron el ancho del documento dentro del viewport, sin desbordamiento horizontal o solapamientos en las comprobaciones realizadas. Los controles de hábitos medidos alcanzaron al menos 44 × 44 px. Para conservar siete fechas visibles a 320 px, cada celda mide aproximadamente 39,14 × 62 px; a 375 px mide 47 × 62 px. Ese ancho inferior a 44 px en el caso más estrecho se mantiene explícito como compromiso del selector de siete columnas.

Se verificaron seis pares de texto/fondo en ambos temas: los contrastes medidos fueron al menos 4,76:1. La etiqueta de balance energético quedó en 5,45:1 en claro y 6,58:1 en oscuro, después de oscurecer únicamente su texto claro. La revisión de estos selectores, las etiquetas, los focos y los recorridos por teclado no constituye una certificación global WCAG de toda la aplicación.

## Límites y cierre pendiente

La CI Linux completa debe ejecutarse sobre el HEAD del PR y aportar su manifiesto, conteos sin omisiones, TypeScript, lint, build y limpieza del entorno descartable. Los resultados locales anteriores no sustituyen esa ejecución. El estado definitivo de CI y la Preview se enlazarán en la descripción del PR Draft.

La Preview permite revisar la interfaz y su build, pero no se considera una certificación de Gemini real ni de todos los servicios remotos. No se copiaron secretos ni se cambió configuración de Production. No hay migraciones, cambios de esquema, nuevas dependencias o cambios deliberados en cálculos, Coach, objetivos, cuotas o RLS.

Esta entrega no autoriza merge ni despliegue en Production. La revisión visual personal del usuario y cualquier validación remota posterior permanecen sujetas a la autorización correspondiente.
