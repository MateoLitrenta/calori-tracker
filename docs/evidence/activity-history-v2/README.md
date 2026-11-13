# Historial de actividad 2.0 — evidencia visual

Datos, cuentas y registros exclusivamente sintéticos. No se consultó Production ni se copiaron capturas del video original. Referencia real: `c623f9b`; fuente final: `b98fbe0` (árbol `d3b3afb2d6f6a6f2fd03e8e6f73fd56bfce908c6`). Chrome `157.0.8103.51`, Playwright 1.56.1, fecha fija 12 de noviembre de 2026.

## Antes y después

- 320 claro: [antes](before-history-light-320.png) · [después](after-history-light-320.png).
- 320 oscuro: [antes](before-history-dark-320.png) · [después](after-history-dark-320.png).
- 393 claro: [antes](before-history-light-393.png) · [después](after-history-light-393.png).
- 393 oscuro: [antes](before-history-dark-393.png) · [después](after-history-dark-393.png).
- 1440 claro: [antes](before-history-light-1440.png) · [después](after-history-light-1440.png).
- 1440 oscuro: [antes](before-history-dark-1440.png) · [después](after-history-dark-1440.png).

Los PNG aislados muestran el componente completo: el harness despliega temporalmente los contenedores de scroll, conserva el ancho medido exacto y oculta la navegación fija para evitar que tape la imagen larga. Las mediciones responsive, interacciones y el video usan el layout original, sin esos ajustes. El video corresponde a `288ed9e`; el ajuste posterior del ResizeObserver sólo difiere la limpieza de la reserva al cambiar el ancho y no cambia la presentación ni el recorrido grabado. El resize se verifica sobre la fuente final por separado. [Registros abiertos en móvil](opened-registers-light-393.png) y [desktop](opened-registers-dark-1440.png) muestran la navegación y el contexto reales.

## Recorrido y estados

- [Video móvil, 19.7 segundos](walkthrough-mobile.mp4): calendario mensual, ayer, Hoy, día vacío, actividad incompleta, Año → Mes, Semana, abrir registros y volver conservando fecha y período. H.264, 394×852, 10 fps, sin audio. El viewport original de 393 px tiene un píxel adicional de padding para el codec, sin escalar el contenido. [Decodificación y SHA-256](video-verification.json).
- Semana: [móvil](week-light-393.png) · [desktop](week-dark-1440.png).
- Año: [móvil](year-light-393.png) · [desktop](year-dark-1440.png).
- Día incompleto: [móvil](incomplete-light-393.png) · [desktop](incomplete-dark-1440.png).
- [Resumen energético avanzado](energy-dark-1440.png): conserva promedio, acumulado, consumidas y gasto estimado; no domina la exploración principal.

## Comprobaciones

Se verificaron 12 combinaciones antes y 12 después: 320, 375, 393, 430, 768 y 1440 px, ambos temas. Altura móvil 852 px, tablet 1024 y desktop 900. Los estados iniciales se recapturaron sobre la fuente final congelada; cero errores JavaScript, desbordamientos horizontales o peticiones externas. Las fechas y controles tienen objetivos de al menos 44×44 px; 320 usa una semana desplazable para conservar ese tamaño.

Los 12 recorridos funcionales aprobaron **346 comprobaciones**: ayer, Hoy, navegación mensual, vacío/comidas/entrenamiento/incompleto, Año → Mes, siete días de Semana, apertura explícita, retorno, navegación entre secciones, borradores y foco. El formulario inline de desktop bloquea la navegación sin perder el texto. En móvil, la hoja modal ya impide los clics normales fuera de ella; el guard adicional de cambio de día se comprobó mediante un evento programático, identificado en el manifiesto.

La regresión de scroll encontrada a 768×1024 se corrigió antes de cerrar la matriz: seleccionar un detalle más corto reducía el máximo del scroller y lo desplazaba 13 px. Se reserva la altura real medida del preview, sin recortar ni forzar scroll; los tres cambios a comida, vacío e incompleto mantienen delta 0. La reserva se libera al cambiar el ancho o la vista. La limpieza dentro del observer causaba una notificación de bucle al redimensionar; ahora se difiere a un frame cancelable. El [probe de resize](resize-observer-check.json) escucha `window.error` y rechazos antes del cliente Vite y termina sin errores, igual que los 12 recorridos finales.

Se revisaron nombres y estados del árbol accesible, `aria-current=date`, selección y foco visible, flechas y navegación por teclado. El resumen avanzado abre/cierra con teclado y conserva sus cuatro métricas en las 12 combinaciones. [Snapshot accesible](accessibility-snapshot.txt), [matriz](responsive-matrix.json), [interacciones](interaction-checks.json), [scroll](scroll-stability.json) y [hashes de medios](media-sha256.json).

## Comparación de uso y límites

La suite completa de Linux y los controles de TypeScript, lint y build se registran por separado en [quality-results.json](quality-results.json): 569/569 pruebas, sin fallos ni omisiones. No se confunden las fronteras simuladas de este harness visual con las pruebas reales locales de PostgreSQL/PostgREST.

Antes, Día presentaba el año sin números visibles: objetivos de 24 px en móvil y aproximadamente 16 px en desktop, información energética dominante y una explicación colapsada. Seleccionar cambiaba inmediatamente el día del registro. Ahora, Mes muestra fechas numeradas (o una semana accesible en el ancho más estrecho), indicadores de comida/entrenamiento y detalle textual; **Abrir registros del día** hace explícito el cambio de contexto, y volver conserva la exploración. Hoy requiere una sola acción. Esta comparación describe recorridos comprobados; no constituye un estudio con usuarios ni una comparación certificada con otras aplicaciones.

Auth, RPC, Storage y Gemini se simulan en este harness. Las utilidades de cálculo, componentes y store React son los del producto; no se certifican servicios remotos con estas imágenes. No se certifican Safari/iOS o Android físicos, teclado virtual real ni NVDA/VoiceOver. Se requiere aprobación visual del Preview antes del merge.
